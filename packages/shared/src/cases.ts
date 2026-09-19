import type { Case } from "./failfair.js";

/**
 * 가상 시연 사례. 전부 `sourceType: "demo"`이며 화면에서 "가상 시연" 표시가 붙는다.
 * 팀이 수집한 실제 사례는 선배 입력 화면으로 등록하고 검수 후 approved로 바꾼다.
 *
 * D(콘텐츠) 담당이 이 파일을 소유한다. id는 영문 소문자와 하이픈만, 한 번 정하면 바꾸지 않는다.
 */
const DEMO_BASE = {
  status: "approved",
  sourceType: "demo",
  version: 1,
  createdAt: 0,
  allowContact: false,
} as const;

export const DEMO_CASES: Case[] = [
  {
    ...DEMO_BASE,
    id: "team-solo-night",
    category: "team_project",
    title: "밤새 슬라이드를 혼자 완성한 선배",
    problemType: "unreachable_member",
    situation:
      "발표 전날 팀원 한 명과 연락이 끊겼고 슬라이드 절반이 비어 있었다",
    constraints: ["남은 팀원들이 소극적", "발표까지 8시간"],
    urgency: "today",
    goal: "기한 내 발표 가능한 결과물",
    actionSteps: [
      {
        order: 1,
        actionTag: "solo_completion",
        description: "연락 없는 팀원 몫까지 혼자 슬라이드를 채웠다",
      },
    ],
    outcome: {
      shortTerm: "제출은 했지만 발표 연습 시간이 없었다",
      followUp: "팀원 평가에서 기여도 차이를 따로 적어 냈다",
      unresolved: "그 팀원과는 이후 말을 섞지 않았다",
    },
    receipt: {
      firstAction: "사라진 팀원에게 전화, 답 없음",
      wasted: "답을 기다리며 2시간 허비",
      turningPoint: "새벽 1시에 혼자 하기로 결정",
      cost: "밤샘 1회, 발표 연습 포기",
      status: "partial",
    },
    conditions: ["혼자 처리 가능한 작업량이었는지", "다음 날 체력이 되는지"],
    tags: ["잠수", "팀원", "발표", "슬라이드", "혼자"],
    tool: {
      title: "밤샘 전 30분 우선순위표",
      body: [
        "1. 발표에서 반드시 말할 슬라이드 3장 먼저 완성",
        "2. 없어도 되는 슬라이드는 제목만 남기고 삭제",
        "3. 새벽 3시 이후에는 디자인 금지, 내용만",
        "4. 아침에 5분 리허설 1회",
      ].join("\n"),
      usageNote: "혼자 하기로 정한 직후에 씀",
    },
  },
  {
    ...DEMO_BASE,
    id: "team-inform-professor",
    category: "team_project",
    title: "진행 자료와 연락 시도를 정리해 교수님께 알린 선배",
    problemType: "unreachable_member",
    situation:
      "발표 이틀 전 팀원 한 명이 잠수를 탔고 자료 조사 파트가 통째로 비었다",
    constraints: ["발표까지 이틀", "팀원 4명 중 3명 연락됨"],
    urgency: "week",
    goal: "불이익 없이 발표 마치기",
    actionSteps: [
      {
        order: 1,
        actionTag: "inform_professor",
        description:
          "진행 상황 표와 연락 시도 기록을 첨부해 교수님께 메일을 보냈다",
      },
      {
        order: 2,
        actionTag: "reduce_scope_reassign",
        description: "답장을 기다리는 동안 남은 셋이 빈 파트를 나눠 맡았다",
      },
    ],
    outcome: {
      shortTerm: "교수님이 평가 방식을 조정해 주겠다고 답했다",
      followUp: "발표 후 개별 기여도 제출 요청을 받았다",
      unresolved: "",
    },
    receipt: {
      firstAction: "연락 시도 시각을 전부 메모",
      wasted: "단톡에 세 번 더 호출",
      turningPoint: "메일에 표를 붙인 것",
      cost: "이틀, 메일 작성 1시간",
      status: "resolved",
    },
    conditions: [
      "교수님이 메일에 답하는 분인지",
      "수업 규정에 팀원 평가 조항이 있는지",
    ],
    tags: ["잠수", "교수님", "메일", "팀원", "발표"],
    tool: {
      title: "교수님께 보내는 상황 보고 메일 틀",
      body: [
        "제목: [과목명] 조별과제 진행 상황 보고드립니다 (○조)",
        "",
        "교수님, 안녕하세요. ○조 ○○○입니다.",
        "발표를 앞두고 팀 진행 상황을 먼저 공유드리고자 메일 드립니다.",
        "",
        "1. 현재 완료된 부분: (예: 자료조사 완료, 슬라이드 60%)",
        "2. 진행이 막힌 부분: (예: 팀원 1명이 ○일부터 연락이 닿지 않음, 시도 기록 첨부)",
        "3. 저희가 하려는 조치: (예: 범위를 줄여 ○일까지 마무리)",
        "",
        "혹시 발표 범위나 평가 방식에 조정이 가능하다면 말씀 부탁드립니다.",
        "바쁘신 중에 읽어 주셔서 감사합니다.",
        "",
        "○○○ 드림 (학번 / 연락처)",
      ].join("\n"),
      usageNote: "연락 시도 기록을 먼저 모은 뒤 보냄",
    },
  },
  {
    ...DEMO_BASE,
    id: "team-reduce-scope",
    category: "team_project",
    title: "핵심만 남기고 남은 팀원과 나눈 선배",
    problemType: "unreachable_member",
    situation:
      "발표 전날 밤 팀원 한 명이 사라졌고, 남은 셋은 뭘 해야 할지 모르는 상태였다",
    constraints: ["발표까지 10시간", "남은 팀원들과 통화 가능"],
    urgency: "today",
    goal: "기한 내 제출",
    actionSteps: [
      {
        order: 1,
        actionTag: "reduce_scope_reassign",
        description: "발표 목차를 절반으로 줄이고 남은 셋이 한 파트씩 맡았다",
      },
    ],
    outcome: {
      shortTerm: "일부 내용을 포기하고 기한 내 제출했다",
      followUp: "질의응답에서 뺀 부분을 질문받아 당황했다",
      unresolved: "",
    },
    receipt: {
      firstAction: "남은 팀원 전원 통화",
      wasted: "",
      turningPoint: "목차를 줄이자는 제안에 다들 동의",
      cost: "10시간, 발표 범위 절반",
      status: "partial",
    },
    conditions: [
      "남은 팀원들의 합의가 가능한지",
      "줄여도 되는 범위가 과제 요구사항에 있는지",
    ],
    tags: ["잠수", "분담", "범위", "팀원", "발표"],
    tool: {
      title: "긴급 역할 재분배표",
      body: [
        "남은 시간: ___시간",
        "반드시 남길 파트: 1) ___ 2) ___ 3) ___",
        "빼는 파트: ___ (이유 한 줄: ___)",
        "담당: A → ___ / B → ___ / C → ___",
        "합치는 시각: ___ / 리허설: ___",
      ].join("\n"),
      usageNote: "통화로 합의한 직후 단톡에 붙여 넣음",
    },
  },
  {
    ...DEMO_BASE,
    id: "grades-ask-ta",
    category: "grades",
    title: "중간고사를 망친 뒤 조교실 문을 두드린 선배",
    problemType: "low_exam_score",
    situation:
      "전공 기초 중간고사에서 하위권 점수를 받았고 기말까지 6주 남았다",
    constraints: ["기말 비중 50%", "혼자 공부해 온 상태"],
    urgency: "later",
    goal: "기말에서 만회해 재수강 피하기",
    actionSteps: [
      {
        order: 1,
        actionTag: "ask_help",
        description: "채점된 답안을 들고 조교 면담을 신청했다",
      },
      {
        order: 2,
        actionTag: "change_study_method",
        description: "면담에서 받은 지적대로 문제 풀이 위주로 바꿨다",
      },
    ],
    outcome: {
      shortTerm: "틀린 유형이 개념 하나에 몰려 있다는 걸 알았다",
      followUp: "기말은 중위권, 재수강은 피했다",
      unresolved: "",
    },
    receipt: {
      firstAction: "점수 보고 이틀 동안 아무것도 안 함",
      wasted: "유튜브 강의 정주행",
      turningPoint: "조교 면담 20분",
      cost: "6주, 주 2회 조교실",
      status: "resolved",
    },
    conditions: ["조교 면담 제도가 있는 수업인지", "채점 답안을 돌려주는지"],
    tags: ["시험", "점수", "조교", "기말", "재수강"],
    tool: {
      title: "조교 면담 요청 메시지",
      body: [
        "안녕하세요, ○○ 수업 수강생 ○○○입니다.",
        "중간고사 답안을 보고 제가 어디서 막히는지 알고 싶어 면담을 요청드립니다.",
        "가능한 시간대: ___ / ___",
        "미리 준비해 갈 것: 채점 답안, 틀린 문제 목록",
      ].join("\n"),
      usageNote: "",
    },
  },
  {
    ...DEMO_BASE,
    id: "club-reduce-role",
    category: "club",
    title: "행사 총괄을 내려놓자고 먼저 말한 선배",
    problemType: "role_overload",
    situation:
      "동아리 행사 총괄을 맡았는데 시험 기간과 겹쳐 손을 놓기 직전이었다",
    constraints: ["행사까지 3주", "대신 맡을 사람이 불확실"],
    urgency: "week",
    goal: "행사는 열리고 나는 시험을 치기",
    actionSteps: [
      {
        order: 1,
        actionTag: "reduce_role",
        description: "운영진 회의에서 총괄 대신 홍보만 맡겠다고 제안했다",
      },
      {
        order: 2,
        actionTag: "share_workload",
        description: "총괄 업무를 셋으로 쪼개 나눠 맡을 사람을 찾았다",
      },
    ],
    outcome: {
      shortTerm: "회의에서 바로 동의를 얻지는 못했다",
      followUp: "일주일 뒤 부회장이 총괄을 받았다",
      unresolved: "회장과는 아직 어색하다",
    },
    receipt: {
      firstAction: "혼자 끙끙대며 2주 버팀",
      wasted: "밤에 몰래 준비하기",
      turningPoint: "업무를 쪼갠 표를 들고 회의에 들어간 것",
      cost: "3주, 관계 부담",
      status: "partial",
    },
    conditions: [
      "운영진 회의가 정기적으로 열리는지",
      "업무를 쪼갤 수 있는 구조인지",
    ],
    tags: ["동아리", "역할", "총괄", "시험", "부담"],
    tool: {
      title: "역할 축소 제안 한 장",
      body: [
        "현재 맡은 일: ___",
        "계속 맡을 수 있는 것: ___",
        "넘기고 싶은 것과 이유: ___ (시험 기간 ___주)",
        "제안하는 분담: ___ → ___ / ___ → ___",
        "결정이 필요한 날짜: ___",
      ].join("\n"),
      usageNote: "회의 전에 운영진 단톡에 미리 올림",
    },
  },
];
