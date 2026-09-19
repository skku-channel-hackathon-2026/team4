import { useEffect, useState } from 'react'
import { Button } from '@channel.io/bezier-react/beta'

interface CopyButtonProps {
  text: string
  label?: string
  onCopied?: () => void
}

function CopyButton({ text, label = '복사', onCopied }: CopyButtonProps) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), 1500)
    return () => window.clearTimeout(timer)
  }, [copied])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      onCopied?.()
    } catch {
      window.prompt('아래 내용을 복사하세요', text)
    }
  }

  return (
    <Button
      size="s"
      variant="outlined"
      semantic="secondary"
      label={copied ? '복사됨' : label}
      onClick={() => void copy()}
    />
  )
}

export default CopyButton
