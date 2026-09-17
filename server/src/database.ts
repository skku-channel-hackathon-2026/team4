import { AsyncLocalStorage } from "node:async_hooks";

// A small shared contract keeps local Node development independent of Workers types.
export interface AppDatabase {
  prepare(sql: string): {
    bind(...values: (string | number | null)[]): {
      run(): Promise<unknown>;
      first<T = Record<string, unknown>>(): Promise<T | null>;
    };
    first<T = Record<string, unknown>>(): Promise<T | null>;
  };
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
