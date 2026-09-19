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
  score: number;
  actionMatched: boolean;
  similarities: string[];
  differences: string[];
}

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[\s,.!?~()[\]"'·/]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
}

function overlaps(a: string, b: string): boolean {
  const tokensA = tokenize(a);
  const lowerB = b.toLowerCase();
  return tokensA.some((token) => lowerB.includes(token));
}

export function scoreCase(
  situation: Situation,
  action: ActionCandidate,
  item: Case,
): MatchInfo {
  let score = 0;
  const similarities: string[] = [];
  const differences: string[] = [];

  const actionMatched = Boolean(
    action.actionTag &&
    item.actionSteps.some((step) => step.actionTag === action.actionTag),
  );
  if (actionMatched) {
    score += 30;
    similarities.push("선배가 실제로 이 행동을 했음");
  }

  if (situation.problemType && item.problemType === situation.problemType) {
    score += 30;
    similarities.push("같은 종류의 상황");
  } else if (
    situation.problemType &&
    item.problemType !== situation.problemType
  ) {
    differences.push("문제의 종류가 다를 수 있음");
  }

  const constraintHit = situation.constraints.some((constraint) =>
    item.constraints.some((own) => overlaps(constraint, own)),
  );
  if (constraintHit) {
    score += 20;
    similarities.push("주요 제약이 비슷함");
  }

  if (situation.deadline.urgency !== "unknown") {
    if (item.urgency === situation.deadline.urgency) {
      score += 10;
      similarities.push(`남은 시간이 비슷함 (${URGENCY_LABELS[item.urgency]})`);
    } else {
      differences.push(`선배는 ${URGENCY_LABELS[item.urgency]} 상황이었음`);
    }
  }

  if (situation.goal && overlaps(situation.goal, item.goal)) {
    score += 10;
    similarities.push("원하는 결과가 비슷함");
  }

  const haystack = [item.situation, item.title, ...item.tags]
    .join(" ")
    .toLowerCase();
  let textHits = 0;
  for (const token of tokenize(
    `${situation.situation} ${situation.progress}`,
  )) {
    if (haystack.includes(token)) textHits += 1;
  }
  if (textHits > 0) {
    score += Math.min(textHits, 10);
    similarities.push("상황 설명에 겹치는 표현이 있음");
  }

  return { score, actionMatched, similarities, differences };
}

export interface RankedCase {
  item: Case;
  info: MatchInfo;
}

export function rankCases(
  situation: Situation,
  action: ActionCandidate,
  cases: Case[],
): RankedCase[] {
  return cases
    .filter((item) => item.category === situation.category)
    .map((item) => ({ item, info: scoreCase(situation, action, item) }))
    .filter((ranked) => ranked.info.score > 0)
    .sort((a, b) => {
      if (a.info.actionMatched !== b.info.actionMatched)
        return a.info.actionMatched ? -1 : 1;
      return b.info.score - a.info.score;
    });
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
    conditions: item.conditions,
    toolTitle: item.tool?.title,
  };
}

export function matchActions(
  situation: Situation,
  actions: ActionCandidate[],
  cases: Case[],
): ActionResult[] {
  return actions
    .filter((action) => action.confirmed)
    .map((action) =>
      buildResult(action, situation, rankCases(situation, action, cases)[0]),
    );
}
