import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import type { AppDatabase } from "./database.js";

/**
 * 테스트용 D1 대역. `cloudflare/migrations/*.sql`을 순서대로 실행한 SQLite를 메모리에 띄운다.
 * 스키마를 여기 따로 적지 않으므로, 마이그레이션과 코드가 어긋나면 운영이 아니라
 * 단위 테스트에서 먼저 깨진다. 조건부 INSERT/UPDATE가 몇 행을 바꿨는지도 흉내가 아니라
 * 실제 SQL로 확인한다.
 */
function migrationsDir(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let depth = 0; depth < 6; depth += 1) {
    const candidate = join(dir, "cloudflare", "migrations");
    if (existsSync(candidate)) return candidate;
    dir = dirname(dir);
  }
  throw new Error("cloudflare/migrations not found above " + import.meta.url);
}

/** 적용 순서대로 정렬된 마이그레이션 SQL. */
export function migrationSql(): { name: string; sql: string }[] {
  const dir = migrationsDir();
  return readdirSync(dir)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => ({ name, sql: readFileSync(join(dir, name), "utf8") }));
}

export function createTestDatabase(migrations = migrationSql()): AppDatabase {
  const sqlite = new DatabaseSync(":memory:");
  for (const { sql } of migrations) sqlite.exec(sql);
  const statement = (sql: string, values: (string | number | null)[]) => ({
    sql,
    values,
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
  type TestStatement = ReturnType<typeof statement>;
  return {
    prepare(sql: string) {
      return {
        ...statement(sql, []),
        bind: (...values: (string | number | null)[]) => statement(sql, values),
      };
    },
    /** D1 batch처럼 한 트랜잭션. 중간에 실패하면 앞선 문장도 되돌린다. */
    async batch(statements) {
      sqlite.exec("BEGIN");
      try {
        const results: unknown[] = [];
        for (const item of statements as TestStatement[]) {
          const result = sqlite.prepare(item.sql).run(...item.values);
          results.push({ meta: { changes: Number(result.changes) } });
        }
        sqlite.exec("COMMIT");
        return results;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  };
}
