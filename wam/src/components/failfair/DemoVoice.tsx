import { useEffect, useRef, useState } from 'react'
import type { Message } from '@tutorial/shared'

// Stream MP3 on supported browsers; otherwise play the completed response.
async function playSpeech(
  audio: HTMLAudioElement,
  message: Message,
  token: string,
  cancellation: AbortSignal
) {
  const signal = AbortSignal.any([cancellation, AbortSignal.timeout(180000)])
  const response = await fetch('/api/tts', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ text: message.content, role: message.role }),
    signal,
  })
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string
    } | null
    throw new Error(body?.error || '음성을 만들지 못했어요.')
  }
  if (signal.aborted) throw new DOMException('Stopped', 'AbortError')
  let url = ''
  const wait = (target: EventTarget, event: string) =>
    new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        target.removeEventListener(event, done)
        target.removeEventListener('error', error)
        signal.removeEventListener('abort', abort)
      }
      const done = () => {
        cleanup()
        resolve()
      }
      const error = () => {
        cleanup()
        reject(new Error('음성을 재생하지 못했어요.'))
      }
      const abort = () => {
        cleanup()
        reject(new DOMException('Stopped', 'AbortError'))
      }
      if (signal.aborted) {
        abort()
        return
      }
      target.addEventListener(event, done, { once: true })
      target.addEventListener('error', error, { once: true })
      signal.addEventListener('abort', abort, { once: true })
    })
  try {
    if (
      typeof MediaSource !== 'undefined' &&
      MediaSource.isTypeSupported('audio/mpeg') &&
      response.body
    ) {
      const source = new MediaSource()
      url = URL.createObjectURL(source)
      const opened = wait(source, 'sourceopen')
      audio.src = url
      await opened
      const buffer = source.addSourceBuffer('audio/mpeg')
      const reader = response.body.getReader()
      let playing: Promise<void> | undefined
      try {
        while (!signal.aborted) {
          const { value, done } = await reader.read()
          if (done) break
          if (signal.aborted) throw new DOMException('Stopped', 'AbortError')
          const appended = wait(buffer, 'updateend')
          buffer.appendBuffer(value)
          await appended
          if (!playing) {
            playing = audio.play()
            // Observe immediately, even while more chunks are still arriving.
            void playing.catch(() => undefined)
          }
        }
        if (!playing) throw new Error('빈 음성이 반환됐어요.')
        const ended = wait(audio, 'ended')
        void ended.catch(() => undefined)
        source.endOfStream()
        await playing
        await ended
      } finally {
        await reader.cancel().catch(() => undefined)
      }
    } else {
      url = URL.createObjectURL(await response.blob())
      if (signal.aborted) throw new DOMException('Stopped', 'AbortError')
      audio.src = url
      const ended = wait(audio, 'ended')
      void ended.catch(() => undefined)
      await audio.play()
      await ended
    }
  } finally {
    audio.pause()
    audio.removeAttribute('src')
    audio.load()
    if (url) URL.revokeObjectURL(url)
  }
}

export default function DemoVoice({ messages }: { messages: Message[] }) {
  const audio = useRef<HTMLAudioElement>(null)
  const [token, setToken] = useState('')
  const [enabled, setEnabled] = useState(false)
  const [status, setStatus] = useState('')
  const seen = useRef(messages.length)
  const queue = useRef<Message[]>([])
  const active = useRef<AbortController | null>(null)
  const enabledRef = useRef(false)
  const tokenRef = useRef('')

  function stop() {
    queue.current = []
    active.current?.abort()
    audio.current?.pause()
  }

  async function drain() {
    if (active.current || !enabledRef.current || !audio.current) return
    const controller = new AbortController()
    active.current = controller
    try {
      while (
        queue.current.length &&
        !controller.signal.aborted &&
        enabledRef.current
      ) {
        const message = queue.current.shift()!
        setStatus(
          message.role === 'student' ? '학생 음성 재생 중' : '선배 음성 재생 중'
        )
        await playSpeech(
          audio.current,
          message,
          tokenRef.current,
          controller.signal
        )
      }
      if (!controller.signal.aborted) setStatus('음성 시연 대기 중')
    } catch (error) {
      if (!controller.signal.aborted) {
        queue.current = []
        enabledRef.current = false
        setEnabled(false)
        setStatus(
          error instanceof Error && error.name === 'NotAllowedError'
            ? '브라우저가 재생을 막았어요. 음성을 다시 켜고 재생해 주세요.'
            : `${error instanceof Error ? error.message : '음성 재생 실패'} 텍스트 대화는 계속할 수 있어요.`
        )
      }
    } finally {
      controller.abort()
      active.current = null
      if (queue.current.length && enabledRef.current) void drain()
    }
  }

  useEffect(() => {
    const added = messages.slice(seen.current)
    seen.current = messages.length
    if (enabledRef.current) {
      queue.current.push(...added)
      void drain()
    }
    // Only new conversation messages trigger playback, never historical reloads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages])

  useEffect(
    () => () => {
      enabledRef.current = false
      queue.current = []
      active.current?.abort()
    },
    []
  )

  async function toggle() {
    if (enabled) {
      enabledRef.current = false
      setEnabled(false)
      stop()
      setStatus('음성 시연 꺼짐')
      return
    }
    tokenRef.current = token.trim()
    seen.current = messages.length
    enabledRef.current = true
    setEnabled(true)
    setStatus('음성 연결 확인 중')
    // Unlock this media element during a user gesture (silent PCM WAV).
    if (audio.current) {
      audio.current.src =
        'data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQIAAAAAAA=='
      await audio.current.play().catch(() => undefined)
    }
    // Turning voice on should give immediate feedback instead of silently waiting
    // for the next chat turn.
    const latest = messages[messages.length - 1]
    if (latest) queue.current.push(latest)
    void drain()
  }

  return (
    <details style={{ marginBottom: 12 }}>
      <summary>음성 시연 {enabled ? 'ON' : 'OFF'}</summary>
      <p>학생과 선배의 대화를 서로 다른 목소리로 읽어요.</p>
      <input
        type="password"
        aria-label="시연 토큰"
        placeholder="시연 토큰"
        autoComplete="off"
        value={token}
        disabled={enabled}
        onChange={(event) => setToken(event.target.value)}
      />
      <button
        type="button"
        onClick={() => void toggle()}
        disabled={!enabled && !token.trim()}
      >
        {enabled ? '음성 끄기' : '음성 켜기'}
      </button>
      <button
        type="button"
        disabled={!enabled}
        onClick={() => {
          stop()
          setStatus('재생 중지됨')
        }}
      >
        중지
      </button>
      <button
        type="button"
        disabled={!enabled || !messages.length}
        onClick={() => {
          stop()
          queue.current.push(messages[messages.length - 1]!)
          void drain()
        }}
      >
        마지막 대사 다시 듣기
      </button>
      <p role="status">{status}</p>
      <audio
        ref={audio}
        hidden
      />
    </details>
  )
}
