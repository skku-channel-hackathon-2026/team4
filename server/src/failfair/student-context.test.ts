import test from "node:test";
import assert from "node:assert/strict";
import {
  ContextItemSchema,
  ContextDeltaSchema,
  SituationSchema,
  toLegacySituation,
  type ContextItem,
} from "@tutorial/shared";
import {
  reconcileConfirmedContext,
  applyContextDelta,
  projectContext,
  recordContextQuestion,
} from "./student-context.js";
import { normalizeSituation } from "./session.service.js";
import { FallbackGateway, RuleBasedGateway } from "./model-gateway.js";
const messages = [
  {
    role: "student" as const,
    content: "모임은 계속 하고 싶어. 야간 근무는 바꿀 수 없어. 기한은 몰라요.",
    at: 0,
  },
];
const entry = (
  id: string,
  kind: ContextItem["kind"],
  value: string,
  quote: string,
): ContextItem => ({
  id,
  topic: id,
  kind,
  value,
  status: "stated",
  evidence: [{ messageIndex: 0, quote }],
});
const preference = entry(
  "social",
  "preference",
  "모임 유지",
  "모임은 계속 하고 싶어",
);
const restriction = entry(
  "work",
  "constraint",
  "야간 근무 변경 불가",
  "야간 근무는 바꿀 수 없어",
);
const unknown: ContextItem = {
  id: "available_time",
  topic: "이용 가능한 시간",
  kind: "unknown",
  value: "",
  status: "missing",
  evidence: [],
};

test("preferences and hypotheses cannot become legacy restrictions", () => {
  const hypothesis: ContextItem = {
    ...entry(
      "overload",
      "hypothesis",
      "시간 부족 가능성",
      "야간 근무는 바꿀 수 없어",
    ),
    status: "inferred",
  };
  const c = applyContextDelta(
    undefined,
    { upsert: [preference, restriction, hypothesis], remove: [] },
    messages,
    4,
  );
  assert.deepEqual(projectContext(c).constraints, [
    "work: 야간 근무 변경 불가",
  ]);
  assert.equal(c.items[0].evidence[0].messageIndex, 4);
});
test("omitted items survive, explicit corrections replace rather than append", () => {
  const first = applyContextDelta(
    undefined,
    { upsert: [preference, restriction], remove: [] },
    messages,
    0,
  );
  const corrected = {
    ...preference,
    value: "모임 중단",
    evidence: [{ messageIndex: 0, quote: "모임은 그만 할래" }],
  };
  const second = applyContextDelta(
    first,
    { upsert: [corrected], remove: [] },
    [{ role: "student", content: "모임은 그만 할래", at: 1 }],
    1,
  );
  assert.equal(second.items.length, 2);
  assert.equal(second.items[0].value, "모임 중단");
  assert.deepEqual(second.items[1], first.items[1]);
  assert.equal(first.items[0].value, "모임 유지");
});
test("absence, explicit uncertainty and refusal have distinct contracts", () => {
  assert.ok(ContextItemSchema.safeParse(unknown).success);
  assert.equal(
    ContextItemSchema.safeParse({ ...unknown, status: "unsure" }).success,
    false,
  );
  assert.equal(
    ContextItemSchema.safeParse({ ...preference, status: "inferred" }).success,
    false,
  );
  const unsure: ContextItem = {
    ...unknown,
    status: "unsure",
    evidence: [{ messageIndex: 0, quote: "기한은 몰라요" }],
  };
  const c = applyContextDelta(
    undefined,
    { upsert: [unsure], remove: [] },
    messages,
    0,
  );
  assert.throws(
    () => recordContextQuestion(c, unknown.id),
    /Invalid question topic/,
  );
  assert.throws(
    () => applyContextDelta(c, { upsert: [unknown], remove: [] }, messages, 0),
    /downgrade/,
  );
});
test("reworded questions cannot ask the same stable topic twice", () => {
  const c = applyContextDelta(
    undefined,
    { upsert: [unknown], remove: [] },
    messages,
    0,
  );
  const asked = recordContextQuestion(c, unknown.id);
  assert.throws(
    () => recordContextQuestion(asked, unknown.id),
    /Repeated question topic/,
  );
  assert.deepEqual(c.askedTopicIds, []);
});
test("invalid quotes, assistant quotes and conflicting updates fail without mutation", () => {
  assert.throws(
    () =>
      applyContextDelta(
        undefined,
        { upsert: [preference], remove: [] },
        [{ ...messages[0], role: "assistant" }],
        0,
      ),
    /evidence/,
  );
  assert.throws(
    () =>
      applyContextDelta(undefined, { upsert: [preference], remove: [] }, [], 0),
    /evidence/,
  );
  assert.throws(
    () =>
      applyContextDelta(
        undefined,
        { upsert: [preference, preference], remove: [] },
        messages,
        0,
      ),
    /Conflicting/,
  );
  assert.equal(
    ContextDeltaSchema.safeParse({
      upsert: [],
      remove: [{ id: "a", evidence: [] }],
    }).success,
    false,
  );
});
test("removal needs a student quote and does not remove other facts", () => {
  const c = applyContextDelta(
    undefined,
    { upsert: [preference, restriction], remove: [] },
    messages,
    0,
  );
  const result = applyContextDelta(
    c,
    {
      upsert: [],
      remove: [
        {
          id: "social",
          evidence: [{ messageIndex: 0, quote: "모임 유지 말은 취소" }],
        },
      ],
    },
    [{ role: "student", content: "모임 유지 말은 취소", at: 1 }],
    1,
  );
  assert.deepEqual(
    result.items.map((i) => i.id),
    ["work"],
  );
  assert.equal(c.items.length, 2);
});
test("session roundtrip retains context while search projection removes it", () => {
  const studentContext = applyContextDelta(
    undefined,
    { upsert: [preference], remove: [] },
    messages,
    0,
  );
  const situation = SituationSchema.parse({ category: "club", studentContext });
  assert.deepEqual(
    normalizeSituation(situation).studentContext,
    studentContext,
  );
  assert.equal(toLegacySituation(situation).studentContext, undefined);
});
test("provider failure cannot silently replace structured context with keyword rules", async () => {
  const rule = new RuleBasedGateway();
  const g = new FallbackGateway(
    "gemini",
    {
      analyze: async () => {
        throw Error("provider failed");
      },
      suggestActions: rule.suggestActions.bind(rule),
    },
    rule,
    () => {},
  );
  const situation = SituationSchema.parse({
    category: "club",
    studentContext: { version: "1.0", items: [], askedTopicIds: [] },
  });
  await assert.rejects(
    g.analyze({
      category: "club",
      situation,
      messages: [],
      message: "안녕",
      questionCount: 0,
    }),
    /Structured context analysis failed/,
  );
});

test("review edits update projections and retain preferences with user evidence", () => {
  const studentContext = applyContextDelta(
    undefined,
    { upsert: [preference, restriction], remove: [] },
    messages,
    0,
  );
  const old = SituationSchema.parse({
    category: "club",
    constraints: [restriction.value],
    studentContext,
  });
  const history = [...messages];
  const next = reconcileConfirmedContext(
    old,
    { ...old, goal: "일정 조정", constraints: [] },
    history,
  );
  assert.equal(history.length, 2);
  assert.deepEqual(projectContext(next.studentContext!).constraints, []);
  assert.equal(
    projectContext(next.studentContext!).goal,
    "원하는 결과: 일정 조정",
  );
  assert.ok(next.studentContext!.items.some((i) => i.id === "social"));
  assert.equal(
    next.studentContext!.items.find((i) => i.kind === "goal")!.evidence[0]
      .messageIndex,
    1,
  );
});
