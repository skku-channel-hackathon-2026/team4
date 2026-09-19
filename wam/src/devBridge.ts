import type { CallFunctionArgs, ChannelIOWam } from '@channel.io/app-sdk-wam'
import {
  ACTION_TAGS,
  CATEGORIES,
  DEMO_CASES,
  FAILFAIR_FUNCTIONS as F,
  type ActionCandidate,
  type ActionResult,
  type Case,
  type SessionView,
  type Situation,
} from '@tutorial/shared'

/**
 * `pnpm dev:wam`으로 브라우저에서 단독 실행할 때만 쓰는 가짜 채널톡 bridge.
 * 서버 규칙의 축약판이라 화면 흐름 확인용이며, 실제 매칭 품질은 서버가 기준이다.
 * 프로덕션 빌드에서는 `import.meta.env.DEV`가 false라 아무것도 하지 않는다.
 * 주소 뒤에 `?mode=senior` 처럼 붙이면 호스트 값을 바꿔 볼 수 있다.
 */
export function installDevBridge() {
  if (!import.meta.env.DEV || window.ChannelIOWam) return

  const data: Record<string, unknown> = {
    appId: 'dev-app',
    channelId: 'dev-channel',
    managerId: 'dev-manager',
    chatId: 'dev-group',
    chatType: 'group',
    chatTitle: '앱_개발_검증',
    appearance: 'light',
  }
  new URLSearchParams(window.location.search).forEach((value, key) => {
    data[key] = value
  })

  const cases: Case[] = [...DEMO_CASES]
  const sessions = new Map<string, SessionView & { asked: number }>()
  const QUESTIONS = [
    '언제까지 해결해야 하나요? 남은 시간이나 마감을 알려 주세요.',
    '지금까지 끝난 작업과 남은 작업은 무엇인가요?',
    "지금 고려하고 있는 행동이 있나요? 없으면 '모르겠어요'라고 답해도 돼요.",
  ]

  const wait = () => new Promise((resolve) => window.setTimeout(resolve, 300))

  const emptySituation = (category: Situation['category']): Situation => ({
    category,
    situation: '',
    goal: '',
    deadline: { raw: '', urgency: 'unknown' },
    progress: '',
    constraints: [],
    attemptedActions: [],
    consideredActions: [],
    unknowns: [],
  })

  const summarize = (s: Situation) =>
    [
      '제가 이해한 상황이 맞는지 확인해 주세요.',
      `• 상황: ${s.situation || '미확인'}`,
      `• 마감: ${s.deadline.raw || '미확인'}`,
      `• 진행: ${s.progress || '미확인'}`,
      `• 고려 중인 행동: ${s.consideredActions.join(', ') || '미확인'}`,
      '아래에서 고치거나 그대로 확인해 주세요.',
    ].join('\n')

  const callFunction = async <T>({
    name,
    params,
  }: CallFunctionArgs): Promise<T> => {
    await wait()
    const sessionId = String(params.sessionId ?? '')
    const session = sessions.get(sessionId)
    let result: unknown

    switch (name) {
      case F.start: {
        const category = params.category as Situation['category']
        const id = `dev-${sessions.size + 1}`
        const prompt =
          CATEGORIES.find((item) => item.id === category)?.prompt ??
          '무슨 일이 있었나요?'
        sessions.set(id, {
          id,
          category,
          state: 'COLLECTING',
          revision: 0,
          messages: [{ role: 'assistant', content: prompt, at: Date.now() }],
          situation: emptySituation(category),
          actions: [],
          results: [],
          asked: 0,
        })
        result = {
          sessionId: id,
          state: 'COLLECTING',
          revision: 0,
          assistantMessage: prompt,
        }
        break
      }
      case F.reply: {
        if (!session) throw new Error('dev bridge: session not found')
        const text = String(params.message)
        const s = session.situation
        // 서버의 SKIP_PATTERN 축약판. 건너뛴 답은 필드에 넣지 않고 미확인으로 남긴다.
        const skipped = /모르겠|말하고 싶지 않|건너|스킵|패스|글쎄/.test(text)
        const FIELD_LABELS = ['마감·남은 시간', '진행 상황', '고려 중인 행동']
        if (skipped && s.situation) {
          const label = FIELD_LABELS[session.asked - 1]
          if (label && !s.unknowns.includes(label)) s.unknowns.push(label)
        } else if (!s.situation) s.situation = text
        else if (session.asked === 1) s.deadline.raw = text
        else if (session.asked === 2) s.progress = text
        else if (session.asked === 3) s.consideredActions = [text]
        const detected = ACTION_TAGS[session.category]
          .filter((action) =>
            action.keywords.some((keyword) => text.includes(keyword))
          )
          .map((action) => action.label)
        s.consideredActions = Array.from(
          new Set([...s.consideredActions, ...detected])
        )

        let assistantMessage: string
        if (session.asked < QUESTIONS.length) {
          assistantMessage = QUESTIONS[session.asked]!
          session.asked += 1
          session.state = 'COLLECTING'
        } else {
          assistantMessage = summarize(s)
          session.state = 'REVIEWING_SITUATION'
        }
        session.revision += 1
        session.messages.push({
          role: 'student',
          content: text,
          at: Date.now(),
        })
        session.messages.push({
          role: 'assistant',
          content: assistantMessage,
          at: Date.now(),
        })
        result = {
          state: session.state,
          revision: session.revision,
          assistantMessage,
          situation: s,
        }
        break
      }
      case F.confirmSituation: {
        if (!session) throw new Error('dev bridge: session not found')
        session.situation = params.situation as Situation
        const catalog = ACTION_TAGS[session.category]
        const actions: ActionCandidate[] = []
        session.situation.consideredActions.forEach((label, index) => {
          const tagged = catalog.find(
            (action) =>
              action.label === label ||
              action.keywords.some((keyword) => label.includes(keyword))
          )
          if (tagged && actions.some((item) => item.actionTag === tagged.tag))
            return
          actions.push({
            id: `student-${index + 1}`,
            label: tagged?.label ?? label,
            actionTag: tagged?.tag,
            origin: 'student',
            confirmed: true,
          })
        })
        for (const action of catalog) {
          if (actions.length >= 3) break
          if (actions.some((item) => item.actionTag === action.tag)) continue
          actions.push({
            id: `suggested-${action.tag}`,
            label: action.label,
            actionTag: action.tag,
            origin: 'suggested',
            confirmed: true,
          })
        }
        session.actions = actions
        session.state = 'REVIEWING_ACTIONS'
        session.revision += 1
        result = {
          state: session.state,
          revision: session.revision,
          situation: session.situation,
          actions,
        }
        break
      }
      case F.compare: {
        if (!session) throw new Error('dev bridge: session not found')
        const actions = params.actions as ActionCandidate[]
        const results: ActionResult[] = actions.map((action) => {
          const item = cases.find(
            (candidate) =>
              candidate.status === 'approved' &&
              candidate.category === session.category &&
              candidate.actionSteps.some(
                (step) => step.actionTag === action.actionTag
              )
          )
          if (!item) {
            return {
              id: `result-${action.id}`,
              action,
              status: 'no_case',
              similarities: [],
              differences: action.actionTag
                ? []
                : ['이 행동은 아직 사례 태그와 연결되지 않았어요'],
              unknowns: [],
              seniorActions: [],
              conditions: [],
            }
          }
          return {
            id: `result-${action.id}`,
            action,
            status: 'matched',
            caseId: item.id,
            caseTitle: item.title,
            sourceType: item.sourceType,
            similarities: ['선배가 실제로 이 행동을 했음'],
            differences: [],
            unknowns: session.situation.deadline.raw ? [] : ['마감·남은 시간'],
            seniorActions: item.actionSteps.map((step) => step.description),
            outcome: item.outcome,
            cost: item.receipt.cost,
            conditions: item.conditions,
            toolTitle: item.tool?.title,
          }
        })
        session.actions = actions
        session.results = results
        session.state = 'RESULTS'
        session.revision += 1
        result = {
          state: session.state,
          revision: session.revision,
          results,
          notice:
            '비슷한 경험을 한 선배의 기록입니다. 상황의 차이에 따라 결과는 달라질 수 있습니다. 일부 사례는 가상 시연 데이터입니다.',
        }
        break
      }
      case F.getSession:
        if (!session) throw new Error('dev bridge: session not found')
        result = session
        break
      case F.getCase: {
        const item = cases.find((candidate) => candidate.id === params.caseId)
        if (!item) throw new Error('dev bridge: case not found')
        result = { case: item }
        break
      }
      case F.feedback:
        console.info('[dev bridge] feedback', params)
        result = { ok: true }
        break
      case F.submitCase: {
        const item = {
          ...(params as Omit<
            Case,
            'id' | 'status' | 'sourceType' | 'version' | 'createdAt'
          >),
          id: `case-dev-${cases.length + 1}`,
          status: 'draft',
          sourceType: 'real',
          version: 1,
          createdAt: Date.now(),
        } as Case
        cases.push(item)
        result = { case: item }
        break
      }
      case F.listCases:
        result = {
          cases: params.status
            ? cases.filter((item) => item.status === params.status)
            : cases,
        }
        break
      case F.reviewCase: {
        const index = cases.findIndex((item) => item.id === params.caseId)
        if (index < 0) throw new Error('dev bridge: case not found')
        cases[index] = {
          ...cases[index]!,
          status: params.status as Case['status'],
        }
        result = { case: cases[index] }
        break
      }
      default:
        throw new Error(`dev bridge: unknown function ${name}`)
    }
    return result as T
  }

  const bridge: ChannelIOWam = {
    getWamData: (key) => data[key],
    setSize: (size) => console.info('[dev bridge] setSize', size),
    close: () => console.info('[dev bridge] close'),
    callFunction,
    callNativeFunction: async () => {
      throw new Error('dev bridge: native functions are unavailable')
    },
  }
  window.ChannelIOWam = bridge
}
