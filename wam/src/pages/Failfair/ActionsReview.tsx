import { useState } from 'react'
import {
  Badge,
  Button,
  Checkbox,
  HStack,
  Text,
  TextInput,
  VStack,
} from '@channel.io/bezier-react/beta'
import {
  ACTION_TAGS,
  type ActionCandidate,
  type Category,
} from '@tutorial/shared'

import Section from '../../components/failfair/Section'

interface ActionsReviewPageProps {
  category: Category
  actions: ActionCandidate[]
  busy: boolean
  onCompare: (actions: ActionCandidate[]) => void
  onBack: () => void
}

function tagFor(category: Category, label: string): string | undefined {
  return ACTION_TAGS[category].find(
    (action) =>
      action.label === label ||
      action.keywords.some((keyword) => label.includes(keyword))
  )?.tag
}

/** v2 §3.1 4단계: 내가 말한 행동과 제안 행동을 구분해 2~3개 확인. */
function ActionsReviewPage({
  category,
  actions,
  busy,
  onCompare,
  onBack,
}: ActionsReviewPageProps) {
  const [list, setList] = useState<ActionCandidate[]>(actions)
  const [custom, setCustom] = useState('')
  const confirmed = list.filter((action) => action.confirmed)

  const toggle = (id: string) =>
    setList((current) =>
      current.map((action) =>
        action.id === id ? { ...action, confirmed: !action.confirmed } : action
      )
    )

  const add = () => {
    const label = custom.trim()
    if (!label) return
    setList((current) => [
      ...current,
      {
        id: `custom-${current.length + 1}`,
        label,
        actionTag: tagFor(category, label),
        origin: 'student',
        confirmed: true,
      },
    ])
    setCustom('')
  }

  return (
    <VStack spacing={16}>
      <Text
        as="p"
        typo="14"
        color="text-neutral-light"
      >
        비교할 행동을 골라 주세요. 최대 3개. 서로 배타적이지 않으니 함께 하거나
        순서를 정할 수도 있어요.
      </Text>

      {list.length === 0 && (
        <div className="ff-box ff-warn">
          <Text
            as="p"
            typo="13"
          >
            아직 정리된 행동 후보가 없어요. 아래 &lsquo;직접 추가&rsquo;에 지금
            고민 중인 선택지를 적으면 그대로 비교해 드려요.
          </Text>
        </div>
      )}

      <VStack spacing={8}>
        {list.map((action) => (
          <div
            key={action.id}
            className="ff-box"
          >
            <HStack
              spacing={8}
              align="center"
              justify="between"
            >
              <Checkbox
                checked={action.confirmed}
                onCheckedChange={() => toggle(action.id)}
              >
                {action.label}
              </Checkbox>
              <Badge
                size="xs"
                variant={action.origin === 'student' ? 'blue' : 'default'}
              >
                {action.origin === 'student' ? '내가 말한 행동' : '제안'}
              </Badge>
            </HStack>
            {!action.actionTag && (
              <Text
                as="p"
                typo="12"
                color="text-neutral-lighter"
              >
                아직 사례 태그와 연결되지 않은 행동이에요. 사례가 없을 수
                있어요.
              </Text>
            )}
          </div>
        ))}
      </VStack>

      <Section
        title="직접 추가"
        hint="내가 생각하는 다른 행동이 있으면 적어 주세요"
      >
        <HStack spacing={8}>
          <TextInput
            value={custom}
            placeholder="예: 팀원 재배정 요청"
            onChange={(event) => setCustom(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                event.preventDefault()
                add()
              }
            }}
          />
          <div style={{ flexShrink: 0 }}>
            <Button
              size="m"
              variant="outlined"
              semantic="secondary"
              label="추가"
              disabled={!custom.trim()}
              onClick={add}
            />
          </div>
        </HStack>
      </Section>

      {confirmed.length > 3 && (
        <Text
          as="p"
          typo="12"
          className="ff-critical"
        >
          한 번에 3개까지 비교할 수 있어요. {confirmed.length - 3}개를 빼
          주세요.
        </Text>
      )}
      {confirmed.length === 0 && list.length > 0 && (
        <Text
          as="p"
          typo="12"
          color="text-neutral-lighter"
        >
          비교할 행동을 하나 이상 골라 주세요.
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
          label="상황 다시 보기"
          disabled={busy}
          onClick={onBack}
        />
        <Button
          size="m"
          variant="filled"
          semantic="primary"
          label={`선배 사례 비교하기 (${confirmed.length})`}
          loading={busy}
          disabled={busy || confirmed.length === 0 || confirmed.length > 3}
          onClick={() => onCompare(confirmed)}
        />
      </HStack>
    </VStack>
  )
}

export default ActionsReviewPage
