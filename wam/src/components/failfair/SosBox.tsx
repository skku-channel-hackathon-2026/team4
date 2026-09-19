import { useState } from 'react'
import {
  Badge,
  Button,
  HStack,
  Text,
  TextArea,
  VStack,
} from '@channel.io/bezier-react/beta'
import { SOS_STATUS_LABELS, type SosRequest } from '@tutorial/shared'

import Section from './Section'

interface SosBoxProps {
  /** 이 사례에 이미 보낸 요청. 없으면 보내기 폼을 보여 준다. */
  request: SosRequest | null
  busy: boolean
  /** 마지막 전송에서 봇 알림이 올라갔는지. null이면 아직 모름. */
  notified: boolean | null
  onSend: (message: string) => void
  onRefresh: () => void
}

function statusText(request: SosRequest, notified: boolean | null): string {
  if (request.status === 'accepted')
    return '선배가 수락했어요. 이 채팅방에서 이어서 대화해 주세요.'
  if (request.status === 'declined')
    return '선배가 지금은 어렵다고 답했어요. 다른 사례의 선배에게 다시 요청해 보세요.'
  if (notified === false)
    return '요청은 저장됐어요. 봇 알림은 올라가지 않았지만(그룹 채팅이 아니거나 전송 실패), 선배가 앱을 열면 요청을 볼 수 있어요.'
  return '선배가 답하면 이 채팅방에 알림이 와요.'
}

/** 사례 상세 위에 붙는 SOS 상자. 실제 경험을 남기고 연락을 허용한 선배에게만 보인다. */
function SosBox({ request, busy, notified, onSend, onRefresh }: SosBoxProps) {
  const [draft, setDraft] = useState('')

  if (request) {
    return (
      <Section title="이 선배에게 보낸 SOS">
        <div className="ff-box">
          <VStack spacing={8}>
            <HStack spacing={6}>
              <Badge
                size="xs"
                variant={
                  request.status === 'accepted'
                    ? 'green'
                    : request.status === 'pending'
                      ? 'yellow'
                      : 'default'
                }
              >
                {SOS_STATUS_LABELS[request.status]}
              </Badge>
            </HStack>
            <Text
              as="p"
              typo="13"
              color="text-neutral-light"
            >
              “{request.message}”
            </Text>
            <Text
              as="p"
              typo="13"
            >
              {statusText(request, notified)}
            </Text>
            {request.status === 'pending' && (
              <HStack>
                <Button
                  size="s"
                  variant="outlined"
                  semantic="secondary"
                  label="상태 새로고침"
                  loading={busy}
                  disabled={busy}
                  onClick={onRefresh}
                />
              </HStack>
            )}
          </VStack>
        </div>
      </Section>
    )
  }

  return (
    <Section
      title="이 선배에게 SOS 보내기"
      hint="실제 경험을 남기고 연락을 허용한 선배예요. 한두 줄로 지금 상황을 적으면 이 채팅방에 알림이 가고, 선배가 수락하면 여기서 이어서 대화해요."
    >
      <div className="ff-box">
        <VStack spacing={8}>
          <TextArea
            value={draft}
            placeholder="예: 발표가 8시간 남았는데 어디부터 손대야 할지 모르겠어요"
            minRows={3}
            maxRows={6}
            disabled={busy}
            onChange={(event) => setDraft(event.target.value)}
          />
          <HStack justify="end">
            <Button
              size="m"
              variant="filled"
              semantic="primary"
              label="🆘 SOS 보내기"
              loading={busy}
              disabled={busy || !draft.trim()}
              onClick={() => onSend(draft.trim())}
            />
          </HStack>
        </VStack>
      </div>
    </Section>
  )
}

export default SosBox
