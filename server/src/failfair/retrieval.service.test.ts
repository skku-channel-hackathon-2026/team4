import assert from "node:assert/strict";
import test from "node:test";
import {
  DEMO_CASES,
  type ActionCandidate,
  type Situation,
} from "@tutorial/shared";
import { matchActions, rankCases } from "./retrieval.service.js";

const situation: Situation = {
  category: "team_project",
  problemType: "unreachable_member",
  situation: "발표 전날 팀원 한 명과 연락이 닿지 않음",
  goal: "기한 내 발표",
  deadline: { raw: "8시간 남음", urgency: "today" },
  progress: "슬라이드 절반",
  constraints: ["남은 팀원들의 참여가 소극적임"],
  attemptedActions: ["연락 시도"],
  consideredActions: ["혼자 마무리", "교수님께 상황 전달"],
  unknowns: [],
};

const action = (id: string, actionTag?: string): ActionCandidate => ({
  id,
  label: id,
  actionTag,
  origin: "student",
  confirmed: true,
});

test("rankCases prefers cases where the senior actually took the action", () => {
  const ranked = rankCases(
    situation,
    action("solo", "solo_completion"),
    DEMO_CASES,
  );
  assert.equal(ranked[0]?.item.id, "team-solo-night");
  assert.equal(ranked[0]?.info.actionMatched, true);
  assert.ok(ranked.every((entry) => entry.item.category === "team_project"));
});

test("matchActions returns matched, reference, and no_case statuses", () => {
  const results = matchActions(
    situation,
    [
      action("solo", "solo_completion"),
      action("prof", "inform_professor"),
      action("custom"),
    ],
    DEMO_CASES,
  );
  assert.equal(results[0]?.status, "matched");
  assert.equal(results[0]?.caseId, "team-solo-night");
  assert.equal(results[1]?.status, "matched");
  // 당일 마감 조건을 반영하면 성공 사례보다 당일에 거절당한 사례가 먼저 나온다.
  assert.equal(results[1]?.caseId, "team-inform-late-refused");
  assert.equal(results[2]?.status, "no_case");
  assert.ok(results[0]?.seniorActions.length);
  assert.ok(results[0]?.outcome?.shortTerm);
});

test("matchActions reports no_case when the category has no such action", () => {
  const club: Situation = {
    ...situation,
    category: "club",
    problemType: "role_overload",
  };
  const results = matchActions(
    club,
    [action("x", "solo_completion")],
    DEMO_CASES,
  );
  assert.equal(results[0]?.status, "reference");
  assert.ok(results[0]?.differences[0]?.includes("하지 않았어요"));
});

test("unapproved and cross-category cases never enter the candidate pool", () => {
  const original = DEMO_CASES[0];
  const candidates = [
    { ...original, id: "hidden", status: "hidden" as const },
    { ...original, id: "draft", status: "draft" as const },
    { ...original, id: "other", category: "club" as const },
  ];
  assert.deepEqual(
    rankCases(situation, action("solo", "solo_completion"), candidates),
    [],
  );
});
test("same action is ranked by situation, restrictions and goal, not outcome", () => {
  const base = DEMO_CASES[0];
  const near = {
    ...base,
    id: "near",
    situation: situation.situation,
    constraints: situation.constraints,
    goal: situation.goal,
    urgency: situation.deadline.urgency,
  };
  const far = {
    ...base,
    id: "far",
    problemType: "conflict",
    situation: "등록금 대출 서류 준비",
    constraints: ["서류 발급 불가"],
    goal: "기숙사 입사",
    urgency: "later" as const,
  };
  const ranked = rankCases(situation, action("solo", "solo_completion"), [
    far,
    near,
  ]);
  assert.equal(ranked[0].item.id, "near");
  const changedOutcome = {
    ...near,
    outcome: {
      shortTerm: "최악의 결과",
      followUp: "",
      unresolved: "전혀 해결 못 함",
    },
  };
  assert.equal(
    rankCases(situation, action("solo", "solo_completion"), [
      far,
      changedOutcome,
    ])[0].info.score,
    ranked[0].info.score,
  );
});
test("matching action with weak context discloses that limitation", () => {
  const sparse = {
    ...situation,
    problemType: undefined,
    situation: "",
    progress: "",
    goal: "",
    constraints: [],
    deadline: { raw: "", urgency: "unknown" as const },
  };
  const r = matchActions(
    sparse,
    [action("solo", "solo_completion")],
    DEMO_CASES,
  )[0];
  assert.equal(r.status, "matched");
  assert.ok(r.differences.some((text) => text.includes("정보는 부족")));
});
test("urgency alone does not produce a reference case", () => {
  const sparse = {
    ...situation,
    problemType: undefined,
    situation: "",
    progress: "",
    goal: "",
    constraints: [],
  };
  assert.equal(
    matchActions(sparse, [action("none", "exclude_member")], DEMO_CASES)[0]
      .status,
    "no_case",
  );
});
test("unconfirmed actions are excluded and duplicate source evidence is disclosed", () => {
  const item = {
    ...DEMO_CASES[0],
    actionSteps: [
      { order: 1, actionTag: "solo_completion", description: "혼자 진행" },
      { order: 2, actionTag: "inform_professor", description: "교수에게 알림" },
    ],
  };
  const r = matchActions(
    situation,
    [
      action("one", "solo_completion"),
      action("two", "inform_professor"),
      { ...action("three", "reduce_scope_reassign"), confirmed: false },
    ],
    [item],
  );
  assert.equal(r.length, 2);
  assert.ok(
    r.every((x) => x.differences.some((t) => t.includes("동일한 선배 사례"))),
  );
  assert.deepEqual(r[0].conditions, item.conditions);
  assert.deepEqual(r[0].outcome, item.outcome);
  assert.equal(r[0].cost, item.receipt.cost);
  assert.ok(r[0].unknowns.some((t) => t.includes("적용 조건")));
});
test("ranking ties do not depend on repository order", () => {
  const a = { ...DEMO_CASES[0], id: "a" },
    b = { ...DEMO_CASES[0], id: "b" };
  assert.deepEqual(
    rankCases(situation, action("s", "solo_completion"), [b, a]).map(
      (x) => x.item.id,
    ),
    ["a", "b"],
  );
});
