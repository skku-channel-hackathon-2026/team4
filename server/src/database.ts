import { AsyncLocalStorage } from "node:async_hooks";

// A small shared contract keeps local Node development independent of Workers types.
export interface AppStatement {
  run(): Promise<{ meta?: { changes?: number } } | unknown>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results?: T[] } | unknown>;
}
export interface AppDatabase {
  prepare(sql: string): AppStatement & {
    bind(...values: (string | number | null)[]): AppStatement;
  };
  /** Workers D1에서만 제공한다. 운영 HTTP 어댑터에는 없으므로 필수 경로에서 사용하지 않는다. */
  batch?(statements: AppStatement[]): Promise<unknown[]>;
}
const databaseContext = new AsyncLocalStorage<AppDatabase>();
export function withDatabase<T>(database: AppDatabase, callback: () => T): T {
  return databaseContext.run(database, callback);
}
export function getDatabase(): AppDatabase {
  const database = databaseContext.getStore();
  if (!database)
    throw new Error(
      "D1 requires the Cloudflare runtime; use pnpm dev:cloudflare",
    );
  return database;
}

/** D1의 `run()`이 돌려주는 변경 행 수. 조건부 쓰기가 실제로 먹었는지 판정한다. */
export function changedRows(result: unknown): number {
  const meta = (result as { meta?: { changes?: number } } | null)?.meta;
  return typeof meta?.changes === "number" ? meta.changes : 0;
}

/** D1의 `all()`이 돌려주는 행 배열. */
export function resultRows<T>(result: unknown): T[] {
  const rows = (result as { results?: T[] } | null)?.results;
  return Array.isArray(rows) ? rows : [];
}
