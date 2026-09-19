import { type Case, type Situation } from "@tutorial/shared";
import { BENCHMARK_CASES, type BenchmarkQuery } from "./matching-benchmark.js";

/** Diagnostic suite added AFTER the first candidate was frozen.
 * Not used to tune weights or thresholds. Failures are known limitations. */
function pair(
  id: string,
  category: Situation["category"],
  query: string,
  correct: string,
  distractor: string,
  field: "situation" | "constraints" = "situation",
): BenchmarkQuery {
  const base = BENCHMARK_CASES.find((c) => c.category === category)!;
  const make = (caseId: string, text: string): Case => ({
    ...base,
    id: caseId,
    title: "가상 대조 사례",
    problemType: "comparison",
    goal: "",
    tags: [],
    situation: field === "situation" ? text : "학업 계획을 조정하고 있었다",
    constraints: field === "constraints" ? [text] : [],
  });
  return {
    id,
    split: "validation",
    kind: "ranking",
    note: "진단용 최소 대조쌍: 의미 이해 한계를 확인하며 이번 수정에는 사용하지 않음",
    situation: {
      category,
      situation: field === "situation" ? query : "학업 계획을 조정하고 있어요",
      constraints: field === "constraints" ? [query] : [],
      goal: "",
      progress: "",
      deadline: { raw: "", urgency: "unknown" },
      attemptedActions: [],
      consideredActions: [],
      unknowns: [],
    },
    actionTag: base.actionSteps[0].actionTag,
    acceptableIds: ["z-compatible"],
    cases: [make("a-incompatible", distractor), make("z-compatible", correct)],
  };
}
export const CHALLENGE_QUERIES: BenchmarkQuery[] = [
  pair(
    "challenge-paraphrase",
    "team_project",
    "조원이 읽씹 중이에요",
    "팀원과 연락이 닿지 않는다",
    "조원이 코딩을 배우는 중이다",
  ),
  pair(
    "challenge-negation",
    "grades",
    "공부할 시간이 부족하지 않아요",
    "학습에 쓸 여유가 충분하다",
    "공부할 시간이 부족하다",
  ),
  pair(
    "challenge-polarity",
    "club",
    "행사 업무를 줄일 수 없어요",
    "맡은 일을 반드시 유지해야 한다",
    "행사 업무를 줄일 수 있다",
  ),
  pair(
    "challenge-gpa",
    "grades",
    "평점 3.1",
    "평점 3.1",
    "평점 4.1",
    "constraints",
  ),
  pair(
    "challenge-time-equivalence",
    "grades",
    "통학 왕복 2시간",
    "통학 왕복 120분",
    "통학 왕복 20분",
    "constraints",
  ),
  pair(
    "challenge-course-load",
    "grades",
    "18학점 수강",
    "18학점 수강",
    "9학점 수강",
    "constraints",
  ),
];
