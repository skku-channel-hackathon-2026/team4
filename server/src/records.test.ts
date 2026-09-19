import assert from "node:assert/strict";
import test from "node:test";
import { withDatabase } from "./database.js";
import { getRecord, setRecord } from "./records.js";
import { createTestDatabase } from "./test-database.js";

test("app_records는 키 하나에 JSON 하나를 넣고 덮어쓴다", async () => {
  await withDatabase(createTestDatabase(), async () => {
    assert.equal(await getRecord("k"), undefined);
    await setRecord("k", { provider: "rule" });
    assert.deepEqual(await getRecord("k"), { provider: "rule" });
    await setRecord("k", { provider: "gemini", model: "x" });
    assert.deepEqual(await getRecord("k"), { provider: "gemini", model: "x" });
  });
});
