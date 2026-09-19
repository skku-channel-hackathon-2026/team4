import { useState } from 'react'
import {
  Button,
  HStack,
  Text,
  TextArea,
  TextInput,
  VStack,
} from '@channel.io/bezier-react/beta'
import {
  URGENCY_LABELS,
  UrgencySchema,
  type Situation,
  type Urgency,
} from '@tutorial/shared'

import Chip from '../../components/failfair/Chip'
import Section from '../../components/failfair/Section'

interface SituationReviewPageProps {
  situation: Situation
  busy: boolean
  onConfirm: (situation: Situation) => void
  onBack: () => void
}

const join = (values: string[]) => values.join(', ')
const split = (value: string) =>
  value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean)

/** v2 §3.1 3단계: "제가 이해한 상황이 맞나요?" 수정 가능한 요약. */
function SituationReviewPage({
  situation,
  busy,
  onConfirm,
  onBack,
}: SituationReviewPageProps) {
  const [text, setText] = useState(situation.situation)
  const [deadlineRaw, setDeadlineRaw] = useState(situation.deadline.raw)
  const [urgency, setUrgency] = useState<Urgency>(situation.deadline.urgency)
  const [progress, setProgress] = useState(situation.progress)
  const [goal, setGoal] = useState(situation.goal)
  const [constraints, setConstraints] = useState(join(situation.constraints))
  const [attempted, setAttempted] = useState(join(situation.attemptedActions))
  const [considered, setConsidered] = useState(
    join(situation.consideredActions)
  )

  const confirm = () =>
    onConfirm({
      category: situation.category,
      problemType: situation.problemType,
      situation: text.trim(),
      goal: goal.trim(),
      deadline: { raw: deadlineRaw.trim(), urgency },
      progress: progress.trim(),
      constraints: split(constraints),
      attemptedActions: split(attempted),
      consideredActions: split(considered),
      unknowns: situation.unknowns,
    })

  return (
    <VStack spacing={16}>
      <Text
        as="p"
        typo="14"
        color="text-neutral-light"
      >
        제가 이해한 상황이에요. 틀린 곳은 고쳐 주세요. 모르는 건 비워 둬도 돼요.
      </Text>

      <Section title="상황">
        <TextArea
          value={text}
          minRows={3}
          onChange={(event) => setText(event.target.value)}
        />
      </Section>

      <Section title="마감 · 남은 시간">
        <VStack spacing={8}>
          <TextInput
            value={deadlineRaw}
            placeholder="예: 8시간 남음, 다음 주 월요일"
            onChange={(event) => setDeadlineRaw(event.target.value)}
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
        </VStack>
      </Section>

      <Section title="진행 상황">
        <TextInput
          value={progress}
          placeholder="끝난 것과 남은 것"
          onChange={(event) => setProgress(event.target.value)}
        />
      </Section>

      <Section title="원하는 결과">
        <TextInput
          value={goal}
          placeholder="예: 기한 내 발표 가능한 결과물"
          onChange={(event) => setGoal(event.target.value)}
        />
      </Section>

      <Section
        title="제약"
        hint="쉼표로 구분"
      >
        <TextInput
          value={constraints}
          placeholder="예: 남은 팀원들이 소극적임"
          onChange={(event) => setConstraints(event.target.value)}
        />
      </Section>

      <Section
        title="이미 해본 것"
        hint="쉼표로 구분"
      >
        <TextInput
          value={attempted}
          placeholder="예: 개인 메시지 보냄"
          onChange={(event) => setAttempted(event.target.value)}
        />
      </Section>

      <Section
        title="고려 중인 행동"
        hint="쉼표로 구분. 다음 단계에서 후보로 씁니다"
      >
        <TextInput
          value={considered}
          placeholder="예: 혼자 마무리, 교수님께 상황 전달"
          onChange={(event) => setConsidered(event.target.value)}
        />
      </Section>

      {situation.unknowns.length > 0 && (
        <Text
          as="p"
          typo="12"
          color="text-neutral-lighter"
        >
          아직 모르는 것: {situation.unknowns.join(', ')}
        </Text>
      )}

      <HStack
        spacing={8}
        justify="between"
      >
        <Button
          size="m"
          variant="ghost"
          semantic="secondary"
          label="더 말할게요"
          disabled={busy}
          onClick={onBack}
        />
        <Button
          size="m"
          variant="filled"
          semantic="primary"
          label="이대로 맞아요"
          loading={busy}
          disabled={busy || !text.trim()}
          onClick={confirm}
        />
      </HStack>
    </VStack>
  )
}

export default SituationReviewPage
