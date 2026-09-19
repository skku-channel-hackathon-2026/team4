import { useState } from 'react'
import {
  Button,
  Checkbox,
  HStack,
  Text,
  TextArea,
  TextInput,
  VStack,
} from '@channel.io/bezier-react/beta'
import { InlineBanner } from '@channel.io/app-sdk-wam-ui'
import {
  ACTION_TAGS,
  CaseSubmissionSchema,
  CATEGORIES,
  PROBLEM_TYPES,
  RECEIPT_STATUS_LABELS,
  ReceiptStatusSchema,
  URGENCY_LABELS,
  UrgencySchema,
  type CaseSubmission,
  type Category,
  type Urgency,
} from '@tutorial/shared'

import Chip from '../../components/failfair/Chip'
import Section from '../../components/failfair/Section'
import { errorMessage } from '../../hooks/useFailfairApi'

interface SeniorInputPageProps {
  onSubmit: (input: CaseSubmission) => Promise<void>
  onOpenReview: () => void
}

type ReceiptStatus = CaseSubmission['receipt']['status']
type StepDraft = { actionTag: string; description: string }

const split = (value: string) =>
  value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean)

/**
 * 선배 입력 (v2 §4.2 사례 데이터 준비). 등록 직후에는 draft이며 검수 후 노출된다.
 * 실명·타인 특정 정보는 넣지 않도록 안내한다.
 */
function SeniorInputPage({ onSubmit, onOpenReview }: SeniorInputPageProps) {
  const [category, setCategory] = useState<Category>('team_project')
  const [title, setTitle] = useState('')
  const [problemType, setProblemType] = useState('')
  const [situation, setSituation] = useState('')
  const [constraints, setConstraints] = useState('')
  const [urgency, setUrgency] = useState<Urgency>('unknown')
  const [goal, setGoal] = useState('')
  const [steps, setSteps] = useState<StepDraft[]>([
    { actionTag: '', description: '' },
  ])
  const [shortTerm, setShortTerm] = useState('')
  const [followUp, setFollowUp] = useState('')
  const [unresolved, setUnresolved] = useState('')
  const [firstAction, setFirstAction] = useState('')
  const [wasted, setWasted] = useState('')
  const [turningPoint, setTurningPoint] = useState('')
  const [cost, setCost] = useState('')
  const [status, setStatus] = useState<ReceiptStatus>('partial')
  const [conditions, setConditions] = useState('')
  const [tags, setTags] = useState('')
  const [toolTitle, setToolTitle] = useState('')
  const [toolBody, setToolBody] = useState('')
  const [toolNote, setToolNote] = useState('')
  const [allowContact, setAllowContact] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const updateStep = (index: number, patch: Partial<StepDraft>) =>
    setSteps((current) =>
      current.map((step, i) => (i === index ? { ...step, ...patch } : step))
    )

  const submit = async () => {
    setError(null)
    const candidate = {
      category,
      title: title.trim(),
      problemType: problemType.trim(),
      situation: situation.trim(),
      constraints: split(constraints),
      urgency,
      goal: goal.trim(),
      actionSteps: steps
        .filter((step) => step.actionTag && step.description.trim())
        .map((step, index) => ({
          order: index + 1,
          actionTag: step.actionTag,
          description: step.description.trim(),
        })),
      outcome: {
        shortTerm: shortTerm.trim(),
        followUp: followUp.trim(),
        unresolved: unresolved.trim(),
      },
      receipt: {
        firstAction: firstAction.trim(),
        wasted: wasted.trim(),
        turningPoint: turningPoint.trim(),
        cost: cost.trim(),
        status,
      },
      conditions: split(conditions),
      tags: split(tags),
      tool:
        toolTitle.trim() && toolBody.trim()
          ? {
              title: toolTitle.trim(),
              body: toolBody.trim(),
              usageNote: toolNote.trim(),
            }
          : undefined,
      allowContact,
    }
    const parsed = CaseSubmissionSchema.safeParse(candidate)
    if (!parsed.success) {
      const issue = parsed.error.issues[0]
      setError(`빈칸을 확인해 주세요: ${issue?.path.join('.') || '입력값'}`)
      return
    }
    setBusy(true)
    try {
      await onSubmit(parsed.data)
      setDone(true)
    } catch (cause) {
      setError(
        errorMessage(cause, '등록하지 못했어요. 잠시 후 다시 시도해 주세요.')
      )
    } finally {
      setBusy(false)
    }
  }

  if (done) {
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
            onClick={() => window.location.reload()}
          />
        </HStack>
      </VStack>
    )
  }

  const tagOptions = ACTION_TAGS[category]
  const problemOptions = PROBLEM_TYPES[category]

  return (
    <VStack spacing={20}>
      <Text
        as="p"
        typo="13"
        color="text-neutral-light"
      >
        실명, 학번, 특정 교수님·상대 이름은 빼 주세요. 성공담이 아니어도, 아직
        해결 중이어도 좋아요. 등록 후 검수를 거쳐 노출돼요.
      </Text>

      <Section title="카테고리">
        <HStack
          spacing={6}
          wrap
        >
          {CATEGORIES.map((item) => (
            <Chip
              key={item.id}
              label={item.name}
              active={category === item.id}
              onClick={() => {
                setCategory(item.id)
                setProblemType('')
                setSteps([{ actionTag: '', description: '' }])
              }}
            />
          ))}
        </HStack>
      </Section>

      <Section title="사례 제목">
        <TextInput
          value={title}
          placeholder="예: 밤새 슬라이드를 혼자 완성한 선배"
          onChange={(event) => setTitle(event.target.value)}
        />
      </Section>

      <Section
        title="문제 유형"
        hint="가장 가까운 것 하나"
      >
        <HStack
          spacing={6}
          wrap
        >
          {problemOptions.map((problem) => (
            <Chip
              key={problem.type}
              label={problem.label}
              active={problemType === problem.type}
              onClick={() => setProblemType(problem.type)}
            />
          ))}
        </HStack>
      </Section>

      <Section title="당시 상황">
        <VStack spacing={8}>
          <TextArea
            value={situation}
            placeholder="무슨 일이 있었는지 2~3문장"
            minRows={3}
            onChange={(event) => setSituation(event.target.value)}
          />
          <TextInput
            value={constraints}
            placeholder="제약, 쉼표로 구분 (예: 발표까지 8시간, 남은 팀원 소극적)"
            onChange={(event) => setConstraints(event.target.value)}
          />
          <HStack
            spacing={6}
            wrap
          >
            {UrgencySchema.options.map((option) => (
              <Chip
                key={option}
                label={URGENCY_LABELS[option]}
                active={urgency === option}
                onClick={() => setUrgency(option)}
              />
            ))}
          </HStack>
          <TextInput
            value={goal}
            placeholder="그때 원했던 결과"
            onChange={(event) => setGoal(event.target.value)}
          />
        </VStack>
      </Section>

      <Section
        title="실제로 한 행동, 순서대로"
        hint="행동 태그를 고르고 무엇을 했는지 적어 주세요. 이 태그로 새내기의 행동과 연결돼요"
      >
        <VStack spacing={10}>
          {steps.map((step, index) => (
            <div
              key={index}
              className="ff-box"
            >
              <VStack spacing={8}>
                <HStack
                  spacing={6}
                  wrap
                >
                  {tagOptions.map((option) => (
                    <Chip
                      key={option.tag}
                      label={option.label}
                      active={step.actionTag === option.tag}
                      onClick={() =>
                        updateStep(index, { actionTag: option.tag })
                      }
                    />
                  ))}
                </HStack>
                <TextInput
                  value={step.description}
                  placeholder={`${index + 1}번째로 한 일`}
                  onChange={(event) =>
                    updateStep(index, { description: event.target.value })
                  }
                />
              </VStack>
            </div>
          ))}
          {steps.length < 3 && (
            <Button
              size="s"
              variant="outlined"
              semantic="secondary"
              label="행동 추가"
              onClick={() =>
                setSteps((current) => [
                  ...current,
                  { actionTag: '', description: '' },
                ])
              }
            />
          )}
        </VStack>
      </Section>

      <Section title="관찰된 결과">
        <VStack spacing={8}>
          <TextInput
            value={shortTerm}
            placeholder="바로 일어난 일"
            onChange={(event) => setShortTerm(event.target.value)}
          />
          <TextInput
            value={followUp}
            placeholder="그 뒤에 일어난 일 (선택)"
            onChange={(event) => setFollowUp(event.target.value)}
          />
          <TextInput
            value={unresolved}
            placeholder="아직 해결 안 된 것 (선택)"
            onChange={(event) => setUnresolved(event.target.value)}
          />
        </VStack>
      </Section>

      <Section title="복구 영수증">
        <VStack spacing={8}>
          <TextInput
            value={firstAction}
            placeholder="첫 행동: 실패 직후 실제로 한 일"
            onChange={(event) => setFirstAction(event.target.value)}
          />
          <TextInput
            value={wasted}
            placeholder="헛수고: 해봤지만 도움이 안 된 일 (선택)"
            onChange={(event) => setWasted(event.target.value)}
          />
          <TextInput
            value={turningPoint}
            placeholder="전환점: 상황이 달라지기 시작한 행동 (선택)"
            onChange={(event) => setTurningPoint(event.target.value)}
          />
          <TextInput
            value={cost}
            placeholder="회복 비용: 걸린 시간, 돈, 포기한 것"
            onChange={(event) => setCost(event.target.value)}
          />
          <HStack
            spacing={6}
            wrap
          >
            {ReceiptStatusSchema.options.map((option) => (
              <Chip
                key={option}
                label={RECEIPT_STATUS_LABELS[option]}
                active={status === option}
                onClick={() => setStatus(option)}
              />
            ))}
          </HStack>
        </VStack>
      </Section>

      <Section
        title="같은 행동을 쓰기 전에 확인할 조건"
        hint="쉼표로 구분"
      >
        <TextInput
          value={conditions}
          placeholder="예: 교수님이 메일에 답하는 분인지"
          onChange={(event) => setConditions(event.target.value)}
        />
      </Section>

      <Section
        title="검색 키워드"
        hint="새내기가 쓸 법한 단어, 쉼표로 구분"
      >
        <TextInput
          value={tags}
          placeholder="예: 잠수, 팀원, 발표"
          onChange={(event) => setTags(event.target.value)}
        />
      </Section>

      <Section title="복구 도구 (선택)">
        <VStack spacing={8}>
          <TextInput
            value={toolTitle}
            placeholder="도구 이름 (예: 교수님께 보내는 메일 틀)"
            onChange={(event) => setToolTitle(event.target.value)}
          />
          <TextArea
            value={toolBody}
            placeholder="그대로 복사해 쓸 수 있는 텍스트. 개인정보는 ○○로"
            minRows={6}
            onChange={(event) => setToolBody(event.target.value)}
          />
          <TextInput
            value={toolNote}
            placeholder="언제 쓰는 도구인지 한 줄 (선택)"
            onChange={(event) => setToolNote(event.target.value)}
          />
        </VStack>
      </Section>

      <Checkbox
        checked={allowContact}
        onCheckedChange={(checked) => setAllowContact(checked === true)}
      >
        나중에 새내기 질문을 비동기로 받아도 괜찮아요 (연락처는 저장하지 않아요)
      </Checkbox>

      {error && (
        <InlineBanner
          variant="error"
          content={error}
        />
      )}

      <Button
        size="m"
        variant="filled"
        semantic="primary"
        label="사례 등록 (검수 대기)"
        loading={busy}
        disabled={busy}
        onClick={() => void submit()}
      />
    </VStack>
  )
}

export default SeniorInputPage
