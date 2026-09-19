import { Text } from '@channel.io/bezier-react/beta'

interface BubbleProps {
  role: 'student' | 'assistant'
  content: string
}

function Bubble({ role, content }: BubbleProps) {
  return (
    <div
      className={role === 'student' ? 'ff-bubble ff-bubble-me' : 'ff-bubble'}
    >
      <Text
        as="pre"
        typo="14"
        className="ff-bubble-text"
      >
        {content}
      </Text>
    </div>
  )
}

export default Bubble
