import { CaseSchema, SosRequestSchema } from "@tutorial/shared";
import { getDatabase } from "../database.js";
import { listRecords } from "../records.js";
import { bindCaseUpsertIfNewer } from "./case.repository.js";
import type { StoredSession } from "./session.service.js";

/**
 * 전용 표가 생기기 전 `app_records`에 있던 데이터를 표로 옮긴다.
 *
 * 옛 키:
 *   failfair:cases                       사례 배열 (새 코드도 롤백 대비 거울로 계속 쓴다)
 *   failfair:session:{id}                세션 통째 (+ lastRequest)
 *   failfair:sos:{채널}:{사례}:{새내기}   SOS 요청 하나
 *   failfair:feedback                    피드백 배열
 *
 * "한 번만" 표식을 두지 않고 isolate가 뜰 때마다 다시 돌린다. 옛 코드로 되돌렸다가 다시 배포해도
 * 그 사이 옛 저장소에 쓰인 것이 다음 기동 때 따라온다. 그래서 모든 쓰기가 "표가 더 새로우면
 * 건드리지 않는다" 조건을 단다: 사례는 version, 세션은 revision, SOS는 pending → 답변만.
 */
export interface LegacyImportSummary {
  cases: number;
  sessions: number;
  sos: number;
  feedback: number;
}

const PREFIX = "failfair:";
const KEY_CASES = "failfair:cases";
const KEY_FEEDBACK = "failfair:feedback";
const PREFIX_SESSION = "failfair:session:";
const PREFIX_SOS = "failfair:sos:";

function isLegacySession(value: unknown): value is StoredSession & {
  lastRequest?: { requestId: string; response: unknown };
} {
  const candidate = value as Partial<StoredSession> | null;
  return (
    !!candidate &&
    typeof candidate.id === "string" &&
    typeof candidate.channelId === "string" &&
    typeof candidate.ownerId === "string" &&
    typeof candidate.category === "string" &&
    typeof candidate.state === "string" &&
    typeof candidate.revision === "number" &&
    typeof candidate.createdAt === "number" &&
    typeof candidate.updatedAt === "number"
  );
}

interface LegacyFeedback {
  requestId: string;
  sessionId: string;
  resultId: string;
  event: string;
  at?: number;
}

function isLegacyFeedback(value: unknown): value is LegacyFeedback {
  const candidate = value as Partial<LegacyFeedback> | null;
  return (
    !!candidate &&
    typeof candidate.requestId === "string" &&
    typeof candidate.sessionId === "string" &&
    typeof candidate.resultId === "string" &&
    typeof candidate.event === "string"
  );
}

export async function importLegacyRecords(
  now = Date.now(),
): Promise<LegacyImportSummary> {
  const db = getDatabase();
  const summary: LegacyImportSummary = {
    cases: 0,
    sessions: 0,
    sos: 0,
    feedback: 0,
  };
  for (const { id, value } of await listRecords<unknown>(PREFIX)) {
    if (id === KEY_CASES && Array.isArray(value)) {
      for (const candidate of value) {
        const parsed = CaseSchema.safeParse(candidate);
        if (!parsed.success) continue;
        await bindCaseUpsertIfNewer(parsed.data, now).run();
        summary.cases += 1;
      }
    } else if (id.startsWith(PREFIX_SESSION) && isLegacySession(value)) {
      const { lastRequest, ...session } = value;
      await db
        .prepare(
          "INSERT INTO failfair_sessions " +
            "(id, channel_id, owner_id, category, state, revision, body_json, created_at, updated_at) " +
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) " +
            "ON CONFLICT(id) DO UPDATE SET state = excluded.state, revision = excluded.revision, " +
            "body_json = excluded.body_json, updated_at = excluded.updated_at " +
            "WHERE excluded.revision > failfair_sessions.revision",
        )
        .bind(
          session.id,
          session.channelId,
          session.ownerId,
          session.category,
          session.state,
          session.revision,
          JSON.stringify(session),
          session.createdAt,
          session.updatedAt,
        )
        .run();
      if (lastRequest && typeof lastRequest.requestId === "string") {
        await db
          .prepare(
            "INSERT OR IGNORE INTO failfair_requests (session_id, request_id, response_json, created_at) " +
              "VALUES (?, ?, ?, ?)",
          )
          .bind(
            session.id,
            lastRequest.requestId,
            JSON.stringify({ response: lastRequest.response }),
            session.updatedAt,
          )
          .run();
      }
      summary.sessions += 1;
    } else if (id.startsWith(PREFIX_SOS)) {
      const parsed = SosRequestSchema.safeParse(value);
      if (!parsed.success) continue;
      const request = parsed.data;
      // 옛 요청에는 전송 단위 ID가 없다 (request_id NULL). 대기 중 자리가 이미 차 있으면 넣지 않는다.
      await db
        .prepare(
          "INSERT OR IGNORE INTO failfair_sos " +
            "(id, channel_id, case_id, student_manager_id, senior_manager_id, status, request_id, body_json, created_at, responded_at) " +
            "VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)",
        )
        .bind(
          request.id,
          request.channelId,
          request.caseId,
          request.studentManagerId,
          request.seniorManagerId,
          request.status,
          JSON.stringify(request),
          request.createdAt,
          request.respondedAt ?? null,
        )
        .run();
      // 옛 저장소에서 답이 달렸는데 표는 아직 대기 중이면 그 답을 따른다. 반대로는 건드리지 않는다.
      if (request.status !== "pending") {
        await db
          .prepare(
            "UPDATE failfair_sos SET status = ?, responded_at = ?, body_json = ? " +
              "WHERE id = ? AND status = 'pending'",
          )
          .bind(
            request.status,
            request.respondedAt ?? null,
            JSON.stringify(request),
            request.id,
          )
          .run();
      }
      summary.sos += 1;
    } else if (id === KEY_FEEDBACK && Array.isArray(value)) {
      for (const candidate of value) {
        if (!isLegacyFeedback(candidate)) continue;
        await db
          .prepare(
            "INSERT OR IGNORE INTO failfair_feedback " +
              "(request_id, session_id, result_id, case_id, event, created_at) VALUES (?, ?, ?, NULL, ?, ?)",
          )
          .bind(
            candidate.requestId,
            candidate.sessionId,
            candidate.resultId,
            candidate.event,
            candidate.at ?? now,
          )
          .run();
        summary.feedback += 1;
      }
    }
    // 그 밖의 키(failfair:model 등)는 그대로 둔다.
  }
  return summary;
}

let imported: Promise<void> | undefined;

/**
 * isolate마다 한 번, 첫 요청이 저장소를 읽기 전에 옮긴다. 실패해도 요청을 막지 않고 경고만 남기며,
 * 다음 요청이 다시 시도한다. 반드시 D1 컨텍스트(withDatabase) 안에서 부른다.
 */
export function ensureLegacyImported(
  log: (message: string) => void = (message) => console.warn(message),
): Promise<void> {
  imported ??= importLegacyRecords()
    .then((summary) => {
      const moved = Object.values(summary).reduce((sum, n) => sum + n, 0);
      if (moved > 0)
        log(`옛 app_records 데이터를 표로 옮김: ${JSON.stringify(summary)}`);
    })
    .catch((error: unknown) => {
      imported = undefined;
      log(
        `옛 app_records 이관 실패 (${error instanceof Error ? error.message : "unknown"}); 다음 요청에서 다시 시도`,
      );
    });
  return imported;
}
