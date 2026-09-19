import "reflect-metadata";
import test from "node:test";
import assert from "node:assert/strict";
import type { Context } from "@channel.io/app-sdk-server";
import {
  SituationSchema,
  toLegacySituation,
  validateContextMeta,
  type Situation,
  type Message,
} from "@tutorial/shared";
import { GeminiGateway } from "./gemini.gateway.js";
import { RuleBasedGateway } from "./model-gateway.js";
import { SessionService, type StoredSession } from "./session.service.js";
import { preserveContextMeta } from "./context-metadata.js";

const studentText = "생활비 때문에 알바를 줄일 수 없어. 수업도 빠질 수 없어.";
const messages: Message[] = [{ role: "student", content: studentText, at: 1 }];
const base = (): Situation =>
  SituationSchema.parse({
    category: "grades",
    constraints: ["생활비 때문에 알바를 줄일 수 없어", "수업도 빠질 수 없어"],
    contextMeta: {
      schemaVersion: "0.3",
      fieldEvidence: [
        {
          field: "constraints",
          itemIndex: 0,
          refs: [
            { messageIndex: 0, quote: "생활비 때문에 알바를 줄일 수 없어" },
          ],
        },
        {
          field: "constraints",
          itemIndex: 1,
          refs: [{ messageIndex: 0, quote: "수업도 빠질 수 없어" }],
        },
      ],
    },
  });

test("confirmation remaps reordered evidence and invalidates edited values", () => {
  const previous = base();
  const reordered = preserveContextMeta(
    previous,
    {
      ...toLegacySituation(previous),
      constraints: [...previous.constraints].reverse(),
    },
    messages,
  );
  assert.deepEqual(
    reordered.contextMeta?.fieldEvidence?.map((e) =>
      "itemIndex" in e ? e.itemIndex : -1,
    ),
    [1, 0],
  );
  assert.deepEqual(validateContextMeta(reordered, messages), []);
  const changed = preserveContextMeta(
    previous,
    {
      ...toLegacySituation(previous),
      constraints: ["교수님 거절", previous.constraints[1]],
    },
    messages,
  );
  assert.equal(changed.contextMeta?.fieldEvidence?.length, 1);
  assert.equal(
    (changed.contextMeta?.fieldEvidence?.[0] as { itemIndex: number })
      .itemIndex,
    1,
  );
  assert.equal(previous.contextMeta?.fieldEvidence?.length, 2);
});

test("stored metadata rejects whitespace and ignores client-injected refs", () => {
  const previous = base();
  previous.contextMeta!.fieldEvidence![0].refs[0].quote = "\t";
  assert.ok(validateContextMeta(previous, messages).length);
  const forged = base();
  forged.contextMeta!.fieldEvidence![0].refs[0].quote = "forged";
  const result = preserveContextMeta(base(), forged, messages);
  assert.deepEqual(validateContextMeta(result, messages), []);
  assert.equal(
    result.contextMeta?.fieldEvidence?.[0].refs[0].quote,
    "생활비 때문에 알바를 줄일 수 없어",
  );
});

test("analysis → next turn → confirm without metadata → session reload preserves refs", async () => {
  const records = new Map<string, StoredSession>();
  const sessions = new SessionService({
    load: async (id) => {
      const s = records.get(id);
      return s ? structuredClone(s) : undefined;
    },
    save: async (s) => {
      records.set(s.id, structuredClone(s));
    },
  });
  const ctx = {
    caller: { type: "manager", id: "me" },
    channel: { id: "ch" },
  } as Context;
  const session = await sessions.create(ctx, "grades", "무슨 일이 있었나요?");
  let calls = 0;
  const gateway = new GeminiGateway(
    "fake",
    new RuleBasedGateway(),
    "gemini-3.1-flash-lite",
    async () => {
      calls++;
      const situation = toLegacySituation(base());
      const output = {
        situation,
        nextQuestion: null,
        pendingField: null,
        readyToConfirm: true,
        evidence:
          calls === 1
            ? [
                {
                  path: "constraints.0",
                  messageIndex: 1,
                  quote: "생활비 때문에 알바를 줄일 수 없어",
                },
                {
                  path: "constraints.1",
                  messageIndex: 1,
                  quote: "수업도 빠질 수 없어",
                },
              ]
            : [],
      };
      return new Response(
        JSON.stringify({
          candidates: [
            {
              finishReason: "STOP",
              content: { parts: [{ text: JSON.stringify(output) }] },
            },
          ],
        }),
      );
    },
    true,
  );
  // Test-only credentials; the injected store/model make no external requests.
  process.env.APP_ID = "context-lifecycle-test";
  process.env.APP_SECRET = "test-only-secret";
  process.env.SIGNING_KEY = "11".repeat(32);
  const { FailfairFunctions } = await import("./functions.js");
  const functions = new FailfairFunctions();
  Object.defineProperties(functions, {
    sessions: { value: sessions },
    models: { value: { resolve: async () => gateway } },
  });
  await functions.reply(ctx, {
    sessionId: session.id,
    requestId: "first",
    expectedRevision: 0,
    message: studentText,
  });
  await functions.reply(ctx, {
    sessionId: session.id,
    requestId: "second",
    expectedRevision: 1,
    message: "그대로예요",
  });
  const before = await sessions.load(ctx, session.id);
  assert.equal(before.situation.contextMeta?.fieldEvidence?.length, 2);
  await functions.confirmSituation(ctx, {
    sessionId: session.id,
    requestId: "confirm",
    expectedRevision: 2,
    situation: toLegacySituation(before.situation),
  });
  const after = await sessions.load(ctx, session.id);
  assert.equal(after.state, "REVIEWING_ACTIONS");
  assert.deepEqual(after.situation.contextMeta, before.situation.contextMeta);
  assert.deepEqual(validateContextMeta(after.situation, after.messages), []);
  assert.equal(calls, 2);
});
