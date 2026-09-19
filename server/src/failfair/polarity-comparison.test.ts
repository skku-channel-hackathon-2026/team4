import test from "node:test";
import assert from "node:assert/strict";
import { opposingPredicates } from "./polarity-comparison.js";
import { createTextSimilarity } from "./text-similarity.js";
const sim = createTextSimilarity([]);
test("repeating a complete message preserves negation scope", () => {
  const a = "공부할 시간이 부족하지 않아요";
  const b = "공부할 시간이 부족하다";
  const expected = opposingPredicates(a, b, sim);
  assert.ok(expected > 0);
  for (const repetitions of [2, 3, 4]) {
    assert.equal(
      opposingPredicates(Array(repetitions).fill(a).join(" "), b, sim),
      expected,
    );
    assert.equal(
      opposingPredicates(a, Array(repetitions).fill(b).join(" "), sim),
      expected,
    );
  }
});
test("explicit opposite predicates generalize across resources and goals", () => {
  for (const [a, b] of [
    ["장비를 대여할 수 없어요", "장비를 대여할 수 있어요"],
    ["예산이 충분하지 않아요", "예산이 충분하다"],
    ["회의 참석 가능", "회의 참석 불가"],
    ["대체 인원이 없음", "대체 인원이 있음"],
    ["기숙사가 가깝지 않아요", "기숙사가 가깝다"],
  ])
    assert.ok(opposingPredicates(a, b, sim) >= 0.75, `${a} / ${b}`);
});
test("shared words, questions, double negatives and different topics are not proof", () => {
  for (const [a, b] of [
    ["회의 참석 가능", "파일 복구 불가"],
    ["일정이 부족하지 않아요", "일정이 부족하지 않음"],
    ["장비를 대여할 수 없어요?", "장비를 대여할 수 있어요"],
    ["시간이 없지는 않아요", "시간이 없어요"],
    ["예산이 부족하면", "예산이 부족하지 않아요"],
  ])
    assert.equal(opposingPredicates(a, b, sim), 0, `${a} / ${b}`);
});
