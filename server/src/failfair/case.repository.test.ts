import assert from "node:assert/strict";
import test from "node:test";
import { DEMO_CASES, type Case } from "@tutorial/shared";
import { withDatabase } from "../database.js";
import { getRecord, setRecord } from "../records.js";
import { createTestDatabase } from "../test-database.js";
import { D1CaseRepository } from "./case.repository.js";

const inDatabase = <T>(
  callback: (repository: D1CaseRepository) => Promise<T>,
  demo: Case[] = DEMO_CASES,
) =>
  withDatabase(createTestDatabase(), () =>
    callback(new D1CaseRepository(demo)),
  );

const realCase = (overrides: Partial<Case> = {}): Case => ({
  ...DEMO_CASES[0]!,
  id: "case-real-1",
  title: "실제 선배 사례",
  status: "draft",
  sourceType: "real",
  allowContact: true,
  authorManagerId: "senior-1",
  createdAt: 1000,
  ...overrides,
});

test("번들 가상 사례는 DB에 없어도 보이고, 저장한 실제 사례가 뒤에 붙는다", async () => {
  await inDatabase(async (repository) => {
    assert.equal((await repository.list()).length, DEMO_CASES.length);
    await repository.save(realCase());
    const all = await repository.list();
    assert.equal(all.length, DEMO_CASES.length + 1);
    assert.equal(all.at(-1)?.id, "case-real-1");
    assert.deepEqual(await repository.get("case-real-1"), realCase());
    assert.equal(
      (await repository.get(DEMO_CASES[0]!.id))?.id,
      DEMO_CASES[0]!.id,
    );
    assert.equal(await repository.get("없는-사례"), undefined);
  });
});

test("승인 목록은 상태·카테고리로 거르고 초안은 학생에게 보이지 않는다", async () => {
  await inDatabase(async (repository) => {
    await repository.save(realCase({ id: "draft-1", category: "grades" }));
    await repository.save(
      realCase({ id: "approved-1", category: "grades", status: "approved" }),
    );
    await repository.save(
      realCase({ id: "approved-club", category: "club", status: "approved" }),
    );
    const grades = await repository.listApproved("grades");
    assert.ok(grades.every((item) => item.status === "approved"));
    assert.ok(grades.every((item) => item.category === "grades"));
    assert.ok(grades.some((item) => item.id === "approved-1"));
    assert.ok(!grades.some((item) => item.id === "draft-1"));
    assert.ok(!grades.some((item) => item.id === "approved-club"));
    assert.equal((await repository.list("draft")).length, 1);
  });
});

test("가상 사례를 숨기면 같은 id의 DB 행이 번들 쪽을 덮는다", async () => {
  await inDatabase(async (repository) => {
    const demo = DEMO_CASES[0]!;
    await repository.save({ ...demo, status: "hidden", version: 2 });
    assert.equal((await repository.list()).length, DEMO_CASES.length);
    assert.equal((await repository.get(demo.id))?.status, "hidden");
    assert.ok(
      !(await repository.listApproved(demo.category)).some(
        (item) => item.id === demo.id,
      ),
    );
    // 다시 승인하면 버전이 올라간 채로 다시 보인다.
    await repository.save({ ...demo, status: "approved", version: 3 });
    assert.equal((await repository.get(demo.id))?.version, 3);
  });
});

test("같은 id로 다시 저장하면 덮어쓰고, 다른 두 사례를 동시에 저장하면 둘 다 남는다", async () => {
  await inDatabase(async (repository) => {
    await repository.save(realCase({ title: "처음" }));
    await repository.save(realCase({ title: "고침", version: 2 }));
    const stored = await repository.get("case-real-1");
    assert.equal(stored?.title, "고침");
    assert.equal(stored?.version, 2);

    await Promise.all([
      repository.save(realCase({ id: "same-time-1" })),
      repository.save(realCase({ id: "same-time-2" })),
    ]);
    const ids = (await repository.list("draft")).map((item) => item.id);
    assert.ok(ids.includes("same-time-1") && ids.includes("same-time-2"));
  });
});

test("저장하면 옛 failfair:cases 배열에도 같은 사례가 남는다 (롤백 대비 거울)", async () => {
  await inDatabase(async (repository) => {
    await setRecord("failfair:cases", [realCase({ id: "old-1" })]);
    await repository.save(realCase({ id: "new-1" }));
    await repository.save(
      realCase({ id: "new-1", status: "approved", version: 2 }),
    );
    const mirror = await getRecord<Case[]>("failfair:cases");
    assert.deepEqual(
      mirror?.map((item) => [item.id, item.status, item.version]),
      [
        ["old-1", "draft", 1],
        ["new-1", "approved", 2],
      ],
      "같은 id는 바꾸고 다른 것은 그대로 둔다",
    );
    // 거울은 옛 코드가 읽을 뿐, 새 코드의 읽기는 표만 본다.
    assert.equal(await repository.get("old-1"), undefined);
  });
});
