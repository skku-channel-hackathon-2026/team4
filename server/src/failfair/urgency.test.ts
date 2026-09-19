import test from "node:test";
import assert from "node:assert/strict";
import { explicitDurationUrgency } from "./urgency.js";
for (const [text, expected] of [
  ["13일 남았어", "later"],
  ["14일 남았어요", "later"],
  ["23일 남았어요", "later"],
  ["30일 남았어요", "later"],
  ["48시간 남았어", "week"],
  ["48시간 남았음", "week"],
  ["24시간", "today"],
  ["7일", "week"],
  ["8일", "later"],
  ["0.5주", "week"],
  ["13일 아니고 3일", undefined],
  ["48시간 이상", undefined],
  ["내일일 수도 있어", undefined],
] as const) {
  test(`explicit duration ${text}`, () =>
    assert.equal(explicitDurationUrgency(text), expected));
}
