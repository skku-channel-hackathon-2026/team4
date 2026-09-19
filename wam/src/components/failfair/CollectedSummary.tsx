import { Button, HStack, Text, VStack } from '@channel.io/bezier-react/beta'
import type { Situation } from '@tutorial/shared'

interface CollectedSummaryProps {
  situation: Situation
  busy: boolean
  /** 남은 질문을 건너뛰고 상황 확인으로 넘어간다. */
  onSkipRemaining: () => void
}

interface Slot {
  label: string
  value: string
}

/**
 * 대화 중 "지금까지 뭘 모았는지"를 늘 보여 준다.
 * 대화 기록만 있으면 앞서 답한 내용이 위로 밀려 사라져서,
 * 끝이 없는 상담처럼 느껴지고 같은 걸 또 말하게 된다.
 *
 * 값은 서버가 내려 준 `situation`만 쓴다. 질문 순서 규칙을 프런트에서
 * 흉내 내지 않기 위해서다 (v2 §11.1 C 소유 범위).
 */
function CollectedSummary({
  situation,
  busy,
  onSkipRemaining,
}: CollectedSummaryProps) {
  const slots: Slot[] = [
    { label: '마감', value: situation.deadline.raw },
    { label: '진행', value: situation.progress },
    { label: '원하는 결과', value: situation.goal },
    { label: '고려 행동', value: situation.consideredActions.join(', ') },
  ]
  const filled = slots.filter((slot) => slot.value).length

  return (
    <div className="ff-box ff-collected">
      <VStack spacing={8}>
        <HStack
          spacing={8}
          align="center"
          justify="between"
        >
          <Text
            as="span"
            typo="12"
            bold
            color="text-neutral-light"
          >
            지금까지 모은 것 {filled}/{slots.length}
          </Text>
          <Button
            size="xs"
            variant="outlined"
            semantic="secondary"
            label="지금 정보로 진행"
            disabled={busy}
            onClick={onSkipRemaining}
          />
        </HStack>

        <div className="ff-slots">
          {slots.map((slot) => (
            <span
              key={slot.label}
              className={slot.value ? 'ff-slot ff-slot-on' : 'ff-slot'}
            >
              <Text
                as="span"
                typo="12"
              >
                {slot.label}
                {slot.value ? `: ${slot.value}` : ' · 아직'}
              </Text>
            </span>
          ))}
        </div>
      </VStack>
    </div>
  )
}

export default CollectedSummary
