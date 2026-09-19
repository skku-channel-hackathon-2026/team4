import { z } from "zod";

/**
 * 망한 선배 박람회 v2 공통 계약.
 * 서버(Function)와 WAM이 같은 스키마로 입출력을 검증한다. 계약 변경은 B가 통합한다.
 */

/** WAM 정적 경로 이름. 배포 스크립트와 스모크 테스트가 `tutorial` 경로를 쓰므로 그대로 둔다. */
export const FAILFAIR_WAM_NAME = "tutorial";

export const FAILFAIR_FUNCTIONS = {
  open: "failfair.open",
  /** 운영진이 커맨드 등록을 갱신하기 전까지 Desk에 남아 있는 `/tutorial`이 부르는 이름 */
  legacyOpen: "tutorial.open",
  // 새내기 대화
  start: "failfair.start",
  reply: "failfair.reply",
  confirmSituation: "failfair.confirmSituation",
  compare: "failfair.compare",
  getSession: "failfair.getSession",
  getCase: "failfair.getCase",
  feedback: "failfair.feedback",
  // 선배 입력·검수
  submitCase: "failfair.submitCase",
  listCases: "failfair.listCases",
  reviewCase: "failfair.reviewCase",
  // 런타임 모델 설정 (운영진 없이 Gemini 켜고 끄기)
  getModel: "failfair.getModel",
  setModel: "failfair.setModel",
} as const;

/** UI가 분기 처리할 수 있는 오류 코드 (FunctionCallError의 type) */
export const FAILFAIR_ERRORS = {
  invalidInput: "INVALID_INPUT",
  notFoundOrForbidden: "NOT_FOUND_OR_FORBIDDEN",
  staleSession: "STALE_SESSION",
  modelUnavailable: "MODEL_UNAVAILABLE",
  inProgress: "IN_PROGRESS",
} as const;

// ---------------------------------------------------------------------------
// 커맨드 입력
// ---------------------------------------------------------------------------

export const CommandActionInputSchema = z.object({
  chat: z.object({ type: z.string(), id: z.string() }).optional(),
  trigger: z
    .object({
      type: z.string(),
      attributes: z
        .record(z.string())
        .nullish()
        .transform((attributes) => attributes ?? {}),
    })
    .optional(),
  input: z
    .record(z.unknown())
    .nullish()
    .transform((input) => input ?? {}),
  language: z.string().optional(),
});
export type CommandActionInput = z.infer<typeof CommandActionInputSchema>;

// ---------------------------------------------------------------------------
// 카테고리 · 긴급도 · 행동 태그
// ---------------------------------------------------------------------------

export const CategorySchema = z.enum(["grades", "team_project", "club"]);
export type Category = z.infer<typeof CategorySchema>;

export const CATEGORIES: ReadonlyArray<{
  id: Category;
  name: string;
  prompt: string;
}> = [
  {
    id: "grades",
    name: "성적·수업",
    prompt: "어떤 수업에서 무슨 일이 있었고, 어떤 선택을 고민하고 있나요?",
  },
  {
    id: "team_project",
    name: "팀플·과제",
    prompt: "팀에서 어떤 문제가 생겼고, 지금 무엇을 고민하고 있나요?",
  },
  {
    id: "club",
    name: "동아리·학생활동",
    prompt: "활동 중 어떤 일이 있었고, 어떤 선택이 고민되나요?",
  },
];

export const UrgencySchema = z.enum(["today", "week", "later", "unknown"]);
export type Urgency = z.infer<typeof UrgencySchema>;
export const URGENCY_LABELS: Record<Urgency, string> = {
  today: "오늘 안에",
  week: "이번 주 안에",
  later: "아직 여유 있음",
  unknown: "미확인",
};

/**
 * 관리되는 행동 태그. 학생이 말한 행동을 여기 연결해 사례를 찾는다.
 * keywords는 규칙 기반 추출용이며, 모델 연결 후에도 검증용으로 남긴다.
 */
export const ACTION_TAGS: Record<
  Category,
  ReadonlyArray<{ tag: string; label: string; keywords: readonly string[] }>
> = {
  team_project: [
    {
      tag: "solo_completion",
      label: "혼자 마무리",
      keywords: ["혼자", "내가 다", "다 할", "제가 다", "혼자서"],
    },
    {
      tag: "inform_professor",
      label: "교수님께 상황 전달",
      keywords: ["교수", "알린다", "말할지", "말씀", "메일"],
    },
    {
      tag: "reduce_scope_reassign",
      label: "범위 축소·역할 재분배",
      keywords: ["나누", "재분배", "줄이", "범위", "분담"],
    },
    {
      tag: "request_deadline_extension",
      label: "마감 연장 요청",
      keywords: ["연장", "미뤄", "기한", "늦게 내", "순서 바꿔"],
    },
    {
      // 사례가 아직 없는 행동. 학생이 고르면 "연결할 사례가 아직 없습니다"가 정상 결과다 (v2 §5.3).
      tag: "request_member_removal",
      label: "팀원 제외 요청",
      keywords: ["빼달라", "제외", "교체", "쫓아", "명단에서"],
    },
  ],
  grades: [
    {
      tag: "change_study_method",
      label: "공부 방식 변경",
      keywords: ["공부법", "방식", "스터디", "계획 세우", "복습"],
    },
    {
      tag: "ask_help",
      label: "도움 요청",
      keywords: ["질문", "조교", "튜터", "도움", "오피스"],
    },
    {
      tag: "replan_courses",
      label: "과목 이수 계획 재검토",
      keywords: ["재수강", "드랍", "포기", "철회", "계획"],
    },
    {
      tag: "inform_professor",
      label: "교수님께 상황 전달",
      keywords: ["교수", "면담", "말씀", "메일", "배점"],
    },
    {
      // 사례가 아직 없는 행동 (v2 §5.3).
      tag: "request_grade_review",
      label: "성적 이의신청",
      keywords: ["이의", "정정", "재확인", "따져", "항의"],
    },
  ],
  club: [
    {
      tag: "reduce_role",
      label: "역할 축소 협의",
      keywords: ["역할 줄", "축소", "내려놓", "덜 맡"],
    },
    {
      tag: "share_workload",
      label: "업무 분담 요청",
      keywords: ["분담", "나눠", "도와달라", "같이 하"],
    },
    {
      tag: "discuss_leaving",
      label: "활동 중단 논의",
      keywords: ["그만", "탈퇴", "나갈", "중단", "쉬고"],
    },
    {
      tag: "recruit_replacement",
      label: "후임·대체 인원 모집",
      keywords: ["후임", "넘길 사람", "인수인계", "뽑", "모집"],
    },
    {
      tag: "ask_help",
      label: "선배·외부에 도움 요청",
      keywords: ["선배", "OB", "물어", "도움", "경험자"],
    },
  ],
};

// ---------------------------------------------------------------------------
// 상황 · 행동 · 메시지
// ---------------------------------------------------------------------------

export const DeadlineSchema = z.object({
  raw: z.string().default(""),
  urgency: UrgencySchema.default("unknown"),
});

/** v2 2.2 내부 상황 구조. 학생이 말한 사실만 채우고 미확인은 비워 둔다. */
/**
 * 학생의 전공. 학과 개편이 잦아 enum으로 고정하지 않고 문자열로 받는다.
 * `collegeId`는 `SKKU_COLLEGES`의 id, `department`는 표시용 학과명이다.
 * 아직 학과를 정하지 않은 1학년도 있으므로 `department`는 선택이다.
 */
export const MajorSchema = z.object({
  collegeId: z.string().min(1).max(40),
  department: z.string().min(1).max(60).optional(),
});
export type Major = z.infer<typeof MajorSchema>;

export const SituationSchema = z.object({
  category: CategorySchema,
  problemType: z.string().optional(),
  /** A 추가(전공 수집). 선택 입력이라 없는 세션도 정상이다. */
  major: MajorSchema.optional(),
  situation: z.string().default(""),
  goal: z.string().default(""),
  deadline: DeadlineSchema.default({}),
  progress: z.string().default(""),
  constraints: z.array(z.string()).default([]),
  attemptedActions: z.array(z.string()).default([]),
  consideredActions: z.array(z.string()).default([]),
  unknowns: z.array(z.string()).default([]),
});
export type Situation = z.infer<typeof SituationSchema>;

export const ActionOriginSchema = z.enum(["student", "suggested"]);

export const ActionCandidateSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1).max(80),
  actionTag: z.string().optional(),
  origin: ActionOriginSchema,
  confirmed: z.boolean().default(true),
});
export type ActionCandidate = z.infer<typeof ActionCandidateSchema>;

export const MessageSchema = z.object({
  role: z.enum(["student", "assistant"]),
  content: z.string(),
  at: z.number(),
});
export type Message = z.infer<typeof MessageSchema>;

export const SessionStateSchema = z.enum([
  "COLLECTING",
  "REVIEWING_SITUATION",
  "REVIEWING_ACTIONS",
  "MATCHING",
  "RESULTS",
]);
export type SessionState = z.infer<typeof SessionStateSchema>;

// ---------------------------------------------------------------------------
// 검수 사례 (선배 입력)
// ---------------------------------------------------------------------------

export const CaseStatusSchema = z.enum(["draft", "approved", "hidden"]);
export type CaseStatus = z.infer<typeof CaseStatusSchema>;
export const CaseSourceSchema = z.enum(["real", "demo"]);
export type CaseSource = z.infer<typeof CaseSourceSchema>;

export const ActionStepSchema = z.object({
  order: z.number().int().nonnegative(),
  actionTag: z.string().min(1),
  description: z.string().min(1),
});
export type ActionStep = z.infer<typeof ActionStepSchema>;

export const OutcomeSchema = z.object({
  shortTerm: z.string().min(1),
  followUp: z.string().default(""),
  unresolved: z.string().default(""),
});

export const ReceiptStatusSchema = z.enum(["resolved", "partial", "ongoing"]);
export const RECEIPT_STATUS_LABELS: Record<
  z.infer<typeof ReceiptStatusSchema>,
  string
> = { resolved: "해결", partial: "일부 해결", ongoing: "아직 진행 중" };

export const ReceiptSchema = z.object({
  firstAction: z.string().min(1),
  wasted: z.string().default(""),
  turningPoint: z.string().default(""),
  cost: z.string().min(1),
  status: ReceiptStatusSchema,
});

export const ToolSchema = z.object({
  title: z.string().min(1).max(60),
  body: z.string().min(1),
  usageNote: z.string().default(""),
});

/** 선배가 입력 화면에서 보내는 형태. id·상태·작성자는 서버가 붙인다. */
export const CaseSubmissionSchema = z.object({
  category: CategorySchema,
  title: z.string().min(1).max(80),
  problemType: z.string().min(1).max(40),
  situation: z.string().min(1),
  constraints: z.array(z.string().min(1)).default([]),
  urgency: UrgencySchema.default("unknown"),
  goal: z.string().default(""),
  actionSteps: z.array(ActionStepSchema).min(1).max(6),
  outcome: OutcomeSchema,
  receipt: ReceiptSchema,
  conditions: z.array(z.string().min(1)).default([]),
  tags: z.array(z.string().min(1).max(20)).default([]),
  tool: ToolSchema.optional(),
  allowContact: z.boolean().default(false),
});
export type CaseSubmission = z.infer<typeof CaseSubmissionSchema>;

export const CaseSchema = CaseSubmissionSchema.extend({
  id: z.string().min(1),
  status: CaseStatusSchema,
  sourceType: CaseSourceSchema,
  version: z.number().int().positive().default(1),
  authorManagerId: z.string().optional(),
  createdAt: z.number(),
});
export type Case = z.infer<typeof CaseSchema>;

// ---------------------------------------------------------------------------
// 행동별 비교 결과
// ---------------------------------------------------------------------------

export const ActionResultStatusSchema = z.enum([
  "matched",
  "reference",
  "no_case",
]);

export const ActionResultSchema = z.object({
  id: z.string(),
  action: ActionCandidateSchema,
  status: ActionResultStatusSchema,
  caseId: z.string().optional(),
  caseTitle: z.string().optional(),
  sourceType: CaseSourceSchema.optional(),
  similarities: z.array(z.string()).default([]),
  differences: z.array(z.string()).default([]),
  unknowns: z.array(z.string()).default([]),
  seniorActions: z.array(z.string()).default([]),
  outcome: OutcomeSchema.optional(),
  cost: z.string().optional(),
  conditions: z.array(z.string()).default([]),
  toolTitle: z.string().optional(),
});
export type ActionResult = z.infer<typeof ActionResultSchema>;

// ---------------------------------------------------------------------------
// Function 입출력
// ---------------------------------------------------------------------------

const RequestBase = z.object({
  sessionId: z.string().min(1),
  requestId: z.string().min(1),
  expectedRevision: z.number().int().nonnegative(),
});

export const StartInputSchema = z.object({
  category: CategorySchema,
  requestId: z.string().min(1),
});
export const StartOutputSchema = z.object({
  sessionId: z.string(),
  state: SessionStateSchema,
  revision: z.number().int(),
  assistantMessage: z.string(),
});
export type StartOutput = z.infer<typeof StartOutputSchema>;

export const ReplyInputSchema = RequestBase.extend({
  message: z.string().min(1).max(1000),
});
export const ReplyOutputSchema = z.object({
  state: SessionStateSchema,
  revision: z.number().int(),
  assistantMessage: z.string(),
  situation: SituationSchema,
});
export type ReplyOutput = z.infer<typeof ReplyOutputSchema>;

export const ConfirmSituationInputSchema = RequestBase.extend({
  situation: SituationSchema,
});
export const ConfirmSituationOutputSchema = z.object({
  state: SessionStateSchema,
  revision: z.number().int(),
  situation: SituationSchema,
  actions: z.array(ActionCandidateSchema),
});
export type ConfirmSituationOutput = z.infer<
  typeof ConfirmSituationOutputSchema
>;

export const CompareInputSchema = RequestBase.extend({
  actions: z.array(ActionCandidateSchema).min(1).max(3),
});
export const CompareOutputSchema = z.object({
  state: SessionStateSchema,
  revision: z.number().int(),
  results: z.array(ActionResultSchema),
  notice: z.string(),
});
export type CompareOutput = z.infer<typeof CompareOutputSchema>;

export const GetSessionInputSchema = z.object({ sessionId: z.string().min(1) });
export const SessionViewSchema = z.object({
  id: z.string(),
  category: CategorySchema,
  state: SessionStateSchema,
  revision: z.number().int(),
  messages: z.array(MessageSchema),
  situation: SituationSchema,
  actions: z.array(ActionCandidateSchema),
  results: z.array(ActionResultSchema),
});
export type SessionView = z.infer<typeof SessionViewSchema>;

export const GetCaseInputSchema = z.object({
  sessionId: z.string().min(1),
  caseId: z.string().min(1),
});
export const GetCaseOutputSchema = z.object({ case: CaseSchema });

export const FeedbackInputSchema = z.object({
  sessionId: z.string().min(1),
  requestId: z.string().min(1),
  resultId: z.string().min(1),
  event: z.enum(["helpful", "not_helpful", "tool_copied"]),
});
export const OkOutputSchema = z.object({ ok: z.literal(true) });

export const SubmitCaseOutputSchema = z.object({ case: CaseSchema });
export const ListCasesInputSchema = z.object({
  status: CaseStatusSchema.optional(),
});
export const ListCasesOutputSchema = z.object({ cases: z.array(CaseSchema) });
export const ReviewCaseInputSchema = z.object({
  caseId: z.string().min(1),
  status: CaseStatusSchema,
});

export const EmptyInputSchema = z.object({});

// ---------------------------------------------------------------------------
// WAM이 받는 값
// ---------------------------------------------------------------------------

export const ModeSchema = z.enum(["student", "senior"]);
export type Mode = z.infer<typeof ModeSchema>;

export const FailfairWamArgsSchema = z.object({
  chatId: z.string().default(""),
  chatType: z.string().default(""),
  chatTitle: z.string().default(""),
  mode: ModeSchema.optional(),
  /** 호스트가 안 줄 수도 있어 서버가 함께 넣어 준다 (튜토리얼과 동일). */
  appId: z.string().optional(),
  channelId: z.string().optional(),
  managerId: z.string().optional(),
});
export const FailfairWamDataSchema = FailfairWamArgsSchema.extend({
  appId: z.string().min(1),
  channelId: z.string().min(1),
  managerId: z.string().default(""),
});
export type FailfairWamData = z.infer<typeof FailfairWamDataSchema>;

// ---------------------------------------------------------------------------
// 문제 유형 (카테고리별). 규칙 기반 추출과 선배 입력 화면이 함께 쓴다.
// ---------------------------------------------------------------------------

export const PROBLEM_TYPES: Record<
  Category,
  ReadonlyArray<{ type: string; label: string; keywords: readonly string[] }>
> = {
  team_project: [
    {
      type: "unreachable_member",
      label: "팀원 연락 두절",
      keywords: ["잠수", "연락", "사라", "두절", "안 읽"],
    },
    {
      type: "free_rider",
      label: "무임승차",
      keywords: ["무임", "안 해", "안 하", "놀고", "묻어"],
    },
    {
      type: "conflict",
      label: "팀 내 갈등",
      keywords: ["싸", "갈등", "의견", "충돌"],
    },
  ],
  grades: [
    {
      type: "low_exam_score",
      label: "시험 성적 부진",
      keywords: ["시험", "점수", "망", "학점", "성적"],
    },
    {
      type: "missed_deadline",
      label: "과제 마감 놓침",
      keywords: ["마감", "제출", "놓쳤", "늦게"],
    },
    {
      type: "course_fit",
      label: "수업이 안 맞음",
      keywords: ["안 맞", "어려워", "따라가", "포기"],
    },
  ],
  club: [
    {
      type: "role_overload",
      label: "역할 과부하",
      keywords: ["부담", "역할", "총괄", "너무 많", "벅차"],
    },
    {
      type: "relationship",
      label: "관계 문제",
      keywords: ["선배", "관계", "어색", "눈치"],
    },
    {
      type: "leaving",
      label: "활동 중단 고민",
      keywords: ["그만", "탈퇴", "나갈", "중단"],
    },
  ],
};

// ---------------------------------------------------------------------------
// 런타임 모델 설정. 환경 변수가 없을 때 Desk에서 매니저가 Gemini를 켜고 끈다.
// 값은 서버에만 저장되고 화면으로 돌려주지 않는다.
// ---------------------------------------------------------------------------

export const ModelStatusSchema = z.object({
  provider: z.enum(["gemini", "rule"]),
  /** env: 운영진 비밀 변수, record: Desk에서 저장한 값, none: 아무것도 없음(rule) */
  source: z.enum(["env", "record", "none"]),
  model: z.string().optional(),
  warning: z.string().optional(),
});
export type ModelStatus = z.infer<typeof ModelStatusSchema>;

export const SetModelInputSchema = z.object({
  provider: z.enum(["gemini", "rule"]),
  apiKey: z.string().trim().max(200).default(""),
  model: z.string().trim().max(60).default("gemini-3.1-flash-lite"),
});
