import { GEMINI_MODEL_PATTERN, GeminiGateway } from "./gemini.gateway.js";
import {
  ACTION_TAGS,
  CATEGORIES,
  PROBLEM_TYPES,
  URGENCY_LABELS,
  type ActionCandidate,
  type Category,
  type Message,
  type Situation,
  type Urgency,
} from "@tutorial/shared";
import type { PendingField } from "./session.service.js";

/**
 * 모델 어댑터 계약 (v2 §7). C가 소유한다.
 * 실제 LLM 연결은 이 인터페이스를 구현하는 클래스를 하나 더 만들고
 * `createModelGateway`에서 환경 변수로 고르면 된다. 출력은 서버가 다시 검증한다.
 */
export interface AnalyzeInput {
  category: Category;
  situation: Situation;
  messages: Message[];
  message: string;
  pendingField?: PendingField;
  questionCount: number;
}

export interface AnalyzeOutput {
  situation: Situation;
  /** 다음에 물을 질문. 없으면 확인 단계로 넘어간다. */
  nextQuestion?: string;
  pendingField?: PendingField;
  readyToConfirm: boolean;
}

export interface ModelGateway {
  analyze(input: AnalyzeInput): Promise<AnalyzeOutput>;
  suggestActions(situation: Situation): Promise<ActionCandidate[]>;
}

const MAX_QUESTIONS = 3;
const SKIP_PATTERN = /모르겠|말하고 싶지 않|건너|스킵|패스|잘 몰라|글쎄/;

export function detectUrgency(text: string): Urgency {
  if (/오늘|내일|시간 (남|뒤|후)|시간남|몇 시간|자정|당장|지금 바로/.test(text))
    return "today";
  if (/이번 주|일주일|며칠|이틀|사흘|주말|다음 주|3일|4일|5일/.test(text))
    return "week";
  if (/여유|다음 달|한 달|학기|방학|천천히/.test(text)) return "later";
  return "unknown";
}

/** "8시간 남았고" 같은 명시적 표현을 먼저, 없으면 "내일" 같은 단어를 잡는다. */
export function extractDeadlineRaw(text: string): string {
  const explicit = text.match(/\d+\s*(시간|일|주|달)\s*(남|뒤|후|안)[^,.\s]*/);
  if (explicit) return explicit[0];
  const word = text.match(
    /오늘|내일|모레|이번 주|다음 주|주말|이번 달|다음 달|자정/,
  );
  return word?.[0] ?? "";
}

export function detectActionLabels(category: Category, text: string): string[] {
  return ACTION_TAGS[category]
    .filter((action) =>
      action.keywords.some((keyword) => text.includes(keyword)),
    )
    .map((action) => action.label);
}

export function detectProblemType(
  category: Category,
  text: string,
): string | undefined {
  return PROBLEM_TYPES[category].find((problem) =>
    problem.keywords.some((keyword) => text.includes(keyword)),
  )?.type;
}

function dedupe(values: string[]): string[] {
  return Array.from(
    new Set(values.map((value) => value.trim()).filter(Boolean)),
  );
}

const FIELD_LABELS: Record<PendingField, string> = {
  deadline: "마감·남은 시간",
  progress: "진행 상황",
  consideredActions: "고려 중인 행동",
  goal: "원하는 결과",
};

function questionFor(category: Category, field: PendingField): string {
  switch (field) {
    case "deadline":
      return "언제까지 해결해야 하나요? 남은 시간이나 마감을 알려 주세요. (예: 8시간 남음, 다음 주 월요일)";
    case "progress":
      if (category === "team_project")
        return "지금까지 끝난 작업과 남은 작업은 무엇인가요?";
      if (category === "grades")
        return "남은 평가는 무엇이고, 지금까지 어떤 방법으로 공부해 봤나요?";
      return "맡은 역할은 무엇이고, 결정해야 하는 기한이 있나요?";
    case "consideredActions":
      return "지금 고려하고 있는 행동이 있나요? 없으면 '모르겠어요'라고 답해도 돼요.";
    case "goal":
      return "이 상황에서 가장 원하는 결과는 무엇인가요?";
  }
}

/**
 * 규칙 기반 대체 게이트웨이 (v2 §7 "저장된 상황 필드에 기반한 기본 질문").
 * 키워드로 상황 필드를 채우고, 비어 있는 필드를 하나씩 묻는다.
 */
export class RuleBasedGateway implements ModelGateway {
  async analyze(input: AnalyzeInput): Promise<AnalyzeOutput> {
    const text = input.message.trim();
    const situation: Situation = {
      ...input.situation,
      deadline: { ...input.situation.deadline },
      constraints: [...input.situation.constraints],
      attemptedActions: [...input.situation.attemptedActions],
      consideredActions: [...input.situation.consideredActions],
      unknowns: [...input.situation.unknowns],
    };
    const skipped = SKIP_PATTERN.test(text);

    if (skipped && input.pendingField) {
      situation.unknowns = dedupe([
        ...situation.unknowns,
        FIELD_LABELS[input.pendingField],
      ]);
    } else {
      if (!situation.situation) situation.situation = text;
      else if (!input.pendingField)
        situation.situation = `${situation.situation} ${text}`;

      const urgency = detectUrgency(text);
      if (urgency !== "unknown" && situation.deadline.urgency === "unknown") {
        situation.deadline.urgency = urgency;
      }
      const raw = extractDeadlineRaw(text);
      const explicitDeadline = /\d+\s*(시간|일|주|달)\s*(남|뒤|후|안)/.test(
        text,
      );
      // "8시간 남았어요"처럼 명시적인 마감은 어느 질문에 답하던 중이든 마감으로 갱신한다.
      if (raw && (!situation.deadline.raw || explicitDeadline))
        situation.deadline.raw = raw;
      if (explicitDeadline && situation.deadline.urgency === "unknown")
        situation.deadline.urgency = "today";
      const onlyDeadline = explicitDeadline && text.length <= 20;

      situation.consideredActions = dedupe([
        ...situation.consideredActions,
        ...detectActionLabels(input.category, text),
      ]);
      if (
        /(연락|메시지|전화|메일|디엠|dm).{0,8}(했|보냈|해봤|남겼)/i.test(text)
      ) {
        situation.attemptedActions = dedupe([
          ...situation.attemptedActions,
          "연락 시도",
        ]);
      }
      if (!situation.problemType) {
        situation.problemType = detectProblemType(input.category, text);
      }

      switch (input.pendingField) {
        case "deadline":
          if (!situation.deadline.raw) situation.deadline.raw = text;
          break;
        case "progress":
          if (!situation.progress && !onlyDeadline) situation.progress = text;
          break;
        case "consideredActions":
          if (situation.consideredActions.length === 0)
            situation.consideredActions = [text];
          break;
        case "goal":
          if (!situation.goal) situation.goal = text;
          break;
        default:
          break;
      }
    }

    const missing: PendingField[] = [];
    if (
      !situation.deadline.raw &&
      !situation.unknowns.includes(FIELD_LABELS.deadline)
    )
      missing.push("deadline");
    if (
      !situation.progress &&
      !situation.unknowns.includes(FIELD_LABELS.progress)
    )
      missing.push("progress");
    if (
      situation.consideredActions.length === 0 &&
      !situation.unknowns.includes(FIELD_LABELS.consideredActions)
    ) {
      missing.push("consideredActions");
    }

    const nextField = missing[0];
    if (nextField && input.questionCount < MAX_QUESTIONS) {
      return {
        situation,
        nextQuestion: questionFor(input.category, nextField),
        pendingField: nextField,
        readyToConfirm: false,
      };
    }
    for (const field of missing) {
      situation.unknowns = dedupe([...situation.unknowns, FIELD_LABELS[field]]);
    }
    return { situation, readyToConfirm: true };
  }

  async suggestActions(situation: Situation): Promise<ActionCandidate[]> {
    const catalog = ACTION_TAGS[situation.category];
    const candidates: ActionCandidate[] = [];
    const usedTags = new Set<string>();

    situation.consideredActions.forEach((label, index) => {
      const tagged = catalog.find(
        (action) =>
          action.label === label ||
          action.keywords.some((keyword) => label.includes(keyword)),
      );
      if (tagged?.tag && usedTags.has(tagged.tag)) return;
      if (tagged) usedTags.add(tagged.tag);
      candidates.push({
        id: `student-${index + 1}`,
        label: tagged?.label ?? label,
        actionTag: tagged?.tag,
        origin: "student",
        confirmed: true,
      });
    });

    for (const action of catalog) {
      if (candidates.length >= 3) break;
      if (usedTags.has(action.tag)) continue;
      usedTags.add(action.tag);
      candidates.push({
        id: `suggested-${action.tag}`,
        label: action.label,
        actionTag: action.tag,
        origin: "suggested",
        confirmed: true,
      });
    }
    return candidates.slice(0, 3);
  }
}

export function summarizeSituation(situation: Situation): string {
  const line = (label: string, value: string) =>
    `• ${label}: ${value || "미확인"}`;
  const deadline = situation.deadline.raw
    ? `${situation.deadline.raw} (${URGENCY_LABELS[situation.deadline.urgency]})`
    : "";
  return [
    "제가 이해한 상황이 맞는지 확인해 주세요.",
    line("상황", situation.situation),
    line("마감", deadline),
    line("진행", situation.progress),
    line("이미 한 것", situation.attemptedActions.join(", ")),
    line("고려 중인 행동", situation.consideredActions.join(", ")),
    situation.unknowns.length > 0
      ? `• 아직 모르는 것: ${situation.unknowns.join(", ")}`
      : "",
    "아래에서 고치거나 그대로 확인해 주세요.",
  ]
    .filter(Boolean)
    .join("\n");
}

export function firstPrompt(category: Category): string {
  return (
    CATEGORIES.find((item) => item.id === category)?.prompt ??
    "무슨 일이 있었나요?"
  );
}

/**
 * 1차 게이트웨이(외부 모델)가 실패하면 그 턴만 2차(규칙 기반)로 답한다.
 * 시연 중 외부 모델이 흔들려도 학생이 오류 대신 답을 받게 하는 안전장치다.
 * 두 경로 모두 서버가 상황을 다시 검증하므로 세션은 손상되지 않는다.
 */
export class FallbackGateway implements ModelGateway {
  constructor(
    readonly label: string,
    private readonly primary: ModelGateway,
    private readonly fallback: ModelGateway,
    private readonly log: (message: string) => void = (message) =>
      console.warn(message),
  ) {}

  async analyze(input: AnalyzeInput): Promise<AnalyzeOutput> {
    try {
      return await this.primary.analyze(input);
    } catch (error) {
      this.log(
        `${this.label} analyze failed; answering this turn with the rule-based gateway (${describeError(error)})`,
      );
      return this.fallback.analyze(input);
    }
  }

  async suggestActions(situation: Situation): Promise<ActionCandidate[]> {
    try {
      return await this.primary.suggestActions(situation);
    } catch (error) {
      this.log(
        `${this.label} suggestActions failed; using the rule-based gateway (${describeError(error)})`,
      );
      return this.fallback.suggestActions(situation);
    }
  }
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : "unknown error";
}

export interface ModelConfig {
  /** 실제로 기동되는 게이트웨이. 설정이 잘못되면 gemini를 골랐어도 rule이다. */
  provider: "gemini" | "rule";
  model?: string;
  /** 규칙 기반으로 내려앉은 이유. /api/health에 노출되므로 환경 변수 값을 담지 않는다. */
  warning?: string;
}

const DEFAULT_GEMINI_MODEL = "gemini-3.1-flash-lite";

/** 환경 변수만 보고 무엇이 기동될지 설명한다. 값을 echo하지 않는다. */
export function describeModelConfig(
  env: Record<string, string | undefined> = process.env,
): ModelConfig {
  const provider = env.MODEL_PROVIDER?.trim();
  if (!provider || provider === "rule") return { provider: "rule" };
  if (provider !== "gemini")
    return { provider: "rule", warning: "Unsupported MODEL_PROVIDER" };
  const key = (env.GEMINI_API_KEY ?? env.MODEL_API_KEY)?.trim();
  if (!key)
    return {
      provider: "rule",
      warning: "MODEL_PROVIDER=gemini but GEMINI_API_KEY is missing",
    };
  const model = env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;
  if (!GEMINI_MODEL_PATTERN.test(model))
    return { provider: "rule", warning: "Invalid GEMINI_MODEL" };
  return { provider: "gemini", model };
}

/**
 * 환경 변수로 게이트웨이를 고른다. 어떤 설정 오류에도 throw하지 않는다.
 * 부팅 시 throw하면 Worker 전체가 500이 되므로, 잘못된 설정은 경고를 남기고
 * 규칙 기반으로 기동한다. 실제 기동 결과는 `GET /api/health`의 `model`로 확인한다.
 */
export function createModelGateway(
  env: Record<string, string | undefined> = process.env,
  log: (message: string) => void = (message) => console.warn(message),
): ModelGateway {
  const rule = new RuleBasedGateway();
  const config = describeModelConfig(env);
  if (config.warning)
    log(`${config.warning}; starting with the rule-based gateway`);
  if (config.provider !== "gemini") return rule;
  const key = (env.GEMINI_API_KEY ?? env.MODEL_API_KEY ?? "").trim();
  try {
    return new FallbackGateway(
      "gemini",
      new GeminiGateway(key, rule, config.model),
      rule,
      log,
    );
  } catch (error) {
    log(
      `Gemini gateway could not be created (${describeError(error)}); starting with the rule-based gateway`,
    );
    return rule;
  }
}
