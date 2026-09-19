import test from "node:test";
import assert from "node:assert/strict";
import { compareConditions } from "./condition-comparison.js";

test("explicit named quantities preserve decimals and convert time units", () => {
  assert.equal(
    compareConditions(["평점 2.75"], ["평점 3.75"]).differences.length,
    1,
  );
  assert.equal(
    compareConditions(["통학 왕복 1.5시간"], ["통학 왕복 90분"]).differences
      .length,
    0,
  );
  assert.equal(
    compareConditions(["업무 담당 4명"], ["업무 담당 2명"]).differences.length,
    1,
  );
  assert.equal(
    compareConditions(["등록금 30만원"], ["통학 30분"]).comparable,
    0,
  );
});
test("only identical explicit subjects can establish opposite conditions", () => {
  assert.equal(
    compareConditions(["대체 인원 있음"], ["대체 인원 없음"]).differences
      .length,
    1,
  );
  assert.equal(
    compareConditions(["업무 분담 가능"], ["업무 분담 불가"]).differences
      .length,
    1,
  );
  assert.equal(
    compareConditions(["통화 가능"], ["자료 복구 불가"]).comparable,
    0,
  );
  assert.equal(compareConditions([], ["대체 인원 없음"]).comparable, 0);
  // Ambiguous free sentences are not interpreted as confirmed contradictions.
  assert.equal(
    compareConditions(["시간이 없진 않은데요"], ["시간이 많아요"]).comparable,
    0,
  );
});
