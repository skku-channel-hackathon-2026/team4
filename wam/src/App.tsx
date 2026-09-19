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
  SessionView,
  Situation,
  SosRequest,
} from '@tutorial/shared'

import ErrorNotice from './components/failfair/ErrorNotice'
import SosBox from './components/failfair/SosBox'
import StepProgress from './components/failfair/StepProgress'
import { newRequestId, useFailfairApi } from './hooks/useFailfairApi'
import { useFailfairWamData } from './hooks/useFailfairWamData'
import ActionsReviewPage from './pages/Failfair/ActionsReview'
import CaseDetailPage from './pages/Failfair/CaseDetail'
import CategoryPage from './pages/Failfair/Category'
import ChatPage from './pages/Failfair/Chat'
import ComparePage from './pages/Failfair/Compare'
import SituationReviewPage from './pages/Failfair/SituationReview'
import ReviewPage from './pages/Senior/Review'
import SeniorInputPage from './pages/Senior/SeniorInput'
import SosInboxPage from './pages/Senior/SosInbox'
import { resolveError, type FailfairError } from './utils/failfairError'

const WAM_WIDTH = 560
const WAM_MAX_HEIGHT = 720

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

type StudentStep =
  'category' | 'chat' | 'situation' | 'actions' | 'compare' | 'case'
type Screen =
  | { kind: 'home' }
  | { kind: 'student'; step: StudentStep }
  | { kind: 'senior'; tab: 'input' | 'review' | 'sos' }

const TITLES: Record<StudentStep, string> = {
  category: '어떤 고민이에요?',
  chat: '고민 대화',
  situation: '상황 확인',
  actions: '행동 확인',
  compare: '행동별 선배 사례',
  case: '사례 상세',
}

/** 진행 표시에서 각 화면이 몇 번째 단계인지. 사례 상세는 비교와 같은 단계로 본다. */
const STEP_INDEX: Record<StudentStep, number> = {
  category: 1,
  chat: 2,
  situation: 3,
  actions: 4,
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
  const [sos, setSos] = useState<SosRequest | null>(null)
  const [sosNotified, setSosNotified] = useState<boolean | null>(null)
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
            sessionRef.current = fresh
            setSession(fresh)
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
    const requestId = newRequestId()
    void run(
      async () => {
        const live = sessionRef.current
        if (!live) return
        const replied = await api.reply(live.id, live.revision, text, requestId)
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

  /** 남은 질문을 한 번에 건너뛰고 상황 확인으로 넘어간다. */
  const skipRemaining = () => {
    if (!sessionRef.current) return
    // 회차마다 고정된 requestId. 재시도해도 같은 값을 써서, 서버가 이미 처리한
    // 회차는 저장된 응답으로 되돌아오고 중복으로 한 번 더 건너뛰지 않는다.
    const requestIds = Array.from({ length: MAX_SKIPS }, () => newRequestId())
    void run(async () => {
      let current = sessionRef.current
      if (!current) return
      // 남은 질문 수만큼 답을 보내지만 대화에는 한 쌍만 남긴다. 중간 질문은
      // 이미 건너뛴 것이라 그대로 쌓으면 같은 문구가 세 번 이어져 보인다.
      const before = current.messages
      const at = Date.now()
      for (let attempt = 0; attempt < MAX_SKIPS; attempt += 1) {
        const replied = await api.reply(
          current.id,
          current.revision,
          SKIP_TEXT,
          requestIds[attempt]
        )
        current = {
          ...current,
          state: replied.state,
          revision: replied.revision,
          situation: replied.situation,
          messages: [
            ...before,
            { role: 'student', content: SKIP_TEXT, at },
            {
              role: 'assistant',
              content: replied.assistantMessage,
              at: at + 1,
            },
          ],
        }
        sessionRef.current = current
        setSession(current)
        if (current.state !== 'COLLECTING') break
      }
      if (current.state !== 'COLLECTING') {
        setScreen({ kind: 'student', step: 'situation' })
      }
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
      setScreen({ kind: 'student', step: 'actions' })
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
      setSos(null)
      setSosNotified(null)
      setScreen({ kind: 'student', step: 'case' })
      if (canSos) {
        try {
          const { requests } = await api.sosList('student')
          setSos(
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

  const sendSos = (message: string) => {
    if (!session || !caseDetail) return
    void run(async () => {
      const { request, notified } = await api.sosRequest(
        session.id,
        caseDetail.id,
        message,
        { chatId: data?.chatId ?? '', chatType: data?.chatType ?? '' }
      )
      setSos(request)
      setSosNotified(notified)
    }, 'SOS를 보내지 못했어요.')
  }

  const refreshSos = () => {
    if (!caseDetail) return
    void run(async () => {
      const { requests } = await api.sosList('student')
      setSos(
        requests.find((request) => request.caseId === caseDetail.id) ?? null
      )
    }, 'SOS 상태를 불러오지 못했어요.')
  }

  const restart = () => {
    sessionRef.current = null
    // 죽은 세션을 겨냥한 "다시 시도"가 남지 않도록 같이 비운다.
    lastTask.current = null
    lastOnFail.current = undefined
    setSession(null)
    setCaseDetail(null)
    setContactable(false)
    setSos(null)
    setSosNotified(null)
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
    if (screen.kind !== 'student') return
    const previous: Partial<Record<StudentStep, Screen>> = {
      category: { kind: 'home' },
      chat: { kind: 'student', step: 'category' },
      situation: { kind: 'student', step: 'chat' },
      actions: { kind: 'student', step: 'situation' },
      compare: { kind: 'student', step: 'actions' },
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
            성공한 선배의 정답보다,
            <br />
            망해본 선배의 다음 한 수.
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
            messages={session.messages}
            state={session.state}
            situation={session.situation}
            busy={busy}
            failedAts={failedAts}
            onSend={send}
            onResend={resend}
            onSkipRemaining={skipRemaining}
            onReview={() => setScreen({ kind: 'student', step: 'situation' })}
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
      case 'actions':
        body = session ? (
          <ActionsReviewPage
            key={session.revision}
            category={session.category}
            actions={session.actions}
            busy={busy}
            onCompare={compare}
            onBack={() => setScreen({ kind: 'student', step: 'situation' })}
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
            onOpenCase={openCase}
            onHelpful={helpful}
            onEditActions={() =>
              setScreen({ kind: 'student', step: 'actions' })
            }
            onEditSituation={() =>
              setScreen({ kind: 'student', step: 'situation' })
            }
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
              contactable || sos ? (
                <SosBox
                  request={sos}
                  busy={busy}
                  notified={sosNotified}
                  onSend={sendSos}
                  onRefresh={refreshSos}
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
          <StepProgress current={STEP_INDEX[screen.step]} />
        )}
        <div
          className="ff-scroll"
          ref={scrollRef}
        >
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
