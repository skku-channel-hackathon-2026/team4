import { DatabaseSync } from "node:sqlite";
import type { AppDatabase } from "./database.js";

/**
 * 테스트용 D1 대역. `app_records`의 실제 스키마와 같은 SQLite를 메모리에 띄운다.
 * 조건부 INSERT/UPDATE와 `json_extract`가 정말 우리가 기대한 대로 도는지
 * (그리고 몇 행이 바뀌었는지) 흉내가 아니라 SQL로 확인하려고 둔다.
 */
export function createTestDatabase(): AppDatabase {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    CREATE TABLE app_records (
      id TEXT PRIMARY KEY,
      value_json TEXT NOT NULL CHECK (json_valid(value_json)),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  const statement = (sql: string, values: (string | number | null)[]) => ({
    async run() {
      const result = sqlite.prepare(sql).run(...values);
      return { meta: { changes: Number(result.changes) } };
    },
    async first<T>() {
      return (sqlite.prepare(sql).get(...values) as T | undefined) ?? null;
    },
    async all<T>() {
      return { results: sqlite.prepare(sql).all(...values) as T[] };
    },
  });
  return {
    prepare(sql: string) {
      return {
        ...statement(sql, []),
        bind: (...values: (string | number | null)[]) => statement(sql, values),
      };
    },
  };
}
