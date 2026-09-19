import {
  FunctionCallError,
  FunctionCallErrorCode,
} from "@channel.io/app-sdk-server";
import {
  FAILFAIR_ERRORS,
  SosRequestSchema,
  type Case,
  type SosRequest,
} from "@tutorial/shared";
import {
  getRecord,
  insertRecordIfAbsent,
  listRecords,
  replaceRecordIfField,
  setRecord,
} from "../records.js";

/**
 * SOS 요청 저장·규칙. B가 소유한다.
 *
 * 요청 하나가 `app_records` 한 행이다. 예전처럼 전체 목록을 한 키에 배열로 두면
 * "읽고 → 고치고 → 통째로 덮어쓰는" 사이에 남의 요청이나 남의 수락이 사라진다.
 * 그래서 새 요청은 빈 자리에만 넣고(`claim`), 응답은 아직 `pending`일 때만
 * 바꾼다(`settle`). 둘 다 DB가 판정하므로 동시에 눌러도 한 쪽만 이긴다.
 */
export interface SosStore {
  /** 이 채널의 모든 요청. */
  list(channelId: string): Promise<SosRequest[]>;
  /**
   * (채널·사례·새내기) 한 자리에 요청 하나. 이미 답을 기다리는 요청이 있으면
   * 그것을 돌려주고 `created: false`. 거절된 요청 자리는 새 요청이 대체한다.
   */
  claim(
    request: SosRequest,
  ): Promise<{ request: SosRequest; created: boolean }>;
  /** 아직 `pending`일 때만 답을 적는다. 남이 먼저 답했으면 undefined. */
  settle(
    request: SosRequest,
    status: "accepted" | "declined",
    now: number,
  ): Promise<SosRequest | undefined>;
}

const RECORD_SOS = "failfair:sos";

/** ID 안의 `:`이 키 경계를 흐리지 않도록 조각마다 감싼다. */
const part = (value: string) => encodeURIComponent(value);

function channelPrefix(channelId: string): string {
  return `${RECORD_SOS}:${part(channelId)}:`;
}

/** 한 새내기가 한 사례에 대해 가지는 자리 하나. 중복 방지를 DB 키로 보장한다. */
function slotKey(request: SosRequest): string {
  return (
    channelPrefix(request.channelId) +
    `${part(request.caseId)}:${part(request.studentManagerId)}`
  );
}

function parse(candidate: unknown): SosRequest | undefined {
  const parsed = SosRequestSchema.safeParse(candidate);
  return parsed.success ? parsed.data : undefined;
}

export const appRecordsSosStore: SosStore = {
  async list(channelId) {
    const rows = await listRecords<unknown>(channelPrefix(channelId));
    return rows.flatMap((row) => {
      const request = parse(row);
      return request ? [request] : [];
    });
  },

  async claim(request) {
    const key = slotKey(request);
    if (await insertRecordIfAbsent(key, request))
      return { request, created: true };
    const existing = parse(await getRecord<unknown>(key));
    // 자리는 있는데 읽지 못했다면(깨진 JSON) 경합이 아니라 손상이다. 그냥 덮어쓴다.
    if (!existing) {
      await setRecord(key, request);
      return { request, created: true };
    }
    // 거절당한 요청 자리에는 다시 부탁할 수 있다. 그 사이 남이 바꿨으면 다시 읽는다.
    if (existing.status === "declined") {
      if (await replaceRecordIfField(key, "status", "declined", request))
        return { request, created: true };
      const reread = parse(await getRecord<unknown>(key));
      return { request: reread ?? existing, created: false };
    }
    return { request: existing, created: false };
  },

  async settle(request, status, now) {
    const updated: SosRequest = { ...request, status, respondedAt: now };
    const changed = await replaceRecordIfField(
      slotKey(request),
      "status",
      "pending",
      updated,
    );
    return changed ? updated : undefined;
  },
};

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
  constructor(private readonly store: SosStore = appRecordsSosStore) {}

  /** 같은 새내기가 같은 사례에 보낸 대기 중 요청이 있으면 그것을 돌려준다 (중복 방지). */
  async request(
    input: {
      item: Case;
      channelId: string;
      chatId: string;
      chatType: string;
      chatTitle: string;
      studentManagerId: string;
      message: string;
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
    return this.store.claim({
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
    });
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
