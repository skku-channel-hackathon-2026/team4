import assert from "node:assert/strict";
import test from "node:test";
import {
  DEMO_CASES,
  type ActionCandidate,
  type Situation,
} from "@tutorial/shared";
import {
  MATCH_WEIGHTS,
  unknownsOf,
  matchActions as matchWithSource,
  rankCases as rankWithSource,
} from "./retrieval.service.js";

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

test("excluded actions cannot change lexical evidence or comparison cards", () => {
  const selected = action("solo", "solo_completion");
  const eligible = DEMO_CASES.filter(
    (c) =>
      c.category === situation.category &&
      c.actionSteps.some((s) => s.actionTag === selected.actionTag),
  );
  const excluded = {
    ...eligible[0],
    id: "excluded-action",
    situation: situation.situation,
    actionSteps: [
      {
        order: 1,
        actionTag: "inform_professor",
        description: "다른 행동을 수행",
      },
    ],
  };
  assert.deepEqual(
    rankCases(situation, selected, [...eligible, excluded]),
    rankCases(situation, selected, eligible),
  );
  assert.deepEqual(
    matchActions(situation, [selected], [...eligible, excluded]),
    matchActions(situation, [selected], eligible),
  );
});

test("inconsistent same-subject constraints stay uncertain regardless of order", () => {
  const selected = action("solo", "solo_completion");
  const student = { ...situation, constraints: ["예산 10000원"] };
  const original = DEMO_CASES.find((c) =>
    c.actionSteps.some((s) => s.actionTag === selected.actionTag),
  )!;
  for (const constraints of [
    ["예산 10000원", "예산 20000원"],
    ["예산 20000원", "예산 10000원"],
  ]) {
    const cases = [{ ...original, constraints }];
    assert.equal(
      rankCases(student, selected, cases)[0].info.components.constraints,
      0,
    );
    assert.equal(
      matchActions(student, [selected], cases)[0].status,
      "reference",
    );
  }
  assert.equal(
    rankCases(student, selected, [
      { ...original, constraints: ["예산 10000원", "가용 인원 2명"] },
    ])[0].info.components.constraints,
    1,
  );
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
  assert.equal(results[0]?.status, "no_case");
  assert.equal(results[0]?.caseId, undefined);
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
  assert.equal(r.status, "reference");
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

test("editorial titles and tags cannot change situation evidence or corpus scores", () => {
  for (const category of ["grades", "team_project", "club"] as const) {
    const cases = DEMO_CASES.filter((c) => c.category === category);
    const source = cases[0];
    const query: Situation = {
      ...situation,
      category,
      problemType: source.problemType,
      situation: source.situation,
      constraints: source.constraints,
      goal: source.goal,
    };
    const selected = action("selected", source.actionSteps[0].actionTag);
    const scores = (input: typeof cases) =>
      rankCases(query, selected, input).map((r) => [
        r.item.id,
        r.info.score,
        r.info.relevant,
      ]);
    const polluted = cases.map((c, i) => ({
      ...c,
      title: i === 0 ? "별도 제목" : query.situation,
      tags: i === 0 ? [] : query.situation.split(" ").slice(0, 5),
    }));
    assert.deepEqual(scores(polluted), scores(cases), category);
  }
});

function rankCases(...args: Parameters<typeof rankWithSource>) {
  return rankWithSource(
    args[0],
    args[1],
    args[2],
    args[3] ?? { source: "demo" },
  );
}
function matchActions(...args: Parameters<typeof matchWithSource>) {
  return matchWithSource(
    args[0],
    args[1],
    args[2],
    args[3] ?? { source: "demo" },
  );
}

test("real mode is the default and never mixes with the explicit demo mode", () => {
  const real = {
    ...DEMO_CASES[0],
    id: "real-experience",
    sourceType: "real" as const,
  };
  const pool = [...DEMO_CASES, real];
  assert.deepEqual(
    rankWithSource(situation, action("a", "solo_completion"), pool).map(
      (r) => r.item.id,
    ),
    [real.id],
  );
  assert.ok(
    rankWithSource(situation, action("a", "solo_completion"), pool, {
      source: "demo",
    }).every((r) => r.item.sourceType === "demo"),
  );
});
test("specified weights, evidence coverage and explicit condition differences are separate", () => {
  assert.deepEqual(MATCH_WEIGHTS, {
    problem: 20,
    context: 20,
    constraints: 20,
    goal: 20,
    urgency: 20,
  });
  const base = DEMO_CASES[0];
  const student = {
    ...situation,
    constraints: ["업무 분담 불가"],
    goal: "",
    deadline: { raw: "", urgency: "unknown" as const },
  };
  const conflicting = { ...base, constraints: ["업무 분담 가능"] };
  const ranked = rankCases(student, action("a", "solo_completion"), [
    conflicting,
  ]);
  const result = matchActions(
    student,
    [action("a", "solo_completion")],
    [conflicting],
  )[0];
  assert.equal(result.status, "reference");
  assert.ok(result.differences.some((d) => d.includes("주요 제약 차이")));
  assert.ok(ranked[0].info.coverage.unknown.includes("목표"));
  assert.ok(ranked[0].info.coverage.unknown.includes("긴급도"));
  assert.ok(!result.differences.some((d) => d.includes("목표가 다름")));
});
test("different recorded trajectories are retained without changing representative ranking", () => {
  const base = DEMO_CASES[0];
  const cases = [
    {
      ...base,
      id: "a",
      receipt: { ...base.receipt, status: "partial" as const },
    },
    {
      ...base,
      id: "b",
      receipt: { ...base.receipt, status: "partial" as const },
    },
    {
      ...base,
      id: "c",
      receipt: { ...base.receipt, status: "ongoing" as const },
    },
    {
      ...base,
      id: "d",
      receipt: { ...base.receipt, status: "resolved" as const },
    },
  ];
  const r = matchActions(situation, [action("a", "solo_completion")], cases)[0];
  assert.equal(r.caseId, "a");
  assert.ok(r.alternatives?.some((alt) => alt.caseId === "c"));
  assert.ok(r.alternatives?.some((alt) => alt.caseId === "d"));
  assert.ok((r.alternatives?.length ?? 0) <= 2);
});
test("unsupported actions are distinct from supported actions with no evidence", () => {
  const [unsupported, empty] = matchActions(
    situation,
    [action("custom"), action("removal", "request_member_removal")],
    DEMO_CASES,
  );
  assert.equal(unsupported.status, "no_case");
  assert.equal(unsupported.unsupported, true);
  assert.equal(empty.status, "no_case");
  assert.notEqual(empty.unsupported, true);
});

test("fields filled at student confirmation no longer appear as missing", () => {
  const unknowns = unknownsOf({
    ...situation,
    unknowns: [
      "진행 상황",
      "원하는 결과",
      "마감·남은 시간",
      "교수님 답장 여부",
    ],
  });
  assert.deepEqual(unknowns, ["교수님 답장 여부"]);
});

test("unasked progress and goal are not counted as missing; only the deadline is", () => {
  const unknowns = unknownsOf({
    ...situation,
    progress: "",
    goal: "",
    deadline: { raw: "", urgency: "unknown" },
    unknowns: [],
  });
  assert.deepEqual(unknowns, ["마감·남은 시간"]);
});
test("known time differences are references, unknown time is not a conflict", () => {
  const c = { ...DEMO_CASES[0], urgency: "later" as const };
  assert.equal(
    matchActions(situation, [action("a", "solo_completion")], [c])[0].status,
    "reference",
  );
  const unknown = {
    ...situation,
    deadline: { raw: "", urgency: "unknown" as const },
  };
  assert.equal(
    matchActions(unknown, [action("a", "solo_completion")], [c])[0].status,
    "matched",
  );
});
