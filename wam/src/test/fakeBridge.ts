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
  forceRevision(revision: number): void
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
  let forcedRevision: number | null = null
  let revision = 0
  let asked = 0

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
        if (pendingReplyError) {
          const error = pendingReplyError
          pendingReplyError = null
          throw error
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
        messages.push({
          role: 'assistant',
          content: assistantMessage,
          at: Date.now(),
        })
        return {
          state: asked >= 3 ? 'REVIEWING_SITUATION' : 'COLLECTING',
          revision,
          assistantMessage,
          situation: situation(),
        } as T
      }

      case F.getSession:
        return {
          id: 'session-1',
          category: 'team_project',
          state: 'COLLECTING',
          revision: forcedRevision ?? revision,
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
    forceRevision: (value) => {
      forcedRevision = value
    },
  }
}
