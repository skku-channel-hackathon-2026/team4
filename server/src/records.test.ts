import assert from "node:assert/strict";
import test from "node:test";
import { withDatabase } from "./database.js";
import {
  getRecord,
  insertRecordIfAbsent,
  listRecords,
  replaceRecordIfField,
  setRecord,
} from "./records.js";
import { createTestDatabase } from "./test-database.js";

const run = <T>(callback: () => Promise<T>): Promise<T> =>
  withDatabase(createTestDatabase(), callback);

test("빈 자리에만 넣는다 — 두 번째 삽입은 앞의 값을 덮어쓰지 않는다", async () => {
  await run(async () => {
    assert.equal(await insertRecordIfAbsent("k", { who: "first" }), true);
    assert.equal(await insertRecordIfAbsent("k", { who: "second" }), false);
    assert.deepEqual(await getRecord("k"), { who: "first" });
  });
});

test("저장된 값의 필드가 기대와 같을 때만 바꾼다", async () => {
  await run(async () => {
    await setRecord("k", { status: "pending", note: "처음" });
    assert.equal(
      await replaceRecordIfField("k", "status", "accepted", {
        status: "declined",
      }),
      false,
      "이미 다른 상태면 덮어쓰지 않는다",
    );
    assert.deepEqual(await getRecord("k"), { status: "pending", note: "처음" });

    assert.equal(
      await replaceRecordIfField("k", "status", "pending", {
        status: "accepted",
      }),
      true,
    );
    assert.deepEqual(await getRecord("k"), { status: "accepted" });
    assert.equal(
      await replaceRecordIfField("k", "status", "pending", {
        status: "hijack",
      }),
      false,
      "한 번 바뀐 뒤에는 같은 조건이 다시 먹지 않는다",
    );
    assert.equal(
      await replaceRecordIfField("없는키", "status", "pending", {}),
      false,
    );
  });
});

test("접두사로 묶인 행만 읽는다", async () => {
  await run(async () => {
    await setRecord("failfair:sos:c1:a", { n: 1 });
    await setRecord("failfair:sos:c1:b", { n: 2 });
    await setRecord("failfair:sos:c2:a", { n: 3 });
    await setRecord("failfair:cases", { n: 4 });
    assert.deepEqual(await listRecords("failfair:sos:c1:"), [
      { n: 1 },
      { n: 2 },
    ]);
    assert.deepEqual(await listRecords("failfair:sos:c2:"), [{ n: 3 }]);
    assert.deepEqual(await listRecords("failfair:sos:없음:"), []);
  });
});
