import { GEMINI_MODEL_PATTERN, GeminiGateway } from "./gemini.gateway.js";
import {
  ACTION_TAGS,
  CATEGORIES,
  URGENCY_LABELS,
  detectActionLabels,
  detectProblemType,
  detectUrgency,
  extractDeadlineRaw,
  type ActionCandidate,
  type Category,
  type Message,
  type Situation,
} from "@tutorial/shared";

// 키워드 추출은 packages/shared/src/detect.ts로 옮겼다 (선배 인터뷰 화면도 같은 규칙을 쓴다).
// 기존 import 경로를 깨지 않도록 여기서 다시 내보낸다.
export {
  detectActionLabels,
  detectProblemType,
  detectUrgency,
  extractDeadlineRaw,
};
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
      return "언제까지 해결해야 해요? 남은 시간이나 마감을 편하게 말해 주세요.";
    case "progress":
      if (category === "team_project")
        return "지금까지 된 건 어디까지고, 남은 건 뭐예요?";
      if (category === "grades")
        return "남은 평가는 뭐고, 지금까지는 어떻게 공부해 봤어요?";
      return "맡은 역할은 뭐고, 언제까지 결정해야 해요?";
    case "consideredActions":
      return "지금 머릿속에 있는 선택지가 있어요? 없으면 없다고 해도 괜찮아요.";
    case "goal":
      return "이 상황에서 제일 바라는 결과는 뭐예요?";
  }
}

/**
 * 학생이 방금 말한 것을 한 구절로 받아 준다. 필드 이름을 읊는 질문만 이어지면
 * 설문지처럼 읽히기 때문이다. 이 턴에 새로 알게 된 것이 없으면 빈 문자열이다.
 */
export function acknowledge(before: Situation, after: Situation): string {
  const parts: string[] = [];
  if (!before.deadline.raw && after.deadline.raw) {
    if (after.deadline.urgency === "today")
      parts.push("시간이 정말 빠듯하네요.");
    else if (after.deadline.urgency === "week")
      parts.push("이번 주가 고비네요.");
    else if (after.deadline.urgency === "later")
      parts.push("다행히 시간은 조금 있네요.");
  }
  const newActions = after.consideredActions.filter(
    (label) => !before.consideredActions.includes(label),
  );
  if (newActions.length === 1) {
    parts.push(`${newActions[0]}를 생각하고 계시군요.`);
  } else if (newActions.length > 1) {
    parts.push(`${newActions.join(", ")} 사이에서 고민 중이시군요.`);
  }
  if (
    !before.attemptedActions.includes("연락 시도") &&
    after.attemptedActions.includes("연락 시도")
  ) {
    parts.push("연락은 이미 해 보셨고요.");
  }
  if (parts.length === 0 && !before.situation && after.situation) {
    parts.push("무슨 일인지 알겠어요.");
  }
  return parts.join(" ");
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
      const lead = skipped ? "" : acknowledge(input.situation, situation);
      const question = questionFor(input.category, nextField);
      return {
        situation,
        nextQuestion: lead ? `${lead} ${question}` : question,
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
    `• ${label}: ${value || "아직 못 들었어요"}`;
  const deadline = situation.deadline.raw
    ? `${situation.deadline.raw} (${URGENCY_LABELS[situation.deadline.urgency]})`
    : "";
  return [
    "제가 이해한 걸 정리해 볼게요.",
    line("상황", situation.situation),
    line("마감", deadline),
    line("진행", situation.progress),
    line("이미 한 것", situation.attemptedActions.join(", ")),
    line("고려 중인 행동", situation.consideredActions.join(", ")),
    situation.unknowns.length > 0
      ? `• 아직 모르는 것: ${situation.unknowns.join(", ")}`
      : "",
    "맞으면 아래 「맞아요」를 눌러 주세요. 다르거나 더 말할 게 있으면 그냥 이어서 적어 주시면 돼요.",
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
      if (input.situation.studentContext) {
        this.log(`${this.label} analyze failed; preserving structured context`);
        throw new Error("Structured context analysis failed. Please retry.");
      }
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
      new GeminiGateway(
        key,
        rule,
        config.model,
        undefined,
        env.ENABLE_CONTEXT_META_WRITE === "true",
      ),
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
