import { opposingPredicates } from "./polarity-comparison.js";
import {
  distributedScores,
  type Dimension,
  type DistributedScore,
} from "./distributed-score.js";
export { MATCH_WEIGHTS } from "./distributed-score.js";
import { compareConditions } from "./condition-comparison.js";
import { createTextSimilarity } from "./text-similarity.js";
export { tokenize } from "./text-similarity.js";
import {
  URGENCY_LABELS,
  type ActionCandidate,
  type ActionResult,
  type Case,
  type Situation,
} from "@tutorial/shared";

/**
 * 행동별 사례 매칭 (v2 §5). C가 소유한다.
 * 점수는 내부 정렬용이며 화면에 확률로 표시하지 않는다.
 */
export interface MatchInfo {
  /** Internal relevance score, not success probability. */
  score: number;
  distributed?: DistributedScore;
  actionMatched: boolean;
  relevant: boolean;
  conditionDifferences: string[];
  coverage: { known: string[]; unknown: string[] };
  components: {
    problem: number;
    context: number;
    constraints: number;
    goal: number;
    urgency: number;
  };
  similarities: string[];
  differences: string[];
}
export interface RankedCase {
  item: Case;
  info: MatchInfo;
}

type Similarity = ReturnType<typeof createTextSimilarity>;
// Titles and editorial tags describe presentation, not verified circumstances.
// Keep them out of both similarity and corpus IDF so metadata cannot outweigh
// the actual experience, or change unrelated candidates' scores.
const contextText = (item: Case) => item.situation;
const makeSimilarity = (cases: Case[]) =>
  createTextSimilarity(
    cases.map((item) =>
      [contextText(item), item.goal, ...item.constraints].join(" "),
    ),
  );
const distinct = (values: string[]) => [
  ...new Set(values.map((v) => v.trim()).filter(Boolean)),
];

function evaluate(
  situation: Situation,
  action: ActionCandidate,
  item: Case,
  similarity: Similarity,
): MatchInfo {
  const actionMatched =
    !!action.actionTag &&
    item.actionSteps.some((step) => step.actionTag === action.actionTag);
  const sameProblem =
    !!situation.problemType && situation.problemType === item.problemType;
  const narrative = [situation.situation, situation.progress].join(" ");
  const contextOpposition = opposingPredicates(
    narrative,
    contextText(item),
    similarity,
  );
  const context = contextOpposition
    ? -contextOpposition
    : similarity(narrative, contextText(item));
  // Categorical agreement and narrative similarity are distinct bounded signals.
  const problem = sameProblem ? 1 : 0;
  const goalOpposition = opposingPredicates(
    situation.goal,
    item.goal,
    similarity,
  );
  const goal = goalOpposition
    ? -goalOpposition
    : similarity(situation.goal, item.goal);
  const constraints = distinct(situation.constraints);
  const constraintMatches = constraints.map((text) => {
    const matches = distinct(item.constraints).map((own) => ({
      own,
      check: compareConditions([text], [own]),
    }));
    const explicit = matches.filter((m) => m.check.comparable);
    const agrees = explicit.some((m) => !m.check.differences.length);
    const conflicts = explicit.some((m) => m.check.differences.length > 0);
    return {
      text,
      score: explicit.length
        ? agrees && conflicts
          ? 0 // Conflicting same-subject records are uncertain, not exact agreement.
          : conflicts
            ? -1
            : 1
        : Math.max(0, ...matches.map((m) => similarity(text, m.own))),
    };
  });
  // Average coverage across the student's restrictions; one shared word is not full coverage.
  const constraintScore = constraints.length
    ? constraintMatches.reduce((sum, m) => sum + m.score, 0) /
      constraints.length
    : 0;
  const urgency =
    situation.deadline.urgency !== "unknown" &&
    item.urgency === situation.deadline.urgency
      ? 1
      : 0;
  const components = {
    problem,
    context,
    constraints: constraintScore,
    goal,
    urgency,
  };
  // Category, action and urgency alone are not evidence of similar circumstances.
  const relevant =
    sameProblem || context >= 0.12 || constraintScore >= 0.22 || goal >= 0.25;
  const conditionCheck = compareConditions(
    situation.constraints,
    item.constraints,
  );
  if (
    situation.deadline.urgency !== "unknown" &&
    item.urgency !== "unknown" &&
    !urgency
  )
    conditionCheck.differences.push(
      `행동할 시간 차이: 학생 ${URGENCY_LABELS[situation.deadline.urgency]} / 선배 ${URGENCY_LABELS[item.urgency]}. 적용 가능성 확인 필요`,
    );
  if (contextOpposition)
    conditionCheck.differences.push(
      "같은 주제의 상황 서술에 반대 부정 표현이 있어 확인 필요",
    );
  if (goalOpposition)
    conditionCheck.differences.push(
      "같은 주제의 목표 서술에 반대 부정 표현이 있어 확인 필요",
    );
  const coverage = { known: ["실제 행동"], unknown: [] as string[] };
  for (const [label, known] of [
    ["문제 유형", !!situation.problemType && !!item.problemType],
    ["상황 설명", !!situation.situation.trim() && !!item.situation.trim()],
    ["주요 제약", constraints.length > 0 && item.constraints.length > 0],
    ["목표", !!situation.goal.trim() && !!item.goal.trim()],
    [
      "긴급도",
      situation.deadline.urgency !== "unknown" && item.urgency !== "unknown",
    ],
  ] as const)
    (known ? coverage.known : coverage.unknown).push(label);
  const similarities: string[] = [];
  const differences: string[] = [...conditionCheck.differences];
  if (actionMatched) similarities.push("선배가 실제로 이 행동을 했음");
  if (actionMatched && !relevant)
    differences.push(
      "행동은 같지만 현재 상황과의 유사성을 뒷받침할 정보는 부족함",
    );
  if (sameProblem) similarities.push("같은 종류의 상황");
  else if (situation.problemType)
    differences.push(
      item.problemType
        ? "문제의 종류가 다를 수 있음"
        : "선배의 문제 유형은 미확인",
    );
  if (context >= 0.12) similarities.push("상황·진행 설명에 관련된 표현이 있음");
  for (const match of constraintMatches
    .filter((m) => m.score >= 0.22)
    .slice(0, 2))
    similarities.push(`제약 관련 표현이 겹침: ${match.text.slice(0, 100)}`);
  if (goal >= 0.25) similarities.push("목표 설명에 관련된 표현이 있음");
  if (urgency)
    similarities.push(`남은 시간이 비슷함 (${URGENCY_LABELS[item.urgency]})`);
  else if (situation.deadline.urgency !== "unknown")
    differences.push(
      item.urgency === "unknown"
        ? "선배의 당시 남은 시간은 미확인"
        : `선배는 ${URGENCY_LABELS[item.urgency]} 상황이었음`,
    );
  if (constraints.length && constraintScore < 0.22)
    differences.push("주요 제약이 비슷한지는 사례에서 확인되지 않음");
  return {
    score: 0,
    actionMatched,
    relevant,
    conditionDifferences: conditionCheck.differences,
    coverage,
    components,
    similarities,
    differences,
  };
}
export function scoreCase(
  situation: Situation,
  action: ActionCandidate,
  item: Case,
): MatchInfo {
  const result = {
    item,
    info: evaluate(situation, action, item, makeSimilarity([item])),
  };
  applyScores(situation, [result], {});
  return result.info;
}
export interface RetrievalOptions {
  source?: Case["sourceType"];
  /** Local ablation evaluation only; never sent by the client. */
  omitDimensions?: readonly Dimension[];
}
function approvedCandidates(
  situation: Situation,
  cases: Case[],
  options: RetrievalOptions,
) {
  return cases.filter(
    (item) =>
      item.status === "approved" &&
      item.category === situation.category &&
      item.sourceType === (options.source ?? "real"),
  );
}
function applyScores(
  situation: Situation,
  ranked: RankedCase[],
  options: RetrievalOptions,
) {
  const scores = distributedScores(
    ranked.map(({ item, info }) => ({
      components: info.components,
      studentTexts: {
        context: [situation.situation, situation.progress].join(" "),
        constraints: situation.constraints.join(" "),
        goal: situation.goal,
      },
      caseTexts: {
        context: item.situation,
        constraints: item.constraints.join(" "),
        goal: item.goal,
      },
    })),
    options.omitDimensions,
  );
  for (let i = 0; i < ranked.length; i++) {
    ranked[i].info.score = scores[i].score;
    ranked[i].info.distributed = scores[i];
    if (
      scores[i].supportingDimensions.length < 2 &&
      ranked[i].info.components.context < 0.5
    ) {
      ranked[i].info.relevant = false;
      if (!ranked[i].info.differences.some((d) => d.includes("정보는 부족")))
        ranked[i].info.differences.push(
          "유사성 근거가 한 항목 이하에 집중되어 여러 조건이 비슷하다고 판단할 정보는 부족함",
        );
    }
  }
}
function rank(
  situation: Situation,
  action: ActionCandidate,
  cases: Case[],
  options: RetrievalOptions,
): RankedCase[] {
  // The retrieval unit is situation + selected action. Excluded actions must
  // not change IDF, component scores or ordering for this action's candidates.
  const eligible = cases.filter(
    (item) =>
      !!action.actionTag &&
      item.actionSteps.some((step) => step.actionTag === action.actionTag),
  );
  const similarity = makeSimilarity(eligible);
  const ranked = eligible
    .map((item) => ({
      item,
      info: evaluate(situation, action, item, similarity),
    }))
    .filter((entry) => entry.info.actionMatched);
  applyScores(situation, ranked, options);
  return ranked.sort(
    (a, b) =>
      b.info.score - a.info.score ||
      (a.item.id < b.item.id ? -1 : a.item.id > b.item.id ? 1 : 0),
  );
}
export function rankCases(
  situation: Situation,
  action: ActionCandidate,
  cases: Case[],
  options: RetrievalOptions = {},
): RankedCase[] {
  const candidates = approvedCandidates(situation, cases, options);
  return rank(situation, action, candidates, options);
}

export function unknownsOf(situation: Situation): string[] {
  // Confirmation can fill fields that the model previously marked as missing.
  const filled = new Set([
    ...(situation.progress.trim() ? ["진행 상황"] : []),
    ...(situation.goal.trim() ? ["원하는 결과"] : []),
    ...(situation.deadline.raw.trim() ? ["마감·남은 시간"] : []),
  ]);
  const unknowns = situation.unknowns.filter((field) => !filled.has(field));
  // 묻지 않은 진행 상황·원하는 결과는 미확인으로 세지 않는다. 대화에서 묻는 건 마감뿐이라,
  // 나머지를 여기서 줄줄이 붙이면 학생이 답하지 않은 걸 결과마다 탓하는 것처럼 보인다.
  if (!situation.deadline.raw && !unknowns.includes("마감·남은 시간"))
    unknowns.push("마감·남은 시간");
  return Array.from(new Set(unknowns));
}

/** 한 행동에 대한 결과 카드. 매칭 정보는 저장된 사례 필드로만 채운다 (v2 §6). */
export function buildResult(
  action: ActionCandidate,
  situation: Situation,
  ranked: RankedCase | undefined,
): ActionResult {
  const base = {
    id: `result-${action.id}`,
    action,
    unknowns: unknownsOf(situation),
  };

  if (!action.actionTag) {
    return {
      ...base,
      status: "no_case",
      unsupported: true,
      similarities: [],
      differences: [
        "이 행동의 의미를 확인했지만 지원하는 사례 태그와 연결되지 않았어요. 행동 확인 화면에서 의미를 다시 선택해 주세요",
      ],
      seniorActions: [],
      conditions: [],
    };
  }
  if (!ranked) {
    return {
      ...base,
      status: "no_case",
      similarities: [],
      differences: ["이 행동을 실제로 한 승인 사례가 아직 없습니다"],
      seniorActions: [],
      conditions: [],
    };
  }

  const { item, info } = ranked;
  const differences = [...info.differences];
  for (const field of info.coverage.unknown)
    base.unknowns.push(`${field} 비교 정보`);
  if (item.actionSteps.length > 1)
    differences.push(
      "여러 행동을 거친 사례 전체의 결과입니다. 특정 행동 하나의 효과로 단정할 수 없으며 행동별 결과 시점은 별도 기록이 없습니다",
    );

  if (item.conditions.length)
    base.unknowns.push("선배 사례의 적용 조건이 지금도 충족되는지는 확인 필요");
  return {
    ...base,
    status:
      info.relevant && !info.conditionDifferences.length
        ? "matched"
        : "reference",
    caseId: item.id,
    caseTitle: item.title,
    sourceType: item.sourceType,
    comparedFields: info.coverage.known,
    similarities: info.similarities,
    differences,
    seniorActions: [...item.actionSteps]
      .sort((a, b) => a.order - b.order)
      .map((step) => `${step.order}. ${step.description}`),
    outcome: item.outcome,
    cost: item.receipt.cost,
    conditions: [...item.conditions],
    toolTitle: item.tool?.title,
  };
}

/** Flatten only one level: alternatives never contain further alternatives. */
export function resultCards(results: ActionResult[]): ActionResult[] {
  return results.flatMap((r) => [r, ...(r.alternatives ?? [])]);
}

export function matchActions(
  situation: Situation,
  actions: ActionCandidate[],
  cases: Case[],
  options: RetrievalOptions = {},
): ActionResult[] {
  const candidates = approvedCandidates(situation, cases, options);
  const results = actions
    .filter((a) => a.confirmed)
    .map((action) => {
      const ranked = action.actionTag
        ? rank(situation, action, candidates, options)
        : [];
      const first = ranked[0];
      const result = buildResult(action, situation, first);
      if (!first) return result;
      // Rank the representative WITHOUT outcome. Then retain a different recorded
      // trajectory rather than presenting one outcome as the only possible one.
      const remaining = ranked.slice(1).filter((r) => r.info.relevant);
      const extras: RankedCase[] = [];
      const trajectories = new Set([first.item.receipt.status]);
      for (const entry of remaining) {
        if (extras.length === 2) break;
        if (!trajectories.has(entry.item.receipt.status)) {
          extras.push(entry);
          trajectories.add(entry.item.receipt.status);
        }
      }
      for (const entry of remaining) {
        if (extras.length === 2) break;
        if (!extras.some((other) => other.item.id === entry.item.id))
          extras.push(entry);
      }
      if (extras.length)
        result.alternatives = extras.map((r) => ({
          ...buildResult(action, situation, r),
          id: `${result.id}-case-${r.item.id}`,
        }));
      return result;
    });
  const cards = resultCards(results);
  for (const result of cards) {
    if (
      result.caseId &&
      cards.filter((other) => other.caseId === result.caseId).length > 1
    )
      result.differences.push(
        "다른 행동 카드와 동일한 선배 사례입니다. 서로 독립된 경험으로 세지 마세요",
      );
  }
  return results;
}
