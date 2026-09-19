import type { ReactNode } from 'react'
import { Button, HStack, Text } from '@channel.io/bezier-react/beta'

interface BubbleProps {
  role: 'student' | 'assistant'
  content: string
  /** 내가 보낸 말풍선이 서버까지 못 갔을 때 다시 보내기를 붙인다. */
  failed?: boolean
  onRetry?: () => void
  /**
   * 말풍선 안에 넣을 조작 요소 (선택 칩, 확인 버튼). 확인·선택 단계를 별도
   * 폼 화면으로 빼지 않고 대화 안에서 끝내기 위한 자리다.
   */
  children?: ReactNode
}

function Bubble({ role, content, failed, onRetry, children }: BubbleProps) {
  const mine = role === 'student'
  return (
    <div className={mine ? 'ff-bubble-row ff-bubble-row-me' : 'ff-bubble-row'}>
      <div
        className={[
          'ff-bubble',
          mine ? 'ff-bubble-me' : '',
          failed ? 'ff-bubble-failed' : '',
          children ? 'ff-bubble-wide' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {content && (
          <Text
            as="pre"
            typo="14"
            className="ff-bubble-text"
          >
            {content}
          </Text>
        )}
        {children && <div className="ff-bubble-body">{children}</div>}
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
