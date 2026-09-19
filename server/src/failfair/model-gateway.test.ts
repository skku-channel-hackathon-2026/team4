import assert from "node:assert/strict";
import test from "node:test";
import type { Situation } from "@tutorial/shared";
import {
  FallbackGateway,
  RuleBasedGateway,
  describeModelConfig,
  detectActionLabels,
  detectProblemType,
  detectUrgency,
  extractDeadlineRaw,
  acknowledge,
  summarizeSituation,
  type ModelGateway,
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

test("questions lead with what the student just said instead of reading a field name", async () => {
  const gateway = new RuleBasedGateway();
  const message =
    "발표까지 8시간 남았는데 팀원이 잠수탔어요. 혼자 다 할지 교수님께 말할지 고민이에요";
  const result = await gateway.analyze({
    category: "team_project",
    situation: empty("team_project"),
    messages: [{ role: "student", content: message, at: 1 }],
    message,
    questionCount: 0,
  });
  assert.ok(result.nextQuestion);
  // 방금 말한 마감과 행동을 한 구절로 받아 준 뒤에 질문이 온다.
  assert.match(result.nextQuestion, /빠듯하네요/);
  assert.match(result.nextQuestion, /혼자 마무리, 교수님께 상황 전달 사이에서/);
  assert.match(result.nextQuestion, /\?$/);
  // 설문지처럼 읽히는 괄호 예시는 없다.
  assert.doesNotMatch(result.nextQuestion, /\(예:/);

  // 건너뛴 답에는 받아 주는 말을 붙이지 않는다.
  const skipped = await gateway.analyze({
    category: "team_project",
    situation: result.situation,
    messages: [],
    message: "모르겠어요",
    pendingField: result.pendingField,
    questionCount: 1,
  });
  if (skipped.nextQuestion)
    assert.doesNotMatch(skipped.nextQuestion, /군요|네요/);

  // 새로 알게 된 것이 없으면 빈 문자열. 첫 턴에 상황만 들었으면 짧게 받아 준다.
  assert.equal(acknowledge(result.situation, result.situation), "");
  assert.equal(
    acknowledge(empty("grades"), {
      ...empty("grades"),
      situation: "시험을 망쳤어요",
    }),
    "무슨 일인지 알겠어요.",
  );
});

test("summary reads as a recap and tells the student what to press next", () => {
  const text = summarizeSituation({
    ...empty("grades"),
    situation: "중간고사를 망쳤어요",
    unknowns: ["마감·남은 시간"],
  });
  assert.match(text, /^제가 이해한 걸 정리해 볼게요\./);
  assert.match(text, /아직 못 들었어요/);
  assert.match(text, /아직 모르는 것: 마감·남은 시간/);
  assert.match(text, /「맞아요」/);
  assert.doesNotMatch(text, /미확인/);
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

test("FallbackGateway answers with the rule-based gateway when the primary fails", async () => {
  const logs: string[] = [];
  const failing: ModelGateway = {
    analyze: async () => {
      throw new Error("HTTP failure");
    },
    suggestActions: async () => {
      throw new Error("boom");
    },
  };
  const gateway = new FallbackGateway(
    "gemini",
    failing,
    new RuleBasedGateway(),
    (message) => logs.push(message),
  );
  const message = "발표가 8시간 남았는데 팀원이 잠수탔어요";
  const result = await gateway.analyze({
    category: "team_project",
    situation: empty("team_project"),
    messages: [{ role: "student", content: message, at: 1 }],
    message,
    questionCount: 0,
  });
  assert.equal(result.situation.deadline.urgency, "today");
  assert.ok(result.nextQuestion || result.readyToConfirm);
  assert.equal(logs.length, 1);
  assert.match(logs[0], /gemini analyze failed/);
  assert.match(logs[0], /HTTP failure/);
  const actions = await gateway.suggestActions(result.situation);
  assert.ok(actions.length > 0);
  assert.equal(logs.length, 2);
});

test("FallbackGateway returns the primary result untouched when it succeeds", async () => {
  const primaryOutput = { situation: empty("grades"), readyToConfirm: true };
  const primary: ModelGateway = {
    analyze: async () => primaryOutput,
    suggestActions: async () => [],
  };
  const gateway = new FallbackGateway(
    "gemini",
    primary,
    new RuleBasedGateway(),
    () => {
      throw new Error("must not log on success");
    },
  );
  const result = await gateway.analyze({
    category: "grades",
    situation: empty("grades"),
    messages: [],
    message: "시험을 망쳤어요",
    questionCount: 0,
  });
  assert.equal(result, primaryOutput);
});

test("describeModelConfig reports what will actually run without echoing values", () => {
  assert.deepEqual(describeModelConfig({}), { provider: "rule" });
  assert.deepEqual(describeModelConfig({ MODEL_PROVIDER: "rule" }), {
    provider: "rule",
  });
  assert.deepEqual(
    describeModelConfig({ MODEL_PROVIDER: "gemini", GEMINI_API_KEY: "k" }),
    { provider: "gemini", model: "gemini-3.1-flash-lite" },
  );
  assert.deepEqual(
    describeModelConfig({
      MODEL_PROVIDER: " gemini ",
      MODEL_API_KEY: "k",
      GEMINI_MODEL: "gemini-2.5-flash",
    }),
    { provider: "gemini", model: "gemini-2.5-flash" },
  );
  const missing = describeModelConfig({ MODEL_PROVIDER: "gemini" });
  assert.equal(missing.provider, "rule");
  assert.match(missing.warning ?? "", /GEMINI_API_KEY/);
  const badModel = describeModelConfig({
    MODEL_PROVIDER: "gemini",
    GEMINI_API_KEY: "k",
    GEMINI_MODEL: "gpt-4o",
  });
  assert.equal(badModel.provider, "rule");
  assert.match(badModel.warning ?? "", /GEMINI_MODEL/);
  // 값을 잘못 넣어도 health 응답에 그 값이 새지 않는다.
  const leaked = describeModelConfig({ MODEL_PROVIDER: "sk-secret-value" });
  assert.equal(leaked.provider, "rule");
  assert.ok(!(leaked.warning ?? "").includes("sk-secret-value"));
});
