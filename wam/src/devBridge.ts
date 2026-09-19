import type { CallFunctionArgs, ChannelIOWam } from '@channel.io/app-sdk-wam'
import {
  ACTION_TAGS,
  CATEGORIES,
  DEMO_CASES,
  FAILFAIR_ERRORS,
  FAILFAIR_FUNCTIONS as F,
  type ActionCandidate,
  type ActionResult,
  type Case,
  type SessionView,
  type Situation,
  type SosMessage,
  type SosRequest,
} from '@tutorial/shared'

/**
 * `pnpm dev:wam`으로 브라우저에서 단독 실행할 때만 쓰는 가짜 채널톡 bridge.
 * 서버 규칙의 축약판이라 화면 흐름 확인용이며, 실제 매칭 품질은 서버가 기준이다.
 * 프로덕션 빌드에서는 로컬 주소에 `?bridge=server`가 있을 때만 설치한다.
 * 주소 뒤에 `?mode=senior` 처럼 붙이면 호스트 값을 바꿔 볼 수 있다.
 *
 * `?bridge=server` (또는 `VITE_DEV_BRIDGE=server`, `pnpm dev:wam:server`)를 붙이면
 * 가짜 규칙 대신 로컬 Worker(`pnpm dev:cloudflare`, 8787)를 부른다. 실제 서버 로직과
 * Gemini 대화를 브라우저에서 볼 때 쓴다. 요청은 vite 프록시(/functions)를 거친다.
 */
export async function installDevBridge(): Promise<void> {
  const search = new URLSearchParams(window.location.search)
  const localServerBridge =
    ['127.0.0.1', 'localhost'].includes(window.location.hostname) &&
    search.get('bridge') === 'server'
  if ((!import.meta.env.DEV && !localServerBridge) || window.ChannelIOWam)
    return

  const data: Record<string, unknown> = {
    appId: 'dev-app',
    channelId: 'dev-channel',
    managerId: 'dev-manager',
    chatId: 'dev-group',
    chatType: 'group',
    chatTitle: '앱_개발_검증',
    demoVoice: true,
    // 실제 호스트에서는 서버가 `open`에서 서명해 내려 준다. fake 모드에서는 자리만 채운다.
    chatToken: 'dev-chat-token',
    appearance: 'light',
  }
  search.forEach((value, key) => {
    data[key] = value
  })

  const common = {
    getWamData: (key: string) => data[key],
    setSize: (size: unknown) => console.info('[dev bridge] setSize', size),
    close: () => console.info('[dev bridge] close'),
    callNativeFunction: async () => {
      throw new Error('dev bridge: native functions are unavailable')
    },
  }

  if (
    data.bridge === 'server' ||
    import.meta.env.VITE_DEV_BRIDGE === 'server'
  ) {
    const serverCall = createServerCall(data)
    window.ChannelIOWam = {
      ...common,
      callFunction: serverCall,
    } as ChannelIOWam
    console.info(
      '[dev bridge] server 모드: PUT /functions/v1 → vite 프록시 → 로컬 Worker 127.0.0.1:8787'
    )
    // SOS 대상 표식은 서버만 서명할 수 있다. 호스트가 하듯 `open`을 한 번 불러 받아 온다.
    try {
      const opened = await serverCall<{
        attributes?: { wamArgs?: { chatToken?: string } }
      }>({
        appId: String(data.appId),
        name: F.open,
        params: {
          chat: { id: String(data.chatId), type: String(data.chatType) },
          trigger: {
            type: 'command',
            attributes: { chatTitle: String(data.chatTitle) },
          },
          input: {},
        },
      })
      data.chatToken = opened.attributes?.wamArgs?.chatToken ?? ''
    } catch (error) {
      data.chatToken = ''
      console.warn(
        '[dev bridge] open 호출 실패 — SOS는 막힙니다 (Worker가 떠 있는지 확인)',
        error
      )
    }
    return
  }
  data.chatToken = 'dev-chat-token'
  console.info(
    '[dev bridge] fake 모드: 브라우저 안 축약 규칙 (서버·Gemini 호출 없음)'
  )

  // SOS 매칭을 브라우저에서 확인하려고 연락 허용한 실제 선배 사례 하나를 끼운다.
  const cases: Case[] = [
    ...DEMO_CASES,
    {
      ...DEMO_CASES[0]!,
      id: 'case-dev-real',
      title: '연락 되는 선배 (dev)',
      sourceType: 'real',
      allowContact: true,
      authorManagerId: 'dev-senior',
      createdAt: Date.now(),
    },
  ]
  const sosRequests: SosRequest[] = []
  const sosMessages: SosMessage[] = []
  /** 전송 단위 requestId → 그때 만든 요청. 서버의 failfair_sos.request_id와 같은 역할. */
  const sosByRequestId = new Map<string, SosRequest>()
  let devModel: {
    provider: 'gemini' | 'rule'
    source: 'env' | 'record' | 'none'
    model?: string
  } = { provider: 'rule', source: 'none' }
  const sessions = new Map<string, SessionView & { asked: number }>()
  // 서버와 같이 추가 질문은 마감 하나뿐이다.
  const QUESTIONS = [
    '무슨 일인지 알겠어요. 대략 언제까지 해결해야 해요? 정확하지 않아도 돼요.',
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
      '제가 이해한 걸 정리해 볼게요.',
      `• 상황: ${s.situation || '아직 못 들었어요'}`,
      `• 마감: ${s.deadline.raw || '아직 못 들었어요'}`,
      `• 진행: ${s.progress || '아직 못 들었어요'}`,
      `• 고려 중인 행동: ${s.consideredActions.join(', ') || '아직 못 들었어요'}`,
      '맞으면 아래 「맞아요」를 눌러 주세요. 다르거나 더 말할 게 있으면 그냥 이어서 적어 주시면 돼요.',
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
        result = {
          case: item,
          contactable:
            item.status === 'approved' &&
            item.sourceType === 'real' &&
            item.allowContact &&
            !!item.authorManagerId &&
            item.authorManagerId !== data.managerId,
        }
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
          authorManagerId: params.allowContact
            ? String(data.managerId)
            : undefined,
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
      case F.sosRequest: {
        const contactable = (candidate: Case) =>
          candidate.status === 'approved' &&
          candidate.sourceType === 'real' &&
          candidate.allowContact &&
          !!candidate.authorManagerId &&
          candidate.authorManagerId !== data.managerId
        // 서버와 같은 매칭: 사례를 안 고르면 결과에 연결된 선배 → 같은 카테고리의 연락 허용 선배.
        const preferred = (session?.results ?? []).flatMap((result) =>
          result.caseId ? [result.caseId] : []
        )
        const item = params.caseId
          ? cases.find((candidate) => candidate.id === params.caseId)
          : (preferred
              .map((id) => cases.find((candidate) => candidate.id === id))
              .find((candidate) => candidate && contactable(candidate)) ??
            cases.find(
              (candidate) =>
                contactable(candidate) &&
                candidate.category === session?.category
            ))
        if (!item)
          throw Object.assign(new Error('dev bridge: no senior available'), {
            type: FAILFAIR_ERRORS.noSeniorAvailable,
          })
        // 서버처럼 같은 requestId 재전송은 그때 만든 요청을 상태와 무관하게 돌려준다.
        const retransmitted = sosByRequestId.get(String(params.requestId))
        if (retransmitted) {
          result = { request: retransmitted, notified: false }
          break
        }
        // 서버처럼 (사례·새내기)당 대기 요청 하나만 둔다.
        const pending = sosRequests.find(
          (request) =>
            request.caseId === item.id &&
            request.studentManagerId === String(data.managerId) &&
            request.status === 'pending'
        )
        const request: SosRequest = pending ?? {
          id: `sos-dev-${sosRequests.length + 1}`,
          caseId: item.id,
          caseTitle: item.title,
          channelId: String(data.channelId),
          chatId: String(data.chatId),
          chatType: 'group',
          chatTitle: String(data.chatTitle),
          studentManagerId: String(data.managerId),
          seniorManagerId: item.authorManagerId ?? 'dev-senior',
          message: String(params.message),
          status: 'pending',
          createdAt: Date.now(),
        }
        if (!pending) sosRequests.push(request)
        sosByRequestId.set(String(params.requestId), request)
        result = {
          request,
          notified: !pending && Boolean(params.chatTarget),
          directChat: false,
        }
        break
      }
      case F.sosThread: {
        const request = sosRequests.find((item) => item.id === params.sosId)
        if (!request) throw new Error('dev bridge: sos not found')
        result = {
          request,
          messages: sosMessages.filter((item) => item.sosId === request.id),
        }
        break
      }
      case F.sosSend: {
        const request = sosRequests.find((item) => item.id === params.sosId)
        if (!request) throw new Error('dev bridge: sos not found')
        if (request.status !== 'accepted')
          throw Object.assign(new Error('dev bridge: not accepted'), {
            type: FAILFAIR_ERRORS.inProgress,
          })
        const message: SosMessage = {
          id: `sosm-dev-${sosMessages.length + 1}`,
          sosId: request.id,
          senderManagerId: String(data.managerId),
          role:
            request.studentManagerId === String(data.managerId)
              ? 'student'
              : 'senior',
          text: String(params.text),
          createdAt: Date.now(),
        }
        sosMessages.push(message)
        result = { message }
        break
      }
      case F.sosList:
        result = {
          requests: sosRequests.filter((request) =>
            params.role === 'senior'
              ? request.seniorManagerId === data.managerId
              : request.studentManagerId === data.managerId
          ),
        }
        break
      case F.sosRespond: {
        const request = sosRequests.find((item) => item.id === params.sosId)
        if (!request) throw new Error('dev bridge: sos not found')
        if (request.status === 'pending') {
          request.status = params.status as SosRequest['status']
          request.respondedAt = Date.now()
        }
        result = { request, notified: false, directChat: false }
        break
      }
      case F.getModel:
        result = devModel
        break
      case F.setModel:
        devModel =
          params.provider === 'gemini'
            ? {
                provider: 'gemini',
                source: 'record',
                model: String(params.model || 'gemini-3.1-flash-lite'),
              }
            : { provider: 'rule', source: 'none' }
        result = devModel
        break
      default:
        throw new Error(`dev bridge: unknown function ${name}`)
    }
    return result as T
  }

  window.ChannelIOWam = { ...common, callFunction } as ChannelIOWam
}

/**
 * 로컬 Worker를 부르는 callFunction. 채널톡 호스트가 하는 일(서명, context 주입)을 흉내 낸다.
 * 서명 키는 로컬 .dev.vars의 SIGNING_KEY와 같아야 한다. 기본값은 이 레포의 로컬 기본값("11"×32)이고
 * `VITE_DEV_SIGNING_KEY`로 바꿀 수 있다. 실서버 키는 절대 여기 두지 않는다.
 */
function createServerCall(data: Record<string, unknown>) {
  const keyHex: string = import.meta.env.VITE_DEV_SIGNING_KEY ?? '11'.repeat(32)
  const keyBytes = Uint8Array.from(keyHex.match(/.{1,2}/g) ?? [], (pair) =>
    parseInt(pair, 16)
  )
  const key = crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  return async <T>({ name, params }: CallFunctionArgs): Promise<T> => {
    const body = JSON.stringify({
      method: name,
      params,
      context: {
        caller: { type: 'manager', id: String(data.managerId) },
        channel: { id: String(data.channelId) },
      },
    })
    const signature = await crypto.subtle.sign(
      'HMAC',
      await key,
      new TextEncoder().encode(body)
    )
    const response = await fetch('/functions/v1', {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        'x-signature': btoa(String.fromCharCode(...new Uint8Array(signature))),
      },
      body,
    })
    if (!response.ok)
      throw new Error(
        `로컬 Worker 응답 ${response.status}. 'pnpm dev:cloudflare'가 8787에서 떠 있는지 확인해 주세요.`
      )
    const json = (await response.json()) as {
      result?: T
      error?: { type?: string; message?: string; data?: unknown }
    }
    if (json.error)
      throw Object.assign(
        new Error(json.error.message ?? '요청이 거부됐어요'),
        {
          type: json.error.type,
          data: json.error.data,
        }
      )
    return json.result as T
  }
}
