import "reflect-metadata";
import test from "node:test";
import assert from "node:assert/strict";
import type { Context } from "@channel.io/app-sdk-server";
import {
  DEMO_CASES,
  CompareInputSchema,
  type ActionCandidate,
} from "@tutorial/shared";
import { getDatabase, resultRows, withDatabase } from "../database.js";
import { createTestDatabase } from "../test-database.js";
import { SessionService } from "./session.service.js";
import { D1CaseRepository } from "./case.repository.js";

process.env.APP_ID = "comparison-pipeline-test";
process.env.APP_SECRET = "test-only-secret";
process.env.SIGNING_KEY = "11".repeat(32);
const context = (id = "me") =>
  ({ caller: { type: "manager", id }, channel: { id: "channel" } }) as Context;
const candidate = (id: string, tag = "solo_completion"): ActionCandidate => ({
  id,
  label: id,
  actionTag: tag,
  origin: "student",
  confirmed: true,
});

async function setup() {
  const { FailfairFunctions } = await import("./functions.js");
  const functions = new FailfairFunctions();
  const sessions = new SessionService();
  const source = {
    ...DEMO_CASES[0],
    id: "pipeline-case",
    actionSteps: [
      { order: 1, actionTag: "solo_completion", description: "혼자 초안 작성" },
      { order: 2, actionTag: "inform_professor", description: "교수님께 공유" },
    ],
  };
  const cases = new D1CaseRepository([source]);
  Object.defineProperties(functions, { cases: { value: cases } });
  const session = await sessions.create(context(), "team_project", "시작");
  await sessions.mutate(session, "confirmed", 0, (current) => {
    current.situation = {
      ...current.situation,
      problemType: source.problemType,
      situation: source.situation,
      goal: source.goal,
      constraints: source.constraints,
      deadline: { raw: "8시간", urgency: "today" },
    };
    current.state = "REVIEWING_ACTIONS";
    current.confirmedRevision = 1;
    return { ok: true };
  });
  return { functions, sessions, session, source, cases };
}

test("H → M: confirmed actions → approved matches → stored results → receipt/tool → feedback", async () => {
  await withDatabase(createTestDatabase(), async () => {
    const { functions, sessions, session, source } = await setup();
    const input = {
      sessionId: session.id,
      requestId: "compare-1",
      expectedRevision: 1,
      actions: [candidate("one"), candidate("two", "inform_professor")],
    };
    const result = await functions.compare(context(), input);
    assert.equal(result.state, "RESULTS");
    assert.equal(result.results.length, 2);
    assert.ok(
      result.results.every(
        (r) => r.caseId === source.id && r.status === "matched",
      ),
    );
    assert.ok(
      result.results.every((r) =>
        r.differences.some((d) => d.includes("동일한 선배 사례")),
      ),
    );
    assert.deepEqual(result.results[0].outcome, source.outcome);
    assert.equal(result.results[0].cost, source.receipt.cost);
    assert.deepEqual(result.results[0].conditions, source.conditions);
    assert.deepEqual(
      await functions.compare(context(), input),
      result,
      "same request replays without another revision",
    );
    const saved = await sessions.load(context(), session.id);
    assert.deepEqual(saved.results, result.results);
    const detail = await functions.getCase(context(), {
      sessionId: session.id,
      caseId: source.id,
    });
    assert.deepEqual(detail.case.receipt, source.receipt);
    assert.equal(detail.case.tool?.body, source.tool?.body);
    const feedback = {
      sessionId: session.id,
      resultId: result.results[0].id,
      requestId: "copy",
      event: "tool_copied" as const,
    };
    await functions.feedback(context(), feedback);
    await functions.feedback(context(), feedback);
    await functions.feedback(context(), {
      ...feedback,
      requestId: "help",
      event: "helpful",
    });
    const rows = resultRows<{ event: string; case_id: string }>(
      await getDatabase()
        .prepare(
          "SELECT event, case_id FROM failfair_feedback ORDER BY request_id",
        )
        .all(),
    );
    assert.equal(rows.length, 2);
    assert.ok(rows.every((r) => r.case_id === source.id));
    const refreshed = await functions.compare(context(), {
      ...input,
      requestId: "compare-2",
      expectedRevision: 2,
    });
    assert.notEqual(refreshed.results[0].id, result.results[0].id);
    await assert.rejects(
      functions.feedback(context(), {
        ...feedback,
        requestId: "stale-feedback",
      }),
      /Result not found/,
    );
  });
});

test("invalid selections, unrelated details and fabricated feedback are rejected", async () => {
  await withDatabase(createTestDatabase(), async () => {
    const { functions, session, source } = await setup();
    const input = {
      sessionId: session.id,
      requestId: "compare-1",
      expectedRevision: 1,
      actions: [candidate("one")],
    };
    assert.equal(
      CompareInputSchema.safeParse({
        ...input,
        actions: [candidate("dup"), candidate("dup")],
      }).success,
      false,
    );
    await assert.rejects(
      functions.compare(context(), {
        ...input,
        actions: [{ ...candidate("one"), confirmed: false }],
      }),
      /Invalid confirmed/,
    );
    await assert.rejects(
      functions.compare(context(), {
        ...input,
        actions: [candidate("one", "resign_role")],
      }),
      /Invalid confirmed/,
    );
    await assert.rejects(
      functions.getCase(context(), {
        sessionId: session.id,
        caseId: source.id,
      }),
      /Case not found/,
    );
    await functions.compare(context(), input);
    await assert.rejects(
      functions.getCase(context("other"), {
        sessionId: session.id,
        caseId: source.id,
      }),
      /Session not found/,
    );
    await assert.rejects(
      functions.feedback(context(), {
        sessionId: session.id,
        resultId: "fake",
        requestId: "bad",
        event: "helpful",
      }),
      /Result not found/,
    );
  });
});

test("hidden cases and absent tools are unavailable after comparison", async () => {
  await withDatabase(createTestDatabase(), async () => {
    const { functions, session, source, cases } = await setup();
    const response = await functions.compare(context(), {
      sessionId: session.id,
      requestId: "compare",
      expectedRevision: 1,
      actions: [candidate("one")],
    });
    await cases.save({ ...source, tool: undefined, version: 2 });
    await assert.rejects(
      functions.feedback(context(), {
        sessionId: session.id,
        resultId: response.results[0].id,
        requestId: "copy",
        event: "tool_copied",
      }),
      /No available tool/,
    );
    await cases.save({ ...source, status: "hidden", version: 3 });
    await assert.rejects(
      functions.getCase(context(), {
        sessionId: session.id,
        caseId: source.id,
      }),
      /Case not found/,
    );
  });
});
