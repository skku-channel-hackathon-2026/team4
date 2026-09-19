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
}

/** 선배에게 온 SOS 목록. 수락하면 요청이 온 채팅방에 봇 알림이 올라간다. */
function SosInboxPage({ listRequests, respond }: SosInboxPageProps) {
  const [requests, setRequests] = useState<SosRequest[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

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
      const { request } = await respond(sosId, status)
      setRequests((current) =>
        (current ?? []).map((item) => (item.id === request.id ? request : item))
      )
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
              {item.status === 'accepted' && (
                <Text
                  as="p"
                  typo="13"
                >
                  수락했어요. 요청이 온 채팅방에서 이어서 대화해 주세요.
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
