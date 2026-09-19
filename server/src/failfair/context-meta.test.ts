import test from "node:test";
import assert from "node:assert/strict";
import {
  toLegacySituation,
  validateContextMeta,
  unknownsConflicts,
  pruneResolvedUnknowns,
  canonicalUnknownLabel,
} from "@tutorial/shared";
import type { Situation, Message } from "@tutorial/shared";
import { normalizeSituation } from "./session.service.js";

const base = (): Situation => ({
  category: "grades",
  situation: "",
  goal: "",
  deadline: { raw: "", urgency: "unknown" },
  progress: "",
  constraints: [],
  attemptedActions: [],
  consideredActions: [],
  unknowns: [],
});
const msgs = (): Message[] => [
  { role: "student", content: "생활비 때문에 알바를 줄일 수 없어", at: 1 },
];

test("canonicalUnknownLabel maps aliases/english keys and leaves free labels", () => {
  assert.equal(canonicalUnknownLabel("마감"), "마감·남은 시간");
  assert.equal(canonicalUnknownLabel("남은 과제 마감일"), "마감·남은 시간");
  assert.equal(canonicalUnknownLabel("deadline"), "마감·남은 시간");
  assert.equal(canonicalUnknownLabel("목표"), "원하는 결과");
  assert.equal(canonicalUnknownLabel("진행상황"), "진행 상황");
  // 네 주제가 아닌 자유 라벨은 그대로 둔다.
  assert.equal(
    canonicalUnknownLabel("교수님과 소통 가능 여부"),
    "교수님과 소통 가능 여부",
  );
});

test("toLegacySituation strips contextMeta for external/search projection", () => {
  const s: Situation = { ...base(), contextMeta: { schemaVersion: "0.3" } };
  assert.equal(toLegacySituation(s).contextMeta, undefined);
  // 다른 필드는 그대로 유지한다.
  assert.equal(toLegacySituation(s).category, "grades");
});

test("unknownsConflicts flags a filled field that is also in unknowns", () => {
  const conflicted: Situation = {
    ...base(),
    goal: "낙제 피하기",
    deadline: { raw: "3일", urgency: "week" },
    unknowns: ["원하는 결과", "진행 상황"], // goal은 값이 있는데 unknowns에 있음
  };
  assert.deepEqual(unknownsConflicts(conflicted), ["원하는 결과"]);
  // 값이 없는 진행 상황은 정상적으로 남는다.
  assert.deepEqual(pruneResolvedUnknowns(conflicted).unknowns, ["진행 상황"]);
  // 모든 필드가 비어 있으면 아무것도 제거하지 않는다.
  assert.deepEqual(
    unknownsConflicts({ ...base(), unknowns: ["원하는 결과"] }),
    [],
  );
});

test("normalizeSituation drops resolved fields from unknowns (pollution guard)", () => {
  const polluted: Situation = {
    ...base(),
    goal: "낙제 피하기",
    unknowns: ["원하는 결과"],
  };
  assert.equal(
    normalizeSituation(polluted).unknowns.includes("원하는 결과"),
    false,
  );
});

test("normalizeSituation preserves contextMeta and omits it when absent", () => {
  const withMeta: Situation = {
    ...base(),
    contextMeta: { schemaVersion: "0.3" },
  };
  assert.deepEqual(normalizeSituation(withMeta).contextMeta, {
    schemaVersion: "0.3",
  });
  assert.equal("contextMeta" in normalizeSituation(base()), false);
});

test("validateContextMeta accepts a well-formed snapshot", () => {
  const s: Situation = {
    ...base(),
    constraints: ["생활비 때문에 알바를 줄일 수 없어"],
    unknowns: ["예산"],
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
      ],
      topicStates: [{ label: "예산", status: "unknown" }],
    },
  };
  assert.deepEqual(validateContextMeta(s, msgs()), []);
});

test("validateContextMeta flags bad quote, out-of-range item, and known-in-unknowns", () => {
  const badQuote: Situation = {
    ...base(),
    situation: "요약",
    contextMeta: {
      schemaVersion: "0.3",
      fieldEvidence: [
        { field: "situation", refs: [{ messageIndex: 0, quote: "없는 말" }] },
      ],
    },
  };
  assert.ok(validateContextMeta(badQuote, msgs()).length > 0);

  const outOfRange: Situation = {
    ...base(),
    contextMeta: {
      schemaVersion: "0.3",
      fieldEvidence: [
        {
          field: "constraints",
          itemIndex: 5,
          refs: [
            { messageIndex: 0, quote: "생활비 때문에 알바를 줄일 수 없어" },
          ],
        },
      ],
    },
  };
  assert.ok(validateContextMeta(outOfRange, msgs()).length > 0);

  const knownInUnknowns: Situation = {
    ...base(),
    unknowns: ["예산"],
    contextMeta: {
      schemaVersion: "0.3",
      topicStates: [
        {
          label: "예산",
          status: "known",
          evidence: [
            { messageIndex: 0, quote: "생활비 때문에 알바를 줄일 수 없어" },
          ],
        },
      ],
    },
  };
  assert.ok(
    validateContextMeta(knownInUnknowns, msgs()).some((e) =>
      e.includes("known"),
    ),
  );
});
