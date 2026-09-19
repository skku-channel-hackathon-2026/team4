import assert from "node:assert/strict";
import test from "node:test";
import type { Context } from "@channel.io/app-sdk-server";
import { withDatabase, type AppDatabase } from "../database.js";
import { createTestDatabase } from "../test-database.js";
import {
  SessionService,
  d1SessionStore,
  requireState,
} from "./session.service.js";

/**
 * 저장소는 진짜 SQL로 돌린다. 여기서 확인하려는 것이 "두 창이 같은 버전으로 동시에 저장해도
 * 한 쪽만 이긴다"이므로, Map 대역으로는 정작 지켜야 할 것이 검사되지 않는다.
 */
const inDatabase = <T>(callback: (service: SessionService) => Promise<T>) => {
  const database = createTestDatabase();
  // 운영 HTTP DB와 같이 prepare만 제공한다.
  return withDatabase({ prepare: (sql) => database.prepare(sql) }, () =>
    callback(new SessionService(d1SessionStore)),
  );
};

const ctx = (managerId: string): Context =>
  ({
    caller: { type: "manager", id: managerId },
    channel: { id: "ch" },
  }) as Context;

const revisionOf = (error: unknown) =>
  (error as { data?: { revision?: number } }).data?.revision;

test("sessions are owner-scoped and hide other people's sessions", async () => {
  await inDatabase(async (service) => {
    const session = await service.create(ctx("me"), "team_project", "hi");
    assert.equal(session.state, "COLLECTING");
    assert.equal((await service.load(ctx("me"), session.id)).id, session.id);
    await assert.rejects(
      () => service.load(ctx("someone-else"), session.id),
      /not found/i,
    );
    await assert.rejects(
      () => service.load(ctx("me"), "s-없는-세션"),
      /not found/i,
    );
  });
});

test("mutate enforces expectedRevision and replays duplicate requestIds", async () => {
  await inDatabase(async (service) => {
    const session = await service.create(ctx("me"), "grades", "hi");

    const first = await service.mutate(session, "req-1", 0, (current) => {
      current.messages.push({ role: "student", content: "x", at: 1 });
      return { ok: 1 };
    });
    assert.deepEqual(first, { ok: 1 });
    assert.equal(session.revision, 1);

    // 재전송은 버전이 틀려도 저장된 응답을 그대로 돌려주고 아무것도 바꾸지 않는다.
    const replay = await service.mutate(session, "req-1", 99, () => ({
      ok: 2,
    }));
    assert.deepEqual(replay, { ok: 1 });
    assert.equal(session.revision, 1);

    // 다른 창에서 새로 읽은 세션으로 재전송해도 마찬가지다 (기억이 메모리가 아니라 DB에 있다).
    const reloaded = await service.load(ctx("me"), session.id);
    assert.deepEqual(
      await service.mutate(reloaded, "req-1", 1, () => ({ ok: 3 })),
      { ok: 1 },
    );
    assert.equal((await service.load(ctx("me"), session.id)).revision, 1);

    await assert.rejects(
      () => service.mutate(session, "req-2", 0, () => ({ ok: 3 })),
      (error: unknown) => {
        assert.match(String((error as Error).message), /changed/i);
        assert.equal(revisionOf(error), 1);
        return true;
      },
    );
  });
});

test("변경은 다시 읽어도 그대로다 — 대화·상황·상태가 통째로 저장된다", async () => {
  await inDatabase(async (service) => {
    const session = await service.create(ctx("me"), "club", "첫 질문");
    await service.mutate(session, "req-1", 0, (current) => {
      current.messages.push({ role: "student", content: "답", at: 2 });
      current.situation.goal = "역할 줄이기";
      current.state = "REVIEWING_SITUATION";
      current.questionCount = 1;
      return { ok: true };
    });
    const stored = await service.load(ctx("me"), session.id);
    assert.equal(stored.revision, 1);
    assert.equal(stored.state, "REVIEWING_SITUATION");
    assert.equal(stored.messages.length, 2);
    assert.equal(stored.situation.goal, "역할 줄이기");
    assert.equal(stored.questionCount, 1);
  });
});

test("두 창이 같은 버전으로 동시에 저장하면 한 쪽만 이기고 진 쪽은 최신 버전을 받는다", async () => {
  await inDatabase(async (service) => {
    const created = await service.create(ctx("me"), "team_project", "hi");
    const [windowA, windowB] = await Promise.all([
      service.load(ctx("me"), created.id),
      service.load(ctx("me"), created.id),
    ]);
    const tick = () => new Promise((resolve) => setTimeout(resolve, 1));
    const outcomes = await Promise.allSettled([
      service.mutate(windowA, "req-a", 0, async (current) => {
        await tick();
        current.situation.goal = "A";
        return { from: "A" };
      }),
      service.mutate(windowB, "req-b", 0, async (current) => {
        await tick();
        current.situation.goal = "B";
        return { from: "B" };
      }),
    ]);
    const won = outcomes.filter((outcome) => outcome.status === "fulfilled");
    const lost = outcomes.filter((outcome) => outcome.status === "rejected");
    assert.equal(
      won.length,
      1,
      "메모리 검사는 둘 다 통과해도 DB가 한 쪽만 받는다",
    );
    assert.equal(lost.length, 1);
    assert.equal(revisionOf((lost[0] as PromiseRejectedResult).reason), 1);

    const stored = await service.load(ctx("me"), created.id);
    assert.equal(stored.revision, 1);
    const winner = (won[0] as PromiseFulfilledResult<{ from: string }>).value
      .from;
    assert.equal(stored.situation.goal, winner, "이긴 쪽의 변경만 남는다");
  });
});

test("응답 기록이 실패하면 세션 변경도 남지 않아, 재시도가 같은 메시지를 두 번 넣지 않는다", async () => {
  const real = createTestDatabase();
  // 운영 HTTP 어댑터처럼 batch가 없고, 응답 INSERT만 실패하는 DB.
  await real
    .prepare(
      `CREATE TRIGGER reject_test_response
    BEFORE INSERT ON failfair_requests
    BEGIN SELECT RAISE(ABORT, 'response write failed'); END`,
    )
    .run();
  const flaky: AppDatabase = {
    prepare: (sql) => real.prepare(sql),
    batch: async () => {
      throw new Error("batch is unsupported");
    },
  };
  await withDatabase(flaky, async () => {
    const service = new SessionService(d1SessionStore);
    const session = await service.create(ctx("me"), "grades", "hi");
    const push = (current: typeof session) => {
      current.messages.push({ role: "student", content: "한 번만", at: 2 });
      return { ok: true };
    };
    await assert.rejects(
      () => service.mutate(session, "req-1", 0, push),
      /response write failed/,
    );
    const afterFailure = await service.load(ctx("me"), session.id);
    assert.equal(afterFailure.revision, 0, "세션 변경이 남지 않는다");
    assert.equal(afterFailure.messages.length, 1);
    await real.prepare("DROP TRIGGER reject_test_response").run();

    // 같은 requestId·같은 expectedRevision으로 재시도하면 정상 처리되고 메시지는 한 번만 들어간다.
    assert.deepEqual(await service.mutate(afterFailure, "req-1", 0, push), {
      ok: true,
    });
    const stored = await service.load(ctx("me"), session.id);
    assert.equal(stored.revision, 1);
    assert.equal(stored.messages.length, 2);
    assert.deepEqual(await service.mutate(stored, "req-1", 1, push), {
      ok: true,
    });
    assert.equal((await service.load(ctx("me"), session.id)).revision, 1);
  });
});

test("같은 requestId가 동시에 두 번 들어오면 한 번만 적용되고 둘 다 같은 응답을 받는다", async () => {
  await inDatabase(async (service) => {
    const created = await service.create(ctx("me"), "club", "hi");
    const [windowA, windowB] = await Promise.all([
      service.load(ctx("me"), created.id),
      service.load(ctx("me"), created.id),
    ]);
    const tick = () => new Promise((resolve) => setTimeout(resolve, 1));
    const push = async (current: typeof created) => {
      await tick();
      current.messages.push({ role: "student", content: "두 번 눌림", at: 2 });
      return { echo: current.messages.length };
    };
    const [a, b] = await Promise.all([
      service.mutate(windowA, "req-dup", 0, push),
      service.mutate(windowB, "req-dup", 0, push),
    ]);
    assert.deepEqual(a, b, "진 쪽도 이긴 쪽의 저장된 응답을 받는다");
    const stored = await service.load(ctx("me"), created.id);
    assert.equal(stored.revision, 1);
    assert.equal(stored.messages.length, 2, "메시지는 한 번만 들어간다");
  });
});

test("requireState rejects steps that are not allowed yet", async () => {
  await inDatabase(async (service) => {
    const session = await service.create(ctx("me"), "club", "hi");
    assert.throws(() => requireState(session, ["RESULTS"]), /not allowed/);
    requireState(session, ["COLLECTING"]);
  });
});
