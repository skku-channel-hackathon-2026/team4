import assert from "node:assert/strict";
import test from "node:test";
import { DEMO_CASES, type Case, type SosRequest } from "@tutorial/shared";
import { withDatabase } from "../database.js";
import { getRecord, setRecord } from "../records.js";
import { createTestDatabase } from "../test-database.js";
import { D1CaseRepository } from "./case.repository.js";
import { importLegacyRecords } from "./legacy-import.js";
import { d1SessionStore, type StoredSession } from "./session.service.js";
import { d1SosStore } from "./sos.service.js";

const inDatabase = <T>(callback: () => Promise<T>) =>
  withDatabase(createTestDatabase(), callback);

const legacyCase = (overrides: Partial<Case> = {}): Case => ({
  ...DEMO_CASES[0]!,
  id: "case-legacy",
  title: "옛 저장소 사례",
  status: "approved",
  sourceType: "real",
  allowContact: true,
  authorManagerId: "senior-1",
  version: 1,
  createdAt: 1000,
  ...overrides,
});

const legacySession = (
  overrides: Partial<StoredSession> & {
    lastRequest?: { requestId: string; response: unknown };
  } = {},
) => ({
  id: "s-legacy",
  channelId: "c1",
  ownerId: "student-1",
  category: "team_project" as const,
  state: "COLLECTING" as const,
  revision: 2,
  situation: { category: "team_project" as const },
  actions: [],
  results: [],
  messages: [{ role: "assistant" as const, content: "hi", at: 1 }],
  questionCount: 1,
  createdAt: 1000,
  updatedAt: 2000,
  lastRequest: { requestId: "req-legacy", response: { state: "COLLECTING" } },
  ...overrides,
});

const legacySos = (overrides: Partial<SosRequest> = {}): SosRequest => ({
  id: "sos-legacy",
  caseId: "case-legacy",
  caseTitle: "옛 저장소 사례",
  channelId: "c1",
  chatId: "g1",
  chatType: "group",
  chatTitle: "앱_개발_검증",
  studentManagerId: "student-1",
  seniorManagerId: "senior-1",
  message: "도와주세요",
  status: "pending",
  createdAt: 3000,
  ...overrides,
});

test("옛 app_records의 사례·세션·SOS·피드백이 전부 표로 옮겨지고, 다시 돌려도 늘지 않는다", async () => {
  await inDatabase(async () => {
    await setRecord("failfair:cases", [legacyCase(), { broken: true }]);
    await setRecord("failfair:session:s-legacy", legacySession());
    await setRecord(
      "failfair:sos:c1:case-legacy:student-1",
      legacySos({ id: "sos-legacy-1" }),
    );
    await setRecord(
      "failfair:sos:c1:case-legacy:student-2",
      legacySos({
        id: "sos-legacy-2",
        studentManagerId: "student-2",
        status: "accepted",
        respondedAt: 4000,
      }),
    );
    await setRecord("failfair:feedback", [
      {
        sessionId: "s-legacy",
        requestId: "fb-1",
        resultId: "r-1",
        event: "helpful",
        at: 5000,
      },
      { nope: true },
    ]);
    await setRecord("failfair:model", { provider: "rule" });

    const summary = await importLegacyRecords(9000);
    assert.deepEqual(summary, { cases: 1, sessions: 1, sos: 2, feedback: 1 });

    const cases = new D1CaseRepository([]);
    assert.equal((await cases.get("case-legacy"))?.title, "옛 저장소 사례");

    const session = await d1SessionStore.load("s-legacy");
    assert.equal(session?.revision, 2);
    assert.equal(session?.messages.length, 1);
    assert.ok(!("lastRequest" in (session ?? {})), "lastRequest는 표로 갔다");
    assert.deepEqual(
      await d1SessionStore.findResponse("s-legacy", "req-legacy"),
      {
        response: { state: "COLLECTING" },
      },
    );

    const sos = await d1SosStore.list("c1");
    assert.deepEqual(
      sos.map((request) => [request.id, request.status]).sort(),
      [
        ["sos-legacy-1", "pending"],
        ["sos-legacy-2", "accepted"],
      ],
    );
    // 옛 요청은 전송 단위 ID가 없어도 재전송 자리를 차지하지 않는다 (NULL은 유니크에 안 걸린다).
    assert.deepEqual(await getRecord("failfair:model"), { provider: "rule" });

    // 두 번째 실행: 같은 수를 보지만 행은 늘지 않는다.
    await importLegacyRecords(9500);
    assert.equal((await cases.list()).length, 1);
    assert.equal((await d1SosStore.list("c1")).length, 2);
  });
});

test("표가 더 새로우면 옛 데이터가 덮지 않고, 옛 쪽이 더 새로우면 따라온다", async () => {
  await inDatabase(async () => {
    const cases = new D1CaseRepository([]);
    await cases.save(legacyCase({ status: "hidden", version: 2 }));
    await d1SessionStore.insert(
      legacySession({ revision: 3 }) as StoredSession,
    );
    await d1SosStore.claim(legacySos({ id: "sos-a" }), "r-a");
    await d1SosStore.claim(
      legacySos({ id: "sos-b", studentManagerId: "student-2" }),
      "r-b",
    );
    await d1SosStore.settle(legacySos({ id: "sos-b" }), "declined", 4000);

    // 옛 저장소: 사례 v1 approved(구식), 세션 revision 1(구식), sos-a accepted(옛 쪽이 답함), sos-b pending(구식)
    await setRecord("failfair:cases", [legacyCase()]);
    await setRecord(
      "failfair:session:s-legacy",
      legacySession({ revision: 1, questionCount: 0 }),
    );
    await setRecord(
      "failfair:sos:c1:case-legacy:student-1",
      legacySos({ id: "sos-a", status: "accepted", respondedAt: 5000 }),
    );
    await setRecord(
      "failfair:sos:c1:case-legacy:student-2",
      legacySos({ id: "sos-b", studentManagerId: "student-2" }),
    );
    await importLegacyRecords(9000);

    assert.equal((await cases.get("case-legacy"))?.status, "hidden");
    assert.equal((await d1SessionStore.load("s-legacy"))?.revision, 3);
    const byId = new Map(
      (await d1SosStore.list("c1")).map((request) => [request.id, request]),
    );
    assert.equal(byId.get("sos-a")?.status, "accepted", "옛 쪽의 답을 따른다");
    assert.equal(
      byId.get("sos-b")?.status,
      "declined",
      "이미 답한 것은 되돌리지 않는다",
    );

    // 옛 쪽이 더 새 버전이면 (롤백 중 옛 코드가 검수한 경우) 따라온다.
    await setRecord("failfair:cases", [
      legacyCase({ status: "approved", version: 3 }),
    ]);
    await setRecord(
      "failfair:session:s-legacy",
      legacySession({ revision: 4, questionCount: 7 }),
    );
    await importLegacyRecords(9500);
    assert.equal((await cases.get("case-legacy"))?.version, 3);
    assert.equal((await d1SessionStore.load("s-legacy"))?.questionCount, 7);
  });
});
