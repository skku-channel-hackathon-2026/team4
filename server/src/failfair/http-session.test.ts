import test from "node:test";
import assert from "node:assert/strict";
import type { Context } from "@channel.io/app-sdk-server";
import { withDatabase, type AppDatabase } from "../database.js";
import { createTestDatabase } from "../test-database.js";
import { SessionService, d1SessionStore } from "./session.service.js";
const ctx = {
  caller: { type: "manager", id: "test" },
  channel: { id: "test" },
} as Context;
test("HTTP database without batch commits and replays a reply", async () => {
  const db = createTestDatabase();
  await withDatabase(
    { prepare: (sql) => db.prepare(sql) } as AppDatabase,
    async () => {
      const service = new SessionService(d1SessionStore);
      const session = await service.create(ctx, "grades", "question");
      const result = await service.mutate(session, "request-1", 0, (s) => {
        s.situation.goal = "도움 받기";
        return { ok: true };
      });
      assert.deepEqual(result, { ok: true });
      const loaded = await service.load(ctx, session.id);
      assert.equal(loaded.revision, 1);
      assert.equal(loaded.situation.goal, "도움 받기");
      assert.deepEqual(
        await service.mutate(loaded, "request-1", 0, () => {
          throw Error("must not repeat");
        }),
        result,
      );
    },
  );
});
test("HTTP commit rolls back when response persistence fails", async () => {
  const db = createTestDatabase();
  await withDatabase(
    { prepare: (sql) => db.prepare(sql) } as AppDatabase,
    async () => {
      const service = new SessionService(d1SessionStore);
      const session = await service.create(ctx, "grades", "question");
      await db
        .prepare(
          "CREATE TRIGGER fail_response BEFORE INSERT ON failfair_requests BEGIN SELECT RAISE(ABORT, 'test response failure'); END",
        )
        .run();
      await assert.rejects(
        () =>
          service.mutate(session, "request-1", 0, (s) => {
            s.situation.goal = "not saved";
            return { ok: true };
          }),
        /test response failure/,
      );
      const loaded = await service.load(ctx, session.id);
      assert.equal(loaded.revision, 0);
      assert.equal(loaded.situation.goal, "");
      await db.prepare("DROP TRIGGER fail_response").run();
      await service.mutate(loaded, "request-1", 0, () => ({ ok: true }));
      assert.equal((await service.load(ctx, session.id)).revision, 1);
    },
  );
});
test("HTTP concurrent requests keep one winner and replay older responses", async () => {
  const db = createTestDatabase();
  await withDatabase(
    { prepare: (sql) => db.prepare(sql) } as AppDatabase,
    async () => {
      const service = new SessionService(d1SessionStore);
      const session = await service.create(ctx, "grades", "question");
      const a = await service.load(ctx, session.id),
        b = await service.load(ctx, session.id);
      const results = await Promise.allSettled([
        service.mutate(a, "a", 0, () => ({ winner: "a" })),
        service.mutate(b, "b", 0, () => ({ winner: "b" })),
      ]);
      assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
      const loaded = await service.load(ctx, session.id);
      await service.mutate(loaded, "next", 1, () => ({ next: true }));
      assert.deepEqual(
        await service.mutate(loaded, "a", 0, () => ({ bad: true })),
        { winner: "a" },
      );
    },
  );
});
