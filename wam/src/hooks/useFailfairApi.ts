import { useMemo } from 'react'
import {
  FAILFAIR_FUNCTIONS,
  type ActionCandidate,
  type Case,
  type CaseStatus,
  type CaseSubmission,
  type Category,
  type CompareOutput,
  type ConfirmSituationOutput,
  type ReplyOutput,
  type SessionView,
  type Situation,
  type SosRequest,
  type StartOutput,
} from '@tutorial/shared'

/**
 * App Function 호출 묶음. SDK가 window에 심어 주는 bridge를 직접 써서
 * useEffect 의존성과 무관하게 안정적인 객체를 돌려준다. A가 소유한다.
 */
function call<T>(
  appId: string,
  name: string,
  params: Record<string, unknown>
): Promise<T> {
  const wam = window.ChannelIOWam
  if (!wam) {
    return Promise.reject(
      new Error(
        '채널톡 안에서만 열 수 있어요. 채팅창에서 /망선박 을 실행해 주세요.'
      )
    )
  }
  return wam.callFunction<unknown>({ appId, name, params }).then(unwrap<T>)
}

interface FunctionEnvelope {
  result?: unknown
  error?: { type?: string; message?: string; data?: unknown }
}

/**
 * 채널톡 호스트는 App Function 응답을 \`{ result }\` 또는 \`{ error }\` 봉투로 돌려준다.
 * 개발용 bridge는 result만 돌려주므로 두 모양을 모두 받는다. 봉투를 안 벗기면
 * start 응답의 assistantMessage·sessionId가 undefined가 되어 첫 말풍선이 비고 다음 호출이 실패한다.
 */
export function unwrap<T>(response: unknown): T {
  if (response && typeof response === 'object') {
    const envelope = response as FunctionEnvelope
    const keys = Object.keys(envelope)
    const looksLikeEnvelope =
      keys.length > 0 &&
      keys.every((key) => key === 'result' || key === 'error')
    if (looksLikeEnvelope) {
      if (envelope.error) {
        throw Object.assign(
          new Error(envelope.error.message ?? '요청이 거부됐어요.'),
          { type: envelope.error.type, data: envelope.error.data }
        )
      }
      return envelope.result as T
    }
  }
  return response as T
}

export function newRequestId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

/**
 * 상태를 바꾸는 호출은 `requestId`를 받는다.
 *
 * 서버 `mutate`는 같은 `requestId`를 revision 검사보다 **먼저** 확인해서 저장해 둔
 * 응답을 그대로 돌려준다. 그래서 통신 실패로 같은 요청을 재전송할 때 이 값을
 * 그대로 유지하면, 서버는 처리했는데 응답만 유실된 경우에도 중복 처리 없이
 * 원래 결과를 되찾는다. 생략하면 새 값을 만들어 쓴다(= 새 요청).
 */
export interface FailfairApi {
  start(category: Category): Promise<StartOutput>
  reply(
    sessionId: string,
    expectedRevision: number,
    message: string,
    requestId?: string
  ): Promise<ReplyOutput>
  confirmSituation(
    sessionId: string,
    expectedRevision: number,
    situation: Situation,
    requestId?: string
  ): Promise<ConfirmSituationOutput>
  compare(
    sessionId: string,
    expectedRevision: number,
    actions: ActionCandidate[],
    requestId?: string
  ): Promise<CompareOutput>
  getSession(sessionId: string): Promise<SessionView>
  getCase(
    sessionId: string,
    caseId: string
  ): Promise<{ case: Case; contactable?: boolean }>
  feedback(
    sessionId: string,
    resultId: string,
    event: 'helpful' | 'not_helpful' | 'tool_copied'
  ): Promise<void>
  submitCase(input: CaseSubmission): Promise<{ case: Case }>
  listCases(status?: CaseStatus): Promise<{ cases: Case[] }>
  reviewCase(caseId: string, status: CaseStatus): Promise<{ case: Case }>
  // SOS
  sosRequest(
    sessionId: string,
    caseId: string,
    message: string,
    chat: { chatId: string; chatType: string }
  ): Promise<{ request: SosRequest; notified: boolean }>
  sosList(role: 'student' | 'senior'): Promise<{ requests: SosRequest[] }>
  sosRespond(
    sosId: string,
    status: 'accepted' | 'declined'
  ): Promise<{ request: SosRequest; notified: boolean }>
}

export function createFailfairApi(appId: string): FailfairApi {
  const F = FAILFAIR_FUNCTIONS
  return {
    start: (category) =>
      call(appId, F.start, { category, requestId: newRequestId() }),
    reply: (sessionId, expectedRevision, message, requestId = newRequestId()) =>
      call(appId, F.reply, {
        sessionId,
        expectedRevision,
        message,
        requestId,
      }),
    confirmSituation: (
      sessionId,
      expectedRevision,
      situation,
      requestId = newRequestId()
    ) =>
      call(appId, F.confirmSituation, {
        sessionId,
        expectedRevision,
        situation,
        requestId,
      }),
    compare: (
      sessionId,
      expectedRevision,
      actions,
      requestId = newRequestId()
    ) =>
      call(appId, F.compare, {
        sessionId,
        expectedRevision,
        actions,
        requestId,
      }),
    getSession: (sessionId) => call(appId, F.getSession, { sessionId }),
    getCase: (sessionId, caseId) =>
      call(appId, F.getCase, { sessionId, caseId }),
    feedback: (sessionId, resultId, event) =>
      call(appId, F.feedback, {
        sessionId,
        resultId,
        event,
        requestId: newRequestId(),
      }),
    submitCase: (input) => call(appId, F.submitCase, { ...input }),
    listCases: (status) => call(appId, F.listCases, status ? { status } : {}),
    reviewCase: (caseId, status) =>
      call(appId, F.reviewCase, { caseId, status }),
    sosRequest: (sessionId, caseId, message, chat) =>
      call(appId, F.sosRequest, { sessionId, caseId, message, ...chat }),
    sosList: (role) => call(appId, F.sosList, { role }),
    sosRespond: (sosId, status) => call(appId, F.sosRespond, { sosId, status }),
  }
}

export function useFailfairApi(appId: string): FailfairApi {
  return useMemo(() => createFailfairApi(appId), [appId])
}

export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}
