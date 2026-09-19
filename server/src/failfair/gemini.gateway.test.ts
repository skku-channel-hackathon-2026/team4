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
test("invalid category, evidence, required fields and problem types fail closed", async () => {
  for (const mutate of [
    (o: any) => (o.situation.category = "club"),
    // deadline.raw는 근거 필수: 잘못된 인용은 거부한다.
    (o: any) => {
      o.situation.deadline.raw = "8시간";
      o.evidence.push({
        path: "deadline.raw",
        messageIndex: 0,
        quote: "없는 말",
      });
    },
    // deadline.raw를 채웠는데 근거가 없으면 거부한다.
    (o: any) => (o.situation.deadline.raw = "8시간"),
    (o: any) => delete o.situation.constraints,
    (o: any) => (o.situation.problemType = "invented"),
    (o: any) => (o.readyToConfirm = true),
  ]) {
    const o = output();
    mutate(o);
    await assert.rejects(gateway(o).analyze(input()), /Gemini analysis failed/);
  }
});
test("interpretive fields no longer require an exact-quote (goal/progress/situation)", async () => {
  const o = output();
  o.situation.goal = "성적을 회복하는 것"; // 원문에 그대로 없는 의역된 목표
  o.situation.progress = "성적이 많이 떨어짐";
  o.evidence = []; // 해석 필드는 근거가 없어도 통과해야 한다
  const result = await gateway(o).analyze(input());
  assert.equal(result.situation.goal, "성적을 회복하는 것");
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
test("declined fields cannot be asked again (prior withheld state)", async () => {
  const i = input();
  i.situation.unknowns = ["마감·남은 시간"];
  i.situation.contextMeta = {
    schemaVersion: "0.3",
    topicStates: [
      {
        label: "마감·남은 시간",
        status: "withheld",
        evidence: [
          { messageIndex: 0, quote: "생활비 때문에 알바를 줄일 수 없어" },
        ],
      },
    ],
  };
  const o = output(); // pendingField: deadline → 재질문 시도
  o.situation.unknowns = ["마감·남은 시간"];
  await assert.rejects(gateway(o).analyze(i));
});
test("declined guard blocks a currently-withheld field but not an unasked one", async () => {
  // unasked 주제는 unknowns에 있어도 물어볼 수 있다(회귀 방지: turn1 오작동).
  const unasked: any = output();
  unasked.situation.unknowns = ["마감·남은 시간"];
  unasked.unknownSignals = [{ label: "마감·남은 시간", status: "unasked" }];
  const ok = await gateway(unasked).analyze(input());
  assert.equal(ok.pendingField, "deadline");
  // 이번 턴에 withheld로 표시된 필드는 재질문을 막는다.
  const withheld: any = output();
  withheld.situation.unknowns = ["마감·남은 시간"];
  withheld.unknownSignals = [
    {
      label: "마감·남은 시간",
      status: "withheld",
      messageIndex: 0,
      quote: "생활비 때문에 알바를 줄일 수 없어",
    },
  ];
  await assert.rejects(gateway(withheld).analyze(input()));
});
test("action suggestions remain catalog backed", async () => {
  const actions = await gateway(output()).suggestActions(input().situation);
  assert.equal(actions.length, 3);
});

test("unknown fields need no invented evidence and rooted evidence paths normalize", async () => {
  const o = output();
  o.situation.unknowns = ["교수님 반응"]; // 네 주제가 아닌 자유 라벨은 그대로 통과
  o.evidence[0].path = "situation.situation";
  assert.equal(
    (await gateway(o).analyze(input())).situation.unknowns[0],
    "교수님 반응",
  );
});
test("explicit summary request stops questions", async () => {
  const i = input();
  i.message += " 지금 정보로 정리해줘";
  i.messages[0].content = i.message;
  assert.equal((await gateway(output()).analyze(i)).readyToConfirm, true);
});
test("not ready to confirm requires both question and field", async () => {
  for (const mutate of [
    (o: any) => (o.pendingField = null),
    (o: any) => (o.nextQuestion = null),
  ]) {
    const o = output();
    o.readyToConfirm = false;
    mutate(o);
    await assert.rejects(gateway(o).analyze(input()), /Gemini analysis failed/);
  }
});
test("deadline urgency is rule-corrected from the raw text", async () => {
  const i = input();
  i.messages = [{ role: "student", content: "발표가 3일 남았어", at: 1 }];
  i.message = "발표가 3일 남았어";
  const o: any = output();
  o.situation.deadline = { raw: "3일", urgency: "today" }; // 모델 오분류
  o.nextQuestion = "지금까지 어떻게 준비했나요?";
  o.pendingField = "progress";
  o.evidence = [{ path: "deadline.raw", messageIndex: 0, quote: "3일" }];
  const r = await gateway(o).analyze(i);
  assert.equal(r.situation.deadline.urgency, "week");
});
test("unknowns labels are canonicalized to Korean and de-duplicated", async () => {
  const o: any = output();
  o.readyToConfirm = true;
  o.nextQuestion = null;
  o.pendingField = null;
  o.evidence = [];
  o.situation.unknowns = ["deadline", "마감·남은 시간", "progress"]; // 영문키 + 중복
  const result = await gateway(o).analyze(input());
  assert.deepEqual(result.situation.unknowns, ["마감·남은 시간", "진행 상황"]);
});
test("context meta is absent when the write toggle is off (legacy A)", async () => {
  const result = await gateway(output()).analyze(input());
  assert.equal(result.situation.contextMeta, undefined);
});
test("context meta maps evidence to session indices and unknowns to topic states", async () => {
  const i = input();
  // 18개 메시지 → recent는 마지막 16개, sessionOffset = 2.
  i.messages = Array.from({ length: 18 }, (_, k) => ({
    role: "student" as const,
    content: k === 17 ? "생활비 때문에 알바를 줄일 수 없어" : `m${k}`,
    at: k,
  }));
  i.message = "생활비 때문에 알바를 줄일 수 없어";
  const o = output();
  o.situation.situation = "생활비 때문에 알바를 줄일 수 없어";
  o.situation.unknowns = ["진행 상황"]; // pendingField(deadline)와 다른 라벨
  o.evidence = [
    {
      path: "situation",
      messageIndex: 15,
      quote: "생활비 때문에 알바를 줄일 수 없어",
    },
  ];
  const fetchImpl: typeof fetch = async () =>
    new Response(
      JSON.stringify({
        candidates: [
          {
            finishReason: "STOP",
            content: { parts: [{ text: JSON.stringify(o) }] },
          },
        ],
      }),
      { status: 200 },
    );
  const g = new GeminiGateway(
    "fake",
    new RuleBasedGateway(),
    "gemini-3.1-flash-lite",
    fetchImpl,
    true, // enableContextMeta
  );
  const meta = (await g.analyze(i)).situation.contextMeta;
  assert.equal(meta?.schemaVersion, "0.3");
  assert.equal(meta?.fieldEvidence?.[0].field, "situation");
  assert.equal(meta?.fieldEvidence?.[0].refs[0].messageIndex, 17); // 2 + 15
  assert.ok(
    meta?.topicStates?.some(
      (t) => t.label === "진행 상황" && t.status === "unknown",
    ),
  );
});
test("unknownSignals map to topic states; unsure/withheld need a valid student quote", async () => {
  const msg = "마감일은 몰라요 진행 상황은 말하고 싶지 않아요";
  const build = (signals: unknown) => {
    const o: any = output();
    o.situation.situation = "상황 요약";
    o.situation.unknowns = ["마감·남은 시간", "진행 상황", "고려 중인 행동"];
    o.readyToConfirm = true;
    o.nextQuestion = null;
    o.pendingField = null;
    o.evidence = [];
    o.unknownSignals = signals;
    const i = input();
    i.messages = [{ role: "student", content: msg, at: 1 }];
    i.message = msg;
    const fetchImpl: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          candidates: [
            {
              finishReason: "STOP",
              content: { parts: [{ text: JSON.stringify(o) }] },
            },
          ],
        }),
        { status: 200 },
      );
    return new GeminiGateway(
      "fake",
      new RuleBasedGateway(),
      "gemini-3.1-flash-lite",
      fetchImpl,
      true,
    ).analyze(i);
  };
  const meta = (
    await build([
      {
        label: "마감·남은 시간",
        status: "unsure",
        messageIndex: 0,
        quote: "마감일은 몰라요",
      },
      {
        label: "진행 상황",
        status: "withheld",
        messageIndex: 0,
        quote: "진행 상황은 말하고 싶지 않아요",
      },
      { label: "고려 중인 행동", status: "unasked" },
    ])
  ).situation.contextMeta;
  const byLabel = Object.fromEntries(
    (meta?.topicStates ?? []).map((t) => [t.label, t]),
  );
  assert.equal(byLabel["마감·남은 시간"].status, "unsure");
  assert.equal(byLabel["마감·남은 시간"].evidence[0].quote, "마감일은 몰라요");
  assert.equal(byLabel["진행 상황"].status, "withheld");
  assert.equal(byLabel["고려 중인 행동"].status, "unknown");

  // 근거 인용이 원문과 안 맞으면 unsure로 단정하지 않고 unknown으로 강등한다.
  const meta2 = (
    await build([
      {
        label: "마감·남은 시간",
        status: "unsure",
        messageIndex: 0,
        quote: "없는 말",
      },
      { label: "진행 상황", status: "unasked" },
      { label: "고려 중인 행동", status: "unasked" },
    ])
  ).situation.contextMeta;
  const d = (meta2?.topicStates ?? []).find(
    (t) => t.label === "마감·남은 시간",
  );
  assert.equal(d?.status, "unknown");
});
test("a repeated question ends in confirmation and records the unanswered field", async () => {
  const i = input();
  i.messages = [
    { role: "student", content: "생활비 때문에 알바를 줄일 수 없어", at: 1 },
    { role: "assistant", content: "가장 가까운 마감은 언제인가요?", at: 2 },
    { role: "student", content: "생활비 때문에 알바를 줄일 수 없어", at: 3 },
  ];
  const fetchImpl: typeof fetch = async () =>
    new Response(
      JSON.stringify({
        candidates: [
          {
            finishReason: "STOP",
            content: { parts: [{ text: JSON.stringify(output()) }] },
          },
        ],
      }),
      { status: 200 },
    );
  const g = new GeminiGateway(
    "fake",
    new RuleBasedGateway(),
    "gemini-3.1-flash-lite",
    fetchImpl,
  );
  const result = await g.analyze(i);
  assert.equal(result.readyToConfirm, true);
  assert.equal(result.nextQuestion, undefined);
  assert.ok(result.situation.unknowns.includes("마감·남은 시간"));
});
test("rate limit (429) is retried with backoff before succeeding", async () => {
  let calls = 0;
  const fetchImpl: typeof fetch = async () => {
    calls++;
    if (calls === 1) return new Response("{}", { status: 429 });
    return new Response(
      JSON.stringify({
        candidates: [
          {
            finishReason: "STOP",
            content: { parts: [{ text: JSON.stringify(output()) }] },
          },
        ],
      }),
      { status: 200 },
    );
  };
  const g = new GeminiGateway(
    "fake",
    new RuleBasedGateway(),
    "gemini-3.1-flash-lite",
    fetchImpl,
  );
  const result = await g.analyze(input());
  assert.equal(calls, 2);
  assert.equal(result.pendingField, "deadline");
});
