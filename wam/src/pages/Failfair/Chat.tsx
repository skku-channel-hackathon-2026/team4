import { useEffect, useRef, useState } from 'react'
import {
  Button,
  HStack,
  Text,
  TextArea,
  VStack,
} from '@channel.io/bezier-react/beta'
import type { Message, SessionState, Situation } from '@tutorial/shared'

import Bubble, { TypingBubble } from '../../components/failfair/Bubble'
import CollectedSummary from '../../components/failfair/CollectedSummary'

interface ChatPageProps {
  messages: Message[]
  state: SessionState
  /** 지금까지 서버가 채운 상황. 수집 현황 카드에 그대로 쓴다. */
  situation: Situation
  busy: boolean
  /**
   * 서버까지 가지 못한 내 메시지들의 `at`. 말풍선마다 따로 표시한다. 하나로
   * 뭉뚱그리면 뒤 메시지가 성공했을 때 앞 메시지의 실패가 지워져, 서버가 받지
   * 못한 말이 화면에는 정상으로 남는다.
   */
  failedAts: ReadonlySet<number>
  onSend: (text: string) => void
  onResend: (at: number) => void
  onSkipRemaining: () => void
  onReview: () => void
}

/** v2 §3.1 2단계: 자유 입력창과 대화 기록. 건너뛰기와 확인 단계 이동 제공. */
function ChatPage({
  messages,
  state,
  situation,
  busy,
  failedAts,
  onSend,
  onResend,
  onSkipRemaining,
  onReview,
}: ChatPageProps) {
  const [draft, setDraft] = useState('')
  const endRef = useRef<HTMLDivElement | null>(null)
  const unsent = messages.filter(
    (message) => message.role === 'student' && failedAts.has(message.at)
  ).length

  // 새 말풍선이 생기면 본문 맨 아래로 내린다. 기준점을 대화 기록 안이 아니라
  // 페이지 끝에 두어야 마지막 말풍선과 입력창이 함께 보인다. 기록 안에 두면
  // 기록이 넘칠 만큼 길어지기 전까지는 아무 일도 하지 않는다.
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
        {messages.map((message, index) => {
          const failed = message.role === 'student' && failedAts.has(message.at)
          return (
            <Bubble
              key={`${message.at}-${index}`}
              role={message.role}
              content={message.content}
              failed={failed}
              onRetry={failed ? () => onResend(message.at) : undefined}
            />
          )
        })}
        {busy && <TypingBubble />}
      </div>

      {unsent > 0 && (
        <div className="ff-box ff-warn">
          <Text
            as="p"
            typo="13"
          >
            아직 보내지 못한 말이 {unsent}개 있어요. 그 말풍선의 &lsquo;다시
            보내기&rsquo;를 눌러야 상담에 반영돼요.
          </Text>
        </div>
      )}

      {state === 'COLLECTING' && situation.situation && (
        <CollectedSummary
          situation={situation}
          busy={busy}
          onSkipRemaining={onSkipRemaining}
        />
      )}

      {state === 'REVIEWING_SITUATION' && (
        <div className="ff-box ff-accent">
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

      <Text
        as="p"
        typo="12"
        color="text-neutral-lighter"
      >
        &ldquo;모르겠어요&rdquo;도 괜찮은 답이에요. 답하지 않은 항목은 결과에서
        미확인으로 표시되고, 사라지지 않아요.
      </Text>

      <div ref={endRef} />
    </VStack>
  )
}

export default ChatPage
