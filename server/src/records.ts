import { changedRows, getDatabase, resultRows } from "./database.js";

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

/**
 * 한 덩어리 JSON 배열 대신 접두사로 묶인 여러 행을 읽는다.
 * 행마다 따로 쓰므로 동시 요청이 서로의 변경을 덮어쓰지 않는다.
 * `prefix`는 앱이 만든 값만 넘긴다 (LIKE 와일드카드를 이스케이프하지 않는다).
 */
export async function listRecords<T>(prefix: string): Promise<T[]> {
  const result = await getDatabase()
    .prepare("SELECT value_json FROM app_records WHERE id LIKE ? ORDER BY id")
    .bind(`${prefix}%`)
    .all<{ value_json: string }>();
  return resultRows<{ value_json: string }>(result).flatMap((row) => {
    try {
      return [JSON.parse(row.value_json) as T];
    } catch {
      return [];
    }
  });
}

/** 그 자리가 비어 있을 때만 넣는다. 이미 누가 차지했으면 false. */
export async function insertRecordIfAbsent(
  id: string,
  value: unknown,
): Promise<boolean> {
  const result = await getDatabase()
    .prepare(
      "INSERT INTO app_records (id, value_json) VALUES (?, ?) ON CONFLICT(id) DO NOTHING",
    )
    .bind(id, JSON.stringify(value))
    .run();
  return changedRows(result) === 1;
}

/**
 * 저장된 JSON의 `field`가 아직 `expected`일 때만 통째로 바꾼다.
 * 읽은 뒤 쓰는 사이에 남이 먼저 바꿨으면 false가 되어, 덮어쓰기 대신 다시 읽게 한다.
 */
export async function replaceRecordIfField(
  id: string,
  field: string,
  expected: string,
  value: unknown,
): Promise<boolean> {
  const result = await getDatabase()
    .prepare(
      "UPDATE app_records SET value_json = ?, updated_at = CURRENT_TIMESTAMP " +
        "WHERE id = ? AND json_extract(value_json, ?) = ?",
    )
    .bind(JSON.stringify(value), id, `$.${field}`, expected)
    .run();
  return changedRows(result) === 1;
}
