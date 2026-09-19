import test from "node:test";
import assert from "node:assert/strict";
import {
  distributedScores,
  DIMENSIONS,
  type Components,
  type ScoreInput,
} from "./distributed-score.js";
const row = (
  components: Partial<Components>,
  studentTexts: ScoreInput["studentTexts"] = {},
  caseTexts: ScoreInput["caseTexts"] = {},
): ScoreInput => ({
  components: {
    problem: 0,
    context: 0,
    constraints: 0,
    goal: 0,
    urgency: 0,
    ...components,
  },
  studentTexts,
  caseTexts,
});
test("distributed evidence can outrank a single perfect tag or deadline", () => {
  const scores = distributedScores([
    row({ problem: 1 }),
    row({ context: 0.15, constraints: 0.23, goal: 0.26 }),
    row({ urgency: 1 }),
  ]);
  assert.ok(scores[1].score > scores[0].score);
  assert.ok(scores[1].score > scores[2].score);
  for (const score of scores)
    for (const key of DIMENSIONS)
      assert.ok(Math.abs(score.contributions[key]) <= 20);
});
test("unknown dimensions do not lend their budget to a lone matching field", () => {
  assert.equal(distributedScores([row({ goal: 1 })])[0].score, 20);
  assert.equal(distributedScores([row({})])[0].score, 0);
  assert.equal(distributedScores([row({ constraints: -1 })])[0].score, -20);
});
test("repeating the same fact across fields shares a single budget on either side", () => {
  for (const side of ["studentTexts", "caseTexts"] as const) {
    const r = row({ context: 1, constraints: 1, goal: 1 });
    r[side] = {
      context: "근무 일정 고정",
      constraints: "일정 고정 근무",
      goal: "근무 일정 고정 근무",
    };
    assert.equal(distributedScores([r])[0].score, 20);
  }
});
test("weak overlap cannot receive a full vote just by being the best candidate", () => {
  assert.ok(distributedScores([row({ context: 0.001 })])[0].score < 1);
});
test("ablation never redistributes omitted weights and duplicate scores keep their rank votes", () => {
  const a = row({ problem: 1, context: 0.3, goal: 0.1 });
  const b = row({ problem: 0, context: 0.15, goal: 0.5 });
  const base = distributedScores([a, b]);
  const ablated = distributedScores([a, b], ["problem"]);
  for (let i = 0; i < base.length; i++) {
    for (const key of DIMENSIONS.filter((k) => k !== "problem"))
      assert.equal(ablated[i].contributions[key], base[i].contributions[key]);
    assert.equal(ablated[i].contributions.problem, 0);
  }
  assert.deepEqual(distributedScores([a, b, b]).slice(0, 2), base);
});
