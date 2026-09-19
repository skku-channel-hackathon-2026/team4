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
  /** 지금 앱을 연 채팅방. 요청이 다른 방에서 시작됐는지 가린다. */
  currentChatId: string
  /**
   * 여기서 SOS를 보낼 수 있는지. 서버가 서명한 그룹 채팅 표식이 있을 때만 참이다.
   * 앱은 1:1 방을 새로 만들 권한이 없어, 그룹이 아니면 이어서 대화할 방이 없다.
   */
  canSend: boolean
  onSend: (message: string) => void
  onRefresh: () => void
}

/** 요청이 시작된 방 이름. 이름을 못 받았으면 뭉뚱그린다. */
function roomName(request: SosRequest): string {
  return request.chatTitle ? `'${request.chatTitle}'` : '요청을 보낸 그룹 채팅'
}

function statusText(
  request: SosRequest,
  notified: boolean | null,
  elsewhere: boolean
): string {
  const room = elsewhere ? `${roomName(request)} 방` : '이 채팅방'
  if (request.status === 'accepted')
    return `선배가 수락했어요. ${room}에서 이어서 대화해 주세요.`
  if (request.status === 'declined')
    return '선배가 지금은 어렵다고 답했어요. 다른 사례의 선배에게 다시 요청해 보세요.'
  if (notified === false)
    return `요청은 저장됐어요. 봇 알림은 올라가지 않았지만(전송 실패), 선배가 앱을 열면 요청을 볼 수 있어요. 선배가 답하면 ${room}에 알림이 와요.`
  return `선배가 답하면 ${room}에 알림이 와요.`
}

/** 사례 상세 위에 붙는 SOS 상자. 실제 경험을 남기고 연락을 허용한 선배에게만 보인다. */
function SosBox({
  request,
  busy,
  notified,
  currentChatId,
  canSend,
  onSend,
  onRefresh,
}: SosBoxProps) {
  const [draft, setDraft] = useState('')

  if (request) {
    // 채널 안에서 한 선배당 요청 하나라, 다른 방에서 보낸 요청이 여기 보일 수 있다.
    const elsewhere =
      Boolean(request.chatId) && request.chatId !== currentChatId
    return (
      <Section title="이 선배에게 보낸 SOS">
        <div className="ff-box">
          <VStack spacing={8}>
            <HStack
              spacing={6}
              wrap
            >
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
              {elsewhere && request.chatTitle && (
                <Badge
                  size="xs"
                  variant="default"
                >
                  {request.chatTitle}에서 보냄
                </Badge>
              )}
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
              {statusText(request, notified, elsewhere)}
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

  if (!canSend) {
    return (
      <Section title="이 선배에게 SOS 보내기">
        <div className="ff-box">
          <Text
            as="p"
            typo="13"
          >
            이 선배에게 도움을 청하려면 그룹 채팅방에서 /망선박을 열어 주세요.
            수락하면 그 방에서 이어서 대화하게 되는데, 앱이 1:1 방을 새로 만들
            수는 없어요.
          </Text>
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
