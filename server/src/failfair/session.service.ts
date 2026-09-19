import {
  FunctionCallError,
  FunctionCallErrorCode,
  type Context,
} from "@channel.io/app-sdk-server";
import {
  FAILFAIR_ERRORS,
  validateContextMeta,
  pruneResolvedUnknowns,
  type ActionCandidate,
  type ActionResult,
  type Category,
  type Message,
  type SessionState,
  type SessionView,
  type Situation,
} from "@tutorial/shared";
import { getRecord, setRecord } from "../records.js";

export type PendingField =
  "deadline" | "progress" | "consideredActions" | "goal";

/** D1 `failfair_sessions`로 옮기기 전까지 app_records에 통째로 저장하는 세션 */
export interface StoredSession {
  id: string;
  channelId: string;
  ownerId: string;
  category: Category;
  state: SessionState;
  revision: number;
  situation: Situation;
  confirmedRevision?: number;
  actions: ActionCandidate[];
  results: ActionResult[];
  messages: Message[];
  pendingField?: PendingField;
  questionCount: number;
  lastRequest?: { requestId: string; response: unknown };
  createdAt: number;
  updatedAt: number;
}

/** 저장소 계약. 테스트에서는 Map으로 갈아 끼운다. */
export interface SessionStore {
  load(id: string): Promise<StoredSession | undefined>;
  save(session: StoredSession): Promise<void>;
}

export const appRecordsSessionStore: SessionStore = {
  load: (id) => getRecord<StoredSession>(`failfair:session:${id}`),
  save: (session) => setRecord(`failfair:session:${session.id}`, session),
};

export function newSessionId(now = Date.now()): string {
  const random = Math.random().toString(36).slice(2, 8);
  return `s-${now.toString(36)}-${random}`;
}

export function toView(session: StoredSession): SessionView {
  return {
    id: session.id,
    category: session.category,
    state: session.state,
    revision: session.revision,
    messages: session.messages,
    situation: session.situation,
    actions: session.actions,
    results: session.results,
  };
}

export class SessionService {
  constructor(private readonly store: SessionStore = appRecordsSessionStore) {}

  async create(
    ctx: Context,
    category: Category,
    firstMessage: string,
    now = Date.now(),
  ): Promise<StoredSession> {
    const ownerId = requireOwner(ctx);
    const session: StoredSession = {
      id: newSessionId(now),
      channelId: ctx.channel.id,
      ownerId,
      category,
      state: "COLLECTING",
      revision: 0,
      situation: { category } as Situation,
      actions: [],
      results: [],
      messages: [{ role: "assistant", content: firstMessage, at: now }],
      questionCount: 0,
      createdAt: now,
      updatedAt: now,
    };
    session.situation = normalizeSituation(session.situation);
    await this.store.save(session);
    return session;
  }

  /** 소유자가 아니면 존재 여부도 알려주지 않는다. */
  async load(ctx: Context, sessionId: string): Promise<StoredSession> {
    const ownerId = requireOwner(ctx);
    const session = await this.store.load(sessionId);
    if (
      !session ||
      session.channelId !== ctx.channel.id ||
      session.ownerId !== ownerId
    ) {
      throw new FunctionCallError(
        "Session not found",
        FunctionCallErrorCode.NotFound,
        { type: FAILFAIR_ERRORS.notFoundOrForbidden },
      );
    }
    return session;
  }

  /**
   * 변경 요청 공통 처리. 같은 requestId는 저장된 응답을 그대로 돌려주고,
   * expectedRevision이 다르면 STALE_SESSION으로 거절한다.
   */
  async mutate<T>(
    session: StoredSession,
    requestId: string,
    expectedRevision: number,
    handler: (session: StoredSession) => Promise<T> | T,
    now = Date.now(),
  ): Promise<T> {
    if (session.lastRequest?.requestId === requestId) {
      return session.lastRequest.response as T;
    }
    if (session.revision !== expectedRevision) {
      throw new FunctionCallError(
        "The session changed. Reload and try again.",
        FunctionCallErrorCode.Conflict,
        {
          type: FAILFAIR_ERRORS.staleSession,
          data: { revision: session.revision },
        },
      );
    }
    const response = await handler(session);
    if (validateContextMeta(session.situation, session.messages).length)
      throw new Error("Invalid situation metadata");
    session.revision += 1;
    session.updatedAt = now;
    session.lastRequest = { requestId, response };
    await this.store.save(session);
    return response;
  }
}

export function requireOwner(ctx: Context): string {
  if (ctx.caller.type !== "manager" || !ctx.caller.id) {
    throw new FunctionCallError(
      "Only a signed-in manager can use this",
      FunctionCallErrorCode.BadRequest,
      { type: FAILFAIR_ERRORS.notFoundOrForbidden },
    );
  }
  return ctx.caller.id;
}

export function requireState(
  session: StoredSession,
  allowed: SessionState[],
): void {
  if (!allowed.includes(session.state)) {
    throw new FunctionCallError(
      `This step is not allowed while the session is ${session.state}`,
      FunctionCallErrorCode.Conflict,
      { type: FAILFAIR_ERRORS.inProgress, data: { state: session.state } },
    );
  }
}

export function normalizeSituation(situation: Situation): Situation {
  // 값이 있는 필드는 unknowns에서 제거한다(저장/읽기 왕복 시 오염 방지, 레거시 데이터 포함).
  return pruneResolvedUnknowns({
    category: situation.category,
    problemType: situation.problemType,
    // A 추가(전공 수집). 여기서 빠뜨리면 확인 단계에서 전공이 조용히 사라진다.
    major: situation.major,
    situation: situation.situation ?? "",
    goal: situation.goal ?? "",
    deadline: {
      raw: situation.deadline?.raw ?? "",
      urgency: situation.deadline?.urgency ?? "unknown",
    },
    progress: situation.progress ?? "",
    constraints: situation.constraints ?? [],
    attemptedActions: situation.attemptedActions ?? [],
    consideredActions: situation.consideredActions ?? [],
    unknowns: situation.unknowns ?? [],
    // 선택적 v0.3 확장은 있을 때만 그대로 보존한다(왕복 저장 시 손실 방지).
    ...(situation.contextMeta ? { contextMeta: situation.contextMeta } : {}),
    ...(situation.studentContext
      ? { studentContext: situation.studentContext }
      : {}),
  });
}
