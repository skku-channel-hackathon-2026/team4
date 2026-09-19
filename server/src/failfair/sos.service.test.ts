import assert from "node:assert/strict";
import test from "node:test";
import { DEMO_CASES, type Case, type SosRequest } from "@tutorial/shared";
import { withDatabase } from "../database.js";
import { createTestDatabase } from "../test-database.js";
import {
  SosService,
  d1SosStore,
  isContactable,
  sosRequestedText,
} from "./sos.service.js";

/**
 * 저장소는 진짜 SQL(조건부 INSERT/UPDATE)로 돌린다. 여기서 확인하려는 것이
 * "동시에 눌러도 남의 요청·남의 수락이 사라지지 않는다"이므로, 대역으로 흉내 내면
 * 정작 지켜야 할 것이 검사되지 않는다.
 */
const inDatabase = <T>(callback: (service: SosService) => Promise<T>) =>
  withDatabase(createTestDatabase(), () =>
    callback(new SosService(d1SosStore)),
  );

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

let sent = 0;
const ask = (
  overrides: Partial<Parameters<SosService["request"]>[0]> = {},
) => ({
  item: realCase(),
  // 전송마다 새 ID. 재전송을 흉내 낼 때만 같은 값을 넘긴다.
  requestId: `send-${(sent += 1)}`,
  channelId: "c1",
  chatId: "g1",
  chatType: "group",
  chatTitle: "앱_개발_검증",
  studentManagerId: "student-1",
  message: "발표 8시간 남았는데 도와주세요",
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
  await inDatabase(async (service) => {
    const first = await service.request(ask(), 1000);
    assert.equal(first.created, true);
    assert.equal(first.request.seniorManagerId, "senior-1");
    assert.equal(first.request.status, "pending");
    assert.equal(first.request.chatTitle, "앱_개발_검증");

    // 다른 방에서 다시 보내도 대기 중인 요청은 하나. 알림이 갈 방도 처음 그대로다.
    const again = await service.request(
      ask({ message: "다시", chatId: "g2", chatTitle: "다른방" }),
      2000,
    );
    assert.equal(again.created, false);
    assert.equal(again.request.id, first.request.id);
    assert.equal(again.request.chatId, "g1");
    assert.equal(
      (await service.listFor("c1", "student-1", "student")).length,
      1,
    );

    await assert.rejects(
      () => service.request(ask({ item: DEMO_CASES[0]! })),
      /cannot be contacted/,
    );
  });
});

test("거절당한 뒤에는 같은 선배에게 새 요청을 보낼 수 있다", async () => {
  await inDatabase(async (service) => {
    const { request } = await service.request(ask(), 1000);
    await service.respond("c1", "senior-1", request.id, "declined", 2000);

    const retry = await service.request(
      ask({
        message: "한 번만 더 부탁드려요",
        chatId: "g2",
        chatTitle: "다른방",
      }),
      3000,
    );
    assert.equal(retry.created, true);
    assert.equal(retry.request.status, "pending");
    assert.equal(retry.request.chatId, "g2");
    // 거절 이력은 남고 새 요청이 맨 앞에 온다. 화면은 사례별로 첫 번째(최신)를 고른다.
    const mine = await service.listFor("c1", "student-1", "student");
    assert.equal(mine.length, 2);
    assert.equal(mine[0]!.message, "한 번만 더 부탁드려요");
    assert.equal(mine[0]!.status, "pending");
    assert.equal(mine[1]!.status, "declined");
    // 대기 중인 요청이 생겼으니 또 보내면 그것을 돌려준다.
    const third = await service.request(ask({ message: "세 번째" }), 4000);
    assert.equal(third.created, false);
    assert.equal(third.request.id, retry.request.id);
  });
});

test("목록은 역할별로 갈리고, 답은 받은 선배만 할 수 있으며 한 번만 바뀐다", async () => {
  await inDatabase(async (service) => {
    const { request } = await service.request(ask(), 1000);
    assert.equal(
      (await service.listFor("c1", "student-1", "student")).length,
      1,
    );
    assert.equal((await service.listFor("c1", "senior-1", "senior")).length, 1);
    assert.equal(
      (await service.listFor("c1", "senior-1", "student")).length,
      0,
    );
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
});

test("응답만 잃고 같은 requestId로 재전송하면, 선배가 그 사이 수락했어도 새 SOS가 생기지 않는다", async () => {
  await inDatabase(async (service) => {
    const first = await service.request(ask({ requestId: "send-x" }), 1000);
    await service.respond("c1", "senior-1", first.request.id, "accepted", 2000);

    const retransmit = await service.request(
      ask({ requestId: "send-x", message: "같은 내용" }),
      3000,
    );
    assert.equal(retransmit.created, false, "알림도 다시 나가지 않는다");
    assert.equal(retransmit.request.id, first.request.id);
    assert.equal(retransmit.request.status, "accepted");
    assert.equal(
      (await service.listFor("c1", "student-1", "student")).length,
      1,
    );

    // 새 전송 ID면 새 상담이다. 수락된 이력은 남고 대기 중 요청이 하나 더 생긴다.
    const fresh = await service.request(ask({ requestId: "send-y" }), 4000);
    assert.equal(fresh.created, true);
    assert.notEqual(fresh.request.id, first.request.id);
    assert.equal(
      (await service.listFor("c1", "student-1", "student")).length,
      2,
    );
  });
});

test("같은 전송이 동시에 두 번 들어와도 요청은 하나이고 둘 다 같은 요청을 받는다", async () => {
  await inDatabase(async (service) => {
    const [a, b] = await Promise.all([
      service.request(ask({ requestId: "send-same" }), 1000),
      service.request(ask({ requestId: "send-same" }), 1000),
    ]);
    assert.equal([a, b].filter((result) => result.created).length, 1);
    assert.equal(a.request.id, b.request.id);
  });
});

test("동시에 보낸 두 새내기의 요청이 서로를 지우지 않는다", async () => {
  await inDatabase(async (service) => {
    const [a, b] = await Promise.all([
      service.request(ask({ studentManagerId: "student-1" }), 1000),
      service.request(ask({ studentManagerId: "student-2" }), 1000),
    ]);
    assert.equal(a.created, true);
    assert.equal(b.created, true);
    assert.equal(
      (await service.listFor("c1", "senior-1", "senior")).length,
      2,
      "둘 다 남아야 한다",
    );
  });
});

test("수락과 다른 새내기의 새 요청이 겹쳐도 수락이 되돌아가지 않는다", async () => {
  await inDatabase(async (service) => {
    const { request } = await service.request(
      ask({ studentManagerId: "student-1" }),
      1000,
    );
    const [accepted] = await Promise.all([
      service.respond("c1", "senior-1", request.id, "accepted", 2000),
      service.request(ask({ studentManagerId: "student-2" }), 2000),
    ]);
    assert.equal(accepted.changed, true);

    const inbox = await service.listFor("c1", "senior-1", "senior");
    assert.equal(inbox.length, 2);
    const mine = inbox.find((item) => item.studentManagerId === "student-1");
    assert.equal(mine?.status, "accepted", "수락이 그대로 남아야 한다");
  });
});

test("같은 요청에 수락과 거절이 겹치면 한 쪽만 이기고 알림도 한 번만 나간다", async () => {
  await inDatabase(async (service) => {
    const { request } = await service.request(ask(), 1000);
    const [first, second] = await Promise.all([
      service.respond("c1", "senior-1", request.id, "accepted", 2000),
      service.respond("c1", "senior-1", request.id, "declined", 2000),
    ]);
    const changes = [first, second].filter((result) => result.changed);
    assert.equal(changes.length, 1, "알림은 changed일 때만 나간다");

    const [stored] = await service.listFor("c1", "senior-1", "senior");
    assert.equal(stored!.status, changes[0]!.request.status);
    // 진 쪽도 저장된 상태를 돌려줘, 화면이 자기가 누른 답을 잘못 보여 주지 않는다.
    const loser = [first, second].find((result) => !result.changed);
    assert.equal(loser!.request.status, stored!.status);
  });
});

test("같은 새내기가 동시에 두 번 눌러도 요청은 하나다", async () => {
  await inDatabase(async (service) => {
    const [a, b] = await Promise.all([
      service.request(ask({ message: "첫 번째" }), 1000),
      service.request(ask({ message: "두 번째" }), 1000),
    ]);
    assert.equal([a, b].filter((result) => result.created).length, 1);
    const mine = await service.listFor("c1", "student-1", "student");
    assert.equal(mine.length, 1);
    assert.equal(a.request.id, b.request.id);
  });
});

test("채널이 다르면 요청도 섞이지 않는다", async () => {
  await inDatabase(async (service) => {
    await service.request(ask({ channelId: "c1" }), 1000);
    await service.request(ask({ channelId: "c2" }), 1000);
    assert.equal((await service.listFor("c1", "senior-1", "senior")).length, 1);
    assert.equal((await service.listFor("c2", "senior-1", "senior")).length, 1);
  });
});

test("요청은 어느 방에서 시작했는지 그대로 지니고 다닌다", async () => {
  await inDatabase(async (service) => {
    const { request } = await service.request(
      ask({ chatId: "g-study", chatTitle: "자료구조 스터디" }),
      1000,
    );
    const [seen] = await service.listFor("c1", "senior-1", "senior");
    assert.equal(seen!.chatId, "g-study");
    assert.equal(seen!.chatTitle, "자료구조 스터디");
    const answered = await service.respond(
      "c1",
      "senior-1",
      request.id,
      "accepted",
      2000,
    );
    assert.equal(answered.request.chatId, "g-study");
    assert.equal(answered.request.chatTitle, "자료구조 스터디");
  });
});

/** 저장 형식이 바뀌어도 화면이 읽는 필드는 그대로여야 한다. */
test("저장된 요청은 스키마를 통과한다", async () => {
  await inDatabase(async (service) => {
    const { request } = await service.request(ask(), 1000);
    const stored: SosRequest = (
      await service.listFor("c1", "student-1", "student")
    )[0]!;
    assert.deepEqual(stored, request);
  });
});
