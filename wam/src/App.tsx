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
import { Button, Text, VStack } from '@channel.io/bezier-react/beta'
import type {
  ActionCandidate,
  Case,
  CaseSubmission,
  Category,
  Major,
  SessionView,
  Situation,
} from '@tutorial/shared'

import ErrorNotice from './components/failfair/ErrorNotice'
import StepProgress from './components/failfair/StepProgress'
import { useFailfairApi } from './hooks/useFailfairApi'
import { useFailfairWamData } from './hooks/useFailfairWamData'
import ActionsReviewPage from './pages/Failfair/ActionsReview'
import CaseDetailPage from './pages/Failfair/CaseDetail'
import CategoryPage from './pages/Failfair/Category'
import ChatPage from './pages/Failfair/Chat'
import ComparePage from './pages/Failfair/Compare'
import SituationReviewPage from './pages/Failfair/SituationReview'
import ReviewPage from './pages/Senior/Review'
import SeniorInputPage from './pages/Senior/SeniorInput'
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
  | { kind: 'senior'; tab: 'input' | 'review' }

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
  const [helpfulIds, setHelpfulIds] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<FailfairError | null>(null)
  /** 서버까지 가지 못한 내 메시지. 말풍선에 "다시 보내기"를 붙인다. */
  const [failedSend, setFailedSend] = useState<string | null>(null)
  /** 비교 중일 때 스켈레톤 카드 수를 맞추기 위한 값 */
  const [comparingCount, setComparingCount] = useState(0)
  /** 첫 화면에서 고른 전공. 세션 시작부터 상황에 실어 보낸다. */
  const [major, setMajor] = useState<Major | undefined>(undefined)

  // 화면이 바뀌면 본문 스크롤을 위로 돌린다. 앞 화면의 위치가 남아 있으면
  // 새 화면이 중간부터 보여서 무엇을 보는지 알기 어렵다.
  const scrollRef = useRef<HTMLDivElement | null>(null)

  // 마지막으로 실패한 호출. 오류 배너의 "다시 시도"가 그대로 다시 부른다.
  const lastTask = useRef<(() => Promise<void>) | null>(null)
  const lastFallback = useRef('')

  useEffect(() => {
    setSize({ width: WAM_WIDTH, height: WAM_MAX_HEIGHT })
  }, [setSize])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 })
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
      setBusy(true)
      setError(null)
      try {
        await task()
      } catch (cause) {
        const resolved = resolveError(cause, fallback)
        setError(resolved)
        onFail?.()
        // 버전이 밀린 경우에만 최신 상태로 되맞춘다 (v2 §10 STALE_SESSION).
        if (resolved.code === 'STALE_SESSION' && session) {
          try {
            setSession(await api.getSession(session.id))
          } catch {
            // 조회도 실패하면 위 안내만 남긴다.
          }
        }
      } finally {
        setBusy(false)
      }
    },
    [api, session]
  )

  const retry = () => {
    const task = lastTask.current
    if (!task || busy) return
    void run(task, lastFallback.current)
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
      setFailedSend(null)
      setScreen({ kind: 'student', step: 'chat' })
    }, '대화를 시작하지 못했어요.')

  const deliver = (text: string, at: number) =>
    void run(
      async () => {
        if (!session) return
        setFailedSend(null)
        const replied = await api.reply(session.id, session.revision, text)
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
      () => setFailedSend(text)
    )

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

  /** 실패한 메시지는 말풍선을 새로 쌓지 않고 같은 내용을 한 번 더 보낸다. */
  const resend = () => {
    if (!failedSend) return
    deliver(failedSend, Date.now())
  }

  /** 남은 질문을 한 번에 건너뛰고 상황 확인으로 넘어간다. */
  const skipRemaining = () => {
    if (!session) return
    void run(async () => {
      let current = session
      for (let attempt = 0; attempt < MAX_SKIPS; attempt += 1) {
        const at = Date.now() + attempt * 2
        const replied = await api.reply(current.id, current.revision, SKIP_TEXT)
        current = {
          ...current,
          state: replied.state,
          revision: replied.revision,
          situation: replied.situation,
          messages: [
            ...current.messages,
            { role: 'student', content: SKIP_TEXT, at },
            {
              role: 'assistant',
              content: replied.assistantMessage,
              at: at + 1,
            },
          ],
        }
        setSession(current)
        if (current.state !== 'COLLECTING') break
      }
      if (current.state !== 'COLLECTING') {
        setScreen({ kind: 'student', step: 'situation' })
      }
    }, '건너뛰지 못했어요.')
  }

  const confirmSituation = (situation: Situation) => {
    if (!session) return
    void run(async () => {
      const confirmed = await api.confirmSituation(
        session.id,
        session.revision,
        situation
      )
      setSession({
        ...session,
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
    if (!session) return
    // 검색은 몇 초 걸린다. 결과 화면으로 먼저 옮겨 스켈레톤을 보여 준다.
    setComparingCount(actions.length)
    setNotice('')
    setSession({ ...session, actions, results: [] })
    setScreen({ kind: 'student', step: 'compare' })
    void run(async () => {
      const compared = await api.compare(session.id, session.revision, actions)
      setSession({
        ...session,
        state: compared.state,
        revision: compared.revision,
        actions,
        results: compared.results,
      })
      setNotice(compared.notice)
    }, '사례를 찾지 못했어요.')
  }

  const openCase = (caseId: string, resultId: string) => {
    if (!session) return
    void run(async () => {
      const { case: item } = await api.getCase(session.id, caseId)
      setCaseDetail(item)
      setActiveResultId(resultId)
      setScreen({ kind: 'student', step: 'case' })
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

  const restart = () => {
    setSession(null)
    setCaseDetail(null)
    setNotice('')
    setError(null)
    setFailedSend(null)
    setComparingCount(0)
    setScreen({ kind: 'student', step: 'category' })
  }

  // ---------------------------------------------------------------- 선배 흐름

  const submitCase = async (input: CaseSubmission) => {
    await api.submitCase(input)
  }

  // ---------------------------------------------------------------- 내비게이션

  const back = () => {
    setError(null)
    if (screen.kind === 'senior') {
      setScreen(
        screen.tab === 'review'
          ? { kind: 'senior', tab: 'input' }
          : { kind: 'home' }
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
          : '사례 검수'
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
          </button>
        </VStack>
        <Text
          as="p"
          typo="12"
          color="text-neutral-lighter"
        >
          실명이나 상대 이름은 적지 않아도 돼요. 적은 내용은 이 대화 안에서만
          쓰입니다.
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
      ) : (
        <ReviewPage
          listCases={api.listCases}
          reviewCase={api.reviewCase}
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
            failedSend={failedSend}
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
            ) : screen.kind === 'senior' && screen.tab === 'input' ? (
              <Button
                size="xs"
                variant="ghost"
                semantic="secondary"
                label="검수 목록"
                onClick={() => setScreen({ kind: 'senior', tab: 'review' })}
              />
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
