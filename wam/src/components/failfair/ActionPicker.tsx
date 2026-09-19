import { useState } from 'react'
import {
  Button,
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

import Bubble from './Bubble'
import Chip from './Chip'

interface ActionPickerProps {
  category: Category
  actions: ActionCandidate[]
  busy: boolean
  /** 이미 비교 결과를 본 뒤 다시 고르는 중이면 문구를 바꾼다. */
  revisiting: boolean
  onCompare: (actions: ActionCandidate[]) => void
}

const MAX_PICK = 3

function tagFor(category: Category, label: string): string | undefined {
  return ACTION_TAGS[category].find((action) => action.label === label)?.tag
}

/**
 * v2 §3.1 4단계 행동 확인을 대화 안에서 끝낸다.
 * 내가 말한 행동과 제안을 칩으로 보여 주고, 켜진 것만 비교한다.
 */
function ActionPicker({
  category,
  actions,
  busy,
  revisiting,
  onCompare,
}: ActionPickerProps) {
  const [list, setList] = useState<ActionCandidate[]>(actions)
  const [adding, setAdding] = useState(false)
  const [custom, setCustom] = useState('')
  const [unsupportedConfirmed, setUnsupportedConfirmed] = useState<Set<string>>(
    new Set()
  )
  const confirmed = list.filter((action) => action.confirmed)
  const needsMeaning = confirmed.some(
    (action) => !action.actionTag && !unsupportedConfirmed.has(action.id)
  )
  const mine = list.filter((action) => action.origin === 'student')
  const suggested = list.filter((action) => action.origin !== 'student')

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
    setAdding(false)
  }

  const intro = revisiting
    ? '다른 행동으로 다시 비교해 볼까요? 켜진 것만 비교해요.'
    : list.length === 0
      ? '아직 고민 중인 행동을 못 들었어요. 지금 생각하는 선택지를 적어 주면 그대로 비교해 드릴게요.'
      : mine.length > 0
        ? '말씀하신 행동은 이 정도로 정리됐어요. 함께 비교해 볼 만한 것도 몇 개 골라 봤어요. 켜진 것만 비교해요, 최대 셋까지요.'
        : '아직 정하신 게 없어서, 이 상황에서 선배들이 흔히 택한 행동을 골라 봤어요. 켜진 것만 비교해요, 최대 셋까지요.'

  const chips = (items: ActionCandidate[]) => (
    <div className="ff-chips">
      {items.map((action) => (
        <Chip
          key={action.id}
          label={action.confirmed ? `✓ ${action.label}` : action.label}
          active={action.confirmed}
          disabled={busy}
          onClick={() => toggle(action.id)}
        />
      ))}
    </div>
  )

  return (
    <Bubble
      role="assistant"
      content={intro}
    >
      {mine.length > 0 && (
        <VStack spacing={4}>
          <Text
            as="span"
            typo="12"
            color="text-neutral-light"
          >
            내가 말한 행동
          </Text>
          {chips(mine)}
        </VStack>
      )}
      {suggested.length > 0 && (
        <VStack spacing={4}>
          <Text
            as="span"
            typo="12"
            color="text-neutral-light"
          >
            {mine.length > 0 ? '이런 것도 있어요' : '선배들이 택한 행동'}
          </Text>
          {chips(suggested)}
        </VStack>
      )}

      {confirmed
        .filter((action) => !action.actionTag)
        .map((action) => (
          <div
            key={action.id}
            className="ff-box"
          >
            <Text
              as="p"
              typo="13"
            >
              {action.label}
            </Text>
            <VStack spacing={6}>
              <Text
                as="p"
                typo="12"
                color="text-neutral-lighter"
              >
                이 행동은 어떤 의미인가요? 한 번 확인한 뒤 사례를 찾을게요.
              </Text>
              <select
                aria-label={`${action.label} 행동 의미`}
                value=""
                onChange={(event) => {
                  const tag = event.target.value
                  if (tag)
                    setList((current) =>
                      current.map((a) =>
                        a.id === action.id ? { ...a, actionTag: tag } : a
                      )
                    )
                }}
              >
                <option value="">의미 선택</option>
                {ACTION_TAGS[category].map((tag) => (
                  <option
                    key={tag.tag}
                    value={tag.tag}
                  >
                    {tag.label}
                  </option>
                ))}
              </select>
              <Button
                size="s"
                variant="ghost"
                semantic="secondary"
                label={
                  unsupportedConfirmed.has(action.id)
                    ? '미지원 행동으로 확인했어요'
                    : '어느 것도 아니에요 · 미지원으로 진행'
                }
                disabled={unsupportedConfirmed.has(action.id)}
                onClick={() =>
                  setUnsupportedConfirmed(
                    (current) => new Set([...current, action.id])
                  )
                }
              />
            </VStack>
          </div>
        ))}

      {adding ? (
        <HStack spacing={8}>
          <TextInput
            value={custom}
            placeholder="예: 팀원 재배정 요청"
            autoFocus
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
      ) : (
        <HStack>
          <Button
            size="xs"
            variant="ghost"
            semantic="secondary"
            label="다른 것도 생각하고 있어요"
            disabled={busy}
            onClick={() => setAdding(true)}
          />
        </HStack>
      )}

      {confirmed.length > MAX_PICK && (
        <Text
          as="p"
          typo="12"
          className="ff-critical"
        >
          한 번에 {MAX_PICK}개까지만 비교할 수 있어요.{' '}
          {confirmed.length - MAX_PICK}개를 꺼 주세요.
        </Text>
      )}

      <HStack justify="end">
        <Button
          size="m"
          variant="filled"
          semantic="primary"
          label={
            confirmed.length > 0
              ? `선배 사례 비교하기 (${confirmed.length})`
              : '비교할 행동을 골라 주세요'
          }
          loading={busy}
          disabled={
            busy ||
            needsMeaning ||
            confirmed.length === 0 ||
            confirmed.length > MAX_PICK
          }
          onClick={() => onCompare(confirmed)}
        />
      </HStack>
    </Bubble>
  )
}

export default ActionPicker
