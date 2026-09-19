import { Button, HStack, Text } from '@channel.io/bezier-react/beta'

interface BubbleProps {
  role: 'student' | 'assistant'
  content: string
  /** 내가 보낸 말풍선이 서버까지 못 갔을 때 다시 보내기를 붙인다. */
  failed?: boolean
  onRetry?: () => void
}

function Bubble({ role, content, failed, onRetry }: BubbleProps) {
  const mine = role === 'student'
  return (
    <div className={mine ? 'ff-bubble-row ff-bubble-row-me' : 'ff-bubble-row'}>
      <div
        className={[
          'ff-bubble',
          mine ? 'ff-bubble-me' : '',
          failed ? 'ff-bubble-failed' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <Text
          as="pre"
          typo="14"
          className="ff-bubble-text"
        >
          {content}
        </Text>
      </div>
      {failed && (
        <HStack
          spacing={4}
          align="center"
        >
          <Text
            as="span"
            typo="12"
            className="ff-critical"
          >
            보내지 못했어요
          </Text>
          {onRetry && (
            <Button
              size="xs"
              variant="ghost"
              semantic="primary"
              label="다시 보내기"
              onClick={onRetry}
            />
          )}
        </HStack>
      )}
    </div>
  )
}

/** 모델이 답을 만드는 동안의 자리 표시. 점 세 개가 순서대로 밝아진다. */
export function TypingBubble() {
  return (
    <div className="ff-bubble-row">
      <div
        className="ff-bubble ff-bubble-typing"
        role="status"
        aria-label="답변을 준비하고 있어요"
      >
        <span className="ff-dot" />
        <span className="ff-dot" />
        <span className="ff-dot" />
      </div>
    </div>
  )
}

export default Bubble
