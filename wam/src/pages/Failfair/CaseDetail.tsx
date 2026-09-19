import { Badge, HStack, Text, VStack } from '@channel.io/bezier-react/beta'
import {
  CATEGORIES,
  RECEIPT_STATUS_LABELS,
  URGENCY_LABELS,
  type Case,
} from '@tutorial/shared'

import CopyButton from '../../components/failfair/CopyButton'
import Section from '../../components/failfair/Section'

interface CaseDetailPageProps {
  item: Case
  onToolCopied?: () => void
}

function Row({ label, value }: { label: string; value: string }) {
  if (!value) return null
  return (
    <>
      <Text
        as="span"
        typo="13"
        color="text-neutral-light"
      >
        {label}
      </Text>
      <Text
        as="span"
        typo="13"
      >
        {value}
      </Text>
    </>
  )
}

/** v2 §3.1 6단계: 실제 행동 순서, 복구 영수증, 적용 조건, 복구 도구. */
function CaseDetailPage({ item, onToolCopied }: CaseDetailPageProps) {
  const categoryName =
    CATEGORIES.find((category) => category.id === item.category)?.name ??
    item.category
  return (
    <VStack spacing={20}>
      <VStack spacing={8}>
        <HStack
          spacing={6}
          wrap
        >
          <Badge
            size="xs"
            variant="default"
          >
            {categoryName}
          </Badge>
          <Badge
            size="xs"
            variant={item.sourceType === 'demo' ? 'purple' : 'green'}
          >
            {item.sourceType === 'demo' ? '가상 시연 사례' : '실제 경험'}
          </Badge>
          <Badge
            size="xs"
            variant="default"
          >
            {RECEIPT_STATUS_LABELS[item.receipt.status]}
          </Badge>
        </HStack>
        <Text
          as="h2"
          typo="18"
          bold
        >
          {item.title}
        </Text>
      </VStack>

      <Section title="당시 상황">
        <div className="ff-box">
          <VStack spacing={6}>
            <Text
              as="p"
              typo="14"
            >
              {item.situation}
            </Text>
            <Text
              as="p"
              typo="13"
              color="text-neutral-light"
            >
              {[
                ...item.constraints,
                URGENCY_LABELS[item.urgency],
                item.goal && `목표: ${item.goal}`,
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </VStack>
        </div>
      </Section>

      <Section title="실제 행동 순서">
        <ol className="ff-list">
          {[...item.actionSteps]
            .sort((a, b) => a.order - b.order)
            .map((step) => (
              <li key={`${step.order}-${step.actionTag}`}>
                <Text
                  as="span"
                  typo="14"
                >
                  {step.description}
                </Text>
              </li>
            ))}
        </ol>
      </Section>

      <Section title="관찰된 결과">
        <VStack spacing={4}>
          <Text
            as="p"
            typo="14"
          >
            {item.outcome.shortTerm}
          </Text>
          {item.outcome.followUp && (
            <Text
              as="p"
              typo="13"
              color="text-neutral-light"
            >
              이후: {item.outcome.followUp}
            </Text>
          )}
          {item.outcome.unresolved && (
            <Text
              as="p"
              typo="13"
              color="text-neutral-light"
            >
              미해결: {item.outcome.unresolved}
            </Text>
          )}
        </VStack>
      </Section>

      <Section title="복구 영수증">
        <div className="ff-box">
          <div className="ff-grid">
            <Row
              label="첫 행동"
              value={item.receipt.firstAction}
            />
            <Row
              label="헛수고"
              value={item.receipt.wasted}
            />
            <Row
              label="전환점"
              value={item.receipt.turningPoint}
            />
            <Row
              label="회복 비용"
              value={item.receipt.cost}
            />
            <Row
              label="현재 상태"
              value={RECEIPT_STATUS_LABELS[item.receipt.status]}
            />
          </div>
        </div>
      </Section>

      {item.conditions.length > 0 && (
        <Section title="같은 행동을 고려하기 전에 확인할 것">
          <ul className="ff-list">
            {item.conditions.map((condition) => (
              <li key={condition}>
                <Text
                  as="span"
                  typo="14"
                >
                  {condition}
                </Text>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {item.tool && (
        <Section
          title="복구 도구"
          hint={item.tool.usageNote || undefined}
        >
          <div className="ff-box">
            <VStack spacing={8}>
              <Text
                as="p"
                typo="14"
                bold
              >
                {item.tool.title}
              </Text>
              <Text
                as="pre"
                typo="13"
                className="ff-pre"
              >
                {item.tool.body}
              </Text>
              <HStack>
                <CopyButton
                  text={item.tool.body}
                  onCopied={onToolCopied}
                />
              </HStack>
            </VStack>
          </div>
        </Section>
      )}
    </VStack>
  )
}

export default CaseDetailPage
