import { getDatabase } from "./database.js";

/**
 * 기존 `app_records` 테이블을 key-value JSON 저장소로 쓴다.
 * 단일 설정값(모델 설정 `failfair:model`)과 이전 표식처럼 행 하나로 끝나는 것만 여기 둔다.
 * 목록·동시 변경이 있는 데이터는 `cloudflare/migrations`의 전용 테이블을 쓴다.
 * 반드시 Function 안에서만 호출한다 (D1 바인딩은 요청 단위로만 존재).
 */
export async function getRecord<T>(id: string): Promise<T | undefined> {
  const row = await getDatabase()
    .prepare("SELECT value_json FROM app_records WHERE id = ?")
    .bind(id)
    .first<{ value_json: string }>();
  if (!row) return undefined;
  try {
    return JSON.parse(row.value_json) as T;
  } catch {
    return undefined;
  }
}

export async function setRecord(id: string, value: unknown): Promise<void> {
  await getDatabase()
    .prepare(
      "INSERT INTO app_records (id, value_json) VALUES (?, ?) " +
        "ON CONFLICT(id) DO UPDATE SET value_json = excluded.value_json, updated_at = CURRENT_TIMESTAMP",
    )
    .bind(id, JSON.stringify(value))
    .run();
}
