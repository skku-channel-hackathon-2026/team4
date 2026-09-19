import type { Situation } from "./failfair.js";

/**
 * 검색 정답 기준 (v2 §14 "데이터와 근거").
 * DEMO_CASES가 바뀌었을 때 §5.3의 분기가 여전히 의도대로 동작하는지 확인한다.
 * server/src/failfair/golden.test.ts가 이 목록을 읽어 rankCases·matchActions를 돌린다.
 *
 * 순위 자체는 고정하지 않는다. §5.2의 가중치는 조정 대상이므로, 여기서는
 * "행동을 실제로 한 사례가 1순위여야 한다", "이 두 사례가 함께 나와야 한다"처럼
 * 가중치를 바꿔도 지켜져야 하는 성질만 적는다.
 *
 * D(콘텐츠)가 cases.ts와 함께 소유한다.
 */
export interface GoldenAction {
  /** 학생이 고른 행동의 태그. ACTION_TAGS에 있는 값만 쓴다. */
  actionTag: string;
  /** 1순위가 반드시 이 사례여야 한다. */
  expectTopCaseId?: string;
  /** 순서는 상관없지만 결과 목록에 모두 들어 있어야 한다. */
  expectRanked?: readonly string[];
  /** buildResult가 내야 하는 상태. */
  expectStatus: "matched" | "reference" | "no_case";
}

export interface GoldenQuery {
  id: string;
  /** 이 질의가 무엇을 검증하는지. 실패했을 때 읽고 판단할 사람을 위한 것이다. */
  intent: string;
  situation: Situation;
  actions: readonly GoldenAction[];
  /**
   * 한 사례 안에 행동이 여럿 등장하는 경우 (§5.1). 이 사례는 나열된 모든 행동에서
   * "선배가 실제로 이 행동을 했음"으로 잡혀야 한다.
   *
   * 주의: 이 사례가 여러 행동 카드에 동시에 뜰 때 "같은 사례"임을 화면에 표시하는 것은
   * 아직 구현돼 있지 않다. buildResult가 행동마다 1순위 하나만 돌려주고 사례가 겹치는지는
   * 보지 않는다. §5.1의 "독립적인 근거처럼 세지 않는다"는 C가 결과 조립 단계에서 처리해야 한다.
   */
  expectMultiActionCaseId?: string;
}

const teamUnreachable: Situation = {
  category: "team_project",
  problemType: "unreachable_member",
  situation: "발표가 내일인데 팀원 한 명이 잠수를 탔고 슬라이드 절반이 비었다",
  goal: "기한 내 발표 가능한 결과물",
  deadline: { raw: "8시간 남음", urgency: "today" },
  progress: "슬라이드 절반",
  constraints: ["남은 팀원들이 소극적", "발표까지 8시간"],
  attemptedActions: ["연락 시도"],
  consideredActions: [],
  unknowns: [],
};

const gradesRecovery: Situation = {
  category: "grades",
  problemType: "low_exam_score",
  situation: "전공 중간고사를 망쳤고 기말까지 여섯 주 남았다",
  goal: "기말에서 만회해 재수강 피하기",
  deadline: { raw: "기말까지 6주", urgency: "later" },
  progress: "강의노트 암기만 해 온 상태",
  constraints: ["기말 비중이 큼", "혼자 공부해 온 상태"],
  attemptedActions: [],
  consideredActions: [],
  unknowns: [],
};

const clubOverload: Situation = {
  category: "club",
  problemType: "role_overload",
  situation: "동아리 역할이 너무 많아 감당이 안 된다",
  goal: "부담을 줄이고 활동은 계속하기",
  deadline: { raw: "행사까지 3주", urgency: "week" },
  progress: "혼자 총괄 중",
  constraints: ["대신 맡을 사람이 불확실", "행사까지 3주"],
  attemptedActions: [],
  consideredActions: [],
  unknowns: [],
};

export const GOLDEN_QUERIES: readonly GoldenQuery[] = [
  {
    id: "gq-tp-01",
    intent:
      "v2 §3.3 대화 예시. 세 행동이 각각 그 행동을 실제로 한 사례로 갈라져야 한다.",
    situation: teamUnreachable,
    actions: [
      { actionTag: "solo_completion", expectStatus: "matched" },
      { actionTag: "inform_professor", expectStatus: "matched" },
      { actionTag: "reduce_scope_reassign", expectStatus: "matched" },
    ],
  },
  {
    id: "gq-tp-02",
    intent:
      "§5.3 상반된 결과. 같은 inform_professor인데 한쪽은 개인별 평가로 이어졌고 한쪽은 거절당했다. 둘 다 후보에 있어야 하며 한쪽만 남기면 실패다.",
    situation: teamUnreachable,
    actions: [
      {
        actionTag: "inform_professor",
        expectRanked: ["team-inform-professor", "team-inform-late-refused"],
        expectStatus: "matched",
      },
    ],
  },
  {
    id: "gq-tp-03",
    intent:
      "§5.3 사례 없음. 팀원 제외 요청은 태그만 있고 사례가 0건이다. 이 행동을 한 선배가 없다는 사실이 결과에 드러나야 한다.",
    situation: teamUnreachable,
    actions: [
      { actionTag: "request_member_removal", expectStatus: "reference" },
    ],
  },
  {
    id: "gq-tp-04",
    intent:
      "§5.1 다행동 사례. 혼자 하다 교수에게 알린 선배가 두 행동 모두에서 후보로 나온다. 서로 독립된 근거 두 건으로 세면 안 된다.",
    situation: teamUnreachable,
    actions: [
      {
        actionTag: "solo_completion",
        expectRanked: ["team-solo-then-inform"],
        expectStatus: "matched",
      },
      {
        actionTag: "inform_professor",
        expectRanked: ["team-solo-then-inform"],
        expectStatus: "matched",
      },
    ],
    expectMultiActionCaseId: "team-solo-then-inform",
  },
  {
    id: "gq-gr-01",
    intent: "성적 회복의 기본 세 갈래.",
    situation: gradesRecovery,
    actions: [
      { actionTag: "change_study_method", expectStatus: "matched" },
      { actionTag: "ask_help", expectStatus: "matched" },
      { actionTag: "replan_courses", expectStatus: "matched" },
    ],
  },
  {
    id: "gq-gr-02",
    intent:
      "§5.3 상반된 결과. 같은 공부법 변경인데 여섯 주 남았을 때는 회복했고 닷새 남았을 때는 F였다. 남은 기간이 변수라는 게 두 사례를 나란히 놓아야 보인다.",
    situation: gradesRecovery,
    actions: [
      {
        actionTag: "change_study_method",
        expectRanked: [
          "grades-change-method-6weeks",
          "grades-change-method-too-late",
        ],
        expectStatus: "matched",
      },
    ],
  },
  {
    id: "gq-gr-03",
    intent: "§5.3 사례 없음. 성적 이의신청은 태그만 있고 사례가 0건이다.",
    situation: gradesRecovery,
    actions: [{ actionTag: "request_grade_review", expectStatus: "reference" }],
  },
  {
    id: "gq-cl-01",
    intent: "동아리 역할 부담의 기본 세 갈래.",
    situation: clubOverload,
    actions: [
      { actionTag: "reduce_role", expectStatus: "matched" },
      { actionTag: "share_workload", expectStatus: "matched" },
      { actionTag: "discuss_leaving", expectStatus: "matched" },
    ],
  },
  {
    id: "gq-cl-02",
    intent:
      "§5.3 상반된 결과. 같은 역할 축소 협의인데 한쪽은 일주일 뒤 후임이 생겼고 한쪽은 프로그램 자체가 없어졌다. 둘 다 실패지만 대비할 것이 다르다.",
    situation: clubOverload,
    actions: [
      {
        actionTag: "reduce_role",
        expectRanked: ["club-reduce-role", "club-reduce-role-program-ended"],
        expectStatus: "matched",
      },
    ],
  },
  {
    id: "gq-cl-03",
    intent:
      "§5.1 다행동 사례. 축소 협의 → 후임 모집 → 사퇴를 거친 선배가 세 행동 모두에서 후보로 나온다.",
    situation: clubOverload,
    actions: [
      {
        actionTag: "reduce_role",
        expectRanked: ["club-reduce-then-quit"],
        expectStatus: "matched",
      },
      {
        actionTag: "recruit_replacement",
        expectRanked: ["club-reduce-then-quit"],
        expectStatus: "matched",
      },
      {
        actionTag: "discuss_leaving",
        expectRanked: ["club-reduce-then-quit"],
        expectStatus: "matched",
      },
    ],
    expectMultiActionCaseId: "club-reduce-then-quit",
  },
];
