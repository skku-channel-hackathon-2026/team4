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
  assert.equal(results[1]?.caseId, "team-inform-professor");
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
