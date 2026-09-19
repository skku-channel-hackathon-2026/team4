import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { analyzeTurn } from "./analyze-turn.mjs";
import { createGeminiGateway } from "./gemini-gateway.mjs";
const read = (n) =>
  JSON.parse(readFileSync(new URL(n, import.meta.url), "utf8"));
const context = () => read("./situation.empty.json");
const message = read("./context-test-cases.json")[0].messages[0];
const result = () => ({
  context: read("./situation.example.json"),
  nextQuestionId: "q1",
});
const run = (output, ctx = context()) =>
  analyzeTurn(
    { context: ctx, messages: [], message },
    { generate: async () => output },
  );
test("extract situation and one question", async () => {
  const r = await run(result());
  assert.equal(r.status, "ok");
  assert.equal(r.kind, "question");
});
test("summary confirmation", async () =>
  assert.equal(
    (await run({ ...result(), nextQuestionId: null })).kind,
    "confirm_summary",
  ));
test("invalid model evidence preserves original", async () => {
  const o = result();
  o.context.situation.facts[0].evidence[0].quote = "없는 발언";
  const r = await run(o);
  assert.equal(r.status, "retry");
  assert.deepEqual(r.context, context());
});
test("model failure preserves original", async () => {
  const r = await analyzeTurn(
    { context: context(), messages: [], message },
    {
      generate: async () => {
        throw Error("secret");
      },
    },
  );
  assert.equal(r.reason, "model_error");
  assert.ok(!JSON.stringify(r).includes("secret"));
});
test("category cannot change", async () => {
  const o = result();
  o.context.category = "club";
  assert.equal((await run(o)).status, "retry");
});
test("nonexistent question rejected", async () =>
  assert.equal(
    (await run({ ...result(), nextQuestionId: "unknown" })).status,
    "retry",
  ));
test("refused question is not asked again", async () => {
  const c = context();
  c.situation.openQuestions = [
    { ...result().context.situation.openQuestions[0], status: "withheld" },
  ];
  assert.equal((await run(result(), c)).status, "retry");
});
test("Gemini request and JSON response", async () => {
  const gateway = createGeminiGateway({
    apiKey: "fake",
    model: "gemini-test",
    fetchImpl: async (url, init) => {
      assert.ok(url.endsWith("/gemini-test:generateContent"));
      assert.ok(!url.includes("fake"));
      const b = JSON.parse(init.body);
      assert.equal(b.generationConfig.responseMimeType, "application/json");
      assert.ok(init.signal);
      return {
        ok: true,
        json: async () => ({
          candidates: [
            {
              finishReason: "STOP",
              content: { parts: [{ text: JSON.stringify(result()) }] },
            },
          ],
        }),
      };
    },
  });
  assert.deepEqual(
    await gateway.generate({ instruction: "test", schema: {}, input: {} }),
    result(),
  );
});
test("HTTP and truncated output fail", async () => {
  for (const response of [
    { ok: false, status: 429 },
    {
      ok: true,
      json: async () => ({ candidates: [{ finishReason: "MAX_TOKENS" }] }),
    },
  ]) {
    const g = createGeminiGateway({
      apiKey: "fake",
      model: "gemini-test",
      fetchImpl: async () => response,
    });
    await assert.rejects(
      g.generate({ instruction: "", schema: {}, input: {} }),
    );
  }
});

test("confirmed and rejected records cannot be downgraded, changed or deleted", async () => {
  const messages = read("./messages.search-ready.example.json");
  for (const field of ["consideredActions", "interpretations"])
    for (const status of ["confirmed", "rejected"])
      for (const mode of ["downgrade", "delete", "change"]) {
        const c = read("./situation.search-ready.example.json");
        if (field === "interpretations")
          c.situation.interpretations = [
            {
              id: "i1",
              text: "확인된 해석",
              basedOnFactIds: ["f1"],
              status,
              confirmationEvidence: [
                { messageId: "u2", quote: messages[1].text },
              ],
            },
          ];
        c.situation[field][0].status = status;
        const changed = structuredClone(c);
        if (mode === "delete") changed.situation[field].shift();
        else if (mode === "downgrade") {
          changed.situation[field][0].status =
            field === "consideredActions" ? "proposed" : "needs_confirmation";
          changed.situation[field][0].confirmationEvidence = [];
        } else changed.situation[field][0].text = "모델이 변경";
        const r = await analyzeTurn(
          {
            context: c,
            messages,
            message: { id: "u3", role: "user", text: "계속" },
          },
          {
            generate: async () => ({ context: changed, nextQuestionId: null }),
          },
        );
        assert.equal(
          r.reason,
          "unapproved_confirmation",
          `${field} ${status} ${mode}`,
        );
      }
});
test("issued question becomes asked and cannot be repeated or forgotten", async () => {
  const first = await run(result());
  assert.equal(first.context.situation.openQuestions[0].status, "asked");
  const second = await analyzeTurn(
    {
      context: first.context,
      messages: [message],
      message: { id: "u2", role: "user", text: "음" },
    },
    { generate: async () => result() },
  );
  assert.equal(second.reason, "invalid_question");
  const omitted = structuredClone(first.context);
  omitted.situation.openQuestions = [];
  const third = await analyzeTurn(
    {
      context: first.context,
      messages: [message],
      message: { id: "u2", role: "user", text: "음" },
    },
    { generate: async () => ({ context: omitted, nextQuestionId: null }) },
  );
  assert.equal(third.context.situation.openQuestions[0].status, "asked");
});
