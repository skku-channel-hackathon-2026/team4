import { Button, HStack, Text, VStack } from '@channel.io/bezier-react/beta'
import {
  URGENCY_LABELS,
  type ActionResult,
  type Situation,
} from '@tutorial/shared'

import ActionCard from '../../components/failfair/ActionCard'

interface ComparePageProps {
  situation: Situation
  results: ActionResult[]
  notice: string
  helpfulIds: ReadonlySet<string>
  onOpenCase: (caseId: string, resultId: string) => void
  onHelpful: (resultId: string) => void
  onEditActions: () => void
  onEditSituation: () => void
  onRestart: () => void
}

/** v2 §3.1 5단계: 행동별 사례 비교. 세로 카드 배치. */
function ComparePage({
  situation,
  results,
  notice,
  helpfulIds,
  onOpenCase,
  onHelpful,
  onEditActions,
  onEditSituation,
  onRestart,
}: ComparePageProps) {
  const unknowns = Array.from(
    new Set(results.flatMap((result) => result.unknowns))
  )
  return (
    <VStack spacing={16}>
      <div className="ff-box">
        <VStack spacing={6}>
          <Text
            as="p"
            typo="13"
            bold
            color="text-neutral-light"
          >
            확인된 현재 상황
          </Text>
          <Text
            as="p"
            typo="14"
          >
            {situation.situation}
          </Text>
          <Text
            as="p"
            typo="13"
            color="text-neutral-light"
          >
            마감: {situation.deadline.raw || '미확인'} ·{' '}
            {URGENCY_LABELS[situation.deadline.urgency]}
            {situation.goal ? ` · 목표: ${situation.goal}` : ''}
          </Text>
          {unknowns.length > 0 && (
            <Text
              as="p"
              typo="12"
              color="text-neutral-lighter"
            >
              아직 모르는 정보: {unknowns.join(', ')}
            </Text>
          )}
        </VStack>
      </div>

      <Text
        as="p"
        typo="12"
        color="text-neutral-lighter"
      >
        {notice}
      </Text>

      {results.map((result) => (
        <ActionCard
          key={result.id}
          result={result}
          helpful={helpfulIds.has(result.id)}
          onOpenCase={onOpenCase}
          onHelpful={onHelpful}
        />
      ))}

      <HStack
        spacing={8}
        wrap
      >
        <Button
          size="s"
          variant="outlined"
          semantic="secondary"
          label="다른 행동을 생각했어요"
          onClick={onEditActions}
        />
        <Button
          size="s"
          variant="ghost"
          semantic="secondary"
          label="상황이 바뀌었어요"
          onClick={onEditSituation}
        />
        <Button
          size="s"
          variant="ghost"
          semantic="secondary"
          label="처음부터"
          onClick={onRestart}
        />
      </HStack>
    </VStack>
  )
}

export default ComparePage
