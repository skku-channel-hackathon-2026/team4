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
import { getRecord, setRecord } from "../records.js";

/**
 * SOS 요청 저장·규칙. B가 소유한다.
 * 사례와 같이 `app_records`에 JSON 배열로 둔다 (해커톤 규모).
 */
export interface SosStore {
  list(): Promise<SosRequest[]>;
  saveAll(items: SosRequest[]): Promise<void>;
}

const RECORD_SOS = "failfair:sos";

export const appRecordsSosStore: SosStore = {
  async list() {
    const raw = await getRecord<unknown>(RECORD_SOS);
    if (!Array.isArray(raw)) return [];
    return raw.flatMap((candidate) => {
      const parsed = SosRequestSchema.safeParse(candidate);
      return parsed.success ? [parsed.data] : [];
    });
  },
  async saveAll(items) {
    await setRecord(RECORD_SOS, items);
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
    const all = await this.store.list();
    const existing = all.find(
      (request) =>
        request.channelId === input.channelId &&
        request.caseId === input.item.id &&
        request.studentManagerId === input.studentManagerId &&
        request.status === "pending",
    );
    if (existing) return { request: existing, created: false };
    const request: SosRequest = {
      id: newSosId(now),
      caseId: input.item.id,
      caseTitle: input.item.title,
      channelId: input.channelId,
      chatId: input.chatId,
      chatType: input.chatType,
      studentManagerId: input.studentManagerId,
      seniorManagerId: input.item.authorManagerId ?? "",
      message: input.message,
      status: "pending",
      createdAt: now,
    };
    await this.store.saveAll([...all, request]);
    return { request, created: true };
  }

  /** 내가 보낸(student) 또는 나에게 온(senior) 요청. 최신순. */
  async listFor(
    channelId: string,
    managerId: string,
    role: "student" | "senior",
  ): Promise<SosRequest[]> {
    const all = await this.store.list();
    return all
      .filter(
        (request) =>
          request.channelId === channelId &&
          (role === "student"
            ? request.studentManagerId === managerId
            : request.seniorManagerId === managerId),
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
    const all = await this.store.list();
    const index = all.findIndex(
      (request) => request.id === sosId && request.channelId === channelId,
    );
    const target = all[index];
    if (!target || target.seniorManagerId !== seniorManagerId) throw notFound();
    if (target.status !== "pending") return { request: target, changed: false };
    const updated: SosRequest = { ...target, status, respondedAt: now };
    all[index] = updated;
    await this.store.saveAll(all);
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
