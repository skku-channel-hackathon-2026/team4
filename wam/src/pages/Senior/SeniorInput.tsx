import { useEffect, useRef, useState } from 'react'
import {
  Button,
  HStack,
  Text,
  TextInput,
  VStack,
} from '@channel.io/bezier-react/beta'
import { InlineBanner } from '@channel.io/app-sdk-wam-ui'
import {
  CATEGORIES,
  CaseSubmissionSchema,
  RECEIPT_STATUS_LABELS,
  type CaseSubmission,
  type Category,
  type Message,
} from '@tutorial/shared'

import Bubble from '../../components/failfair/Bubble'
import Chip from '../../components/failfair/Chip'
import Composer from '../../components/failfair/Composer'
import { errorMessage } from '../../hooks/useFailfairApi'
import {
  CHIP_STEPS,
  SKIP_LABEL,
  actionLabel,
  applyChoice,
  applyText,
  buildSubmission,
  choicesFor,
  emptyDraft,
  nextStep,
  nextStepWhileEditing,
  problemLabel,
  questionFor,
  type SeniorDraft,
  type SeniorStepId,
} from '../../utils/seniorInterview'

interface SeniorInputPageProps {
  onSubmit: (input: CaseSubmission) => Promise<void>
  onOpenReview: () => void
}

type Phase = 'category' | 'interview' | 'done'

/**
 * 선배 입력 (v2 §4.2). 폼 대신 인터뷰다. 카테고리를 고르면 봇이 하나씩 묻고,
 * 답만 하면 사례가 채워진다. 마지막에 정리된 카드를 보고 등록한다.
 * 등록 직후에는 draft이며 검수 후 노출된다.
 */
function SeniorInputPage({ onSubmit, onOpenReview }: SeniorInputPageProps) {
  const [phase, setPhase] = useState<Phase>('category')
  const [draft, setDraft] = useState<SeniorDraft>(() =>
    emptyDraft('team_project')
  )
  const [step, setStep] = useState<SeniorStepId>('situation')
  const [log, setLog] = useState<Message[]>([])
  /** 미리보기에서 한 항목만 고치는 중이면, 답한 뒤 미리보기로 돌아간다. */
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const endRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [log.length, step])

  const say = (role: Message['role'], content: string) =>
    setLog((current) => [...current, { role, content, at: Date.now() }])

  const begin = (category: Category) => {
    const fresh = emptyDraft(category)
    setDraft(fresh)
    setStep('situation')
    setEditing(false)
    setError(null)
    setLog([
      { role: 'assistant', content: questionFor('situation', fresh), at: 0 },
    ])
    setPhase('interview')
  }

  /** 다음 단계로 옮기고 그 질문을 말풍선으로 올린다. */
  const goTo = (next: SeniorStepId, updated: SeniorDraft) => {
    setStep(next)
    if (next === 'preview') setEditing(false)
    say('assistant', questionFor(next, updated))
  }

  const advance = (from: SeniorStepId, updated: SeniorDraft) =>
    goTo(
      editing ? nextStepWhileEditing(from, updated) : nextStep(from, updated),
      updated
    )

  const answerText = (text: string) => {
    say('student', text)
    const updated = applyText(step, text, draft)
    setDraft(updated)
    advance(step, updated)
  }

  const skip = () => {
    const label = SKIP_LABEL[step]
    if (!label) return
    say('student', label)
    const updated = applyText(step, '', draft)
    setDraft(updated)
    advance(step, updated)
  }

  const choose = (value: string, label: string) => {
    say('student', label)
    const updated = applyChoice(step, value, draft)
    setDraft(updated)
    advance(step, updated)
  }

  /** 행동 입력을 끝낸다. 처음부터면 결과로, 고치는 중이면 미리보기로. */
  const finishActions = () => {
    say('student', '그게 끝이에요')
    goTo(editing ? 'preview' : 'outcome', draft)
  }

  /** 미리보기에서 한 항목을 다시 묻는다. 행동은 처음부터 다시 받는다. */
  const edit = (target: SeniorStepId) => {
    setEditing(true)
    setError(null)
    const updated =
      target === 'action'
        ? { ...draft, steps: [], pendingDescription: '' }
        : draft
    setDraft(updated)
    setStep(target)
    say('assistant', questionFor(target, updated))
  }

  const submit = async () => {
    setError(null)
    const parsed = CaseSubmissionSchema.safeParse(buildSubmission(draft))
    if (!parsed.success) {
      const issue = parsed.error.issues[0]
      setError(
        `아직 비어 있는 곳이 있어요: ${issue?.path.join('.') || '입력값'}`
      )
      return
    }
    setBusy(true)
    try {
      await onSubmit(parsed.data)
      setPhase('done')
    } catch (cause) {
      setError(
        errorMessage(cause, '등록하지 못했어요. 잠시 후 다시 시도해 주세요.')
      )
    } finally {
      setBusy(false)
    }
  }

  if (phase === 'category') {
    return (
      <VStack spacing={12}>
        <Text
          as="p"
          typo="14"
          color="text-neutral-light"
        >
          어떤 얘기예요? 고른 뒤에는 제가 하나씩 물어볼게요. 대답만 하면 사례가
          정리돼요. 성공담이 아니어도, 아직 해결 중이어도 좋아요.
        </Text>
        {CATEGORIES.map((category) => (
          <button
            key={category.id}
            type="button"
            className="ff-big"
            onClick={() => begin(category.id)}
          >
            <Text
              as="span"
              typo="16"
              bold
            >
              {category.name}
            </Text>
          </button>
        ))}
        <Text
          as="p"
          typo="12"
          color="text-neutral-lighter"
        >
          실명, 학번, 특정 교수님·상대 이름은 빼 주세요. 등록한 사례는 검수를
          거쳐 비슷한 고민을 가진 새내기에게 보여질 수 있어요.
        </Text>
      </VStack>
    )
  }

  if (phase === 'done') {
    return (
      <VStack spacing={12}>
        <InlineBanner
          variant="success"
          content="등록됐어요. 검수 후 새내기 대화 결과에 나타나요."
        />
        <HStack spacing={8}>
          <Button
            size="m"
            variant="filled"
            semantic="primary"
            label="검수 목록 보기"
            onClick={onOpenReview}
          />
          <Button
            size="m"
            variant="outlined"
            semantic="secondary"
            label="하나 더 남기기"
            onClick={() => setPhase('category')}
          />
        </HStack>
      </VStack>
    )
  }

  const skipLabel = SKIP_LABEL[step]
  const quick = [
    ...(skipLabel ? [{ label: skipLabel, onClick: skip }] : []),
    ...(step === 'action' && draft.steps.length > 0
      ? [{ label: '그게 끝이에요', onClick: finishActions }]
      : []),
  ]

  return (
    <VStack spacing={8}>
      <div className="ff-log">
        {log.map((message, index) => (
          <Bubble
            key={`${message.at}-${index}`}
            role={message.role}
            content={message.content}
          />
        ))}

        {CHIP_STEPS.has(step) && (
          <ChoiceRow
            draft={draft}
            step={step}
            onPick={choose}
          />
        )}

        {step === 'preview' && (
          <Preview
            draft={draft}
            busy={busy}
            error={error}
            onTitle={(title) => setDraft({ ...draft, title })}
            onEdit={edit}
            onSubmit={() => void submit()}
          />
        )}
      </div>

      {!CHIP_STEPS.has(step) && step !== 'preview' && (
        <Composer
          placeholder={
            step === 'tool'
              ? '그대로 복사해 쓸 수 있는 텍스트. Shift+Enter로 줄바꿈'
              : '편하게 적어 주세요. Enter로 보내기, Shift+Enter로 줄바꿈'
          }
          disabled={busy}
          onSend={answerText}
          quick={quick}
          minRows={step === 'tool' ? 6 : 3}
        />
      )}

      <div ref={endRef} />
    </VStack>
  )
}

// ---------------------------------------------------------------------------

interface ChoiceRowProps {
  draft: SeniorDraft
  step: SeniorStepId
  onPick: (value: string, label: string) => void
}

/** 칩으로 답하는 단계. 추정값이 있으면 켜 두고 「맞아요」 한 번으로 넘어간다. */
function ChoiceRow({ draft, step, onPick }: ChoiceRowProps) {
  const { options, preselected } = choicesFor(step, draft)
  const guessed = options.find((option) => option.value === preselected)
  return (
    <div className="ff-choices">
      {guessed && (
        <Button
          size="m"
          variant="filled"
          semantic="primary"
          label={`맞아요, ${guessed.label}`}
          onClick={() => onPick(guessed.value, guessed.label)}
        />
      )}
      <div className="ff-chips">
        {options
          .filter((option) => option.value !== preselected)
          .map((option) => (
            <Chip
              key={option.value}
              label={option.label}
              active={false}
              onClick={() => onPick(option.value, option.label)}
            />
          ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

interface PreviewProps {
  draft: SeniorDraft
  busy: boolean
  error: string | null
  onTitle: (title: string) => void
  onEdit: (step: SeniorStepId) => void
  onSubmit: () => void
}

function Row({
  label,
  value,
  step,
  onEdit,
}: {
  label: string
  value: string
  step: SeniorStepId
  onEdit: (step: SeniorStepId) => void
}) {
  return (
    <div className="ff-preview-row">
      <Text
        as="span"
        typo="12"
        bold
        color="text-neutral-light"
      >
        {label}
      </Text>
      <Text
        as="pre"
        typo="13"
        className="ff-bubble-text"
        color={value ? undefined : 'text-neutral-lighter'}
      >
        {value || '비워 둠'}
      </Text>
      <Button
        size="xs"
        variant="ghost"
        semantic="secondary"
        label={value ? '고치기' : '적기'}
        onClick={() => onEdit(step)}
      />
    </div>
  )
}

/** 정리된 사례 카드. 제목만 바로 고치고, 나머지는 「고치기」·「적기」로 다시 묻는다. 안 물어본 항목은 비워 둬도 된다. */
function Preview({
  draft,
  busy,
  error,
  onTitle,
  onEdit,
  onSubmit,
}: PreviewProps) {
  const stepsText = draft.steps
    .map(
      (step, index) =>
        `${index + 1}. ${step.description} · ${actionLabel(draft.category, step.actionTag)}`
    )
    .join('\n')
  const outcomeText = [
    draft.shortTerm,
    draft.followUp && `이후: ${draft.followUp}`,
    draft.unresolved && `미해결: ${draft.unresolved}`,
  ]
    .filter(Boolean)
    .join('\n')
  const toolText = draft.toolBody
    ? `${draft.toolTitle || '복구 도구'}\n${draft.toolBody}`
    : ''

  return (
    <Bubble
      role="assistant"
      content=""
    >
      <VStack spacing={4}>
        <Text
          as="span"
          typo="12"
          bold
          color="text-neutral-light"
        >
          사례 제목
        </Text>
        <TextInput
          value={draft.title}
          placeholder="한 줄 제목"
          onChange={(event) => onTitle(event.target.value)}
        />
      </VStack>
      <Row
        label="상황"
        value={draft.situation}
        step="situation"
        onEdit={onEdit}
      />
      <Row
        label="조건"
        value={draft.constraints.join(', ')}
        step="constraints"
        onEdit={onEdit}
      />
      <Row
        label="문제 유형"
        value={problemLabel(draft.category, draft.problemType)}
        step="problemType"
        onEdit={onEdit}
      />
      <Row
        label="한 행동"
        value={stepsText}
        step="action"
        onEdit={onEdit}
      />
      <Row
        label="결과"
        value={outcomeText}
        step="outcome"
        onEdit={onEdit}
      />
      <Row
        label="지금 상태"
        value={RECEIPT_STATUS_LABELS[draft.status]}
        step="status"
        onEdit={onEdit}
      />
      <Row
        label="잃은 것"
        value={draft.cost}
        step="cost"
        onEdit={onEdit}
      />
      <Row
        label="헛수고"
        value={draft.wasted}
        step="wasted"
        onEdit={onEdit}
      />
      <Row
        label="전환점"
        value={draft.turningPoint}
        step="turningPoint"
        onEdit={onEdit}
      />
      <Row
        label="먼저 확인할 것"
        value={draft.conditions.join(', ')}
        step="conditions"
        onEdit={onEdit}
      />
      <Row
        label="복구 도구"
        value={toolText}
        step="tool"
        onEdit={onEdit}
      />
      <Row
        label="SOS"
        value={draft.allowContact ? '받을게요' : '받지 않아요'}
        step="contact"
        onEdit={onEdit}
      />

      {error && (
        <InlineBanner
          variant="error"
          content={error}
        />
      )}

      <HStack justify="end">
        <Button
          size="m"
          variant="filled"
          semantic="primary"
          label="이렇게 남길게요 (검수 대기)"
          loading={busy}
          disabled={busy}
          onClick={onSubmit}
        />
      </HStack>
    </Bubble>
  )
}

export default SeniorInputPage
