import assert from "node:assert/strict";
import test from "node:test";
import { getDatabase, withDatabase, type AppDatabase } from "./database.js";
test("database binding remains isolated across concurrent requests", async () => {
  const first = {} as AppDatabase;
  const second = {} as AppDatabase;
  await Promise.all(
    [first, second].map((database) =>
      withDatabase(database, async () => {
        await new Promise((resolve) => setTimeout(resolve, 1));
        assert.equal(getDatabase(), database);
      }),
    ),
  );
  assert.throws(() => getDatabase(), /Cloudflare runtime/);
});
