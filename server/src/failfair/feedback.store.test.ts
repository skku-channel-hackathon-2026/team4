import assert from "node:assert/strict";
import test from "node:test";
import { getDatabase, resultRows, withDatabase } from "../database.js";
import { createTestDatabase } from "../test-database.js";
import { recordFeedback } from "./feedback.store.js";

test("같은 requestId의 피드백은 한 번만 쌓이고, 사례 없는 카드도 기록된다", async () => {
  await withDatabase(createTestDatabase(), async () => {
    const entry = {
      requestId: "req-1",
      sessionId: "s-1",
      resultId: "r-1",
      caseId: "case-1",
      event: "helpful" as const,
      at: 1000,
    };
    assert.equal(await recordFeedback(entry), true);
    assert.equal(
      await recordFeedback({ ...entry, event: "not_helpful", at: 2000 }),
      false,
      "재전송은 처음 값을 지킨다",
    );
    assert.equal(
      await recordFeedback({
        ...entry,
        requestId: "req-2",
        resultId: "r-2",
        caseId: undefined,
        event: "tool_copied",
      }),
      true,
    );
    // node:sqlite 행은 프로토타입이 없어 strict deepEqual이 실패하므로 평범한 객체로 옮긴다.
    const rows = resultRows<{
      request_id: string;
      case_id: string | null;
      event: string;
    }>(
      await getDatabase()
        .prepare(
          "SELECT request_id, case_id, event FROM failfair_feedback ORDER BY request_id",
        )
        .all(),
    ).map((row) => ({ ...row }));
    assert.deepEqual(rows, [
      { request_id: "req-1", case_id: "case-1", event: "helpful" },
      { request_id: "req-2", case_id: null, event: "tool_copied" },
    ]);
  });
});
