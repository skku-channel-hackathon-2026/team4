import { useState } from 'react'
import {
  Badge,
  Button,
  HStack,
  Text,
  TextArea,
  VStack,
} from '@channel.io/bezier-react/beta'
import {
  SOS_STATUS_LABELS,
  type SosMessage,
  type SosRequest,
  type SosThread as SosThreadData,
} from '@tutorial/shared'

import Section from './Section'
import SosThread from './SosThread'

interface SosBoxProps {
  /** 지금 보여 줄 요청. 없으면 보내기 폼을 보여 준다. */
  request: SosRequest | null
  busy: boolean
  /** 마지막 전송에서 그룹 봇 알림이 올라갔는지. null이면 아직 모름. */
  notified: boolean | null
  /** 마지막 전송에서 두 사람의 채널톡 DM에 SOS를 올렸는지. null이면 아직 모름. */
  directChat: boolean | null
  /** 지금 앱을 연 채팅방. 요청이 다른 방에서 시작됐는지 가린다. */
  currentChatId: string
  /** 내 매니저 ID. 스레드에서 내 말을 구분한다. */
  me: string
  /** 특정 사례의 선배에게 보내는 경우 그 제목. 없으면 서버가 선배를 고른다. */
  targetTitle?: string
  /** 보내기 폼의 기본 문구 (상황 요약). */
  defaultMessage?: string
  onSend: (message: string) => void
  onRefresh: () => void
  /** 스레드 폴링이 알아낸 요청의 최신 상태. */
  onRequestChange: (request: SosRequest) => void
  loadThread: (sosId: string) => Promise<SosThreadData>
  sendMessage: (
    sosId: string,
    text: string,
    requestId: string
  ) => Promise<{ message: SosMessage }>
}

/** 요청이 시작된 방 이름. 이름을 못 받았으면 뭉뚱그린다. */
function roomName(request: SosRequest): string {
  return request.chatTitle ? `'${request.chatTitle}'` : '요청을 보낸 그룹 채팅'
}

function statusText(
  request: SosRequest,
  notified: boolean | null,
  directChat: boolean | null,
  elsewhere: boolean
): string {
  if (request.status === 'accepted') {
    const where = request.directChatId
      ? ' 채널톡 1:1 DM 방도 열어 뒀으니 그쪽에서 이어 가도 돼요.'
      : request.chatId
        ? ` ${elsewhere ? `${roomName(request)} 방` : '이 채팅방'}에서 이어 가도 돼요.`
        : ''
    return `선배가 수락했어요. 아래에서 바로 이야기하세요.${where}`
  }
  if (request.status === 'declined')
    return '선배가 지금은 어렵다고 답했어요. 다른 선배에게 다시 요청해 보세요.'
  const routes = [
    directChat === true || request.directChatId
      ? '선배에게 1:1 DM으로 보냈어요.'
      : '',
    notified === true ? '그룹 채팅에도 알림을 올렸어요.' : '',
    directChat === false && notified === false
      ? '봇 알림은 올라가지 않았지만 요청은 저장됐어요. 선배가 앱을 열면 바로 보여요.'
      : '',
  ].filter(Boolean)
  return `${routes.join(' ')} 선배가 수락하면 이 화면이 바로 바뀌어요.`.trim()
}

/**
 * SOS 상자. 결과 화면 맨 위와 사례 상세에 붙는다.
 * 요청이 없으면 보내기 폼, 있으면 상태와 앱 안 대화 스레드를 보여 준다.
 */
function SosBox({
  request,
  busy,
  notified,
  directChat,
  currentChatId,
  me,
  targetTitle,
  defaultMessage = '',
  onSend,
  onRefresh,
  onRequestChange,
  loadThread,
  sendMessage,
}: SosBoxProps) {
  const [draft, setDraft] = useState(defaultMessage)

  if (request) {
    const elsewhere =
      Boolean(request.chatId) && request.chatId !== currentChatId
    return (
      <Section title={`'${request.caseTitle}' 선배에게 보낸 SOS`}>
        <div className="ff-box ff-accent">
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
              {request.directChatId && (
                <Badge
                  size="xs"
                  variant="blue"
                >
                  DM 열림
                </Badge>
              )}
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
              {statusText(request, notified, directChat, elsewhere)}
            </Text>
            <SosThread
              key={request.id}
              request={request}
              me={me}
              loadThread={loadThread}
              send={sendMessage}
              onRequestChange={onRequestChange}
            />
            {request.status !== 'accepted' && (
              <HStack
                spacing={8}
                wrap
              >
                {request.status === 'pending' && (
                  <Button
                    size="s"
                    variant="outlined"
                    semantic="secondary"
                    label="상태 새로고침"
                    loading={busy}
                    disabled={busy}
                    onClick={onRefresh}
                  />
                )}
              </HStack>
            )}
          </VStack>
        </div>
      </Section>
    )
  }

  return (
    <Section
      title={
        targetTitle
          ? `'${targetTitle}' 선배에게 SOS 보내기`
          : '🆘 지금 바로 선배에게 SOS 보내기'
      }
      hint={
        targetTitle
          ? '실제 경험을 남기고 연락을 허용한 선배예요. 한두 줄로 지금 상황을 적으면 선배에게 DM과 알림이 가고, 수락하면 여기서 바로 대화해요.'
          : '비슷하게 망해 본 선배 중 연락을 허용한 분에게 보내요. 결과에 연결된 선배를 먼저 찾고, 없으면 같은 고민 분야의 선배를 골라요. 수락하면 여기서 바로 대화해요.'
      }
    >
      <div className="ff-box ff-accent">
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
