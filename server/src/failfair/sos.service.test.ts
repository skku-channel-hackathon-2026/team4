import assert from "node:assert/strict";
import test from "node:test";
import { DEMO_CASES, type Case, type SosRequest } from "@tutorial/shared";
import {
  SosService,
  isContactable,
  sosRequestedText,
  type SosStore,
} from "./sos.service.js";

const memoryStore = (): SosStore & { items: SosRequest[] } => {
  const store = {
    items: [] as SosRequest[],
    async list() {
      return structuredClone(store.items);
    },
    async saveAll(items: SosRequest[]) {
      store.items = structuredClone(items);
    },
  };
  return store;
};

const realCase = (overrides: Partial<Case> = {}): Case => ({
  ...DEMO_CASES[0]!,
  id: "case-real-1",
  title: "연락 되는 선배",
  status: "approved",
  sourceType: "real",
  allowContact: true,
  authorManagerId: "senior-1",
  ...overrides,
});

test("가상 사례·연락 거부·본인 사례·미승인 사례에는 SOS를 보낼 수 없다", () => {
  assert.equal(isContactable(realCase(), "student-1"), true);
  assert.equal(isContactable(DEMO_CASES[0]!, "student-1"), false);
  assert.equal(
    isContactable(realCase({ allowContact: false }), "student-1"),
    false,
  );
  assert.equal(
    isContactable(realCase({ authorManagerId: undefined }), "student-1"),
    false,
  );
  assert.equal(isContactable(realCase(), "senior-1"), false);
  assert.equal(
    isContactable(realCase({ status: "draft" }), "student-1"),
    false,
  );
});

test("같은 새내기가 같은 사례에 다시 보내면 기존 대기 요청을 돌려준다", async () => {
  const store = memoryStore();
  const service = new SosService(store);
  const base = {
    item: realCase(),
    channelId: "c1",
    chatId: "g1",
    chatType: "group",
    studentManagerId: "student-1",
    message: "발표 8시간 남았는데 도와주세요",
  };
  const first = await service.request(base, 1000);
  assert.equal(first.created, true);
  assert.equal(first.request.seniorManagerId, "senior-1");
  assert.equal(first.request.status, "pending");
  const again = await service.request({ ...base, message: "다시" }, 2000);
  assert.equal(again.created, false);
  assert.equal(again.request.id, first.request.id);
  assert.equal(store.items.length, 1);
  await assert.rejects(
    () => service.request({ ...base, item: DEMO_CASES[0]! }),
    /cannot be contacted/,
  );
});

test("목록은 역할별로 갈리고, 답은 받은 선배만 할 수 있으며 한 번만 바뀐다", async () => {
  const store = memoryStore();
  const service = new SosService(store);
  const { request } = await service.request(
    {
      item: realCase(),
      channelId: "c1",
      chatId: "g1",
      chatType: "group",
      studentManagerId: "student-1",
      message: "도와주세요",
    },
    1000,
  );
  assert.equal((await service.listFor("c1", "student-1", "student")).length, 1);
  assert.equal((await service.listFor("c1", "senior-1", "senior")).length, 1);
  assert.equal((await service.listFor("c1", "senior-1", "student")).length, 0);
  assert.equal((await service.listFor("c2", "senior-1", "senior")).length, 0);

  await assert.rejects(
    () => service.respond("c1", "someone-else", request.id, "accepted"),
    /not found/,
  );
  const accepted = await service.respond(
    "c1",
    "senior-1",
    request.id,
    "accepted",
    5000,
  );
  assert.equal(accepted.changed, true);
  assert.equal(accepted.request.status, "accepted");
  assert.equal(accepted.request.respondedAt, 5000);
  const replay = await service.respond(
    "c1",
    "senior-1",
    request.id,
    "declined",
    6000,
  );
  assert.equal(replay.changed, false);
  assert.equal(replay.request.status, "accepted");
  assert.match(sosRequestedText(request), /연락 되는 선배/);
  assert.ok(!sosRequestedText(request).includes("student-1"));
});
