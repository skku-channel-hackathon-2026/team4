import assert from "node:assert/strict";
import test from "node:test";
import type { Context } from "@channel.io/app-sdk-server";
import {
  SessionService,
  requireState,
  type SessionStore,
  type StoredSession,
} from "./session.service.js";

function memoryStore(): SessionStore & { map: Map<string, StoredSession> } {
  const map = new Map<string, StoredSession>();
  return {
    map,
    load: async (id) => map.get(id),
    save: async (session) => {
      map.set(session.id, structuredClone(session));
    },
  };
}

const ctx = (managerId: string): Context =>
  ({
    caller: { type: "manager", id: managerId },
    channel: { id: "ch" },
  }) as Context;

test("sessions are owner-scoped and hide other people's sessions", async () => {
  const service = new SessionService(memoryStore());
  const session = await service.create(ctx("me"), "team_project", "hi");
  assert.equal(session.state, "COLLECTING");
  assert.equal((await service.load(ctx("me"), session.id)).id, session.id);
  await assert.rejects(
    () => service.load(ctx("someone-else"), session.id),
    /not found/i,
  );
});

test("mutate enforces expectedRevision and replays duplicate requestIds", async () => {
  const service = new SessionService(memoryStore());
  const session = await service.create(ctx("me"), "grades", "hi");

  const first = await service.mutate(session, "req-1", 0, (current) => {
    current.messages.push({ role: "student", content: "x", at: 1 });
    return { ok: 1 };
  });
  assert.deepEqual(first, { ok: 1 });
  assert.equal(session.revision, 1);

  const replay = await service.mutate(session, "req-1", 99, () => ({ ok: 2 }));
  assert.deepEqual(replay, { ok: 1 });
  assert.equal(session.revision, 1);

  await assert.rejects(
    () => service.mutate(session, "req-2", 0, () => ({ ok: 3 })),
    /changed/i,
  );
});

test("requireState rejects steps that are not allowed yet", async () => {
  const service = new SessionService(memoryStore());
  const session = await service.create(ctx("me"), "club", "hi");
  assert.throws(() => requireState(session, ["RESULTS"]), /not allowed/);
  requireState(session, ["COLLECTING"]);
});
