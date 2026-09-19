import assert from "node:assert/strict";
import test from "node:test";
import type { Context } from "@channel.io/app-sdk-server";
import { withDatabase } from "../database.js";
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
const inDatabase = <T>(callback: (service: SessionService) => Promise<T>) =>
  withDatabase(createTestDatabase(), () =>
    callback(new SessionService(d1SessionStore)),
  );

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

test("requireState rejects steps that are not allowed yet", async () => {
  await inDatabase(async (service) => {
    const session = await service.create(ctx("me"), "club", "hi");
    assert.throws(() => requireState(session, ["RESULTS"]), /not allowed/);
    requireState(session, ["COLLECTING"]);
  });
});
