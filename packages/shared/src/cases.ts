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
      unresolved:
        "교수님께 팀 문제를 알렸다는 게 단톡에 퍼져 잠수 팀원과 친한 다른 팀원들과 껄끄러워졌다",
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
      unresolved:
        "중간 점수가 이미 반영돼 최종 학점은 목표보다 한 단계 아래로 마감됐다",
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
      usageNote: "채점 답안과 틀린 문제 목록을 준비한 뒤 면담 전에 보냄",
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

  // ---------------------------------------------------------------------------
  // 아래는 v2 §5.3 분기를 검증하기 위해 의도적으로 넣은 사례들이다.
  // 같은 행동인데 결과가 반대인 쌍, 한 사례에 행동이 여럿인 경우, 조건이 다른 참고 사례.
  // 지우거나 결과를 고치기 전에 docs/failfair/README.md의 표를 확인할 것.
  // ---------------------------------------------------------------------------

  {
    ...DEMO_BASE,
    id: "team-inform-late-refused",
    category: "team_project",
    title: "발표 세 시간 전에 교수님께 알렸다가 거절당한 선배",
    problemType: "unreachable_member",
    situation:
      "발표 당일 아침부터 팀원 한 명이 답이 없었고 분담은 구두로만 정해 기록이 없었다",
    constraints: [
      "발표까지 세 시간",
      "분담 기록이 없음",
      "팀 단위 단일 평가",
      "담당 교수와 접점이 없음",
    ],
    urgency: "today",
    goal: "점수 손실을 줄이기",
    actionSteps: [
      {
        order: 1,
        actionTag: "inform_professor",
        description:
          "발표 세 시간 전 메일로 팀원 결석을 알리고 발표 순서를 미뤄줄 수 있는지 물었다",
      },
      {
        order: 2,
        actionTag: "request_deadline_extension",
        description: "순서 조정이 거절된 뒤 미완성 상태 그대로 발표했다",
      },
    ],
    outcome: {
      shortTerm:
        "팀 단위 평가 원칙을 유지한다는 답을 받았고 순서 조정도 없었다",
      followUp:
        "미완성 파트로 감점됐다. 나중에 복원해 낸 회의록이 참작돼 잠수 팀원만 추가 감점됐다",
      unresolved:
        "당일 통보라 미리 관리했어야 한다는 피드백을 받았고 팀 점수 자체는 회복되지 않았다",
    },
    receipt: {
      firstAction: "아침부터 전화와 카톡만 반복",
      wasted: "답을 기다리며 오전을 통째로 보냄",
      turningPoint: "세 시간 남았을 때 포기하고 메일을 보낸 것",
      cost: "감점, 회의록 사후 복원 2시간",
      status: "partial",
    },
    conditions: [
      "연락 두절이 며칠째인지 (당일 하루와 며칠은 교수 반응이 달랐다)",
      "분담·회의 기록이 미리 있는지",
      "팀 단위 단일 평가인지",
    ],
    tags: ["잠수", "교수", "당일", "기록없음", "거절"],
  },
  {
    ...DEMO_BASE,
    id: "team-solo-then-inform",
    category: "team_project",
    title: "혼자 하다 새벽에 포기하고 교수님께 알린 선배",
    problemType: "unreachable_member",
    situation:
      "발표 열한 시간 전 팀원이 잠수했고 데이터 분석 파트가 통째로 비어 있었다",
    constraints: [
      "발표까지 열한 시간",
      "분석 도구를 다뤄본 적 없음",
      "가동 인원 두 명",
    ],
    urgency: "today",
    goal: "제출을 성립시키고 점수 손실을 줄이기",
    actionSteps: [
      {
        order: 1,
        actionTag: "solo_completion",
        description: "밤 9시부터 새벽 1시까지 혼자 분석 파트를 시도했다",
      },
      {
        order: 2,
        actionTag: "inform_professor",
        description:
          "새벽 1시에 불가능하다고 판단하고 그때까지의 중간 산출물과 함께 상황을 메일로 보냈다",
      },
      {
        order: 3,
        actionTag: "reduce_scope_reassign",
        description:
          "답장을 기다리는 동안 분석 파트를 빼고 남은 팀원과 구성을 다시 짰다",
      },
    ],
    outcome: {
      shortTerm:
        "분석 파트를 뺀 채 발표했고 교수가 그 파트만 다음 주까지 보완 제출을 허용했다",
      followUp: "보완 제출로 내용 점수는 회복했지만 지연 제출로 소폭 감점됐다",
      unresolved:
        "처음 네 시간을 혼자 쓴 것이 결과에 도움이 됐는지는 본인도 판단하지 못했다. 다만 그 중간 산출물이 메일의 근거가 됐다",
    },
    receipt: {
      firstAction: "팀 문제를 밖에 알리고 싶지 않아 혼자 붙들었다",
      wasted: "익숙하지 않은 도구로 네 시간",
      turningPoint:
        "네 시간 써 보고 남은 여섯 시간으로도 안 된다는 게 분명해진 것",
      cost: "혼자 시도 4시간 + 재구성 2시간, 리허설 포기",
      status: "resolved",
    },
    conditions: [
      "혼자 시도를 언제 멈출지 기준을 미리 정했는지",
      "중간 산출물이 남아 있는지 (없으면 교수 공유의 설득력이 달라진다)",
      "보완 제출을 허용하는 과목인지",
    ],
    tags: ["잠수", "혼자", "교수", "보완제출", "중간산출물"],
    tool: {
      title: "혼자 시도를 멈출 기준 정하기",
      body: [
        "시작 전에 딱 두 줄만 메모에 적는다.",
        "1) 멈출 시각: ___시 (남은 시간의 절반 지점)",
        "2) 그 시각까지 끝나 있어야 하는 것: ___ (구체적인 산출물 하나)",
        "",
        "그 시각에 그 산출물이 없으면 즉시 교수 공유 + 범위 축소로 전환한다.",
        "판단을 그때의 자신에게 맡기지 않는 것이 이 메모의 목적이다.",
      ].join("\n"),
      usageNote: "'조금만 더 하면 될 것 같다'는 느낌은 네 시간째에 가장 강했다",
    },
  },
  {
    ...DEMO_BASE,
    id: "team-reduce-scope-early",
    category: "team_project",
    title: "마감 닷새 전에 범위를 줄인 선배",
    problemType: "unreachable_member",
    situation:
      "보고서 마감 닷새 전 팀원 한 명이 잠수했지만 남은 네 명이 모두 가동 가능했다",
    constraints: [
      "마감까지 닷새",
      "가동 인원 네 명",
      "중간 제출본이 이미 피드백을 받은 상태",
    ],
    urgency: "week",
    goal: "부담을 줄이면서 기한 내 제출",
    actionSteps: [
      {
        order: 1,
        actionTag: "reduce_scope_reassign",
        description:
          "잠수 팀원 파트를 통째로 빼는 대신 남은 네 명이 각자 조금씩 늘려 흡수하도록 재분배했다",
      },
      {
        order: 2,
        actionTag: "inform_professor",
        description: "마감 사흘 전에 상황과 재분배 계획을 함께 알렸다",
      },
    ],
    outcome: {
      shortTerm: "원래 범위를 거의 유지한 채 기한 내 제출했다",
      followUp:
        "감점 없이 마감했고 잠수 팀원만 기여도 미반영으로 개인 감점을 받았다",
      unresolved:
        "흡수한 분량이 결국 남은 네 명에게 갔고, 그게 공정했는지는 팀 안에서 정리되지 않았다",
    },
    receipt: {
      firstAction: "잠수를 확인하자마자 남은 인원의 가용 시간부터 물었다",
      wasted: "",
      turningPoint: "통으로 버리지 않고 나눠 흡수하기로 정한 것",
      cost: "1인당 3시간 추가, 배분을 두고 한 명의 불만",
      status: "resolved",
    },
    conditions: [
      "남은 시간이 며칠 단위인지 (시간 단위 상황에서는 이 방식이 성립하지 않았다)",
      "가동 인원이 네 명 이상인지",
      "중간 제출본 등 이미 확보된 결과물이 있는지",
    ],
    tags: ["잠수", "보고서", "닷새", "흡수", "여유"],
  },

  {
    ...DEMO_BASE,
    id: "grades-change-method-6weeks",
    category: "grades",
    title: "중간고사 D+ 받고 여섯 주 동안 공부법을 바꾼 선배",
    problemType: "low_exam_score",
    situation:
      "전공필수 중간고사에서 D+를 받았고 기말까지 여섯 주가 남아 있었다",
    constraints: ["기말 비중 40%", "상대평가에 수강생 80명", "전공필수 과목"],
    urgency: "later",
    goal: "기말에서 최대한 끌어올리기",
    actionSteps: [
      {
        order: 1,
        actionTag: "change_study_method",
        description:
          "통암기를 버리고 기출 삼 개년을 먼저 풀어 틀린 유형만 역추적하는 방식으로 바꿨다",
      },
      {
        order: 2,
        actionTag: "change_study_method",
        description: "매주 일요일에 그 주 범위를 시험처럼 시간 재고 풀었다",
      },
    ],
    outcome: {
      shortTerm: "기말에서 B0를 받았다",
      followUp: "중간 비중 때문에 최종 학점은 C+로 마감됐고 재수강은 면했다",
      unresolved:
        "상대평가라 기말 점수가 올라도 등급이 그만큼 오르지 않았다. 이 부분은 끝까지 통제하지 못했다",
    },
    receipt: {
      firstAction: "점수를 보고 강의노트를 처음부터 다시 외우기 시작했다",
      wasted: "같은 방식으로 이 주를 더 버팀",
      turningPoint: "중간 시험지를 다시 보니 유형 자체를 처음 봤다는 걸 안 것",
      cost: "여섯 주간 주 10시간, 교양 과제 완성도와 주말 알바 2회",
      status: "partial",
    },
    conditions: [
      "남은 기간이 최소 네 주 이상인지 (방식 전환에는 적응 기간이 필요했다)",
      "기출이나 연습문제를 구할 수 있는 과목인지",
      "상대평가인지 절대평가인지",
    ],
    tags: ["시험", "공부법", "기출", "상대평가", "전공필수"],
    tool: {
      title: "중간 시험지 원인 분류표",
      body: [
        "틀린 문제를 아래 넷 중 하나로만 분류한다. 여러 개에 걸치면 더 앞의 것으로 센다.",
        "A. 개념을 아예 모름  → ___개  → 해당 단원 처음부터",
        "B. 알지만 유형이 낯섦 → ___개  → 기출·연습문제 반복",
        "C. 알지만 시간이 모자람 → ___개 → 시간 재고 풀기",
        "D. 실수              → ___개  → 검산 절차 고정",
        "",
        "A가 절반을 넘으면 문제풀이로 바꿔도 소용없다. 진도를 되돌리는 게 먼저다.",
      ].join("\n"),
      usageNote: "시험지를 못 돌려받으면 기억나는 문제만으로도 한다",
    },
  },
  {
    ...DEMO_BASE,
    id: "grades-withdraw-one-course",
    category: "grades",
    title: "두 과목 중 하나만 철회하고 다음 학기에 다시 들은 선배",
    problemType: "course_fit",
    situation:
      "전공 두 과목이 동시에 무너졌고 수강 철회 기한이 사흘 남아 있었다",
    constraints: [
      "철회 기한까지 사흘",
      "장학금 성적 조건이 걸려 있음",
      "졸업까지 세 학기",
    ],
    urgency: "week",
    goal: "학점 방어와 졸업 일정 유지",
    actionSteps: [
      {
        order: 1,
        actionTag: "replan_courses",
        description:
          "기말 비중이 낮아 회복이 불가능한 한 과목만 철회하고 나머지는 붙들었다",
      },
      {
        order: 2,
        actionTag: "replan_courses",
        description:
          "철회한 과목을 다음 학기 시간표에 먼저 넣고 나머지를 그 주변으로 짰다",
      },
    ],
    outcome: {
      shortTerm: "철회한 과목은 W로 남았고 남은 한 과목은 C0로 마감했다",
      followUp: "다음 학기에 재수강해 B+를 받았고 졸업은 예정대로 했다",
      unresolved:
        "W 기록을 대학원 서류에서 설명해야 할지는 지원 때까지 알 수 없었다. 결과적으로 묻는 곳은 없었다",
    },
    receipt: {
      firstAction: "둘 다 철회할지 둘 다 붙들지로만 고민했다",
      wasted: "이틀을 감으로 재다가 보냄",
      turningPoint: "이수학점과 장학금 조건을 실제로 계산해 본 것",
      cost: "이수학점 3학점, '포기했다'는 감각 한 달",
      status: "resolved",
    },
    conditions: [
      "수강 철회 기한이 지나지 않았는지 (지난 뒤에는 이 선택지가 없다)",
      "철회 후 이수학점이 장학금·졸업 요건을 깨지 않는지",
      "해당 과목이 다음 학기에 개설되는지",
    ],
    tags: ["철회", "재수강", "장학금", "졸업", "학점"],
    tool: {
      title: "철회 전 확인 순서",
      body: [
        "기한 전에 이 순서로 확인한다. 하나라도 막히면 철회는 선택지가 아니다.",
        "1. 철회 후 이번 학기 이수학점이 장학금 최소 이수학점 이상인가",
        "2. 해당 과목이 다음 학기 개설 예정인가 (격년 개설이면 졸업이 1년 밀린다)",
        "3. 졸업까지 남은 학기에 이 과목을 넣을 자리가 있는가",
        "4. W가 성적표에 표기되는가, 횟수 제한이 있는가",
        "5. 지도교수 확인이 필요한 절차인가",
      ].join("\n"),
      usageNote: "1~4번은 학사 공지와 학과 사무실에서 하루면 확인된다",
    },
  },
  {
    ...DEMO_BASE,
    id: "grades-change-method-too-late",
    category: "grades",
    title: "기말 닷새 전에 공부법을 바꿨다가 더 망한 선배",
    problemType: "low_exam_score",
    situation: "중간을 망친 뒤 미루다가 기말 닷새 전에 공부법을 전면 교체했다",
    constraints: [
      "기말까지 닷새",
      "손대지 않은 범위가 절반",
      "다른 두 과목 기말도 같은 주",
    ],
    urgency: "week",
    goal: "기말에서 최대한 만회",
    actionSteps: [
      {
        order: 1,
        actionTag: "change_study_method",
        description:
          "강의를 처음부터 다시 듣던 방식을 버리고 기출만 반복해 푸는 방식으로 바꿨다",
      },
    ],
    outcome: {
      shortTerm:
        "기출 답은 외웠지만 시험에 유형이 바뀌어 나온 문제에서 전부 막혔다",
      followUp: "기말 D0, 최종 F로 재수강 대상이 됐다",
      unresolved:
        "기존 방식을 유지했으면 나았을지는 확인할 수 없다. 다만 닷새 안에 방식을 바꾸고 적응까지 하는 건 불가능했다는 게 본인 판단이다",
    },
    receipt: {
      firstAction: "중간 성적을 확인하고 두 주를 그냥 보냈다",
      wasted: "'기출만 돌리면 된다'는 남의 말을 그대로 따름",
      turningPoint: "없었다. 시험장에서야 안 통한다는 걸 알았다",
      cost: "닷새 40시간, 다른 두 과목 기말 준비 시간까지",
      status: "ongoing",
    },
    conditions: [
      "남은 기간이 방식 전환의 적응 기간을 감당하는지 (이 사례는 아니었다)",
      "손대지 않은 범위가 얼마나 남았는지",
      "그 방법이 나에게 맞는 근거가 있는지, 남의 말인지",
    ],
    tags: ["시험", "공부법", "닷새", "기출", "실패"],
  },
  {
    ...DEMO_BASE,
    id: "grades-ask-then-withdraw",
    category: "grades",
    title: "도움을 청했지만 이미 늦어 철회한 선배",
    problemType: "missed_deadline",
    situation: "과제를 계속 놓치다가 철회 기한 한 주 전에야 조교를 찾아갔다",
    constraints: [
      "과제 여섯 회 중 네 회 미제출",
      "철회 기한까지 이레",
      "졸업 요건 기한이 가까움",
    ],
    urgency: "week",
    goal: "가능하면 이수, 안 되면 손실 최소화",
    actionSteps: [
      {
        order: 1,
        actionTag: "ask_help",
        description: "조교에게 밀린 과제를 늦게라도 낼 수 있는지 물었다",
      },
      {
        order: 2,
        actionTag: "inform_professor",
        description:
          "조교의 권유로 교수에게 직접 상황을 설명하는 메일을 보냈다",
      },
      {
        order: 3,
        actionTag: "replan_courses",
        description:
          "지각 제출이 최대 50%만 인정된다는 답을 받고 계산해 보니 상한이 C0라 철회를 택했다",
      },
    ],
    outcome: {
      shortTerm: "철회 기한 이틀 전에 철회했다",
      followUp: "다음 학기 재수강에서 A0를 받았다",
      unresolved:
        "앞의 두 행동이 결과를 바꿨는지는 단정할 수 없다. 다만 그 두 단계가 없었으면 상한이 C0라는 계산 자체를 못 했고 철회 판단도 못 했다",
    },
    receipt: {
      firstAction: "밀린 과제를 혼자 몰아서 해보려 했다",
      wasted: "이수 가능 여부를 모른 채 사흘간 과제부터 붙듦",
      turningPoint: "지각 제출 인정률이라는 숫자 하나를 확인한 것",
      cost: "확인과 메일에 사흘, 해당 학기 3학점",
      status: "resolved",
    },
    conditions: [
      "철회 기한이 남아 있는지",
      "지각 제출 인정 비율을 확인할 수 있는지 (이 숫자가 있어야 상한 계산이 된다)",
      "재수강 기회가 남은 학기 안에 있는지",
    ],
    tags: ["과제", "미제출", "조교", "철회", "재수강"],
    tool: {
      title: "이수할지 철회할지 계산하는 법",
      body: [
        "감으로 정하지 말고 상한을 계산한다.",
        "1. 확정된 점수 = (이미 받은 점수 x 비중)의 합",
        "2. 남은 평가의 최대치 = (남은 평가 비중)의 합",
        "3. 지각 제출 인정률을 확인해 1번에 더한다",
        "4. 상한 = 1 + 2 + 3",
        "",
        "상한이 목표 학점에 못 미치면 노력의 문제가 아니라 산수의 문제다.",
      ].join("\n"),
      usageNote: "3번 숫자를 모르면 조교에게 그것부터 묻는다",
    },
  },
  {
    ...DEMO_BASE,
    id: "grades-early-habit-change",
    category: "grades",
    title: "학기 3주차에 미리 방향을 튼 선배",
    problemType: "low_exam_score",
    situation:
      "첫 퀴즈에서 반 평균 아래를 받고 학기 3주차에 바로 공부 방식을 바꿨다",
    constraints: ["기말까지 열두 주", "절대평가 과목", "교양 선택 과목"],
    urgency: "later",
    goal: "학기 내내 유지할 방식을 초반에 정하기",
    actionSteps: [
      {
        order: 1,
        actionTag: "change_study_method",
        description:
          "수업 직후 30분 안에 그날 내용을 백지에 복원하는 습관으로 바꿨다",
      },
      {
        order: 2,
        actionTag: "ask_help",
        description:
          "격주로 조교에게 백지 복원본을 보여주고 빠진 부분을 확인받았다",
      },
    ],
    outcome: {
      shortTerm: "이후 퀴즈에서 계속 평균 이상을 유지했다",
      followUp: "최종 A0로 마감했다",
      unresolved:
        "여유 있는 교양 과목이라 가능했던 방식이고, 상대평가 전공에서도 통할지는 확인하지 못했다",
    },
    receipt: {
      firstAction: "첫 퀴즈 점수를 보고 바로 방식을 점검했다",
      wasted: "",
      turningPoint: "시간이 남아 있을 때 습관부터 손댄 것",
      cost: "주 3시간",
      status: "resolved",
    },
    conditions: [
      "남은 기간이 학기 단위인지 (이 사례는 열두 주가 남아 있었다)",
      "절대평가인지 (상대평가였다면 결과가 달랐을 수 있다)",
      "재수강·학점 부담이 낮은 과목인지",
    ],
    tags: ["퀴즈", "초반", "백지복원", "절대평가", "교양"],
  },
  {
    ...DEMO_BASE,
    id: "grades-check-weights",
    category: "grades",
    title: "면담으로 남은 배점부터 확인한 선배",
    problemType: "low_exam_score",
    situation: "중간을 망친 뒤 포기할지 말지를 두 주 동안 정하지 못하고 있었다",
    constraints: [
      "기말까지 다섯 주",
      "강의계획서 배점이 학기 중에 바뀜",
      "담당 교수와 대화해 본 적 없음",
    ],
    urgency: "later",
    goal: "회복이 가능한지부터 판단하기",
    actionSteps: [
      {
        order: 1,
        actionTag: "inform_professor",
        description:
          "면담을 요청해 지금 상태에서 남은 평가로 어디까지 가능한지 배점 기준을 물었다",
      },
    ],
    outcome: {
      shortTerm:
        "기말 비중이 45%로 커졌고 참여 점수가 10% 별도로 있다는 걸 알게 됐다",
      followUp: "회복 가능하다고 판단해 이수를 유지했고 최종 B0로 마감했다",
      unresolved:
        "면담에서 공부 방법에 대한 조언은 얻지 못했다. 이 행동으로 얻은 건 정보뿐이었다",
    },
    receipt: {
      firstAction: "포기할지 말지를 혼자 두 주 동안 재기만 했다",
      wasted: "성적 이야기를 꺼내기 부담스러워 메일을 사흘 묵힘",
      turningPoint: "판단하려면 사실관계가 먼저라는 걸 인정한 것",
      cost: "메일 20분, 면담 15분",
      status: "resolved",
    },
    conditions: [
      "면담·오피스아워가 열려 있는 과목인지",
      "배점 기준을 물어볼 근거가 있는지",
      "점수 조정을 부탁하는 자리가 아니라 정보를 얻는 자리로 갈 수 있는지",
    ],
    tags: ["배점", "면담", "교수", "판단", "정보"],
    tool: {
      title: "면담 요청 메일 초안",
      body: [
        "제목: [과목명/○분반] ○○○ 면담 요청드립니다",
        "",
        "안녕하세요, 교수님. [과목명] ○분반 수강생 ○○○(학번 ______)입니다.",
        "중간고사 이후 남은 학기 계획을 세우려고 하는데 평가 배점에 대해 확인하고 싶은 점이 있어 면담을 요청드립니다.",
        "- 강의계획서와 공지의 기말 비중이 달라 어느 쪽이 최종인지",
        "- 출석·참여 점수가 별도로 반영되는지",
        "오피스아워 ○요일 ○시에 찾아뵈어도 될지 여쭙니다.",
      ].join("\n"),
      usageNote:
        "점수를 올려달라는 내용은 넣지 않는다. 확인 항목은 두 개 이하일 때 답이 빨랐다",
    },
  },

  {
    ...DEMO_BASE,
    id: "club-share-workload-table",
    category: "club",
    title: "분담표를 만들어 회의에서 공식화한 선배",
    problemType: "role_overload",
    situation:
      "공연 동아리에서 잡무가 전부 본인에게 몰렸다. 아무도 시킨 적은 없는데 그렇게 됐다",
    constraints: ["공연까지 여섯 주", "부원 대부분이 친한 사이", "직책은 없음"],
    urgency: "later",
    goal: "분담을 고정하고 관계는 유지하기",
    actionSteps: [
      {
        order: 1,
        actionTag: "share_workload",
        description:
          "지난 네 주간 본인이 처리한 일을 항목과 시간으로 적은 표를 정기회의 안건으로 올렸다",
      },
      {
        order: 2,
        actionTag: "share_workload",
        description:
          "회의에서 항목별 담당자를 그 자리에서 이름을 적어 정하고 회의록에 남겼다",
      },
    ],
    outcome: {
      shortTerm:
        "아홉 개 항목 중 여섯 개에 담당자가 정해졌고 나머지 셋은 지원자가 없어 본인이 유지했다",
      followUp:
        "공연까지 분담이 대체로 유지됐다. 다만 누가 뭘 하는지 확인하고 챙기는 일이 새로 생겨 본인 몫이 됐다",
      unresolved:
        "총 투입 시간은 기대만큼 줄지 않았다. 일의 종류가 실무에서 관리로 바뀌었을 뿐이라는 게 본인 평가다",
    },
    receipt: {
      firstAction: "개인 카톡으로 힘들다고 흘렸다",
      wasted: "'고생했다'는 답만 돌아온 채 두 주",
      turningPoint: "투입 시간을 숫자로 적은 표를 만든 것",
      cost: "표 작성 3시간, 이후 주 2시간 관리, 두 명과 며칠 서먹함",
      status: "partial",
    },
    conditions: [
      "정기회의처럼 공식적으로 말할 자리가 있는지",
      "기록이 남는 자리인지 (구두 합의는 두 주 안에 흐려졌다)",
      "지원자가 없는 항목을 누가 떠안을지 미리 각오했는지",
    ],
    tags: ["동아리", "분담", "회의록", "잡무", "공연"],
    tool: {
      title: "회의에 올릴 분담표",
      body: [
        "| 항목 | 지난 4주 투입 | 현재 담당 | 앞으로 담당 | 마감 |",
        "| 대관 | 6h | 나 | ___ | ___ |",
        "| 예산 정산 | 4h | 나 | ___ | ___ |",
        "| 홍보물 | 8h | 나 | ___ | ___ |",
        "",
        "규칙",
        "- '앞으로 담당'은 회의 자리에서 이름을 적어 채운다. 나중에 정하기로 하면 안 정해진다.",
        "- 지원자가 없는 항목은 '담당 없음'으로 회의록에 남긴다. 자동으로 내 몫이 되지 않게 한다.",
      ].join("\n"),
      usageNote:
        "'지난 4주 투입' 열이 핵심이다. 숫자가 없으면 감정 문제로 넘어갔다",
    },
  },
  {
    ...DEMO_BASE,
    id: "club-quit-midterm",
    category: "club",
    title: "학기 중에 총무를 내려놓고 나온 선배",
    problemType: "leaving",
    situation: "전공 실습과 동아리 총무 일이 겹쳐 두 달간 수면이 무너졌다",
    constraints: [
      "임기 넉 달 남음",
      "회계 장부를 혼자 관리",
      "부원 중 회계를 아는 사람이 없음",
    ],
    urgency: "week",
    goal: "부담에서 벗어나기",
    actionSteps: [
      {
        order: 1,
        actionTag: "discuss_leaving",
        description:
          "회장에게 먼저 알리고 그 주 정기모임에서 부원들에게 직접 말했다",
      },
      {
        order: 2,
        actionTag: "recruit_replacement",
        description: "회계 장부와 통장 절차를 두 주에 걸쳐 인수인계하고 나왔다",
      },
    ],
    outcome: {
      shortTerm:
        "두 주 뒤 정리했고 그 학기 전공 실습 두 과목은 모두 B+ 이상을 받았다",
      followUp:
        "다음 학기 행사에 초대받지 못했다. 친했던 두 명과는 연락이 이어졌지만 나머지와는 끊겼다",
      unresolved:
        "'중간에 그만둔 사람'이라는 인상이 얼마나 남았는지는 본인도 모른다. 취업 서류에 이 활동을 쓸지는 끝까지 정하지 못했다",
    },
    receipt: {
      firstAction: "티 내지 않고 두 달을 버텼다",
      wasted: "수업 시간에 장부를 맞추던 밤들",
      turningPoint: "그만두는 날짜를 먼저 못 박은 것",
      cost: "인수인계 두 주, 1년 반의 활동 이력과 인맥 대부분",
      status: "partial",
    },
    conditions: [
      "인수인계할 대상이 있는지 (회계처럼 인계가 필요한 역할이면 즉시 그만두기는 불가능했다)",
      "임기 중 사퇴에 대한 내부 규정이 있는지",
      "이 활동을 이력으로 써야 하는 계획이 있는지",
    ],
    tags: ["동아리", "총무", "하차", "인수인계", "회계"],
    tool: {
      title: "하차를 알릴 때의 순서와 문장",
      body: [
        "순서: 회장 → 인수인계 대상 → 전체. 이 순서가 바뀌면 뒷말이 생겼다.",
        "",
        "'○월 ○일까지만 하고 그만두려고 합니다. 이유는 ___ (한 줄, 사과하지 않는다).",
        "제가 맡은 건 A, B이고 A는 인수인계 문서를 만들어 두겠습니다.",
        "후임이 정해지면 ○주까지는 인계에 시간을 쓰겠습니다.'",
        "",
        "피한 표현: '죄송한데요'(협상 여지로 읽힘), '당분간 쉬고 싶어요'(돌아올 기대를 남김)",
      ].join("\n"),
      usageNote: "그만두는 날짜를 먼저 못 박았을 때만 실제로 그만둬졌다",
    },
  },
  {
    ...DEMO_BASE,
    id: "club-reduce-role-program-ended",
    category: "club",
    title: "역할을 줄이자고 했다가 프로그램이 없어진 선배",
    problemType: "role_overload",
    situation:
      "본인이 2년 전 만들어 혼자 운영해 온 신입생 멘토링의 부담을 줄이고 싶었다",
    constraints: [
      "다른 부원들이 이 프로그램에 관여한 적 없음",
      "참여 신입생 여덟 명",
      "학기 중반",
    ],
    urgency: "later",
    goal: "부담은 줄이되 프로그램은 유지하기",
    actionSteps: [
      {
        order: 1,
        actionTag: "reduce_role",
        description: "운영진 회의에서 멘토링 운영을 나눠 맡자고 제안했다",
      },
    ],
    outcome: {
      shortTerm:
        "'아무도 못 맡을 것 같으면 올해는 접자'는 쪽으로 논의가 흘러 그대로 종료됐다",
      followUp:
        "참여 중이던 신입생 여덟 명에게 본인이 직접 종료를 알렸고 그중 셋이 동아리를 나갔다",
      unresolved:
        "부담은 사라졌지만 원하던 결과가 아니었다. 다음 해에 다시 만들자는 이야기는 나오지 않았다",
    },
    receipt: {
      firstAction: "혼자 운영 규모를 키우다 한계에 부딪혔다",
      wasted: "인계 후보와 미리 이야기하지 않고 회의에 들어간 것",
      turningPoint: "없었다. 제안 한 번으로 종료가 결정됐다",
      cost: "회의 1시간, 2년간 만든 프로그램과 멘티들과의 관계",
      status: "ongoing",
    },
    conditions: [
      "그 일을 본인 말고 필요하다고 느끼는 사람이 있는지 (없으면 '줄이자'가 '없애자'가 됐다)",
      "제안 전에 최소 한 명의 인계 후보와 미리 이야기했는지",
      "없어졌을 때 영향을 받는 사람이 누구인지 헤아렸는지",
    ],
    tags: ["동아리", "멘토링", "역할축소", "종료", "실패"],
  },
  {
    ...DEMO_BASE,
    id: "club-reduce-then-quit",
    category: "club",
    title: "축소 협의와 후임 모집을 거쳐 결국 그만둔 선배",
    problemType: "role_overload",
    situation:
      "봉사 동아리 대외협력 담당으로 협약 기관 다섯 곳 연락을 혼자 맡고 있었다",
    constraints: [
      "임기 다섯 달 남음",
      "기관 연락 경험자가 없음",
      "기관이 본인 개인 번호로 연락함",
    ],
    urgency: "later",
    goal: "부담은 줄이되 기관과의 관계는 끊기지 않게 하기",
    actionSteps: [
      {
        order: 1,
        actionTag: "reduce_role",
        description: "다섯 곳 중 세 곳만 맡겠다고 운영진에 제안했다",
      },
      {
        order: 2,
        actionTag: "recruit_replacement",
        description: "한 달간 모집 공고를 내고 지원자 두 명을 면담했다",
      },
      {
        order: 3,
        actionTag: "discuss_leaving",
        description:
          "지원자가 모두 중도 포기한 뒤 기관 연락처를 공용 계정으로 옮기고 임기 중 사퇴했다",
      },
    ],
    outcome: {
      shortTerm:
        "공용 계정 전환은 마치고 나왔고 기관 다섯 곳 중 네 곳은 연락이 유지됐다",
      followUp: "한 곳은 담당자 변경 뒤 협약이 종료됐다",
      unresolved:
        "앞의 두 단계가 없었으면 그냥 그만뒀을 때보다 나았는지는 단정할 수 없다. 다만 공용 계정 전환은 그 과정에서 나온 아이디어였고 그게 네 곳을 지켰다",
    },
    receipt: {
      firstAction: "전부는 못 넘기니 절반만 넘기자고 제안했다",
      wasted: "후임이 정해지길 기다린 한 달",
      turningPoint: "개인 번호에 묶인 업무를 공용 계정으로 옮긴 것",
      cost: "석 달 40시간 이상, 임기 다섯 달과 대외협력 이력",
      status: "partial",
    },
    conditions: [
      "후임 모집에 쓸 수 있는 시간이 몇 달 단위인지",
      "개인 연락처에 묶인 업무인지 (이 경우 공용 계정 전환이 먼저였다)",
      "임기 중 사퇴가 가능한 구조인지",
    ],
    tags: ["동아리", "대외협력", "후임", "공용계정", "사퇴"],
    tool: {
      title: "개인에게 묶인 일을 조직에 돌려놓기",
      body: [
        "그만두기 전에 이것부터 한다. 후임이 없어도 할 수 있고, 후임이 생겨도 어차피 필요하다.",
        "1. 외부 연락이 내 개인 번호·개인 메일로 오는가 → 공용 계정을 만들어 전환을 통보한다",
        "2. 자료가 내 개인 드라이브에 있는가 → 공용 드라이브로 옮긴다",
        "3. 기억에만 있는 절차가 있는가 → 한 장으로 적는다 (완벽하지 않아도 된다)",
        "4. 나만 아는 사람이 있는가 → 담당자 목록과 마지막 연락 시점을 적는다",
        "",
        "이 넷을 해두면 그만두는 것과 안 그만두는 것 사이에 선택지가 하나 더 생긴다.",
      ].join("\n"),
      usageNote:
        "이걸 해두기 전에 사퇴를 말하면 '그럼 누가 하냐'에서 대화가 멈췄다",
    },
  },
  {
    ...DEMO_BASE,
    id: "club-handover-after-event",
    category: "club",
    title: "행사가 끝난 직후에 역할을 넘긴 선배",
    problemType: "role_overload",
    situation:
      "가을 정기공연이 끝난 다음 주에 역할 축소를 이야기했고 다음 일정은 아직 잡히지 않았다",
    constraints: [
      "다음 행사는 미정, 석 달 이상 여유",
      "공연 준비에 적극적이던 후배 셋이 있음",
      "직책은 없음",
    ],
    urgency: "later",
    goal: "다음 학기 부담을 미리 줄이기",
    actionSteps: [
      {
        order: 1,
        actionTag: "reduce_role",
        description:
          "뒤풀이 다음 주 회의에서 다음 공연의 무대감독은 후배가 맡는 게 좋겠다고 제안했다",
      },
      {
        order: 2,
        actionTag: "recruit_replacement",
        description:
          "손을 든 후배 두 명이 공동으로 맡기로 했고 준비 초기에 한 달간 옆에서 같이 했다",
      },
    ],
    outcome: {
      shortTerm: "다음 공연의 무대감독은 후배 두 명이 맡았다",
      followUp:
        "본인은 조언 역할로만 참여했고 투입 시간이 주 8시간에서 2시간으로 줄었다",
      unresolved:
        "넘긴 뒤 무대 방향이 본인 취향과 달라졌고, 어디까지 참견해도 되는지는 끝까지 애매했다",
    },
    receipt: {
      firstAction: "공연이 끝나자마자 다음 시즌 구조부터 꺼냈다",
      wasted: "",
      turningPoint: "누가 뭘 잘하는지 모두가 막 본 시점을 고른 것",
      cost: "인계 기간 한 달 주 4시간, 무대 구성 결정권",
      status: "resolved",
    },
    conditions: [
      "확정된 대외 일정이 없는 시점인지 (행사 직전이었다면 같은 말이 다르게 받아들여졌다)",
      "인계 기간을 몇 주 이상 둘 수 있는지",
      "역할을 맡을 의향이 있는 후배를 이미 본 적이 있는지",
    ],
    tags: ["동아리", "공연", "인계", "무대감독", "여유"],
  },
  {
    ...DEMO_BASE,
    id: "club-ask-ob",
    category: "club",
    title: "OB 선배에게 서류를 물어본 선배",
    problemType: "relationship",
    situation:
      "학회장으로 회계 감사와 학교 제출 서류를 처음 겪는데 마감이 한 주 남았다",
    constraints: [
      "현 운영진 중 경험자 없음",
      "작년 서류가 남아 있지 않음",
      "제출 마감까지 이레",
    ],
    urgency: "week",
    goal: "기한 내 제출과 본인 부담 축소",
    actionSteps: [
      {
        order: 1,
        actionTag: "ask_help",
        description:
          "OB 단체방에 작년 제출본을 가진 사람을 물었고 한 선배가 양식과 예시를 보내줬다",
      },
      {
        order: 2,
        actionTag: "ask_help",
        description:
          "그 선배와 통화하며 감사 항목 중 헷갈리는 여섯 개를 확인했다",
      },
    ],
    outcome: {
      shortTerm: "마감 이틀 전에 제출을 마쳤다",
      followUp:
        "실무 부담은 크게 줄었다. 다만 그 선배가 이후 운영 방향에도 의견을 자주 보내면서 '왜 OB한테 다 물어보냐'는 이야기가 동기들 사이에 돌았다",
      unresolved:
        "도움을 받은 범위와 관여의 범위를 어디서 끊을지는 임기 끝까지 애매하게 남았다",
    },
    receipt: {
      firstAction: "양식을 처음부터 만들어 보려 했다",
      wasted: "빈 문서를 이틀 들여다봄",
      turningPoint: "작년 제출본이 어딘가에 있을 거라고 생각한 것",
      cost: "통화 2시간, 작성 6시간, 동기 운영진과의 미묘함",
      status: "partial",
    },
    conditions: [
      "물어볼 경험자에게 닿는 경로가 있는지",
      "부탁의 범위를 처음에 한정했는지 (이 사례는 하지 않아 나중에 애매해졌다)",
      "지금 막힌 게 방법을 몰라서인지 결정을 못 해서인지 (후자면 효과가 작았다)",
    ],
    tags: ["동아리", "학회장", "OB", "서류", "관계"],
    tool: {
      title: "도움을 청할 때 범위를 먼저 못 박기",
      body: [
        "부탁 메시지 안에 끝나는 지점을 넣었을 때와 아닐 때가 달랐다.",
        "",
        "'○○ 서류 작성 건으로 여쭙습니다. 작년 제출본 양식과, 감사 항목 중 ○번~○번 해석만 확인하면 됩니다.",
        "30분 정도 통화 가능하실까요? 이후 작성은 저희 운영진이 하겠습니다.'",
        "",
        "- 필요한 것을 항목으로 한정한다",
        "- 걸릴 시간을 내가 먼저 말한다",
        "- 그 다음은 우리가 한다고 명시한다",
      ].join("\n"),
      usageNote: "마지막 줄이 없으면 도움이 관여로 이어지기 쉬웠다",
    },
  },
];
