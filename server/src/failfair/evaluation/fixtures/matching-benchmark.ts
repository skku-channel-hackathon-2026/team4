import { DEMO_CASES, type Case, type Situation } from "@tutorial/shared";

/** Synthetic judgments fixed before the retrieval experiment, not production
 * success rates. Keep the validation split out of tuning; never change labels
 * just because a candidate implementation fails. */
const caseOf = (
  id: string,
  category: Case["category"],
  situation: string,
  constraints: string[],
  goal: string,
  actionTag: string,
  problemType: string,
): Case => ({
  ...DEMO_CASES[0],
  id,
  category,
  title: `${id} 가상 경험`,
  situation,
  constraints,
  goal,
  problemType,
  tags: [],
  urgency: "unknown",
  actionSteps: [{ order: 1, actionTag, description: "도움을 요청했다" }],
  outcome: {
    shortTerm: "가상 평가용 관찰",
    followUp: "",
    unresolved: "미확인",
  },
  receipt: {
    firstAction: "도움 요청",
    wasted: "",
    turningPoint: "",
    cost: "시간 소모",
    status: "partial",
  },
  conditions: [],
  tool: undefined,
});
export const BENCHMARK_CASES: Case[] = [
  caseOf(
    "team-contact",
    "team_project",
    "조별 발표 자료를 맡은 팀원이 연락을 끊고 단체 대화방에도 답이 없었다",
    ["나머지 팀원은 함께 작업할 수 있음"],
    "발표 자료를 기한 안에 제출",
    "inform_professor",
    "unreachable_member",
  ),
  caseOf(
    "team-skill",
    "team_project",
    "팀원들과 연락은 잘 되지만 모두 코딩 경험이 부족해서 구현 진도가 나가지 않았다",
    ["개발 경험이 없는 팀원들", "자료 조사는 완료"],
    "작동하는 프로그램 완성",
    "inform_professor",
    "skill_gap",
  ),
  caseOf(
    "team-equipment",
    "team_project",
    "노트북 고장으로 작성하던 보고서 파일을 열 수 없었다",
    ["백업 파일 없음", "노트북 수리 필요"],
    "보고서 파일 복구",
    "inform_professor",
    "equipment_failure",
  ),
  caseOf(
    "grades-time",
    "grades",
    "아르바이트와 통학 때문에 책을 펼칠 시간이 부족해서 시험 준비를 못했다",
    ["주중 저녁 근무", "왕복 통학 두 시간"],
    "일을 유지하며 시험 준비",
    "ask_help",
    "time_shortage",
  ),
  caseOf(
    "grades-method",
    "grades",
    "매일 오래 공부했지만 외운 내용을 응용 문제에 적용하지 못해 시험 점수가 낮았다",
    ["공부할 시간은 충분함", "강의 내용 암기 위주"],
    "응용 문제 해결 능력 향상",
    "ask_help",
    "study_method",
  ),
  caseOf(
    "grades-review",
    "grades",
    "제출한 과제가 누락 처리되어 성적에서 점수가 빠졌다",
    ["제출 확인 메일이 있음"],
    "잘못 반영된 과제 점수 정정",
    "ask_help",
    "grading_error",
  ),
  caseOf(
    "club-load",
    "club",
    "동아리 행사 준비 업무를 혼자 맡아 수업 과제를 할 시간이 없었다",
    ["업무를 나눌 사람이 필요함"],
    "동아리 활동은 유지하면서 업무 부담 줄이기",
    "ask_help",
    "role_overload",
  ),
  caseOf(
    "club-conflict",
    "club",
    "동아리 구성원들이 서로 험담하면서 갈등이 커졌고 회의마다 말다툼을 했다",
    ["회장과의 관계가 불편함"],
    "갈등을 중재하고 관계 회복",
    "ask_help",
    "interpersonal_conflict",
  ),
  caseOf(
    "club-recruit",
    "club",
    "동아리 신입 부원 지원자가 부족해서 행사를 열 인원이 모자랐다",
    ["홍보 예산 없음"],
    "신입 부원 모집",
    "ask_help",
    "recruitment_shortage",
  ),
];

export interface BenchmarkQuery {
  id: string;
  split: "development" | "validation";
  kind: "ranking" | "abstention" | "weak-evidence";
  note: string;
  situation: Situation;
  actionTag: string;
  /** Multiple IDs can be acceptable; empty for abstention. */
  acceptableIds: string[];
  cases?: Case[];
}
const situation = (
  category: Situation["category"],
  text: string,
  extra: Partial<Situation> = {},
): Situation => ({
  category,
  situation: text,
  goal: "",
  progress: "",
  constraints: [],
  deadline: { raw: "", urgency: "unknown" },
  attemptedActions: [],
  consideredActions: [],
  unknowns: [],
  ...extra,
});
const q = (
  id: string,
  split: BenchmarkQuery["split"],
  category: Situation["category"],
  text: string,
  expected: string,
  extra: Partial<Situation> = {},
): BenchmarkQuery => ({
  id,
  split,
  kind: "ranking",
  note: "내용이 같은 고민을 다른 표현으로 검색",
  situation: situation(category, text, extra),
  actionTag: category === "team_project" ? "inform_professor" : "ask_help",
  acceptableIds: [expected],
});
const metadataTrap = (
  category: Situation["category"],
  text: string,
  rightId: string,
  wrongId: string,
) => {
  const right = BENCHMARK_CASES.find((c) => c.id === rightId)!;
  const wrong = BENCHMARK_CASES.find((c) => c.id === wrongId)!;
  return [
    right,
    { ...wrong, category, title: text, tags: text.split(" ").slice(0, 8) },
  ];
};

export const BENCHMARK_QUERIES: BenchmarkQuery[] = [
  q(
    "dev-contact",
    "development",
    "team_project",
    "조원이 단톡을 읽지도 않고 답장도 안 해요. 발표 자료가 비었어요",
    "team-contact",
  ),
  q(
    "dev-skill",
    "development",
    "team_project",
    "연락 문제는 없어요. 다들 개발을 처음 해서 코드를 못 짜고 있어요",
    "team-skill",
  ),
  q(
    "dev-job",
    "development",
    "grades",
    "퇴근하고 집에 오면 너무 늦어서 공부할 시간이 없어요",
    "grades-time",
    { constraints: ["저녁 아르바이트", "통학 시간이 김"] },
  ),
  q(
    "dev-method",
    "development",
    "grades",
    "책은 매일 외우는데 조금만 변형된 문제가 나오면 못 풀어요",
    "grades-method",
  ),
  q(
    "dev-load",
    "development",
    "club",
    "행사 준비를 저 혼자 다 하느라 과제 낼 시간이 없어요",
    "club-load",
  ),
  q(
    "dev-conflict",
    "development",
    "club",
    "회의만 하면 싸우고 서로 뒷담화해요. 사이를 풀고 싶어요",
    "club-conflict",
    { goal: "동아리 구성원 사이 갈등 해결" },
  ),
  {
    ...q(
      "dev-title-leak",
      "development",
      "team_project",
      "팀원이 답이 없어서 발표 자료를 채우지 못했어요",
      "team-contact",
    ),
    note: "제목·태그가 고민을 반복해도 실제 상황이 다른 사례는 우선하지 않기",
    cases: metadataTrap(
      "team_project",
      "팀원이 답이 없어서 발표 자료를 채우지 못했어요",
      "team-contact",
      "team-equipment",
    ),
  },
  {
    ...q("dev-empty-reference", "development", "grades", "", ""),
    kind: "abstention",
    note: "카테고리와 시간만으로 참고 사례를 만들지 않기",
    actionTag: "request_grade_review",
    acceptableIds: [],
    situation: situation("grades", "", {
      deadline: { raw: "오늘", urgency: "today" },
    }),
  },
  {
    ...q(
      "dev-unrelated",
      "development",
      "grades",
      "기숙사 에어컨 수리 접수 절차를 알고 싶어요",
      "",
    ),
    kind: "abstention",
    note: "관련 없는 문제에서는 무리하게 참고 사례를 만들지 않기",
    actionTag: "request_grade_review",
    acceptableIds: [],
  },
  {
    ...q("dev-action-only", "development", "club", "", ""),
    kind: "weak-evidence",
    acceptableIds: [],
    note: "행동만 같을 때 상황 유사성이 부족하다고 명시하기",
  },
  q(
    "val-equipment",
    "validation",
    "team_project",
    "컴퓨터가 망가져서 보고서를 못 열어요. 백업도 안 했어요",
    "team-equipment",
  ),
  q(
    "val-contact",
    "validation",
    "team_project",
    "발표 담당 조원이 며칠째 잠수예요",
    "team-contact",
  ),
  q(
    "val-grade-record",
    "validation",
    "grades",
    "분명 과제를 냈는데 미제출로 떠서 감점됐어요",
    "grades-review",
    { constraints: ["제출 완료 메일 보관"] },
  ),
  q(
    "val-study",
    "validation",
    "grades",
    "공부 시간을 늘려도 성적이 그대로예요. 외우기만 해서 활용을 못하는 것 같아요",
    "grades-method",
  ),
  q(
    "val-recruit",
    "validation",
    "club",
    "신입을 뽑아야 하는데 지원이 없어요. 광고비도 못 써요",
    "club-recruit",
  ),
  q(
    "val-load",
    "validation",
    "club",
    "행사 일을 전부 떠안아서 학업이 밀렸어요. 탈퇴는 싫어요",
    "club-load",
  ),
  {
    ...q(
      "val-tag-leak",
      "validation",
      "grades",
      "통학하고 저녁 근무하니 시험공부 시간이 모자라요",
      "grades-time",
    ),
    note: "다른 카테고리에서도 제목·태그가 상황 근거를 대신하지 않기",
    cases: metadataTrap(
      "grades",
      "통학하고 저녁 근무하니 시험공부 시간이 모자라요",
      "grades-time",
      "grades-review",
    ),
  },
  {
    ...q(
      "val-unrelated",
      "validation",
      "club",
      "여권 갱신에 필요한 사진 규격을 알려주세요",
      "",
    ),
    kind: "abstention",
    actionTag: "reduce_role",
    acceptableIds: [],
  },
  {
    ...q("val-number-only", "validation", "grades", "3.1 4.0 18", ""),
    kind: "abstention",
    actionTag: "request_grade_review",
    acceptableIds: [],
    note: "맥락 없는 숫자로 유사 사례를 만들지 않기",
  },
  {
    ...q("val-unknown", "validation", "team_project", "모르겠어요", ""),
    kind: "weak-evidence",
    acceptableIds: [],
  },
  {
    ...q(
      "dev-negation",
      "development",
      "grades",
      "공부할 시간이 부족하지 않아요. 오래 외워도 응용을 못해요",
      "grades-method",
      { constraints: ["공부할 시간은 부족하지 않음"] },
    ),
    note: "부정 표현 때문에 반대 상황으로 끌려가지 않기",
  },
  {
    ...q(
      "val-negation",
      "validation",
      "team_project",
      "연락이 끊긴 건 아니에요. 연락은 되는데 프로그래밍을 못해요",
      "team-skill",
    ),
    note: "연락 문제를 부정하는 문장과 실제 코딩 문제 구별",
  },
];
