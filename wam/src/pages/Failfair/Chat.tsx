import { useEffect, useRef } from 'react'
import { Button, HStack, Text, VStack } from '@channel.io/bezier-react/beta'
import type {
  ActionCandidate,
  Category,
  Message,
  SessionState,
  Situation,
} from '@tutorial/shared'

import ActionPicker from '../../components/failfair/ActionPicker'
import Bubble, { TypingBubble } from '../../components/failfair/Bubble'
import Composer from '../../components/failfair/Composer'

interface ChatPageProps {
  category: Category
  messages: Message[]
  state: SessionState
  situation: Situation
  /** 상황 확인 뒤 서버가 만든 행동 후보. 대화 안에서 칩으로 고른다. */
  actions: ActionCandidate[]
  /** 비교 결과가 있는지. 있으면 행동을 다시 고르는 중이라는 문구로 바꾼다. */
  hasResults: boolean
  /** 행동 후보가 바뀌었을 때 칩 상태를 새로 시작하기 위한 키 */
  revision: number
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
  /** 정리된 상황을 그대로 확정한다. 폼을 거치지 않는다. */
  onConfirmSituation: () => void
  /** 항목별로 직접 고치는 폼으로 간다. 대화로 고치기 어려울 때의 우회로다. */
  onEditSituation: () => void
  onCompare: (actions: ActionCandidate[]) => void
}

const PLACEHOLDER: Record<SessionState, string> = {
  COLLECTING: '상황을 편하게 적어 주세요. Enter로 보내기, Shift+Enter로 줄바꿈',
  REVIEWING_SITUATION: '다르거나 더 말할 게 있으면 여기에 이어서 적어 주세요',
  REVIEWING_ACTIONS: '',
  MATCHING: '',
  RESULTS: '상황이 달라졌으면 여기에 적어 주세요. 다시 정리해 드려요',
}

/**
 * v2 §3.1 2~4단계를 한 대화로 잇는다.
 * 질문·답 → 서버의 정리 말풍선 아래 「맞아요」 → 행동 칩 → 비교.
 * 확인과 선택을 별도 폼 화면으로 빼지 않는다. 폼은 「직접 고칠게요」로만 열린다.
 */
function ChatPage({
  category,
  messages,
  state,
  situation,
  actions,
  hasResults,
  revision,
  busy,
  failedAts,
  onSend,
  onResend,
  onSkipRemaining,
  onConfirmSituation,
  onEditSituation,
  onCompare,
}: ChatPageProps) {
  const endRef = useRef<HTMLDivElement | null>(null)
  const unsent = messages.filter(
    (message) => message.role === 'student' && failedAts.has(message.at)
  ).length

  // 새 말풍선이 생기거나 단계가 바뀌면 본문 맨 아래로 내린다. 기준점을 대화
  // 기록 안이 아니라 페이지 끝에 두어야 마지막 말풍선과 입력창이 함께 보인다.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [messages.length, busy, state])

  // 서버가 답장을 받는 상태에서만 입력창을 연다. REVIEWING_ACTIONS는 거절한다.
  const canReply =
    state === 'COLLECTING' ||
    state === 'REVIEWING_SITUATION' ||
    state === 'RESULTS'

  const quick =
    state === 'COLLECTING'
      ? [
          { label: '모르겠어요', onClick: () => onSend('모르겠어요') },
          ...(situation.situation
            ? [{ label: '그만 묻고 정리해 주세요', onClick: onSkipRemaining }]
            : []),
        ]
      : []

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

        {state === 'REVIEWING_SITUATION' && !busy && (
          <div className="ff-choices">
            <Button
              size="m"
              variant="filled"
              semantic="primary"
              label="맞아요, 이대로 갈게요"
              onClick={onConfirmSituation}
            />
            <Button
              size="m"
              variant="outlined"
              semantic="secondary"
              label="직접 고칠게요"
              onClick={onEditSituation}
            />
          </div>
        )}

        {(state === 'REVIEWING_ACTIONS' || state === 'RESULTS') && (
          <ActionPicker
            key={revision}
            category={category}
            actions={actions}
            busy={busy}
            revisiting={hasResults}
            onCompare={onCompare}
          />
        )}

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

      {canReply && (
        <Composer
          placeholder={PLACEHOLDER[state]}
          disabled={busy}
          onSend={onSend}
          quick={quick}
        />
      )}

      {state === 'REVIEWING_ACTIONS' && (
        <HStack justify="center">
          <Button
            size="xs"
            variant="ghost"
            semantic="secondary"
            label="상황을 고칠게요"
            disabled={busy}
            onClick={onEditSituation}
          />
        </HStack>
      )}

      {state === 'COLLECTING' && (
        <Text
          as="p"
          typo="12"
          color="text-neutral-lighter"
        >
          &ldquo;모르겠어요&rdquo;도 괜찮은 답이에요. 답하지 않은 건 결과에서
          미확인으로 표시되고, 사라지지 않아요.
        </Text>
      )}

      <div ref={endRef} />
    </VStack>
  )
}

export default ChatPage
