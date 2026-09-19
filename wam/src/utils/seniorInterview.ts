import {
  ACTION_TAGS,
  CATEGORIES,
  PROBLEM_TYPES,
  RECEIPT_STATUS_LABELS,
  ReceiptStatusSchema,
  detectActionTags,
  detectProblemType,
  detectUrgency,
  type CaseSubmission,
  type Category,
  type Urgency,
} from '@tutorial/shared'

/**
 * 선배 인터뷰 대본. 실패담은 원래 서사 순서가 있어서, 그 순서대로 하나씩 물으면
 * CaseSubmission이 채워진다. 제목·첫 행동처럼 시스템이 필요한 값은 답에서 만든다.
 * 선배에게는 "어떤 일이 있었고 → 뭘 했고 → 어떻게 됐고 → 뭘 잃었나"만 묻는다.
 */

export type ReceiptStatus = CaseSubmission['receipt']['status']

export type SeniorStepId =
  | 'situation'
  | 'constraints'
  | 'problemType'
  | 'action'
  | 'actionTag'
  | 'outcome'
  | 'followUp'
  | 'status'
  | 'unresolved'
  | 'cost'
  | 'wasted'
  | 'turningPoint'
  | 'conditions'
  | 'tool'
  | 'toolTitle'
  | 'contact'
  | 'preview'

export interface StepDraft {
  actionTag: string
  description: string
}

export interface SeniorDraft {
  category: Category
  title: string
  situation: string
  constraints: string[]
  urgency: Urgency
  problemType: string
  steps: StepDraft[]
  /** 방금 적었지만 아직 태그를 고르지 않은 행동 */
  pendingDescription: string
  shortTerm: string
  followUp: string
  unresolved: string
  status: ReceiptStatus
  cost: string
  wasted: string
  turningPoint: string
  conditions: string[]
  toolBody: string
  toolTitle: string
  allowContact: boolean
}

export const MAX_STEPS = 6
export const DEFAULT_TOOL_TITLE = '복구 도구'

export function emptyDraft(category: Category): SeniorDraft {
  return {
    category,
    title: '',
    situation: '',
    constraints: [],
    urgency: 'unknown',
    problemType: '',
    steps: [],
    pendingDescription: '',
    shortTerm: '',
    followUp: '',
    unresolved: '',
    status: 'partial',
    cost: '',
    wasted: '',
    turningPoint: '',
    conditions: [],
    toolBody: '',
    toolTitle: '',
    allowContact: false,
  }
}

export const splitList = (value: string): string[] =>
  value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean)

/** 상황 첫 문장으로 제목을 만든다. 선배는 미리보기에서 고칠 수 있다. */
export function autoTitle(situation: string): string {
  const first = situation
    .split(/[.!?。\n]/)
    .map((item) => item.trim())
    .find(Boolean)
  if (!first) return ''
  return first.length > 40 ? `${first.slice(0, 39)}…` : first
}

/** 답이 없어도 되는 질문과, 그때 누르는 버튼 문구 */
export const SKIP_LABEL: Partial<Record<SeniorStepId, string>> = {
  constraints: '특별히 없었어요',
  followUp: '그게 다예요',
  unresolved: '넘어갈게요',
  wasted: '없었어요',
  turningPoint: '없었어요',
  conditions: '없어요',
  tool: '없어요',
  toolTitle: `그냥 「${DEFAULT_TOOL_TITLE}」로`,
}

/** 칩으로 답하는 단계 */
export const CHIP_STEPS: ReadonlySet<SeniorStepId> = new Set([
  'problemType',
  'actionTag',
  'status',
  'contact',
])

export function categoryName(category: Category): string {
  return CATEGORIES.find((item) => item.id === category)?.name ?? ''
}

export function problemLabel(category: Category, type: string): string {
  return (
    PROBLEM_TYPES[category].find((problem) => problem.type === type)?.label ??
    type
  )
}

export function actionLabel(category: Category, tag: string): string {
  return (
    ACTION_TAGS[category].find((action) => action.tag === tag)?.label ?? tag
  )
}

/** 상황 본문에서 추정한 문제 유형. 없으면 undefined. */
export function guessProblemType(draft: SeniorDraft): string | undefined {
  return detectProblemType(draft.category, draft.situation)
}

/** 방금 적은 행동에서 추정한 태그. 첫 번째 것만 쓴다. */
export function guessActionTag(draft: SeniorDraft): string | undefined {
  return detectActionTags(draft.category, draft.pendingDescription)[0]
}

export function questionFor(step: SeniorStepId, draft: SeniorDraft): string {
  switch (step) {
    case 'situation':
      return `${categoryName(draft.category)} 얘기군요. 그때 무슨 일이 있었는지 편하게 말해 주세요. 실명이나 과목명은 빼고요.`
    case 'constraints':
      return '그때 발목을 잡은 조건이 있었어요? 남은 시간, 사람 수, 돈 같은 거요. 여러 개면 줄을 나눠 적어 주세요.'
    case 'problemType': {
      const guess = guessProblemType(draft)
      return guess
        ? `「${problemLabel(draft.category, guess)}」에 가까운 얘기 같은데, 맞아요? 다르면 골라 주세요.`
        : '어떤 문제에 가장 가까웠어요?'
    }
    case 'action':
      if (draft.steps.length === 0) return '그래서 처음에 뭘 했어요?'
      if (draft.steps.length === 1)
        return '그 다음엔 뭘 했어요? 그게 끝이면 아래 버튼을 눌러 주세요.'
      return '그 다음엔요?'
    case 'actionTag': {
      const guess = guessActionTag(draft)
      return guess
        ? `이 행동은 「${actionLabel(draft.category, guess)}」로 분류할게요. 새내기가 같은 행동을 고민할 때 이 사례가 연결돼요. 다른 거면 골라 주세요.`
        : '이 행동은 어느 쪽에 가까워요? 새내기가 같은 행동을 고민할 때 이 사례가 연결돼요.'
    }
    case 'outcome':
      return '그래서 어떻게 됐어요? 바로 일어난 일부터요.'
    case 'followUp':
      return '그 뒤로는 어떻게 흘러갔어요?'
    case 'status':
      return '지금은 어느 정도 정리됐어요?'
    case 'unresolved':
      return '아직 안 풀린 건 뭐예요?'
    case 'cost':
      return '그거 하느라 뭘 잃었어요? 시간, 돈, 관계, 포기한 것 같은 거요. 이 서비스에서 가장 중요한 한 줄이에요.'
    case 'wasted':
      return '돌아보면 헛수고였던 것도 있었어요?'
    case 'turningPoint':
      return '반대로, 상황이 풀리기 시작한 계기가 있었다면요?'
    case 'conditions':
      return '다시 돌아간다면 같은 행동을 하기 전에 먼저 확인했을 게 있어요? 다음 사람한테 알려 주고 싶은 조건이요.'
    case 'tool':
      return '새내기가 그대로 복사해 쓸 만한 게 남았어요? 메일 틀이나 체크리스트 같은 거요. 개인정보는 ○○로 바꿔 주세요.'
    case 'toolTitle':
      return '이 도구를 뭐라고 부를까요? 한 줄이면 돼요.'
    case 'contact':
      return '마지막이에요. 나중에 새내기가 이 사례를 보고 SOS를 보내도 괜찮아요? 연락처는 저장하지 않고, 이 채팅방으로 알림만 와요.'
    case 'preview':
      return '이렇게 정리됐어요. 검수를 거쳐 새내기 화면에 보여요. 고칠 곳이 있으면 각 줄의 「고치기」를 눌러 주세요.'
  }
}

/** 처음부터 순서대로 진행할 때의 다음 단계 */
export function nextStep(step: SeniorStepId, draft: SeniorDraft): SeniorStepId {
  switch (step) {
    case 'situation':
      return 'constraints'
    case 'constraints':
      return 'problemType'
    case 'problemType':
      return 'action'
    case 'action':
      return 'actionTag'
    case 'actionTag':
      return draft.steps.length >= MAX_STEPS ? 'outcome' : 'action'
    case 'outcome':
      return 'followUp'
    case 'followUp':
      return 'status'
    case 'status':
      return draft.status === 'resolved' ? 'cost' : 'unresolved'
    case 'unresolved':
      return 'cost'
    case 'cost':
      return 'wasted'
    case 'wasted':
      return 'turningPoint'
    case 'turningPoint':
      return 'conditions'
    case 'conditions':
      return 'tool'
    case 'tool':
      return draft.toolBody ? 'toolTitle' : 'contact'
    case 'toolTitle':
      return 'contact'
    case 'contact':
    case 'preview':
      return 'preview'
  }
}

/**
 * 미리보기에서 한 항목만 고칠 때의 다음 단계. 대부분 바로 미리보기로 돌아가고,
 * 행동은 다시 순서대로 받으며, 상태·도구는 따라오는 질문 하나까지만 묻는다.
 */
export function nextStepWhileEditing(
  step: SeniorStepId,
  draft: SeniorDraft
): SeniorStepId {
  switch (step) {
    case 'action':
      return 'actionTag'
    case 'actionTag':
      return draft.steps.length >= MAX_STEPS ? 'preview' : 'action'
    case 'status':
      return draft.status === 'resolved' ? 'preview' : 'unresolved'
    case 'tool':
      return draft.toolBody ? 'toolTitle' : 'preview'
    default:
      return 'preview'
  }
}

/** 자유 서술 답을 초안에 적는다. 빈 문자열은 건너뛴 답이다. */
export function applyText(
  step: SeniorStepId,
  text: string,
  draft: SeniorDraft
): SeniorDraft {
  const value = text.trim()
  switch (step) {
    case 'situation':
      return {
        ...draft,
        situation: value,
        title: autoTitle(value),
        urgency: detectUrgency(value),
      }
    case 'constraints':
      return {
        ...draft,
        constraints: splitList(value),
        urgency:
          draft.urgency === 'unknown' ? detectUrgency(value) : draft.urgency,
      }
    case 'action':
      return { ...draft, pendingDescription: value }
    case 'outcome':
      return { ...draft, shortTerm: value }
    case 'followUp':
      return { ...draft, followUp: value }
    case 'unresolved':
      return { ...draft, unresolved: value }
    case 'cost':
      return { ...draft, cost: value }
    case 'wasted':
      return { ...draft, wasted: value }
    case 'turningPoint':
      return { ...draft, turningPoint: value }
    case 'conditions':
      return { ...draft, conditions: splitList(value) }
    case 'tool':
      return { ...draft, toolBody: value }
    case 'toolTitle':
      return { ...draft, toolTitle: value || DEFAULT_TOOL_TITLE }
    default:
      return draft
  }
}

/** 칩으로 고른 답을 초안에 적는다. */
export function applyChoice(
  step: SeniorStepId,
  value: string,
  draft: SeniorDraft
): SeniorDraft {
  switch (step) {
    case 'problemType':
      return { ...draft, problemType: value }
    case 'actionTag':
      return {
        ...draft,
        steps: [
          ...draft.steps,
          { actionTag: value, description: draft.pendingDescription },
        ],
        pendingDescription: '',
      }
    case 'status':
      return {
        ...draft,
        status: ReceiptStatusSchema.parse(value),
        unresolved: value === 'resolved' ? '' : draft.unresolved,
      }
    case 'contact':
      return { ...draft, allowContact: value === 'yes' }
    default:
      return draft
  }
}

export interface Choice {
  value: string
  label: string
}

/** 칩 단계의 선택지와, 추정값이 있으면 미리 켜 둘 값 */
export function choicesFor(
  step: SeniorStepId,
  draft: SeniorDraft
): { options: Choice[]; preselected?: string } {
  switch (step) {
    case 'problemType':
      return {
        options: PROBLEM_TYPES[draft.category].map((problem) => ({
          value: problem.type,
          label: problem.label,
        })),
        preselected: guessProblemType(draft),
      }
    case 'actionTag':
      return {
        options: ACTION_TAGS[draft.category].map((action) => ({
          value: action.tag,
          label: action.label,
        })),
        preselected: guessActionTag(draft),
      }
    case 'status':
      return {
        options: ReceiptStatusSchema.options.map((option) => ({
          value: option,
          label: RECEIPT_STATUS_LABELS[option],
        })),
      }
    case 'contact':
      return {
        options: [
          { value: 'yes', label: '괜찮아요' },
          { value: 'no', label: '아니요' },
        ],
      }
    default:
      return { options: [] }
  }
}

/** 서버로 보낼 형태. 검증은 CaseSubmissionSchema.safeParse가 한다. */
export function buildSubmission(draft: SeniorDraft): unknown {
  return {
    category: draft.category,
    title: draft.title.trim() || autoTitle(draft.situation),
    problemType: draft.problemType,
    situation: draft.situation,
    constraints: draft.constraints,
    urgency: draft.urgency,
    goal: '',
    actionSteps: draft.steps.map((step, index) => ({
      order: index + 1,
      actionTag: step.actionTag,
      description: step.description,
    })),
    outcome: {
      shortTerm: draft.shortTerm,
      followUp: draft.followUp,
      unresolved: draft.unresolved,
    },
    receipt: {
      firstAction: draft.steps[0]?.description ?? '',
      wasted: draft.wasted,
      turningPoint: draft.turningPoint,
      cost: draft.cost,
      status: draft.status,
    },
    conditions: draft.conditions,
    tags: [],
    tool: draft.toolBody
      ? {
          title: draft.toolTitle || DEFAULT_TOOL_TITLE,
          body: draft.toolBody,
          usageNote: '',
        }
      : undefined,
    allowContact: draft.allowContact,
  }
}
