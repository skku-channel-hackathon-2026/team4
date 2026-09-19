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
  return wam.callFunction<T>({ appId, name, params })
}

export function newRequestId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export interface FailfairApi {
  start(category: Category): Promise<StartOutput>
  reply(
    sessionId: string,
    expectedRevision: number,
    message: string
  ): Promise<ReplyOutput>
  confirmSituation(
    sessionId: string,
    expectedRevision: number,
    situation: Situation
  ): Promise<ConfirmSituationOutput>
  compare(
    sessionId: string,
    expectedRevision: number,
    actions: ActionCandidate[]
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
    reply: (sessionId, expectedRevision, message) =>
      call(appId, F.reply, {
        sessionId,
        expectedRevision,
        message,
        requestId: newRequestId(),
      }),
    confirmSituation: (sessionId, expectedRevision, situation) =>
      call(appId, F.confirmSituation, {
        sessionId,
        expectedRevision,
        situation,
        requestId: newRequestId(),
      }),
    compare: (sessionId, expectedRevision, actions) =>
      call(appId, F.compare, {
        sessionId,
        expectedRevision,
        actions,
        requestId: newRequestId(),
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
