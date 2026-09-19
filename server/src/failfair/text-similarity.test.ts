import test from "node:test";
import assert from "node:assert/strict";
import { createTextSimilarity } from "./text-similarity.js";
test("Korean particles share features without requiring identical words", () => {
  const sim = createTextSimilarity(["팀원과 연락이 끊김", "도서관 좌석"]);
  assert.ok(
    sim("팀원 연락", "팀원과 연락이 끊김") > sim("팀원 연락", "도서관 좌석"),
  );
});
test("repeated keywords do not inflate binary term frequency", () => {
  const sim = createTextSimilarity(["과제 제출", "휴학 신청"]);
  assert.equal(
    sim("과제 제출", "과제 제출"),
    sim("과제 제출", "과제 제출 과제 과제 제출"),
  );
});
test("empty and bare numeric input are not context evidence", () => {
  const sim = createTextSimilarity(["13일", "3일"]);
  assert.equal(sim("", ""), 0);
  assert.equal(sim("3.1", "3.1"), 0);
  assert.equal(sim("13일", "3일"), 0);
});
