import { useEffect, useRef, useState } from 'react'
import {
  Button,
  HStack,
  Text,
  TextArea,
  VStack,
} from '@channel.io/bezier-react/beta'
import type { Message, SessionState } from '@tutorial/shared'

import Bubble from '../../components/failfair/Bubble'

interface ChatPageProps {
  messages: Message[]
  state: SessionState
  busy: boolean
  onSend: (text: string) => void
  onReview: () => void
}

/** v2 §3.1 2단계: 자유 입력창과 대화 기록. 건너뛰기와 확인 단계 이동 제공. */
function ChatPage({ messages, state, busy, onSend, onReview }: ChatPageProps) {
  const [draft, setDraft] = useState('')
  const endRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [messages.length, busy])

  const send = () => {
    const text = draft.trim()
    if (!text || busy) return
    setDraft('')
    onSend(text)
  }

  return (
    <VStack spacing={8}>
      <div className="ff-log">
        {messages.map((message, index) => (
          <Bubble
            key={`${message.at}-${index}`}
            role={message.role}
            content={message.content}
          />
        ))}
        {busy && (
          <Bubble
            role="assistant"
            content="…"
          />
        )}
        <div ref={endRef} />
      </div>

      {state === 'REVIEWING_SITUATION' && (
        <div className="ff-box">
          <VStack spacing={8}>
            <Text
              as="p"
              typo="13"
              color="text-neutral-light"
            >
              정리가 맞으면 확인 단계로 넘어가요. 더 말할 게 있으면 아래에 계속
              적어도 돼요.
            </Text>
            <Button
              size="m"
              variant="filled"
              semantic="primary"
              label="상황 확인하기"
              disabled={busy}
              onClick={onReview}
            />
          </VStack>
        </div>
      )}

      <div className="ff-composer">
        <TextArea
          value={draft}
          placeholder="상황을 편하게 적어 주세요. Enter로 보내기, Shift+Enter로 줄바꿈"
          minRows={3}
          maxRows={6}
          disabled={busy}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (
              event.key === 'Enter' &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault()
              send()
            }
          }}
        />
        <VStack spacing={6}>
          <Button
            size="m"
            variant="filled"
            semantic="primary"
            label="보내기"
            disabled={busy || !draft.trim()}
            onClick={send}
          />
          <HStack justify="center">
            <Button
              size="xs"
              variant="ghost"
              semantic="secondary"
              label="모르겠어요"
              disabled={busy}
              onClick={() => onSend('모르겠어요')}
            />
          </HStack>
        </VStack>
      </div>
    </VStack>
  )
}

export default ChatPage
