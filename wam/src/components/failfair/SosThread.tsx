import { useCallback, useEffect, useRef, useState } from 'react'
import { Text, VStack } from '@channel.io/bezier-react/beta'
import type {
  SosMessage,
  SosRequest,
  SosThread as SosThreadData,
} from '@tutorial/shared'

import { errorMessage, newRequestId } from '../../hooks/useFailfairApi'
import Composer from './Composer'

interface SosThreadProps {
  request: SosRequest
  /** 내 매니저 ID. 내 말은 오른쪽에 붙는다. */
  me: string
  loadThread: (sosId: string) => Promise<SosThreadData>
  send: (
    sosId: string,
    text: string,
    requestId: string
  ) => Promise<{ message: SosMessage }>
  /** 폴링으로 알게 된 요청의 최신 상태. 대기 → 수락 전환을 부모가 그리게 한다. */
  onRequestChange?: (request: SosRequest) => void
  pollMs?: number
}

/**
 * 수락된 SOS 안의 대화. 새내기와 선배가 같은 컴포넌트를 본다.
 * 서버에 웹소켓이 없어 몇 초마다 다시 읽는다. 대기 중일 때도 읽어서
 * 선배가 수락하는 순간 새내기 화면이 스스로 바뀐다.
 */
function SosThread({
  request,
  me,
  loadThread,
  send,
  onRequestChange,
  pollMs = 4000,
}: SosThreadProps) {
  const [messages, setMessages] = useState<SosMessage[]>([])
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const endRef = useRef<HTMLDivElement | null>(null)
  const statusRef = useRef(request.status)
  const requestIds = useRef(new Map<string, string>())

  const refresh = useCallback(async () => {
    try {
      const thread = await loadThread(request.id)
      setMessages(thread.messages)
      if (thread.request.status !== statusRef.current) {
        statusRef.current = thread.request.status
        onRequestChange?.(thread.request)
      }
    } catch {
      // 잠시 못 읽어도 다음 회차에 다시 읽는다. 배너로 시끄럽게 하지 않는다.
    }
  }, [loadThread, onRequestChange, request.id])

  useEffect(() => {
    void refresh()
    if (request.status === 'declined') return
    const timer = window.setInterval(() => void refresh(), pollMs)
    return () => window.clearInterval(timer)
  }, [pollMs, refresh, request.status])

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' })
  }, [messages.length])

  const submit = async (text: string) => {
    // 말마다 requestId 하나. 재시도해도 같은 값이라 서버에 두 번 쌓이지 않는다.
    const localId = `local-${Date.now()}`
    const requestId = newRequestId()
    requestIds.current.set(localId, requestId)
    const optimistic: SosMessage = {
      id: localId,
      sosId: request.id,
      senderManagerId: me,
      role: request.studentManagerId === me ? 'student' : 'senior',
      text,
      createdAt: Date.now(),
    }
    setMessages((current) => [...current, optimistic])
    setSending(true)
    setError(null)
    try {
      const { message } = await send(request.id, text, requestId)
      setMessages((current) =>
        current.map((item) => (item.id === localId ? message : item))
      )
    } catch (cause) {
      setMessages((current) => current.filter((item) => item.id !== localId))
      setError(errorMessage(cause, '말을 보내지 못했어요. 다시 보내 주세요.'))
    } finally {
      setSending(false)
    }
  }

  if (request.status === 'declined') return null

  return (
    <VStack spacing={8}>
      <div className="ff-log ff-sos-log">
        {messages.length === 0 && (
          <Text
            as="p"
            typo="12"
            color="text-neutral-lighter"
          >
            {request.status === 'accepted'
              ? '아직 주고받은 말이 없어요. 먼저 인사해 보세요.'
              : '선배가 수락하면 여기서 바로 대화할 수 있어요.'}
          </Text>
        )}
        {messages.map((message) => {
          const mine = message.senderManagerId === me
          return (
            <div
              key={message.id}
              className={
                mine ? 'ff-bubble-row ff-bubble-row-me' : 'ff-bubble-row'
              }
            >
              <div className={mine ? 'ff-bubble ff-bubble-me' : 'ff-bubble'}>
                <Text
                  as="pre"
                  typo="14"
                  className="ff-bubble-text"
                >
                  {message.text}
                </Text>
              </div>
              <Text
                as="span"
                typo="11"
                color="text-neutral-lighter"
              >
                {mine ? '나' : message.role === 'senior' ? '선배' : '새내기'} ·{' '}
                {new Date(message.createdAt).toLocaleTimeString('ko-KR', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </Text>
            </div>
          )
        })}
        <div ref={endRef} />
      </div>
      {error && (
        <Text
          as="p"
          typo="12"
          className="ff-critical"
        >
          {error}
        </Text>
      )}
      {request.status === 'accepted' && (
        <Composer
          placeholder="여기에 적으면 상대에게 바로 보여요. Enter로 보내기"
          disabled={sending}
          onSend={(text) => void submit(text)}
        />
      )}
    </VStack>
  )
}

export default SosThread
