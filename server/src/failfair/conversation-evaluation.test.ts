import test from "node:test";
import assert from "node:assert/strict";
import { runConversation } from "./evaluation/conversation.js";
import { RuleBasedGateway, type AnalyzeInput } from "./model-gateway.js";

test("evaluation forwards updated situation and assistant history", async () => {
  const inputs: AnalyzeInput[] = [];
  const gateway = new RuleBasedGateway();
  gateway.analyze = async (i) => {
    inputs.push(structuredClone(i));
    return {
      situation: { ...i.situation, goal: "업데이트" },
      readyToConfirm: false,
      nextQuestion: "마감은?",
      pendingField: "deadline",
    };
  };
  const r = await runConversation(gateway, {
    id: "test",
    category: "grades",
    turns: [{ message: "첫 말" }, { message: "두 번째 말" }],
  });
  assert.equal(r.passed, true);
  assert.equal(inputs[1].situation.goal, "업데이트");
  assert.equal(inputs[1].questionCount, 1);
  assert.equal(inputs[1].pendingField, "deadline");
  assert.deepEqual(
    inputs[1].messages.map((m) => m.role),
    ["student", "assistant", "student"],
  );
});
test("evaluation records failure without leaking provider error or retrying", async () => {
  const gateway = new RuleBasedGateway();
  let calls = 0;
  gateway.analyze = async () => {
    calls++;
    throw Error("private-provider-detail");
  };
  const r = await runConversation(gateway, {
    id: "error",
    category: "grades",
    turns: [{ message: "첫 말" }, { message: "다음 말" }],
  });
  assert.equal(r.passed, false);
  assert.equal(calls, 1);
  assert.ok(!JSON.stringify(r).includes("private-provider-detail"));
});
test("quality criteria can fail a structurally valid response", async () => {
  const gateway = new RuleBasedGateway();
  gateway.analyze = async (i) => ({
    situation: i.situation,
    readyToConfirm: true,
  });
  const r = await runConversation(gateway, {
    id: "quality",
    category: "grades",
    turns: [{ message: "입력", check: () => ["목표 누락"] }],
  });
  assert.equal(r.passed, false);
  assert.deepEqual(r.turns[0].failures, ["목표 누락"]);
});
