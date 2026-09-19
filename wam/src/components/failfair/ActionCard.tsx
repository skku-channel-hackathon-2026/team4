import {
  Badge,
  Button,
  HStack,
  Text,
  VStack,
} from '@channel.io/bezier-react/beta'
import type { ActionResult } from '@tutorial/shared'

interface ActionCardProps {
  result: ActionResult
  onOpenCase: (caseId: string, resultId: string) => void
  onHelpful: (resultId: string) => void
  helpful: boolean
}

function List({ items }: { items: string[] }) {
  if (items.length === 0) return null
  return (
    <ul className="ff-list">
      {items.map((item) => (
        <li key={item}>
          <Text
            as="span"
            typo="13"
          >
            {item}
          </Text>
        </li>
      ))}
    </ul>
  )
}

function Row({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <VStack spacing={2}>
      <Text
        as="span"
        typo="12"
        bold
        color="text-neutral-light"
      >
        {label}
      </Text>
      {children}
    </VStack>
  )
}

/** v2 §6.2 행동 카드. 결과·비용은 저장된 사례 필드 그대로 표시한다. */
function ActionCard({
  result,
  onOpenCase,
  onHelpful,
  helpful,
}: ActionCardProps) {
  const { action } = result
  return (
    <div className="ff-box">
      <VStack spacing={10}>
        <HStack
          spacing={6}
          wrap
          align="center"
        >
          <Badge
            size="xs"
            variant={action.origin === 'student' ? 'blue' : 'default'}
          >
            {action.origin === 'student' ? '내가 말한 행동' : '제안'}
          </Badge>
          {result.status === 'matched' && (
            <Badge
              size="xs"
              variant="green"
            >
              사례 연결됨
            </Badge>
          )}
          {result.status === 'reference' && (
            <Badge
              size="xs"
              variant="yellow"
            >
              참고 사례
            </Badge>
          )}
          {result.status === 'no_case' && (
            <Badge
              size="xs"
              variant="default"
            >
              연결할 사례 없음
            </Badge>
          )}
          {result.sourceType === 'demo' && (
            <Badge
              size="xs"
              variant="purple"
            >
              가상 시연
            </Badge>
          )}
        </HStack>

        <Text
          as="h3"
          typo="16"
          bold
        >
          {action.label}
        </Text>

        {result.status === 'no_case' ? (
          <Text
            as="p"
            typo="13"
            color="text-neutral-light"
          >
            연결할 사례가 아직 없습니다.{' '}
            {result.differences[0] ?? '선배 사례가 등록되면 여기에 보여요.'}
          </Text>
        ) : (
          <>
            <Row label="근거 사례">
              <Text
                as="p"
                typo="14"
              >
                {result.caseTitle}
              </Text>
            </Row>
            {result.similarities.length > 0 && (
              <Row label="유사점">
                <List items={result.similarities} />
              </Row>
            )}
            {(result.differences.length > 0 || result.unknowns.length > 0) && (
              <Row label="차이·미확인">
                <List
                  items={[
                    ...result.differences,
                    ...result.unknowns.map((item) => `미확인: ${item}`),
                  ]}
                />
              </Row>
            )}
            <Row label="선배의 실제 행동">
              <List items={result.seniorActions} />
            </Row>
            {result.outcome && (
              <Row label="관찰된 결과">
                <List
                  items={[
                    result.outcome.shortTerm,
                    result.outcome.followUp &&
                      `이후: ${result.outcome.followUp}`,
                    result.outcome.unresolved &&
                      `미해결: ${result.outcome.unresolved}`,
                  ].filter((item): item is string => Boolean(item))}
                />
              </Row>
            )}
            {result.cost && (
              <Row label="비용과 부담">
                <Text
                  as="p"
                  typo="13"
                >
                  {result.cost}
                </Text>
              </Row>
            )}
            {result.conditions.length > 0 && (
              <Row label="적용 조건">
                <List items={result.conditions} />
              </Row>
            )}
            <HStack
              spacing={8}
              wrap
            >
              {result.caseId && (
                <Button
                  size="s"
                  variant="filled"
                  semantic="primary"
                  label={
                    result.toolTitle
                      ? `사례 상세 · ${result.toolTitle}`
                      : '사례 상세'
                  }
                  onClick={() => onOpenCase(result.caseId!, result.id)}
                />
              )}
              <Button
                size="s"
                variant={helpful ? 'filled' : 'outlined'}
                semantic="secondary"
                label={helpful ? '도움 됨 ✓' : '도움 됨'}
                onClick={() => onHelpful(result.id)}
              />
            </HStack>
          </>
        )}
      </VStack>
    </div>
  )
}

export default ActionCard
