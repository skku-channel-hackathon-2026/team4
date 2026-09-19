import { FAILFAIR_FUNCTIONS as F } from '@tutorial/shared'

/**
 * 테스트용 가짜 채널톡 bridge.
 *
 * 서버 규칙 중 회귀 검증에 필요한 부분만 흉내 낸다.
 * - 변경 요청마다 revision이 올라간다
 * - 어떤 호출이 어떤 requestId·expectedRevision으로 나갔는지 기록한다
 * - `failReplyWith`로 다음 `failfair.reply`를 원하는 오류로 실패시킨다
 * - `forceRevision`으로 `getSession`이 돌려줄 revision을 강제한다
 */
export interface CallRecord {
  name: string
  requestId?: string
  expectedRevision?: number
  message?: string
}

export interface FakeBridge {
  calls: CallRecord[]
  replies(): CallRecord[]
  failReplyWith(error: unknown): void
  loseReplyAfterCommit(error?: unknown): void
  forceRevision(revision: number): void
  session(): {
    revision: number
    messages: Array<{
      role: 'student' | 'assistant'
      content: string
      at: number
    }>
  }
}

interface CallArgs {
  name: string
  params: Record<string, unknown>
}

export function installFakeBridge(): FakeBridge {
  const calls: CallRecord[] = []
  const messages: {
    role: 'student' | 'assistant'
    content: string
    at: number
  }[] = []
  let pendingReplyError: unknown = null
  let pendingLostResponse: unknown = null
  let revision = 0
  let asked = 0
  let state: 'COLLECTING' | 'REVIEWING_SITUATION' = 'COLLECTING'
  const responses = new Map<string, unknown>()

  const situation = () => ({
    category: 'team_project' as const,
    situation: messages.find((m) => m.role === 'student')?.content ?? '',
    goal: '',
    deadline: { raw: '', urgency: 'unknown' as const },
    progress: '',
    constraints: [],
    attemptedActions: [],
    consideredActions: [],
    unknowns: [],
  })

  const callFunction = async <T>({ name, params }: CallArgs): Promise<T> => {
    calls.push({
      name,
      requestId: params.requestId as string | undefined,
      expectedRevision: params.expectedRevision as number | undefined,
      message: params.message as string | undefined,
    })

    switch (name) {
      case F.start:
        revision = 0
        asked = 0
        state = 'COLLECTING'
        messages.length = 0
        responses.clear()
        messages.push({
          role: 'assistant',
          content: '팀에서 어떤 문제가 생겼나요?',
          at: Date.now(),
        })
        return {
          sessionId: 'session-1',
          state: 'COLLECTING',
          revision,
          assistantMessage: '팀에서 어떤 문제가 생겼나요?',
        } as T

      case F.reply: {
        const requestId = String(params.requestId)
        const replay = responses.get(requestId)
        if (replay) return replay as T
        if (pendingReplyError) {
          const error = pendingReplyError
          pendingReplyError = null
          throw error
        }
        if (params.expectedRevision !== revision) {
          throw new Error('STALE_SESSION')
        }
        asked += 1
        revision += 1
        messages.push({
          role: 'student',
          content: String(params.message),
          at: Date.now(),
        })
        const assistantMessage =
          asked >= 3 ? '이 내용이 맞나요?' : '언제까지 해결해야 하나요?'
        state = asked >= 3 ? 'REVIEWING_SITUATION' : 'COLLECTING'
        messages.push({
          role: 'assistant',
          content: assistantMessage,
          at: Date.now(),
        })
        const response = {
          state,
          revision,
          assistantMessage,
          situation: situation(),
        }
        responses.set(requestId, response)
        if (pendingLostResponse) {
          const error = pendingLostResponse
          pendingLostResponse = null
          throw error
        }
        return response as T
      }

      case F.getSession:
        return {
          id: 'session-1',
          category: 'team_project',
          state,
          revision,
          messages: [...messages],
          situation: situation(),
          actions: [],
          results: [],
        } as T

      case F.feedback:
        return undefined as T

      default:
        throw new Error(`fake bridge: ${name} is not implemented`)
    }
  }

  window.ChannelIOWam = {
    getWamData: (key: string) =>
      (
        ({
          appId: 'test-app',
          channelId: 'test-channel',
          managerId: 'test-manager',
          chatId: 'test-chat',
          chatType: 'group',
          chatTitle: '앱_개발_검증',
          appearance: 'light',
        }) as Record<string, unknown>
      )[key],
    setSize: () => undefined,
    close: () => undefined,
    callFunction,
    callNativeFunction: async () => {
      throw new Error('fake bridge: native functions are unavailable')
    },
  } as unknown as typeof window.ChannelIOWam

  return {
    calls,
    replies: () => calls.filter((call) => call.name === F.reply),
    failReplyWith: (error) => {
      pendingReplyError = error
    },
    loseReplyAfterCommit: (error = new Error('NETWORK_DOWN')) => {
      pendingLostResponse = error
    },
    forceRevision: (value) => {
      revision = value
    },
    session: () => ({ revision, messages: [...messages] }),
  }
}
