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
import { SOS_STATUS_LABELS, type SosRequest } from '@tutorial/shared'

import { errorMessage } from '../../hooks/useFailfairApi'

interface SosInboxPageProps {
  listRequests: () => Promise<{ requests: SosRequest[] }>
  respond: (
    sosId: string,
    status: 'accepted' | 'declined'
  ) => Promise<{ request: SosRequest; notified: boolean }>
  /** 선배가 지금 앱을 연 채팅방. 요청은 다른 방에서 왔을 수 있다. */
  currentChatId: string
}

/** 요청이 시작된 방. 선배가 다른 방에서 열었어도 어디로 가야 할지 알려 준다. */
function roomName(request: SosRequest): string {
  return request.chatTitle ? `'${request.chatTitle}'` : '요청이 온 채팅방'
}

/**
 * 선배에게 온 SOS 목록. 목록은 채널 전체라 다른 방에서 온 요청도 보인다.
 * 앱은 방을 옮겨 주지 못하므로, 답한 뒤 어느 방으로 가야 하는지는 글로 알린다.
 */
function SosInboxPage({
  listRequests,
  respond,
  currentChatId,
}: SosInboxPageProps) {
  const [requests, setRequests] = useState<SosRequest[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  /** 방금 답한 요청에서 봇 알림이 실제로 올라갔는지. 안 올라갔으면 선배가 직접 가야 한다. */
  const [notified, setNotified] = useState<Record<string, boolean>>({})

  const load = useCallback(() => {
    listRequests()
      .then((result) => setRequests(result.requests))
      .catch((cause: unknown) =>
        setError(errorMessage(cause, 'SOS 목록을 불러오지 못했어요.'))
      )
  }, [listRequests])

  useEffect(() => {
    load()
  }, [load])

  const answer = async (sosId: string, status: 'accepted' | 'declined') => {
    setBusyId(sosId)
    setError(null)
    try {
      const { request, notified: posted } = await respond(sosId, status)
      setRequests((current) =>
        (current ?? []).map((item) => (item.id === request.id ? request : item))
      )
      setNotified((current) => ({ ...current, [request.id]: posted }))
    } catch (cause) {
      setError(errorMessage(cause, '답을 보내지 못했어요.'))
    } finally {
      setBusyId(null)
    }
  }

  if (requests === null && !error)
    return <LoadingPage message="SOS 요청을 불러오는 중" />

  const list = requests ?? []
  return (
    <VStack spacing={12}>
      {error && (
        <InlineBanner
          variant="error"
          content={error}
        />
      )}
      <HStack justify="end">
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
        list.map((item) => (
          <div
            key={item.id}
            className="ff-box"
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
              {item.status === 'pending' && item.chatId !== currentChatId && (
                <Text
                  as="p"
                  typo="13"
                  color="text-neutral-light"
                >
                  {roomName(item)} 방에서 온 요청이에요. 수락하면 그 방에서 이어
                  가게 돼요.
                </Text>
              )}
              {item.status === 'accepted' && (
                <Text
                  as="p"
                  typo="13"
                >
                  {notified[item.id] === false
                    ? `수락했어요. 다만 봇 알림이 올라가지 않아서, ${roomName(item)} 방에 직접 한마디 남겨 주셔야 새내기가 알 수 있어요.`
                    : `수락했어요. ${roomName(item)} 방에서 이어서 대화해 주세요.`}
                </Text>
              )}
            </VStack>
          </div>
        ))
      )}
    </VStack>
  )
}

export default SosInboxPage
