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
export const MATCH_WEIGHTS = {
  problem: 30,
  context: 30,
  constraints: 20,
  goal: 15,
  urgency: 5,
} as const;
export interface MatchInfo {
  /** Internal relevance score, not success probability. */
  score: number;
  actionMatched: boolean;
  relevant: boolean;
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
const contextText = (item: Case) =>
  [item.situation, item.title, ...item.tags].join(" ");
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
  const problem =
    situation.problemType && situation.problemType === item.problemType ? 1 : 0;
  const context = similarity(
    [situation.situation, situation.progress].join(" "),
    contextText(item),
  );
  const goal = similarity(situation.goal, item.goal);
  const constraints = distinct(situation.constraints);
  const constraintMatches = constraints.map((text) => ({
    text,
    score: Math.max(
      0,
      ...distinct(item.constraints).map((own) => similarity(text, own)),
    ),
  }));
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
  const score = Object.entries(MATCH_WEIGHTS).reduce(
    (sum, [key, weight]) =>
      sum + weight * components[key as keyof typeof components],
    0,
  );
  // Category, action and urgency alone are not evidence of similar circumstances.
  const relevant =
    !!problem || context >= 0.12 || constraintScore >= 0.22 || goal >= 0.25;
  const similarities: string[] = [];
  const differences: string[] = [];
  if (actionMatched) similarities.push("선배가 실제로 이 행동을 했음");
  if (actionMatched && !relevant)
    differences.push(
      "행동은 같지만 현재 상황과의 유사성을 뒷받침할 정보는 부족함",
    );
  if (problem) similarities.push("같은 종류의 상황");
  else if (situation.problemType)
    differences.push("문제의 종류가 다를 수 있음");
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
    score: Math.round(score * 100) / 100,
    actionMatched,
    relevant,
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
  return evaluate(situation, action, item, makeSimilarity([item]));
}
function approvedCandidates(situation: Situation, cases: Case[]) {
  return cases.filter(
    (item) =>
      item.status === "approved" && item.category === situation.category,
  );
}
function rank(
  situation: Situation,
  action: ActionCandidate,
  cases: Case[],
  similarity: Similarity,
): RankedCase[] {
  return cases
    .map((item) => ({
      item,
      info: evaluate(situation, action, item, similarity),
    }))
    .filter((entry) => entry.info.relevant || entry.info.actionMatched)
    .sort(
      (a, b) =>
        Number(b.info.actionMatched) - Number(a.info.actionMatched) ||
        b.info.score - a.info.score ||
        (a.item.id < b.item.id ? -1 : a.item.id > b.item.id ? 1 : 0),
    );
}
export function rankCases(
  situation: Situation,
  action: ActionCandidate,
  cases: Case[],
): RankedCase[] {
  const candidates = approvedCandidates(situation, cases);
  return rank(situation, action, candidates, makeSimilarity(candidates));
}

export function unknownsOf(situation: Situation): string[] {
  const unknowns = [...situation.unknowns];
  if (!situation.deadline.raw && !unknowns.includes("마감·남은 시간"))
    unknowns.push("마감·남은 시간");
  if (!situation.progress && !unknowns.includes("진행 상황"))
    unknowns.push("진행 상황");
  if (!situation.goal) unknowns.push("원하는 결과");
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
      similarities: [],
      differences: ["이 행동은 아직 사례 태그와 연결되지 않았어요"],
      seniorActions: [],
      conditions: [],
    };
  }
  if (!ranked) {
    return {
      ...base,
      status: "no_case",
      similarities: [],
      differences: [],
      seniorActions: [],
      conditions: [],
    };
  }

  const { item, info } = ranked;
  const differences = info.actionMatched
    ? info.differences
    : [
        "선배는 이 행동은 하지 않았어요. 비슷한 상황의 참고 사례예요",
        ...info.differences,
      ];

  if (item.conditions.length)
    base.unknowns.push("선배 사례의 적용 조건이 지금도 충족되는지는 확인 필요");
  return {
    ...base,
    status: info.actionMatched ? "matched" : "reference",
    caseId: item.id,
    caseTitle: item.title,
    sourceType: item.sourceType,
    similarities: info.similarities,
    differences,
    seniorActions: [...item.actionSteps]
      .sort((a, b) => a.order - b.order)
      .map((step) => step.description),
    outcome: item.outcome,
    cost: item.receipt.cost,
    conditions: [...item.conditions],
    toolTitle: item.tool?.title,
  };
}

export function matchActions(
  situation: Situation,
  actions: ActionCandidate[],
  cases: Case[],
): ActionResult[] {
  const candidates = approvedCandidates(situation, cases);
  const similarity = makeSimilarity(candidates);
  const results = actions
    .filter((action) => action.confirmed)
    .map((action) =>
      buildResult(
        action,
        situation,
        rank(situation, action, candidates, similarity)[0],
      ),
    );
  for (const result of results) {
    if (
      result.caseId &&
      results.filter((other) => other.caseId === result.caseId).length > 1
    )
      result.differences.push(
        "다른 행동 카드와 동일한 선배 사례입니다. 서로 독립된 경험으로 세지 마세요",
      );
  }
  return results;
}
