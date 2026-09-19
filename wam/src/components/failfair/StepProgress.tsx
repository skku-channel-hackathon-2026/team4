import { Text } from '@channel.io/bezier-react/beta'

export const STUDENT_STEPS = [
  '카테고리',
  '고민 대화',
  '상황 확인',
  '행동 확인',
  '사례 비교',
] as const

interface StepProgressProps {
  /** 1부터 시작하는 현재 단계 */
  current: number
}

/**
 * 학생 흐름은 6단계라 지금 어디쯤인지 보이지 않으면 길을 잃는다.
 * 헤더 바로 아래에서 위치만 알려 주는 얇은 표시.
 */
function StepProgress({ current }: StepProgressProps) {
  const total = STUDENT_STEPS.length
  const clamped = Math.min(Math.max(current, 1), total)
  return (
    <div
      className="ff-steps"
      role="group"
      aria-label={`${total}단계 중 ${clamped}단계`}
    >
      <div className="ff-steps-bar">
        {STUDENT_STEPS.map((step, index) => (
          <span
            key={step}
            className={index < clamped ? 'ff-step ff-step-on' : 'ff-step'}
          />
        ))}
      </div>
      <Text
        as="span"
        typo="12"
        color="text-neutral-lighter"
      >
        {clamped}/{total} {STUDENT_STEPS[clamped - 1]}
      </Text>
    </div>
  )
}

export default StepProgress
