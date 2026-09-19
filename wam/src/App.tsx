import { useCallback, useEffect, useRef, useState } from 'react'
import {
  EmptyState,
  ErrorPage,
  HeightSynchronizer,
  WamHeader,
  WamThemeProvider,
} from '@channel.io/app-sdk-wam-ui'
import { useWamClose, useWamSize } from '@channel.io/app-sdk-wam'
import { ChatBubbleAltIcon, FolderOffIcon } from '@channel.io/bezier-icons'
import { Button, HStack, Text, VStack } from '@channel.io/bezier-react/beta'
import type {
  ActionCandidate,
  Case,
  CaseSubmission,
  Category,
  Major,
  SessionState,
  SessionView,
  Situation,
  SosRequest,
} from '@tutorial/shared'

import ErrorNotice from './components/failfair/ErrorNotice'
import SosBox from './components/failfair/SosBox'
import StepProgress from './components/failfair/StepProgress'
import { newRequestId, useFailfairApi } from './hooks/useFailfairApi'
import { useFailfairWamData } from './hooks/useFailfairWamData'
import CaseDetailPage from './pages/Failfair/CaseDetail'
import CategoryPage from './pages/Failfair/Category'
import ChatPage from './pages/Failfair/Chat'
import ComparePage from './pages/Failfair/Compare'
import SituationReviewPage from './pages/Failfair/SituationReview'
import ReviewPage from './pages/Senior/Review'
import ModelSettingsPage from './pages/Admin/ModelSettings'
import SeniorInputPage from './pages/Senior/SeniorInput'
import SosInboxPage from './pages/Senior/SosInbox'
import { resolveError, type FailfairError } from './utils/failfairError'
import DemoVoice from './components/failfair/DemoVoice'

const WAM_WIDTH = 560
const WAM_MAX_HEIGHT = 720
const demoParams = new URLSearchParams(window.location.search)
const SHOW_DEMO_VOICE =
  import.meta.env.DEV ||
  demoParams.get('bridge') === 'server' ||
  demoParams.get('demoVoice') === '1'

/**
 * v2 §3.1 2단계 "현재 정보로 계속하기".
 * 서버는 `COLLECTING` 상태에서 `confirmSituation`을 거절하므로, 남은 질문을
 * 건너뛰는 답을 보내 상태를 `REVIEWING_SITUATION`까지 밀어 준다. 이 문구는
 * 서버의 건너뛰기 판정(`SKIP_PATTERN`)에 걸리도록 "건너"를 포함한다.
 * 서버에 일괄 건너뛰기 Function이 생기면 이 반복은 그 호출 하나로 바뀐다.
 */
const SKIP_TEXT = '남은 질문은 건너뛸게요'
/** 서버 `MAX_QUESTIONS`와 같은 상한. 더 돌지 않도록 막는 안전장치다. */
const MAX_SKIPS = 3

type StudentStep = 'category' | 'chat' | 'situation' | 'compare' | 'case'
type Screen =
  | { kind: 'home' }
  | { kind: 'student'; step: StudentStep }
  | { kind: 'senior'; tab: 'input' | 'review' | 'sos' }
  | { kind: 'admin' }

const TITLES: Record<StudentStep, string> = {
  category: '어떤 고민이에요?',
  chat: '고민 대화',
  situation: '상황 직접 고치기',
  compare: '행동별 선배 사례',
  case: '사례 상세',
}

/**
 * 대화 화면은 수집·상황 확인·행동 고르기를 한 화면에서 잇는다.
 * 제목과 진행 표시는 세션 상태를 따라간다.
 */
const CHAT_TITLES: Record<SessionState, string> = {
  COLLECTING: '고민 대화',
  REVIEWING_SITUATION: '상황 확인',
  REVIEWING_ACTIONS: '행동 고르기',
  MATCHING: '행동 고르기',
  RESULTS: '행동 다시 고르기',
}

const CHAT_STEP_INDEX: Record<SessionState, number> = {
  COLLECTING: 2,
  REVIEWING_SITUATION: 3,
  REVIEWING_ACTIONS: 4,
  MATCHING: 4,
  RESULTS: 4,
}

/** 진행 표시에서 각 화면이 몇 번째 단계인지. 사례 상세는 비교와 같은 단계로 본다. */
const STEP_INDEX: Record<Exclude<StudentStep, 'chat'>, number> = {
  category: 1,
  situation: 3,
  compare: 5,
  case: 5,
}

function App() {
  const { close } = useWamClose()
  const { setSize } = useWamSize()
  const { data, error: dataError } = useFailfairWamData()
  const api = useFailfairApi(data?.appId ?? '')

  const [screen, setScreen] = useState<Screen>({ kind: 'home' })
  const [session, setSession] = useState<SessionView | null>(null)
  const [notice, setNotice] = useState('')
  const [caseDetail, setCaseDetail] = useState<Case | null>(null)
  const [activeResultId, setActiveResultId] = useState<string | null>(null)
  const [contactable, setContactable] = useState(false)
  /** 이 대화에서 가장 최근에 보낸(끝나지 않은) SOS. 결과 화면 맨 위 상자가 보여 준다. */
  const [sos, setSos] = useState<SosRequest | null>(null)
  /** 지금 열어 둔 사례의 선배에게 보낸 SOS. 사례 상세 상자가 보여 준다. */
  const [caseSos, setCaseSos] = useState<SosRequest | null>(null)
  const [sosNotified, setSosNotified] = useState<boolean | null>(null)
  const [sosDirect, setSosDirect] = useState<boolean | null>(null)
  /** 첫 화면에서 보여 줄, 나에게 온 대기 중 SOS 수. 못 읽으면 null. */
  const [inboxCount, setInboxCount] = useState<number | null>(null)
  const [helpfulIds, setHelpfulIds] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<FailfairError | null>(null)
  /**
   * 서버까지 가지 못한 내 메시지들의 `at`. 말풍선마다 "다시 보내기"를 붙인다.
   *
   * 메시지 하나로 뭉뚱그리면, A가 실패한 뒤 B를 보내 성공했을 때 A의 실패
   * 표시까지 지워져서 화면에는 둘 다 정상으로 보이는데 서버는 B만 받은
   * 상태가 된다. 그래서 메시지별로 따로 들고 있는다.
   */
  const [failedAts, setFailedAts] = useState<ReadonlySet<number>>(new Set())
  /** 비교 중일 때 스켈레톤 카드 수를 맞추기 위한 값 */
  const [comparingCount, setComparingCount] = useState(0)
  /** 첫 화면에서 고른 전공. 세션 시작부터 상황에 실어 보낸다. */
  const [major, setMajor] = useState<Major | undefined>(undefined)

  // 화면이 바뀌면 본문 스크롤을 처음 볼 자리로 돌린다. 앞 화면의 위치가 남아
  // 있으면 새 화면이 중간부터 보여서 무엇을 보는지 알기 어렵다.
  const scrollRef = useRef<HTMLDivElement | null>(null)

  /**
   * 항상 최신 세션을 들고 있는 ref.
   *
   * 호출 task는 `id`와 `revision`을 여기에서 읽는다. 클로저에 박아 두면
   * STALE_SESSION으로 세션을 다시 받아 온 뒤에도 "다시 시도"가 옛 revision을
   * 그대로 보내 같은 오류가 끝없이 반복된다 (v2 §10).
   */
  const sessionRef = useRef<SessionView | null>(null)

  /** 말풍선별 requestId. 같은 말풍선의 재전송은 같은 값을 쓴다. */
  const requestIds = useRef(new Map<number, string>())

  // 마지막으로 실패한 호출. 오류 배너의 "다시 시도"가 그대로 다시 부른다.
  const lastTask = useRef<(() => Promise<void>) | null>(null)
  const lastFallback = useRef('')
  const lastOnFail = useRef<(() => void) | undefined>(undefined)

  useEffect(() => {
    setSize({ width: WAM_WIDTH, height: WAM_MAX_HEIGHT })
  }, [setSize])

  // 렌더가 끝난 뒤에 맞춘다. "다시 시도"는 사용자가 누르는 것이라 언제나
  // 이 효과가 돈 다음에 실행된다.
  useEffect(() => {
    sessionRef.current = session
  }, [session])

  useEffect(() => {
    const body = scrollRef.current
    if (!body) return
    // 대화는 마지막 말풍선과 입력창이 보이도록 아래로, 나머지 화면은 위로.
    // 부모인 이 효과가 ChatPage의 효과보다 나중에 돌기 때문에, 여기서 무조건
    // 위로 돌리면 대화로 돌아올 때마다 입력창이 화면 밖으로 밀렸다.
    const chat = screen.kind === 'student' && screen.step === 'chat'
    body.scrollTo({ top: chat ? body.scrollHeight : 0 })
  }, [screen])

  useEffect(() => {
    if (!data?.mode) return
    setScreen(
      data.mode === 'senior'
        ? { kind: 'senior', tab: 'input' }
        : { kind: 'student', step: 'category' }
    )
  }, [data?.mode])

  // 첫 화면에 설 때마다 나에게 온 SOS를 센다. 선배가 앱을 열자마자 요청을 알아채게.
  useEffect(() => {
    if (screen.kind !== 'home' || !data) return
    let cancelled = false
    api
      .sosList('senior')
      .then(({ requests }) => {
        if (cancelled) return
        setInboxCount(
          requests.filter((request) => request.status === 'pending').length
        )
      })
      .catch(() => {
        if (!cancelled) setInboxCount(null)
      })
    return () => {
      cancelled = true
    }
  }, [api, data, screen.kind])

  const run = useCallback(
    async (
      task: () => Promise<void>,
      fallback: string,
      onFail?: () => void
    ) => {
      lastTask.current = task
      lastFallback.current = fallback
      lastOnFail.current = onFail
      setBusy(true)
      setError(null)
      try {
        await task()
      } catch (cause) {
        const resolved = resolveError(cause, fallback)
        setError(resolved)
        onFail?.()
        // 버전이 밀린 경우에만 최신 상태로 되맞춘다 (v2 §10 STALE_SESSION).
        const current = sessionRef.current
        if (resolved.code === 'STALE_SESSION' && current) {
          try {
            const fresh = await api.getSession(current.id)
            // 서버에 아직 없는 로컬 학생 말풍선은 최신화 뒤에도 남겨 둔다.
            // requestIds에 남아 있다는 것은 아직 성공 응답을 받지 못했다는 뜻이다.
            const pending = current.messages.filter(
              (message) =>
                message.role === 'student' &&
                requestIds.current.has(message.at) &&
                !fresh.messages.some(
                  (saved) =>
                    saved.role === message.role && saved.at === message.at
                )
            )
            const recovered = {
              ...fresh,
              messages: [...fresh.messages, ...pending],
            }
            sessionRef.current = recovered
            setSession(recovered)
          } catch {
            // 조회도 실패하면 위 안내만 남긴다.
          }
        }
      } finally {
        setBusy(false)
      }
    },
    [api]
  )

  /** 실패한 호출을 그대로 한 번 더. task가 최신 revision을 다시 읽어 간다. */
  const retry = () => {
    const task = lastTask.current
    if (!task || busy) return
    void run(task, lastFallback.current, lastOnFail.current)
  }

  // ---------------------------------------------------------------- 학생 흐름

  const start = (category: Category) =>
    void run(async () => {
      const started = await api.start(category)
      setSession({
        id: started.sessionId,
        category,
        state: started.state,
        revision: started.revision,
        messages: [
          {
            role: 'assistant',
            content: started.assistantMessage,
            at: Date.now(),
          },
        ],
        situation: {
          category,
          major,
          situation: '',
          goal: '',
          deadline: { raw: '', urgency: 'unknown' },
          progress: '',
          constraints: [],
          attemptedActions: [],
          consideredActions: [],
          unknowns: [],
        },
        actions: [],
        results: [],
      })
      setHelpfulIds(new Set())
      setFailedAts(new Set())
      setScreen({ kind: 'student', step: 'chat' })
    }, '대화를 시작하지 못했어요.')

  const mark = (at: number, failed: boolean) =>
    setFailedAts((current) => {
      if (current.has(at) === failed) return current
      const next = new Set(current)
      if (failed) next.add(at)
      else next.delete(at)
      return next
    })

  /**
   * 말풍선 하나를 서버로 보낸다. `at`은 그 말풍선의 식별자이자 실패 표시의 키다.
   *
   * `requestId`는 이 말풍선에 한 번만 만들어 두고 재전송에도 그대로 쓴다.
   * 서버가 이미 처리했는데 응답만 유실된 경우 중복으로 한 번 더 처리되지 않고
   * 저장된 응답을 되찾는다.
   */
  const deliver = (text: string, at: number) => {
    // 말풍선(at)당 하나로 고정한다. `resend`로 다시 불려도 같은 값을 써야
    // 서버가 이미 처리한 요청을 한 번 더 실행하지 않는다.
    const existing = requestIds.current.get(at)
    const requestId = existing ?? newRequestId()
    if (!existing) requestIds.current.set(at, requestId)
    void run(
      async () => {
        const live = sessionRef.current
        if (!live) return
        const replied = await api.reply(live.id, live.revision, text, requestId)
        requestIds.current.delete(at)
        mark(at, false)
        setSession((current) =>
          current
            ? {
                ...current,
                state: replied.state,
                revision: replied.revision,
                situation: replied.situation,
                messages: [
                  ...current.messages,
                  {
                    role: 'assistant',
                    content: replied.assistantMessage,
                    at: at + 1,
                  },
                ],
              }
            : current
        )
      },
      '메시지를 보내지 못했어요.',
      () => mark(at, true)
    )
  }

  const send = (text: string) => {
    if (!session) return
    const now = Date.now()
    setSession({
      ...session,
      messages: [
        ...session.messages,
        { role: 'student', content: text, at: now },
      ],
    })
    deliver(text, now)
  }

  /** 실패한 말풍선을 같은 자리에서 한 번 더 보낸다. 새로 쌓지 않는다. */
  const resend = (at: number) => {
    const text = session?.messages.find(
      (message) => message.at === at && message.role === 'student'
    )?.content
    if (!text) return
    deliver(text, at)
  }

  /** 남은 질문을 한 번에 건너뛰고 서버의 정리 말풍선을 받는다. */
  const skipRemaining = () => {
    if (!sessionRef.current) return
    // 회차마다 고정된 requestId. 재시도해도 같은 값을 써서, 서버가 이미 처리한
    // 회차는 저장된 응답으로 되돌아오고 중복으로 한 번 더 건너뛰지 않는다.
    const skipRequestIds = Array.from({ length: MAX_SKIPS }, () =>
      newRequestId()
    )
    void run(async () => {
      let current = sessionRef.current
      if (!current) return
      // 남은 질문 수만큼 답을 보내지만 대화에는 한 쌍만 남긴다. 중간 질문은
      // 이미 건너뛴 것이라 그대로 쌓으면 같은 문구가 세 번 이어져 보인다.
      const before = current.messages
      const at = Date.now()
      const studentMessage = {
        role: 'student' as const,
        content: SKIP_TEXT,
        at,
      }
      // 일반 보내기와 같은 순서로 학생 말풍선을 먼저 그려 음성도 먼저 읽는다.
      setSession({
        ...current,
        messages: [...before, studentMessage],
      })
      for (let attempt = 0; attempt < MAX_SKIPS; attempt += 1) {
        const replied = await api.reply(
          current.id,
          current.revision,
          SKIP_TEXT,
          skipRequestIds[attempt]
        )
        current = {
          ...current,
          state: replied.state,
          revision: replied.revision,
          situation: replied.situation,
          messages: [
            ...before,
            studentMessage,
            {
              role: 'assistant',
              content: replied.assistantMessage,
              at: at + 1,
            },
          ],
        }
        if (current.state !== 'COLLECTING') break
      }
      // 중간 건너뛰기 질문은 화면과 음성에 쌓지 않고 최종 답변만 반영한다.
      // 정리 말풍선과 「맞아요」가 같은 대화 화면에 나오므로 화면은 옮기지 않는다.
      sessionRef.current = current
      setSession(current)
    }, '건너뛰지 못했어요.')
  }

  const confirmSituation = (situation: Situation) => {
    if (!sessionRef.current) return
    const requestId = newRequestId()
    void run(async () => {
      const live = sessionRef.current
      if (!live) return
      const confirmed = await api.confirmSituation(
        live.id,
        live.revision,
        situation,
        requestId
      )
      setSession({
        ...live,
        state: confirmed.state,
        revision: confirmed.revision,
        situation: confirmed.situation,
        actions: confirmed.actions,
        results: [],
      })
      setScreen({ kind: 'student', step: 'chat' })
    }, '상황을 저장하지 못했어요.')
  }

  const compare = (actions: ActionCandidate[]) => {
    const opened = sessionRef.current
    if (!opened) return
    // 검색은 몇 초 걸린다. 결과 화면으로 먼저 옮겨 스켈레톤을 보여 준다.
    setComparingCount(actions.length)
    setNotice('')
    sessionRef.current = { ...opened, actions, results: [] }
    setSession(sessionRef.current)
    setScreen({ kind: 'student', step: 'compare' })
    const requestId = newRequestId()
    void run(async () => {
      const current = sessionRef.current
      if (!current) return
      const compared = await api.compare(
        current.id,
        current.revision,
        actions,
        requestId
      )
      setSession({
        ...current,
        state: compared.state,
        revision: compared.revision,
        actions,
        results: compared.results,
      })
      setNotice(compared.notice)
      // 결과 위 SOS 상자: 이미 보낸(끝나지 않은) 요청이 있으면 그 상태를 이어서 보여 준다.
      try {
        const { requests } = await api.sosList('student')
        setSos(
          requests.find((request) => request.status !== 'declined') ?? null
        )
      } catch {
        // 못 읽어도 새 요청은 보낼 수 있다.
      }
    }, '사례를 찾지 못했어요.')
  }

  const openCase = (caseId: string, resultId: string) => {
    if (!sessionRef.current) return
    void run(async () => {
      const live = sessionRef.current
      if (!live) return
      const { case: item, contactable: canSos } = await api.getCase(
        live.id,
        caseId
      )
      setCaseDetail(item)
      setActiveResultId(resultId)
      setContactable(Boolean(canSos))
      setCaseSos(null)
      setScreen({ kind: 'student', step: 'case' })
      if (canSos) {
        try {
          const { requests } = await api.sosList('student')
          setCaseSos(
            requests.find(
              (request) =>
                request.caseId === item.id && request.status !== 'declined'
            ) ?? null
          )
        } catch {
          // 이전 요청 조회가 실패해도 새 요청은 보낼 수 있다.
        }
      }
    }, '사례를 열지 못했어요.')
  }

  const helpful = (resultId: string) => {
    if (!session) return
    setHelpfulIds((current) => new Set(current).add(resultId))
    void api.feedback(session.id, resultId, 'helpful').catch(() => undefined)
  }

  const toolCopied = () => {
    if (!session || !activeResultId) return
    void api
      .feedback(session.id, activeResultId, 'tool_copied')
      .catch(() => undefined)
  }

  /**
   * SOS를 보낸다. `caseId`가 있으면 그 사례의 선배에게, 없으면 서버가 결과에 연결된
   * 연락 가능한 선배(없으면 같은 분야의 선배)를 골라 준다.
   */
  const sendSos = (message: string, caseId?: string) => {
    if (!session) return
    // 전송마다 한 번만 만들고 "다시 시도"에도 그대로 쓴다. 응답만 잃은 요청이 새 SOS로 늘지 않는다.
    const requestId = newRequestId()
    void run(async () => {
      const { request, notified, directChat } = await api.sosRequest(
        session.id,
        caseId,
        message,
        data?.chatToken ?? '',
        requestId
      )
      setSos(request)
      if (caseDetail && request.caseId === caseDetail.id) setCaseSos(request)
      setSosNotified(notified)
      setSosDirect(directChat)
    }, 'SOS를 보내지 못했어요.')
  }

  /** 스레드 폴링이나 새로고침으로 알게 된 최신 요청을 두 상자에 반영한다. */
  const applySos = useCallback((request: SosRequest) => {
    setSos((current) =>
      current && current.id === request.id ? request : current
    )
    setCaseSos((current) =>
      current && current.id === request.id ? request : current
    )
  }, [])

  const refreshSos = () => {
    void run(async () => {
      const { requests } = await api.sosList('student')
      const latest =
        requests.find((request) => request.status !== 'declined') ??
        requests[0] ??
        null
      setSos(latest)
      if (caseDetail)
        setCaseSos(
          requests.find((request) => request.caseId === caseDetail.id) ?? null
        )
    }, 'SOS 상태를 불러오지 못했어요.')
  }

  /** 두 SOS 상자가 같은 값을 쓴다. */
  const sosBoxCommon = {
    busy,
    notified: sosNotified,
    directChat: sosDirect,
    currentChatId: data?.chatId ?? '',
    me: data?.managerId ?? '',
    onRefresh: refreshSos,
    onRequestChange: applySos,
    loadThread: api.sosThread,
    sendMessage: api.sosSend,
  }

  /** 결과 화면 SOS 폼의 기본 문구: 확인된 상황 한 줄 + 마감. */
  const sosDefaultMessage = session
    ? [
        session.situation.situation,
        session.situation.deadline.raw &&
          `마감: ${session.situation.deadline.raw}`,
      ]
        .filter(Boolean)
        .join(' · ')
        .slice(0, 400)
    : ''

  const restart = () => {
    sessionRef.current = null
    // 죽은 세션을 겨냥한 "다시 시도"가 남지 않도록 같이 비운다.
    lastTask.current = null
    lastOnFail.current = undefined
    requestIds.current.clear()
    setSession(null)
    setCaseDetail(null)
    setContactable(false)
    setSos(null)
    setCaseSos(null)
    setSosNotified(null)
    setSosDirect(null)
    setNotice('')
    setError(null)
    setFailedAts(new Set())
    setComparingCount(0)
    setScreen({ kind: 'student', step: 'category' })
  }

  // ---------------------------------------------------------------- 선배 흐름

  const submitCase = async (input: CaseSubmission) => {
    await api.submitCase(input)
  }

  const listSeniorSos = useCallback(() => api.sosList('senior'), [api])

  // ---------------------------------------------------------------- 내비게이션

  const back = () => {
    setError(null)
    if (screen.kind === 'senior') {
      setScreen(
        screen.tab === 'input'
          ? { kind: 'home' }
          : { kind: 'senior', tab: 'input' }
      )
      return
    }
    if (screen.kind === 'admin') {
      setScreen({ kind: 'home' })
      return
    }
    if (screen.kind !== 'student') return
    // 결과를 본 뒤 행동을 다시 고르러 대화로 돌아온 경우에는 결과로 되돌린다.
    const revisiting =
      session?.state === 'RESULTS' && (session?.results.length ?? 0) > 0
    const previous: Partial<Record<StudentStep, Screen>> = {
      category: { kind: 'home' },
      chat: revisiting
        ? { kind: 'student', step: 'compare' }
        : { kind: 'student', step: 'category' },
      situation: { kind: 'student', step: 'chat' },
      compare: { kind: 'student', step: 'chat' },
      case: { kind: 'student', step: 'compare' },
    }
    setScreen(previous[screen.step] ?? { kind: 'home' })
  }

  /**
   * 서버 `failfair.start`는 아직 전공을 받지 않는다. 그래서 세션의 상황에는
   * 전공이 비어 있고, 화면에 넘길 때 프런트가 고른 값을 얹어 준다.
   * 확인 단계에서 이 객체가 그대로 저장되므로 그 뒤로는 서버 값이 기준이 된다.
   * (B가 `start` 입력에 전공을 추가하면 이 보정은 지워도 된다.)
   */
  const situationWithMajor = (source: Situation): Situation => ({
    ...source,
    major: source.major ?? major,
  })

  /** 세션이 사라진 화면에서 공통으로 쓰는 안내. 막다른 길을 만들지 않는다. */
  const sessionGone = (
    <EmptyState
      icon={ChatBubbleAltIcon}
      title="이어 갈 대화가 없어요"
      description="대화가 닫혔거나 아직 시작하지 않았어요. 카테고리부터 다시 고르면 바로 이어서 할 수 있어요."
      action={
        <Button
          size="m"
          variant="filled"
          semantic="primary"
          label="처음부터 시작"
          onClick={restart}
        />
      }
    />
  )

  const title =
    screen.kind === 'home'
      ? '망한 선배 박람회'
      : screen.kind === 'senior'
        ? screen.tab === 'input'
          ? '선배: 실패 사례 남기기'
          : screen.tab === 'review'
            ? '사례 검수'
            : 'SOS 요청'
        : screen.kind === 'admin'
          ? '모델 설정'
          : screen.step === 'chat' && session
            ? CHAT_TITLES[session.state]
            : TITLES[screen.step]

  let body: JSX.Element
  if (dataError) {
    body = <ErrorPage error={dataError} />
  } else if (screen.kind === 'home') {
    body = (
      <VStack spacing={16}>
        <VStack spacing={4}>
          <Text
            as="p"
            typo="24"
            bold
            className="ff-display"
          >
            망해본 선배를 전시합니다 ⚰️
          </Text>
          <Text
            as="p"
            typo="13"
            color="text-neutral-light"
          >
            지금 상황에서 그 행동을 했던 선배에게 실제로 무슨 일이 있었는지
            봅니다.
          </Text>
        </VStack>
        <VStack spacing={10}>
          <button
            type="button"
            className="ff-big ff-big-primary"
            onClick={() => setScreen({ kind: 'student', step: 'category' })}
          >
            <Text
              as="span"
              typo="16"
              bold
            >
              🙋 학생이에요, 지금 고민이 있어요
            </Text>
            <Text
              as="span"
              typo="13"
              color="text-neutral-light"
            >
              대화로 상황을 정리하고, 내가 고려하는 행동마다 실제 선배에게 무슨
              일이 있었는지 봐요.
            </Text>
            <Text
              as="span"
              typo="12"
              color="text-neutral-lighter"
            >
              적은 내용은 이 대화 안에서만 쓰여요.
            </Text>
          </button>
          <button
            type="button"
            className="ff-big"
            onClick={() => setScreen({ kind: 'senior', tab: 'input' })}
          >
            <Text
              as="span"
              typo="16"
              bold
            >
              🙀 선배예요, 망했던 기록을 남길게요
            </Text>
            <Text
              as="span"
              typo="13"
              color="text-neutral-light"
            >
              그때 상황, 실제로 한 행동, 결과와 비용, 다음 사람이 쓸 도구를
              남겨요.
            </Text>
            <Text
              as="span"
              typo="12"
              color="text-neutral-lighter"
            >
              등록한 사례는 검수를 거쳐 다른 학생에게 보여질 수 있어요.
            </Text>
          </button>
          <button
            type="button"
            className={inboxCount ? 'ff-big ff-big-sos' : 'ff-big'}
            onClick={() => setScreen({ kind: 'senior', tab: 'sos' })}
          >
            <Text
              as="span"
              typo="16"
              bold
            >
              🆘 나에게 온 SOS
              {inboxCount ? ` · 답 기다리는 중 ${inboxCount}건` : ''}
            </Text>
            <Text
              as="span"
              typo="13"
              color="text-neutral-light"
            >
              내 사례를 본 새내기가 보낸 SOS를 수락하고, 앱 안에서 바로
              대화해요.
            </Text>
          </button>
          <HStack justify="end">
            <Button
              size="xs"
              variant="ghost"
              semantic="secondary"
              label="모델 설정"
              onClick={() => setScreen({ kind: 'admin' })}
            />
          </HStack>
        </VStack>
        <Text
          as="p"
          typo="12"
          color="text-neutral-lighter"
        >
          어느 쪽이든 실명이나 상대 이름은 적지 않아도 돼요.
        </Text>
      </VStack>
    )
  } else if (screen.kind === 'admin') {
    body = (
      <ModelSettingsPage
        getModel={api.getModel}
        setModel={api.setModel}
      />
    )
  } else if (screen.kind === 'senior') {
    body =
      screen.tab === 'input' ? (
        <SeniorInputPage
          onSubmit={submitCase}
          onOpenReview={() => setScreen({ kind: 'senior', tab: 'review' })}
        />
      ) : screen.tab === 'review' ? (
        <ReviewPage
          listCases={api.listCases}
          reviewCase={api.reviewCase}
        />
      ) : (
        <SosInboxPage
          listRequests={listSeniorSos}
          respond={api.sosRespond}
          loadThread={api.sosThread}
          sendMessage={api.sosSend}
          me={data?.managerId ?? ''}
          currentChatId={data?.chatId ?? ''}
        />
      )
  } else {
    switch (screen.step) {
      case 'category':
        body = (
          <CategoryPage
            busy={busy}
            major={major}
            onMajorChange={setMajor}
            onPick={start}
          />
        )
        break
      case 'chat':
        body = session ? (
          <ChatPage
            category={session.category}
            messages={session.messages}
            state={session.state}
            situation={session.situation}
            actions={session.actions}
            hasResults={session.results.length > 0}
            revision={session.revision}
            busy={busy}
            failedAts={failedAts}
            onSend={send}
            onResend={resend}
            onSkipRemaining={skipRemaining}
            onConfirmSituation={() =>
              confirmSituation(situationWithMajor(session.situation))
            }
            onEditSituation={() =>
              setScreen({ kind: 'student', step: 'situation' })
            }
            onCompare={compare}
          />
        ) : (
          sessionGone
        )
        break
      case 'situation':
        body = session ? (
          <SituationReviewPage
            key={session.revision}
            situation={situationWithMajor(session.situation)}
            busy={busy}
            onConfirm={confirmSituation}
            onBack={() => setScreen({ kind: 'student', step: 'chat' })}
          />
        ) : (
          sessionGone
        )
        break
      case 'compare':
        body = session ? (
          <ComparePage
            situation={situationWithMajor(session.situation)}
            results={session.results}
            notice={notice}
            busy={busy}
            comparingCount={comparingCount}
            failed={Boolean(error)}
            helpfulIds={helpfulIds}
            sosSlot={
              <SosBox
                key={sos?.id ?? 'new'}
                request={sos}
                defaultMessage={sosDefaultMessage}
                onSend={(message) => sendSos(message)}
                {...sosBoxCommon}
              />
            }
            onOpenCase={openCase}
            onHelpful={helpful}
            onEditActions={() => setScreen({ kind: 'student', step: 'chat' })}
            onEditSituation={() => setScreen({ kind: 'student', step: 'chat' })}
            onRestart={restart}
          />
        ) : (
          sessionGone
        )
        break
      case 'case':
        body = caseDetail ? (
          <CaseDetailPage
            item={caseDetail}
            onToolCopied={toolCopied}
            sosSlot={
              contactable || caseSos ? (
                <SosBox
                  key={caseSos?.id ?? 'new'}
                  request={caseSos}
                  targetTitle={caseDetail.title}
                  defaultMessage={sosDefaultMessage}
                  onSend={(message) => sendSos(message, caseDetail.id)}
                  {...sosBoxCommon}
                />
              ) : undefined
            }
          />
        ) : (
          <EmptyState
            icon={FolderOffIcon}
            title="사례를 열지 못했어요"
            description="검수에서 내려간 사례일 수 있어요. 비교 화면으로 돌아가 다른 사례를 열어 보세요."
            action={
              <Button
                size="m"
                variant="filled"
                semantic="primary"
                label="비교 화면으로"
                onClick={() => setScreen({ kind: 'student', step: 'compare' })}
              />
            }
          />
        )
        break
    }
  }

  return (
    <WamThemeProvider>
      <HeightSynchronizer maxHeight={WAM_MAX_HEIGHT}>
        <WamHeader
          title={title}
          showBackButton={screen.kind !== 'home'}
          onBack={back}
          onClose={close}
          rightContent={
            screen.kind === 'student' && session ? (
              <Button
                size="xs"
                variant="ghost"
                semantic="secondary"
                label="처음부터"
                onClick={restart}
              />
            ) : screen.kind === 'senior' ? (
              <HStack spacing={4}>
                {screen.tab !== 'review' && (
                  <Button
                    size="xs"
                    variant="ghost"
                    semantic="secondary"
                    label="검수 목록"
                    onClick={() => setScreen({ kind: 'senior', tab: 'review' })}
                  />
                )}
                {screen.tab !== 'sos' && (
                  <Button
                    size="xs"
                    variant="ghost"
                    semantic="secondary"
                    label="SOS 요청"
                    onClick={() => setScreen({ kind: 'senior', tab: 'sos' })}
                  />
                )}
              </HStack>
            ) : undefined
          }
        />
        {screen.kind === 'student' && (
          <StepProgress
            current={
              screen.step === 'chat'
                ? CHAT_STEP_INDEX[session?.state ?? 'COLLECTING']
                : STEP_INDEX[screen.step]
            }
          />
        )}
        <div
          className="ff-scroll"
          ref={scrollRef}
        >
          {SHOW_DEMO_VOICE && session && screen.kind === 'student' && (
            <DemoVoice
              key={session.id}
              messages={session.messages}
            />
          )}
          {error && (
            <ErrorNotice
              error={error}
              busy={busy}
              onRetry={retry}
              onRestart={restart}
              onDismiss={() => setError(null)}
            />
          )}
          {body}
        </div>
      </HeightSynchronizer>
    </WamThemeProvider>
  )
}

export default App
