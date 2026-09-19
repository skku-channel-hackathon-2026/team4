import { useCallback, useEffect, useState } from 'react'
import {
  Badge,
  Button,
  HStack,
  Text,
  VStack,
} from '@channel.io/bezier-react/beta'
import {
  EmptyState,
  InlineBanner,
  LoadingPage,
} from '@channel.io/app-sdk-wam-ui'
import {
  SOS_STATUS_LABELS,
  type SosMessage,
  type SosRequest,
  type SosThread as SosThreadData,
} from '@tutorial/shared'

import SosThread from '../../components/failfair/SosThread'
import { errorMessage } from '../../hooks/useFailfairApi'

interface SosInboxPageProps {
  listRequests: () => Promise<{ requests: SosRequest[] }>
  respond: (
    sosId: string,
    status: 'accepted' | 'declined'
  ) => Promise<{ request: SosRequest; notified: boolean; directChat: boolean }>
  loadThread: (sosId: string) => Promise<SosThreadData>
  sendMessage: (
    sosId: string,
    text: string,
    requestId: string
  ) => Promise<{ message: SosMessage }>
  /** 선배 본인의 매니저 ID. 스레드에서 내 말을 구분한다. */
  me: string
  /** 선배가 지금 앱을 연 채팅방. 요청은 다른 방에서 왔을 수 있다. */
  currentChatId: string
}

/** 요청이 시작된 방. 선배가 다른 방에서 열었어도 어디로 가야 할지 알려 준다. */
function roomName(request: SosRequest): string {
  return request.chatTitle ? `'${request.chatTitle}'` : '요청이 온 채팅방'
}

const POLL_MS = 5000

/**
 * 선배에게 온 SOS 목록. 몇 초마다 새로 읽어 새 요청이 저절로 나타난다.
 * 수락한 요청은 그 자리에서 앱 안 대화 스레드가 열린다.
 */
function SosInboxPage({
  listRequests,
  respond,
  loadThread,
  sendMessage,
  me,
  currentChatId,
}: SosInboxPageProps) {
  const [requests, setRequests] = useState<SosRequest[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  /** 방금 답한 요청에서 알림이 어디로 갔는지. */
  const [routes, setRoutes] = useState<
    Record<string, { notified: boolean; directChat: boolean }>
  >({})

  const load = useCallback(() => {
    listRequests()
      .then((result) => {
        setRequests(result.requests)
        setError(null)
      })
      .catch((cause: unknown) =>
        setError(errorMessage(cause, 'SOS 목록을 불러오지 못했어요.'))
      )
  }, [listRequests])

  useEffect(() => {
    load()
    const timer = window.setInterval(load, POLL_MS)
    return () => window.clearInterval(timer)
  }, [load])

  const answer = async (sosId: string, status: 'accepted' | 'declined') => {
    setBusyId(sosId)
    setError(null)
    try {
      const { request, notified, directChat } = await respond(sosId, status)
      setRequests((current) =>
        (current ?? []).map((item) => (item.id === request.id ? request : item))
      )
      setRoutes((current) => ({
        ...current,
        [request.id]: { notified, directChat },
      }))
    } catch (cause) {
      setError(errorMessage(cause, '답을 보내지 못했어요.'))
    } finally {
      setBusyId(null)
    }
  }

  const replace = (request: SosRequest) =>
    setRequests((current) =>
      (current ?? []).map((item) => (item.id === request.id ? request : item))
    )

  if (requests === null && !error)
    return <LoadingPage message="SOS 요청을 불러오는 중" />

  const list = requests ?? []
  const pending = list.filter((item) => item.status === 'pending').length
  return (
    <VStack spacing={12}>
      {error && (
        <InlineBanner
          variant="error"
          content={error}
        />
      )}
      <HStack
        justify="between"
        align="center"
      >
        <Text
          as="p"
          typo="13"
          color="text-neutral-light"
        >
          {pending > 0
            ? `답을 기다리는 SOS ${pending}건 · 몇 초마다 자동으로 새로고침해요`
            : '몇 초마다 자동으로 새로고침해요'}
        </Text>
        <Button
          size="xs"
          variant="ghost"
          semantic="secondary"
          label="새로고침"
          onClick={load}
        />
      </HStack>
      {list.length === 0 ? (
        <EmptyState
          title="받은 SOS가 없어요"
          description="연락을 허용한 내 사례를 본 새내기가 SOS를 보내면 여기에 쌓여요."
        />
      ) : (
        list.map((item) => {
          const route = routes[item.id]
          return (
            <div
              key={item.id}
              className={
                item.status === 'pending' ? 'ff-box ff-accent' : 'ff-box'
              }
            >
              <VStack spacing={8}>
                <HStack
                  spacing={6}
                  wrap
                >
                  <Badge
                    size="xs"
                    variant={
                      item.status === 'accepted'
                        ? 'green'
                        : item.status === 'pending'
                          ? 'yellow'
                          : 'default'
                    }
                  >
                    {SOS_STATUS_LABELS[item.status]}
                  </Badge>
                  <Badge
                    size="xs"
                    variant="default"
                  >
                    {item.caseTitle}
                  </Badge>
                  {item.directChatId && (
                    <Badge
                      size="xs"
                      variant="blue"
                    >
                      DM 열림
                    </Badge>
                  )}
                  {item.chatTitle && (
                    <Badge
                      size="xs"
                      variant="default"
                    >
                      {item.chatTitle}
                    </Badge>
                  )}
                </HStack>
                <Text
                  as="p"
                  typo="14"
                >
                  “{item.message}”
                </Text>
                <Text
                  as="p"
                  typo="13"
                  color="text-neutral-light"
                >
                  {new Date(item.createdAt).toLocaleString('ko-KR')}
                </Text>
                {item.status === 'pending' && (
                  <HStack
                    spacing={8}
                    wrap
                  >
                    <Button
                      size="s"
                      variant="filled"
                      semantic="primary"
                      label="수락하고 대화하기"
                      loading={busyId === item.id}
                      disabled={busyId !== null}
                      onClick={() => void answer(item.id, 'accepted')}
                    />
                    <Button
                      size="s"
                      variant="outlined"
                      semantic="secondary"
                      label="지금은 어려워요"
                      loading={busyId === item.id}
                      disabled={busyId !== null}
                      onClick={() => void answer(item.id, 'declined')}
                    />
                  </HStack>
                )}
                {item.status === 'pending' &&
                  item.chatId &&
                  item.chatId !== currentChatId && (
                    <Text
                      as="p"
                      typo="13"
                      color="text-neutral-light"
                    >
                      {roomName(item)} 방에서 온 요청이에요.
                    </Text>
                  )}
                {item.status === 'accepted' && (
                  <>
                    <Text
                      as="p"
                      typo="13"
                    >
                      {route?.directChat || item.directChatId
                        ? '수락했어요. 아래에서 바로 이야기하거나, 채널톡 1:1 DM 방에서 이어 가도 돼요.'
                        : route?.notified
                          ? `수락했어요. 아래에서 바로 이야기하거나, ${roomName(item)} 방에서 이어 가도 돼요.`
                          : '수락했어요. 아래에서 바로 이야기하세요.'}
                    </Text>
                    <SosThread
                      request={item}
                      me={me}
                      loadThread={loadThread}
                      send={sendMessage}
                      onRequestChange={replace}
                    />
                  </>
                )}
              </VStack>
            </div>
          )
        })
      )}
    </VStack>
  )
}

export default SosInboxPage
