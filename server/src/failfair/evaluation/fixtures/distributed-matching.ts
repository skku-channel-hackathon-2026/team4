import type { Case, Situation } from "@tutorial/shared";
import { BENCHMARK_CASES, type BenchmarkQuery } from "./matching-benchmark.js";

/** Frozen before distributed weighting. Synthetic contrasts, not independent
 * real-world annotations. Expected IDs never enter production scoring. */
const pairs = [
  {
    category: "team_project" as const,
    near: "team-contact",
    far: "team-equipment",
    text: "조원이 답장을 안 해서 발표에 쓸 자료가 비었어요",
    goal: "발표 자료를 마감까지 내기",
    constraints: ["나머지 인원은 같이 작업 가능"],
  },
  {
    category: "grades" as const,
    near: "grades-time",
    far: "grades-review",
    text: "퇴근과 통학 때문에 공부할 시간이 모자라요",
    goal: "아르바이트를 그만두지 않고 시험 대비",
    constraints: ["저녁에 일해야 함", "왕복 두 시간 통학"],
  },
  {
    category: "club" as const,
    near: "club-load",
    far: "club-conflict",
    text: "행사 일을 혼자 처리하니 수업 숙제를 할 틈이 없어요",
    goal: "활동을 이어가며 맡은 일을 줄이기",
    constraints: ["일을 나눠 줄 사람이 필요"],
  },
];
function query(
  id: string,
  split: BenchmarkQuery["split"],
  p: (typeof pairs)[number],
  candidates: Case[],
  extra: Partial<Situation> = {},
): BenchmarkQuery {
  const near = BENCHMARK_CASES.find((c) => c.id === p.near)!;
  return {
    id,
    split,
    kind: "ranking",
    note: "여러 상황 근거가 단일 시간/라벨/제약 차이보다 함께 반영되어야 함",
    situation: {
      category: p.category,
      situation: p.text,
      goal: p.goal,
      constraints: p.constraints,
      progress: "",
      deadline: { raw: "오늘", urgency: "today" },
      attemptedActions: [],
      consideredActions: [],
      unknowns: [],
      ...extra,
    },
    actionTag: near.actionSteps[0].actionTag,
    acceptableIds: [near.id],
    cases: candidates,
  };
}
export const DISTRIBUTED_QUERIES: BenchmarkQuery[] = pairs.flatMap((p, i) => {
  const near = BENCHMARK_CASES.find((c) => c.id === p.near)!;
  const far = BENCHMARK_CASES.find((c) => c.id === p.far)!;
  return [
    query(`balance-${i}-time`, "development", p, [
      { ...near, urgency: "week" },
      { ...far, urgency: "today" },
    ]),
    query(`balance-${i}-sparse`, "development", p, [
      { ...near, urgency: "week" },
      { ...far, urgency: "unknown", constraints: [], goal: "" },
    ]),
    query(
      `balance-${i}-tag`,
      "development",
      p,
      [near, { ...far, problemType: "general_difficulty" }],
      {
        problemType: "general_difficulty",
        deadline: { raw: "", urgency: "unknown" },
      },
    ),
    query(
      `holdout-${i}-resource`,
      "validation",
      p,
      [
        {
          ...near,
          constraints: [...near.constraints, "가용 인원 2명"],
          urgency: "today",
        },
        { ...far, constraints: ["가용 인원 3명"], urgency: "today" },
      ],
      {
        constraints: [...p.constraints, "가용 인원 3명"],
        problemType: near.problemType,
      },
    ),
    query(
      `holdout-${i}-goal`,
      "validation",
      p,
      [near, { ...far, goal: p.goal }],
      {
        problemType: near.problemType,
        deadline: { raw: "", urgency: "unknown" },
      },
    ),
    query(
      `holdout-${i}-narrative`,
      "validation",
      p,
      [near, { ...far, situation: p.text }],
      {
        problemType: near.problemType,
        deadline: { raw: "", urgency: "unknown" },
      },
    ),
  ];
});
