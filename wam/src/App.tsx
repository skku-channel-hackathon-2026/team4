import { useCallback, useEffect, useState } from 'react'
import {
  ErrorPage,
  HeightSynchronizer,
  InlineBanner,
  WamHeader,
  WamThemeProvider,
} from '@channel.io/app-sdk-wam-ui'
import { useWamClose, useWamSize } from '@channel.io/app-sdk-wam'
import { Button, HStack, Text, VStack } from '@channel.io/bezier-react/beta'
import type {
  ActionCandidate,
  Case,
  CaseSubmission,
  Category,
  SessionView,
  Situation,
  SosRequest,
} from '@tutorial/shared'

import SosBox from './components/failfair/SosBox'
import { errorMessage, useFailfairApi } from './hooks/useFailfairApi'
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

const WAM_WIDTH = 560
const WAM_MAX_HEIGHT = 720

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
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setSize({ width: WAM_WIDTH, height: WAM_MAX_HEIGHT })
  }, [setSize])

  useEffect(() => {
    if (!data?.mode) return
    setScreen(
      data.mode === 'senior'
        ? { kind: 'senior', tab: 'input' }
        : { kind: 'student', step: 'category' }
    )
  }, [data?.mode])

  const run = useCallback(
    async (task: () => Promise<void>, fallback: string) => {
      setBusy(true)
      setError(null)
      try {
        await task()
      } catch (cause) {
        setError(errorMessage(cause, fallback))
        // 세션이 바뀌었으면 최신 상태로 다시 맞춘다 (STALE_SESSION 대응).
        if (session) {
          try {
            setSession(await api.getSession(session.id))
          } catch {
            // 조회도 실패하면 위 오류만 보여 준다.
          }
        }
      } finally {
        setBusy(false)
      }
    },
    [api, session]
  )

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
      setScreen({ kind: 'student', step: 'chat' })
    }, '대화를 시작하지 못했어요.')

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
    void run(async () => {
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
                  at: now + 1,
                },
              ],
            }
          : current
      )
    }, '메시지를 보내지 못했어요.')
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
      setScreen({ kind: 'student', step: 'compare' })
    }, '사례를 찾지 못했어요.')
  }

  const openCase = (caseId: string, resultId: string) => {
    if (!session) return
    void run(async () => {
      const { case: item, contactable: canSos } = await api.getCase(
        session.id,
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
    setSession(null)
    setCaseDetail(null)
    setContactable(false)
    setSos(null)
    setSosNotified(null)
    setNotice('')
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
      <VStack spacing={12}>
        <Text
          as="p"
          typo="15"
          bold
        >
          성공한 선배의 정답보다, 망해본 선배의 다음 한 수.
        </Text>
        <button
          type="button"
          className="ff-big"
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
            onPick={start}
          />
        )
        break
      case 'chat':
        body = session ? (
          <ChatPage
            messages={session.messages}
            state={session.state}
            busy={busy}
            onSend={send}
            onReview={() => setScreen({ kind: 'student', step: 'situation' })}
          />
        ) : (
          <CategoryPage
            busy={busy}
            onPick={start}
          />
        )
        break
      case 'situation':
        body = session ? (
          <SituationReviewPage
            key={session.revision}
            situation={session.situation}
            busy={busy}
            onConfirm={confirmSituation}
            onBack={() => setScreen({ kind: 'student', step: 'chat' })}
          />
        ) : (
          <ErrorPage error="세션이 없어요." />
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
          <ErrorPage error="세션이 없어요." />
        )
        break
      case 'compare':
        body = session ? (
          <ComparePage
            situation={session.situation}
            results={session.results}
            notice={notice}
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
          <ErrorPage error="세션이 없어요." />
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
          <ErrorPage error="사례를 찾지 못했어요." />
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
        <div className="ff-scroll">
          {error && (
            <div style={{ marginBottom: 12 }}>
              <InlineBanner
                variant="error"
                content={error}
              />
            </div>
          )}
          {body}
        </div>
      </HeightSynchronizer>
    </WamThemeProvider>
  )
}

export default App
