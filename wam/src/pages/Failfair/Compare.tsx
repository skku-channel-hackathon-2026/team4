import { EmptyState } from '@channel.io/app-sdk-wam-ui'
import { FolderOffIcon } from '@channel.io/bezier-icons'
import { Button, HStack, Text, VStack } from '@channel.io/bezier-react/beta'
import {
  URGENCY_LABELS,
  majorLabel,
  type ActionResult,
  type Situation,
} from '@tutorial/shared'

import ActionCard from '../../components/failfair/ActionCard'
import CompareSkeleton from '../../components/failfair/CompareSkeleton'

interface ComparePageProps {
  situation: Situation
  results: ActionResult[]
  notice: string
  /** 검색 중이면 스켈레톤을 보여 준다. */
  busy: boolean
  comparingCount: number
  /** 검색이 실패해 결과가 비어 있는 경우. 오류 안내는 배너가 맡는다. */
  failed: boolean
  helpfulIds: ReadonlySet<string>
  onOpenCase: (caseId: string, resultId: string) => void
  onHelpful: (resultId: string) => void
  onEditActions: () => void
  onEditSituation: () => void
  onRestart: () => void
}

/** 근거가 있는 카드를 위로 올린다. 사례 없음은 맨 아래. */
const ORDER: Record<ActionResult['status'], number> = {
  matched: 0,
  reference: 1,
  no_case: 2,
}

/** v2 §3.1 5단계: 행동별 사례 비교. 세로 카드 배치. */
function ComparePage({
  situation,
  results,
  notice,
  busy,
  comparingCount,
  failed,
  helpfulIds,
  onOpenCase,
  onHelpful,
  onEditActions,
  onEditSituation,
  onRestart,
}: ComparePageProps) {
  if (busy && results.length === 0) {
    return <CompareSkeleton count={comparingCount} />
  }

  const sorted = [...results].sort((a, b) => ORDER[a.status] - ORDER[b.status])
  const unknowns = Array.from(
    new Set(results.flatMap((result) => result.unknowns))
  )
  const withCase = results.filter((result) => result.status !== 'no_case')
  const hasDemo = results.some((result) => result.sourceType === 'demo')

  const edit = (
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
  )

  // 검색이 실패했을 때는 배너가 이미 이유와 재시도를 보여 준다. 여기서는 길만 열어 둔다.
  if (results.length === 0) {
    return (
      <VStack spacing={16}>
        <EmptyState
          icon={FolderOffIcon}
          title={failed ? '결과를 가져오지 못했어요' : '비교할 결과가 없어요'}
          description={
            failed
              ? '위 안내에서 다시 시도하거나, 행동을 고쳐서 한 번 더 찾아볼 수 있어요.'
              : '고른 행동으로는 결과를 만들지 못했어요. 행동을 바꾸거나 상황을 조금 더 적어 주세요.'
          }
        />
        {edit}
      </VStack>
    )
  }

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
            {situation.major ? ` · ${majorLabel(situation.major)}` : ''}
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

      {withCase.length === 0 && (
        <div className="ff-box ff-warn">
          <VStack spacing={4}>
            <Text
              as="p"
              typo="14"
              bold
            >
              고른 행동 모두 연결할 사례가 아직 없어요
            </Text>
            <Text
              as="p"
              typo="13"
              color="text-neutral-light"
            >
              사례 수를 맞추려고 없는 이야기를 만들지는 않아요. 행동을 조금
              다르게 적거나 상황을 더 채우면 찾을 가능성이 높아져요.
            </Text>
          </VStack>
        </div>
      )}

      {hasDemo && (
        <Text
          as="p"
          typo="12"
          color="text-neutral-lighter"
        >
          보라색 &lsquo;가상 시연&rsquo; 배지가 붙은 카드는 실제 선배 기록이
          아니라 시연용으로 만든 예시예요.
        </Text>
      )}

      {notice && (
        <Text
          as="p"
          typo="12"
          color="text-neutral-lighter"
        >
          {notice}
        </Text>
      )}

      {sorted.map((result) => (
        <ActionCard
          key={result.id}
          result={result}
          helpful={helpfulIds.has(result.id)}
          onOpenCase={onOpenCase}
          onHelpful={onHelpful}
        />
      ))}

      {edit}
    </VStack>
  )
}

export default ComparePage
