import { getDatabase } from "./database.js";

/**
 * 기존 `app_records` 테이블을 key-value JSON 저장소로 쓴다.
 * 새 마이그레이션 없이 선택 통계, 도구함, 등록된 전시를 보관한다.
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
