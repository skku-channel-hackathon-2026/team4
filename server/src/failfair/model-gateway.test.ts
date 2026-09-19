import assert from "node:assert/strict";
import test from "node:test";
import type { Situation } from "@tutorial/shared";
import {
  RuleBasedGateway,
  detectActionLabels,
  detectProblemType,
  detectUrgency,
  extractDeadlineRaw,
  summarizeSituation,
} from "./model-gateway.js";

const empty = (category: Situation["category"]): Situation => ({
  category,
  situation: "",
  goal: "",
  deadline: { raw: "", urgency: "unknown" },
  progress: "",
  constraints: [],
  attemptedActions: [],
  consideredActions: [],
  unknowns: [],
});

test("keyword extractors read urgency, deadline, actions, and problem type", () => {
  const text =
    "발표가 내일인데 한 명이 잠수탔어요. 8시간 남았고 제가 다 할지 교수님께 말할지 모르겠어요";
  assert.equal(detectUrgency(text), "today");
  assert.equal(extractDeadlineRaw(text), "8시간 남았고");
  assert.deepEqual(detectActionLabels("team_project", text), [
    "혼자 마무리",
    "교수님께 상황 전달",
  ]);
  assert.equal(detectProblemType("team_project", text), "unreachable_member");
});

test("rule-based gateway asks for the first missing field, then confirms", async () => {
  const gateway = new RuleBasedGateway();
  const first = await gateway.analyze({
    category: "team_project",
    situation: empty("team_project"),
    messages: [],
    message:
      "발표 전날인데 팀원 한 명이 잠수탔어요. 혼자 다 할지 교수님께 말할지 고민이에요",
    questionCount: 0,
  });
  assert.equal(first.readyToConfirm, false);
  assert.equal(first.pendingField, "deadline");
  assert.equal(first.situation.problemType, "unreachable_member");
  assert.equal(first.situation.consideredActions.length, 2);

  const second = await gateway.analyze({
    category: "team_project",
    situation: first.situation,
    messages: [],
    message: "8시간 남았어요",
    pendingField: "deadline",
    questionCount: 1,
  });
  assert.equal(second.situation.deadline.urgency, "today");
  assert.equal(second.pendingField, "progress");

  // 진행 상황을 묻는 중에 명시적인 마감을 말하면 마감이 갱신되고 진행은 비어 있어야 한다.
  const deadlineWhileProgress = await gateway.analyze({
    category: "team_project",
    situation: {
      ...second.situation,
      deadline: { raw: "내일", urgency: "today" },
    },
    messages: [],
    message: "6시간 남았어요",
    pendingField: "progress",
    questionCount: 2,
  });
  assert.equal(deadlineWhileProgress.situation.deadline.raw, "6시간 남았어요");
  assert.equal(deadlineWhileProgress.situation.progress, "");

  const third = await gateway.analyze({
    category: "team_project",
    situation: second.situation,
    messages: [],
    message: "모르겠어요",
    pendingField: "progress",
    questionCount: 2,
  });
  assert.equal(third.readyToConfirm, true);
  assert.ok(third.situation.unknowns.includes("진행 상황"));
  assert.match(summarizeSituation(third.situation), /8시간 남았어요/);
});

test("suggestActions keeps the student's actions first and fills from the catalog", async () => {
  const gateway = new RuleBasedGateway();
  const actions = await gateway.suggestActions({
    ...empty("team_project"),
    consideredActions: ["교수님께 상황 전달"],
  });
  assert.equal(actions.length, 3);
  assert.equal(actions[0]?.origin, "student");
  assert.equal(actions[0]?.actionTag, "inform_professor");
  assert.ok(actions.slice(1).every((action) => action.origin === "suggested"));
  assert.equal(new Set(actions.map((action) => action.actionTag)).size, 3);
});
