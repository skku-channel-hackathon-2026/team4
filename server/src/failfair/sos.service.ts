import {
  FunctionCallError,
  FunctionCallErrorCode,
} from "@channel.io/app-sdk-server";
import {
  FAILFAIR_ERRORS,
  SosMessageSchema,
  SosRequestSchema,
  type Case,
  type SosMessage,
  type SosRequest,
} from "@tutorial/shared";
import { changedRows, getDatabase, resultRows } from "../database.js";

/**
 * SOS 요청 저장·규칙. B가 소유한다.
 *
 * 요청 하나가 D1 `failfair_sos` 한 행이다. 전체 목록을 한 키에 배열로 두면
 * "읽고 → 고치고 → 통째로 덮어쓰는" 사이에 남의 요청이나 남의 수락이 사라진다.
 * 그래서 새 요청은 빈 자리에만 넣고(`claim`), 응답은 아직 `pending`일 때만
 * 바꾼다(`settle`). 둘 다 DB가 판정하므로 동시에 눌러도 한 쪽만 이긴다.
 */
export interface SosStore {
  /** 이 채널의 모든 요청. 최신순. */
  list(channelId: string): Promise<SosRequest[]>;
  /**
   * (채널·사례·새내기)당 대기 중 요청은 하나. 이미 답을 기다리는 요청이 있으면
   * 그것을 돌려주고 `created: false`. 거절·수락된 요청은 이력으로 남고 새 요청을 다시 넣을 수 있다.
   */
  claim(
    request: SosRequest,
    /** 화면이 만든 전송 단위 ID. 같은 값이 다시 오면 상태와 무관하게 그 요청을 돌려준다. */
    requestId: string,
  ): Promise<{ request: SosRequest; created: boolean }>;
  /** 아직 `pending`일 때만 답을 적는다. 남이 먼저 답했으면 undefined. */
  settle(
    request: SosRequest,
    status: "accepted" | "declined",
    now: number,
  ): Promise<SosRequest | undefined>;
  /** 앱이 연 채널톡 DM 방 ID를 요청에 붙인다. 이미 있으면 그대로 둔다. */
  attachDirectChat(request: SosRequest, directChatId: string): Promise<void>;
  /** 스레드에 말을 붙인다. 같은 requestId가 다시 오면 그때 저장한 말을 돌려준다. */
  appendMessage(
    channelId: string,
    message: SosMessage,
    requestId: string,
  ): Promise<SosMessage>;
  /** 이 요청의 말. 오래된 순. */
  listMessages(sosId: string): Promise<SosMessage[]>;
}

function parse(candidate: unknown): SosRequest | undefined {
  const parsed = SosRequestSchema.safeParse(candidate);
  return parsed.success ? parsed.data : undefined;
}

function parseRows(result: unknown): SosRequest[] {
  return resultRows<{ body_json: string }>(result).flatMap((row) => {
    try {
      const request = parse(JSON.parse(row.body_json));
      return request ? [request] : [];
    } catch {
      return [];
    }
  });
}

/** 이 (채널·사례·새내기) 자리의 최신 요청. 대기 중인 것을 우선한다. */
async function latestInSlot(
  request: SosRequest,
): Promise<SosRequest | undefined> {
  const result = await getDatabase()
    .prepare(
      "SELECT body_json FROM failfair_sos " +
        "WHERE channel_id = ? AND case_id = ? AND student_manager_id = ? " +
        "ORDER BY (status = 'pending') DESC, created_at DESC LIMIT 1",
    )
    .bind(request.channelId, request.caseId, request.studentManagerId)
    .all<{ body_json: string }>();
  return parseRows(result)[0];
}

/** 이 전송 단위 ID로 이미 저장된 요청. 응답만 잃은 재전송을 새 요청과 구분한다. */
async function findByRequestId(
  channelId: string,
  requestId: string,
): Promise<SosRequest | undefined> {
  const result = await getDatabase()
    .prepare(
      "SELECT body_json FROM failfair_sos WHERE channel_id = ? AND request_id = ? LIMIT 1",
    )
    .bind(channelId, requestId)
    .all<{ body_json: string }>();
  return parseRows(result)[0];
}

export const d1SosStore: SosStore = {
  async list(channelId) {
    const result = await getDatabase()
      .prepare(
        "SELECT body_json FROM failfair_sos WHERE channel_id = ? ORDER BY created_at DESC, id",
      )
      .bind(channelId)
      .all<{ body_json: string }>();
    return parseRows(result);
  },

  async claim(request, requestId) {
    const seen = await findByRequestId(request.channelId, requestId);
    if (seen) return { request: seen, created: false };
    // 대기 중 요청이 이미 있으면 부분 유니크 인덱스(idx_failfair_sos_pending)에 걸려 0행이 된다.
    // 그 사이에 그 요청이 답을 받으면 자리가 비므로 한 번 더 시도한다.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const inserted = await getDatabase()
        .prepare(
          "INSERT OR IGNORE INTO failfair_sos " +
            "(id, channel_id, case_id, student_manager_id, senior_manager_id, status, request_id, body_json, created_at, responded_at) " +
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(
          request.id,
          request.channelId,
          request.caseId,
          request.studentManagerId,
          request.seniorManagerId,
          request.status,
          requestId,
          JSON.stringify(request),
          request.createdAt,
          request.respondedAt ?? null,
        )
        .run();
      if (changedRows(inserted) === 1) return { request, created: true };
      // 같은 전송이 동시에 두 번 들어와 다른 쪽이 먼저 들어갔을 수도 있다.
      const raced = await findByRequestId(request.channelId, requestId);
      if (raced) return { request: raced, created: false };
      const existing = await latestInSlot(request);
      if (existing?.status === "pending")
        return { request: existing, created: false };
    }
    const latest = await latestInSlot(request);
    return { request: latest ?? request, created: false };
  },

  async settle(request, status, now) {
    const updated: SosRequest = { ...request, status, respondedAt: now };
    const result = await getDatabase()
      .prepare(
        "UPDATE failfair_sos SET status = ?, responded_at = ?, body_json = ? " +
          "WHERE id = ? AND status = 'pending'",
      )
      .bind(status, now, JSON.stringify(updated), request.id)
      .run();
    return changedRows(result) === 1 ? updated : undefined;
  },

  async attachDirectChat(request, directChatId) {
    if (request.directChatId) return;
    const updated: SosRequest = { ...request, directChatId };
    await getDatabase()
      .prepare(
        "UPDATE failfair_sos SET body_json = ? " +
          "WHERE id = ? AND json_extract(body_json, '$.directChatId') IS NULL",
      )
      .bind(JSON.stringify(updated), request.id)
      .run();
    request.directChatId = directChatId;
  },

  async appendMessage(channelId, message, requestId) {
    const inserted = await getDatabase()
      .prepare(
        "INSERT OR IGNORE INTO failfair_sos_messages " +
          "(id, sos_id, channel_id, sender_manager_id, role, request_id, text, created_at) " +
          "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .bind(
        message.id,
        message.sosId,
        channelId,
        message.senderManagerId,
        message.role,
        requestId,
        message.text,
        message.createdAt,
      )
      .run();
    if (changedRows(inserted) === 1) return message;
    // 같은 전송이 두 번 들어왔다. 먼저 들어간 말이 정답이다.
    const seen = await getDatabase()
      .prepare(
        "SELECT id, sos_id, sender_manager_id, role, text, created_at " +
          "FROM failfair_sos_messages WHERE sos_id = ? AND request_id = ? LIMIT 1",
      )
      .bind(message.sosId, requestId)
      .first<MessageRow>();
    return seen ? rowToMessage(seen) : message;
  },

  async listMessages(sosId) {
    const result = await getDatabase()
      .prepare(
        "SELECT id, sos_id, sender_manager_id, role, text, created_at " +
          "FROM failfair_sos_messages WHERE sos_id = ? ORDER BY created_at, id",
      )
      .bind(sosId)
      .all<MessageRow>();
    return resultRows<MessageRow>(result).flatMap((row) => {
      const parsed = SosMessageSchema.safeParse(rowToMessage(row));
      return parsed.success ? [parsed.data] : [];
    });
  },
};

interface MessageRow {
  id: string;
  sos_id: string;
  sender_manager_id: string;
  role: string;
  text: string;
  created_at: number;
}

function rowToMessage(row: MessageRow): SosMessage {
  return {
    id: row.id,
    sosId: row.sos_id,
    senderManagerId: row.sender_manager_id,
    role: row.role === "senior" ? "senior" : "student",
    text: row.text,
    createdAt: Number(row.created_at),
  };
}

/**
 * 새내기에게 붙여 줄 선배 사례를 고른다 (매칭).
 * 이 대화의 결과에 연결된 사례 중 연락 가능한 것을 결과 순서대로 우선하고,
 * 없으면 같은 카테고리에서 연락을 허용한 실제 선배 중 가장 최근 등록을 고른다.
 */
export function chooseContactableCase(
  candidates: Case[],
  preferredCaseIds: string[],
  managerId: string,
): Case | undefined {
  const contactable = candidates.filter((item) =>
    isContactable(item, managerId),
  );
  for (const caseId of preferredCaseIds) {
    const hit = contactable.find((item) => item.id === caseId);
    if (hit) return hit;
  }
  return [...contactable].sort((a, b) => b.createdAt - a.createdAt)[0];
}

/** 새내기가 이 사례의 선배에게 연락할 수 있는가. 가상 사례·연락 거부·본인 사례는 불가. */
export function isContactable(item: Case, managerId: string): boolean {
  return (
    item.status === "approved" &&
    item.sourceType === "real" &&
    item.allowContact &&
    !!item.authorManagerId &&
    item.authorManagerId !== managerId
  );
}

export function newSosId(now = Date.now()): string {
  const random = Math.random().toString(36).slice(2, 6);
  return `sos-${now.toString(36)}-${random}`;
}

const notFound = () =>
  new FunctionCallError(
    "SOS request not found",
    FunctionCallErrorCode.NotFound,
    {
      type: FAILFAIR_ERRORS.notFoundOrForbidden,
    },
  );

export class SosService {
  constructor(private readonly store: SosStore = d1SosStore) {}

  /**
   * 같은 새내기가 같은 사례에 보낸 대기 중 요청이 있으면 그것을 돌려준다 (중복 방지).
   * 같은 requestId가 다시 오면 상태와 무관하게 그때 저장한 요청을 돌려준다 (응답만 잃은 재전송).
   */
  async request(
    input: {
      item: Case;
      channelId: string;
      chatId: string;
      chatType: string;
      chatTitle: string;
      studentManagerId: string;
      message: string;
      requestId: string;
    },
    now = Date.now(),
  ): Promise<{ request: SosRequest; created: boolean }> {
    if (!isContactable(input.item, input.studentManagerId)) {
      throw new FunctionCallError(
        "This senior cannot be contacted",
        FunctionCallErrorCode.BadRequest,
        { type: FAILFAIR_ERRORS.notFoundOrForbidden },
      );
    }
    return this.store.claim(
      {
        id: newSosId(now),
        caseId: input.item.id,
        caseTitle: input.item.title,
        channelId: input.channelId,
        chatId: input.chatId,
        chatType: input.chatType,
        chatTitle: input.chatTitle,
        studentManagerId: input.studentManagerId,
        seniorManagerId: input.item.authorManagerId ?? "",
        message: input.message,
        status: "pending",
        createdAt: now,
      },
      input.requestId,
    );
  }

  /** 내가 보낸(student) 또는 나에게 온(senior) 요청. 최신순. */
  async listFor(
    channelId: string,
    managerId: string,
    role: "student" | "senior",
  ): Promise<SosRequest[]> {
    const all = await this.store.list(channelId);
    return all
      .filter((request) =>
        role === "student"
          ? request.studentManagerId === managerId
          : request.seniorManagerId === managerId,
      )
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  /** 요청을 받은 선배만 답할 수 있다. 이미 답한 요청은 바꾸지 않는다 (changed=false). */
  async respond(
    channelId: string,
    seniorManagerId: string,
    sosId: string,
    status: "accepted" | "declined",
    now = Date.now(),
  ): Promise<{ request: SosRequest; changed: boolean }> {
    const all = await this.store.list(channelId);
    const target = all.find((request) => request.id === sosId);
    if (!target || target.seniorManagerId !== seniorManagerId) throw notFound();
    if (target.status !== "pending") return { request: target, changed: false };
    const updated = await this.store.settle(target, status, now);
    // 그 사이 다른 창에서 먼저 답했다면 그 답이 정답이다. 알림도 한 번만 나간다.
    if (!updated) {
      const latest = (await this.store.list(channelId)).find(
        (request) => request.id === sosId,
      );
      return { request: latest ?? target, changed: false };
    }
    return { request: updated, changed: true };
  }

  /** 요청의 두 당사자만 볼 수 있다. 아니면 존재 여부도 알려주지 않는다. */
  private async participant(
    channelId: string,
    managerId: string,
    sosId: string,
  ): Promise<{ request: SosRequest; role: "student" | "senior" }> {
    const request = (await this.store.list(channelId)).find(
      (item) => item.id === sosId,
    );
    if (!request) throw notFound();
    if (request.studentManagerId === managerId)
      return { request, role: "student" };
    if (request.seniorManagerId === managerId)
      return { request, role: "senior" };
    throw notFound();
  }

  /** 두 당사자가 보는 스레드. 요청의 최신 상태도 함께 돌려주므로 화면이 이걸로 상태를 새로고침한다. */
  async thread(
    channelId: string,
    managerId: string,
    sosId: string,
  ): Promise<{ request: SosRequest; messages: SosMessage[] }> {
    const { request } = await this.participant(channelId, managerId, sosId);
    return { request, messages: await this.store.listMessages(sosId) };
  }

  /** 수락된 요청 안에서만 말을 보낼 수 있다. 같은 requestId 재전송은 한 번만 쌓인다. */
  async send(
    channelId: string,
    managerId: string,
    sosId: string,
    requestId: string,
    text: string,
    now = Date.now(),
  ): Promise<SosMessage> {
    const { request, role } = await this.participant(
      channelId,
      managerId,
      sosId,
    );
    if (request.status !== "accepted") {
      throw new FunctionCallError(
        "Messages can be sent only after the senior accepts",
        FunctionCallErrorCode.Conflict,
        { type: FAILFAIR_ERRORS.inProgress, data: { status: request.status } },
      );
    }
    return this.store.appendMessage(
      channelId,
      {
        id: `sosm-${now.toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        sosId,
        senderManagerId: managerId,
        role,
        text,
        createdAt: now,
      },
      requestId,
    );
  }

  async attachDirectChat(
    request: SosRequest,
    directChatId: string,
  ): Promise<void> {
    await this.store.attachDirectChat(request, directChatId);
  }
}

/** 새내기 이름으로 두 사람의 DM에 올릴 SOS 문구. */
export function sosDirectRequestText(request: SosRequest): string {
  return [
    `🆘 [망선박 SOS] '${request.caseTitle}' 사례를 보고 도움을 요청드려요.`,
    request.message,
    "(채팅창에서 /망선박 선배 → SOS 요청에서 수락하면 앱 안에서도 이어서 대화할 수 있어요. 여기서 바로 답해 주셔도 돼요.)",
  ].join("\n");
}

/** 선배 이름으로 DM에 올릴 수락 문구. */
export function sosDirectAcceptedText(request: SosRequest): string {
  return `✅ '${request.caseTitle}' SOS 수락했어요. 여기서 바로 이야기해요.`;
}

/** 그룹 채팅에 올릴 봇 문구. 사람 이름은 넣지 않는다. */
export function sosRequestedText(request: SosRequest): string {
  return [
    `🆘 새내기가 '${request.caseTitle}' 사례의 선배에게 SOS를 보냈어요.`,
    `"${request.message}"`,
    "선배님은 채팅창에서 /tutorial (망선박)을 열고 선배 → SOS 요청에서 답해 주세요.",
  ].join("\n");
}

export function sosRespondedText(request: SosRequest): string {
  return request.status === "accepted"
    ? `✅ '${request.caseTitle}' 선배가 SOS를 수락했어요. 이 방에서 이어서 대화해 주세요.`
    : `🙏 '${request.caseTitle}' 선배가 지금은 도와주기 어렵다고 답했어요. 다른 사례의 선배에게 다시 요청해 보세요.`;
}
