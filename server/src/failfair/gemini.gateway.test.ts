import test from "node:test";
import assert from "node:assert/strict";
import { GeminiGateway } from "./gemini.gateway.js";
import {
  createModelGateway,
  RuleBasedGateway,
  type AnalyzeInput,
} from "./model-gateway.js";
const input = (): AnalyzeInput => ({
  category: "grades",
  situation: {
    category: "grades",
    situation: "",
    goal: "",
    deadline: { raw: "", urgency: "unknown" },
    progress: "",
    constraints: [],
    attemptedActions: [],
    consideredActions: [],
    unknowns: [],
  },
  messages: [
    { role: "student", content: "생활비 때문에 알바를 줄일 수 없어", at: 1 },
  ],
  message: "생활비 때문에 알바를 줄일 수 없어",
  questionCount: 0,
});
const output = () => ({
  situation: {
    ...input().situation,
    situation: "생활비 때문에 알바를 줄일 수 없어",
  },
  nextQuestion: "가장 가까운 마감은 언제인가요?",
  pendingField: "deadline",
  readyToConfirm: false,
  evidence: [
    {
      path: "situation",
      messageIndex: 0,
      quote: "생활비 때문에 알바를 줄일 수 없어",
    },
  ],
});
const mock =
  (data: unknown, finishReason = "STOP"): typeof fetch =>
  async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    const payload = JSON.parse(body.contents[0].parts[0].text);
    assert.equal(payload.messages.length, 1);
    assert.ok(init?.signal);
    return new Response(
      JSON.stringify({
        candidates: [
          {
            finishReason,
            content: { parts: [{ text: JSON.stringify(data) }] },
          },
        ],
      }),
      { status: 200 },
    );
  };
const gateway = (data: unknown) =>
  new GeminiGateway(
    "fake",
    new RuleBasedGateway(),
    "gemini-3.1-flash-lite",
    mock(data),
  );
test("factory selects configured provider and rejects missing keys", () => {
  assert.ok(createModelGateway({}) instanceof RuleBasedGateway);
  assert.ok(
    createModelGateway({
      MODEL_PROVIDER: "gemini",
      GEMINI_API_KEY: "fake",
    }) instanceof GeminiGateway,
  );
  assert.throws(() => createModelGateway({ MODEL_PROVIDER: "gemini" }));
});
test("Gemini preserves context and emits one question without duplicating message", async () => {
  const before = input();
  const copy = structuredClone(before);
  const result = await gateway(output()).analyze(before);
  assert.equal(result.situation.situation, output().situation.situation);
  assert.equal(result.pendingField, "deadline");
  assert.deepEqual(before, copy);
});
test("Gemini keeps the major its response schema never carries", async () => {
  const before = input();
  before.situation.major = {
    collegeId: "engineering",
    department: "기계공학부",
  };
  const raw = output();
  // 모델 응답에는 전공이 없다. 그대로 돌려주면 학생이 고른 값이 사라진다.
  assert.equal("major" in raw.situation, false);

  const result = await gateway(raw).analyze(before);
  assert.deepEqual(result.situation.major, {
    collegeId: "engineering",
    department: "기계공학부",
  });
});
test("invalid category, evidence, required fields and problem types fail closed", async () => {
  for (const mutate of [
    (o: any) => (o.situation.category = "club"),
    (o: any) => (o.evidence[0].quote = "없는 말"),
    (o: any) => (o.evidence = []),
    (o: any) => delete o.situation.constraints,
    (o: any) => (o.situation.problemType = "invented"),
    (o: any) => (o.readyToConfirm = true),
  ]) {
    const o = output();
    mutate(o);
    await assert.rejects(gateway(o).analyze(input()), /Gemini analysis failed/);
  }
});
test("timeout and blocked response fail without changing input", async () => {
  const i = input(),
    old = structuredClone(i);
  const g = new GeminiGateway(
    "fake",
    new RuleBasedGateway(),
    "gemini-3.1-flash-lite",
    async () => {
      throw Error("secret key");
    },
  );
  await assert.rejects(g.analyze(i), /^Error: Gemini analysis failed/);
  assert.deepEqual(i, old);
  await assert.rejects(
    new GeminiGateway(
      "fake",
      new RuleBasedGateway(),
      "gemini-3.1-flash-lite",
      mock(output(), "MAX_TOKENS"),
    ).analyze(i),
  );
});
test("question limit stops followups", async () =>
  assert.equal(
    (await gateway(output()).analyze({ ...input(), questionCount: 3 }))
      .readyToConfirm,
    true,
  ));
test("declined fields cannot be asked again", async () => {
  const i = input();
  i.situation.unknowns = ["마감·남은 시간"];
  const o = output();
  o.situation.unknowns = ["마감·남은 시간"];
  await assert.rejects(gateway(o).analyze(i));
});
test("action suggestions remain catalog backed", async () => {
  const actions = await gateway(output()).suggestActions(input().situation);
  assert.equal(actions.length, 3);
});

test("unknown fields need no invented evidence and rooted evidence paths normalize", async () => {
  const o = output();
  o.situation.unknowns = ["마감"];
  o.evidence[0].path = "situation.situation";
  assert.equal(
    (await gateway(o).analyze(input())).situation.unknowns[0],
    "마감",
  );
});
test("explicit summary request stops questions", async () => {
  const i = input();
  i.message += " 지금 정보로 정리해줘";
  i.messages[0].content = i.message;
  assert.equal((await gateway(output()).analyze(i)).readyToConfirm, true);
});
