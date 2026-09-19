import {
  FunctionCallError,
  FunctionCallErrorCode,
  type Context,
} from "@channel.io/app-sdk-server";
import {
  FAILFAIR_ERRORS,
  type ActionCandidate,
  type ActionResult,
  type Category,
  type Message,
  type SessionState,
  type SessionView,
  type Situation,
} from "@tutorial/shared";
import { changedRows, getDatabase } from "../database.js";

export type PendingField =
  "deadline" | "progress" | "consideredActions" | "goal";

/** D1 `failfair_sessions` 한 행. 대화·행동·결과는 항상 통째로 읽고 쓰므로 body_json 하나에 둔다. */
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
  createdAt: number;
  updatedAt: number;
}

/** 저장소 계약. revision 조건부 UPDATE와 requestId 재생은 DB가 판정한다. */
export interface SessionStore {
  load(id: string): Promise<StoredSession | undefined>;
  insert(session: StoredSession): Promise<void>;
  /**
   * 저장된 revision이 expected일 때만 세션을 통째로 바꾸고, 같은 트랜잭션에서 이 요청의 응답을
   * 남긴다. 남이 먼저 바꿨으면 아무것도 쓰지 않고 false. 둘 중 하나만 남는 일은 없다.
   */
  commit(
    session: StoredSession,
    expectedRevision: number,
    requestId: string,
    response: unknown,
    now: number,
  ): Promise<boolean>;
  /** 같은 requestId로 이미 처리한 응답. 없으면 undefined. */
  findResponse(
    sessionId: string,
    requestId: string,
  ): Promise<{ response: unknown } | undefined>;
}

function parseSession(body: string, id: string): StoredSession | undefined {
  try {
    const parsed = JSON.parse(body) as StoredSession;
    return parsed && parsed.id === id ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export const d1SessionStore: SessionStore = {
  async load(id) {
    const row = await getDatabase()
      .prepare("SELECT body_json FROM failfair_sessions WHERE id = ?")
      .bind(id)
      .first<{ body_json: string }>();
    return row ? parseSession(row.body_json, id) : undefined;
  },

  async insert(session) {
    await getDatabase()
      .prepare(
        "INSERT INTO failfair_sessions " +
          "(id, channel_id, owner_id, category, state, revision, body_json, created_at, updated_at) " +
          "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .bind(
        session.id,
        session.channelId,
        session.ownerId,
        session.category,
        session.state,
        session.revision,
        JSON.stringify(session),
        session.createdAt,
        session.updatedAt,
      )
      .run();
  },

  async commit(session, expectedRevision, requestId, response, now) {
    const db = getDatabase();
    // 두 문장이 한 트랜잭션이다. 응답 기록은 "방금 그 UPDATE가 내 것이었을 때"만 들어간다:
    // revision이 새 값이고 last_request_id가 내 requestId일 때. 다른 창이 같은 revision을
    // 먼저 차지했으면 UPDATE는 0행이고 last_request_id는 그쪽 것이라 INSERT도 0행이다.
    const results = await db.batch([
      db
        .prepare(
          "UPDATE failfair_sessions SET state = ?, revision = ?, body_json = ?, updated_at = ?, last_request_id = ? " +
            "WHERE id = ? AND revision = ?",
        )
        .bind(
          session.state,
          session.revision,
          JSON.stringify(session),
          now,
          requestId,
          session.id,
          expectedRevision,
        ),
      db
        .prepare(
          "INSERT OR IGNORE INTO failfair_requests (session_id, request_id, response_json, created_at) " +
            "SELECT ?, ?, ?, ? FROM failfair_sessions WHERE id = ? AND revision = ? AND last_request_id = ?",
        )
        // undefined 응답도 유효한 JSON으로 남도록 한 겹 감싸 저장한다.
        .bind(
          session.id,
          requestId,
          JSON.stringify({ response }),
          now,
          session.id,
          session.revision,
          requestId,
        ),
    ]);
    return changedRows(results[0]) === 1;
  },

  async findResponse(sessionId, requestId) {
    const row = await getDatabase()
      .prepare(
        "SELECT response_json FROM failfair_requests WHERE session_id = ? AND request_id = ?",
      )
      .bind(sessionId, requestId)
      .first<{ response_json: string }>();
    if (!row) return undefined;
    try {
      return {
        response: (JSON.parse(row.response_json) as { response: unknown })
          .response,
      };
    } catch {
      return undefined;
    }
  },
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
  constructor(private readonly store: SessionStore = d1SessionStore) {}

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
    await this.store.insert(session);
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
   * 저장도 revision 조건부라, 검사와 저장 사이에 다른 창이 먼저 썼으면 그때도 거절한다.
   * 세션 변경과 응답 기록은 한 트랜잭션이라, 실패한 요청의 재시도가 handler를 두 번 적용하지 않는다.
   */
  async mutate<T>(
    session: StoredSession,
    requestId: string,
    expectedRevision: number,
    handler: (session: StoredSession) => Promise<T> | T,
    now = Date.now(),
  ): Promise<T> {
    const replay = await this.store.findResponse(session.id, requestId);
    if (replay) return replay.response as T;
    if (session.revision !== expectedRevision) throw stale(session.revision);
    const response = await handler(session);
    const from = session.revision;
    session.revision += 1;
    session.updatedAt = now;
    if (!(await this.store.commit(session, from, requestId, response, now))) {
      // 같은 requestId가 동시에 두 번 들어와 다른 쪽이 먼저 저장했으면 그 응답이 정답이다.
      const raced = await this.store.findResponse(session.id, requestId);
      if (raced) return raced.response as T;
      const latest = await this.store.load(session.id);
      throw stale(latest?.revision ?? from);
    }
    return response;
  }
}

function stale(revision: number): FunctionCallError {
  return new FunctionCallError(
    "The session changed. Reload and try again.",
    FunctionCallErrorCode.Conflict,
    { type: FAILFAIR_ERRORS.staleSession, data: { revision } },
  );
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
  return {
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
  };
}
