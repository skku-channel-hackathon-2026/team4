import { changedRows, getDatabase } from "../database.js";

export interface FeedbackEntry {
  requestId: string;
  sessionId: string;
  resultId: string;
  /** 결과 카드에 연결된 사례. 사례별 "도움 됨" 집계에 쓴다. 사례 없는 카드면 비어 있다. */
  caseId?: string;
  event: "helpful" | "not_helpful" | "tool_copied";
  at: number;
}

/**
 * 도움 됨·도구 복사 신호를 한 행으로 남긴다. request_id가 기본키라 같은 클릭의 재전송은
 * 두 번 쌓이지 않는다. 처음 기록됐으면 true, 이미 있었으면 false.
 */
export async function recordFeedback(entry: FeedbackEntry): Promise<boolean> {
  const result = await getDatabase()
    .prepare(
      "INSERT OR IGNORE INTO failfair_feedback " +
        "(request_id, session_id, result_id, case_id, event, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(
      entry.requestId,
      entry.sessionId,
      entry.resultId,
      entry.caseId ?? null,
      entry.event,
      entry.at,
    )
    .run();
  return changedRows(result) === 1;
}
