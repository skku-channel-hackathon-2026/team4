import { useState } from 'react'
import {
  Button,
  HStack,
  TextArea,
  VStack,
  type TextAreaHeight,
} from '@channel.io/bezier-react/beta'

interface QuickAction {
  label: string
  onClick: () => void
}

interface ComposerProps {
  placeholder: string
  disabled: boolean
  onSend: (text: string) => void
  /** 보내기 버튼 아래 작은 보조 버튼. "모르겠어요", "그게 끝이에요" 같은 한 번 누르는 답. */
  quick?: QuickAction[]
  minRows?: TextAreaHeight
}

/**
 * 대화 입력창. 학생 대화와 선배 인터뷰가 같은 것을 쓴다.
 * Enter로 보내기, Shift+Enter로 줄바꿈. 한글 조합 중인 Enter는 무시한다.
 */
function Composer({
  placeholder,
  disabled,
  onSend,
  quick = [],
  minRows = 3,
}: ComposerProps) {
  const [draft, setDraft] = useState('')

  const send = () => {
    const text = draft.trim()
    if (!text || disabled) return
    setDraft('')
    onSend(text)
  }

  return (
    <div className="ff-composer">
      <TextArea
        value={draft}
        placeholder={placeholder}
        minRows={minRows}
        maxRows={6}
        disabled={disabled}
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
          disabled={disabled || !draft.trim()}
          onClick={send}
        />
        {quick.length > 0 && (
          <HStack
            spacing={4}
            justify="center"
            wrap
          >
            {quick.map((action) => (
              <Button
                key={action.label}
                size="xs"
                variant="ghost"
                semantic="secondary"
                label={action.label}
                disabled={disabled}
                onClick={action.onClick}
              />
            ))}
          </HStack>
        )}
      </VStack>
    </div>
  )
}

export default Composer
