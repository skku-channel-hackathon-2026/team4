import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { createServer } from "node:http";
import { readFile, readdir, realpath } from "node:fs/promises";
import { resolve, relative } from "node:path";

// Synthetic credentials only; registration must never make external calls here.
process.env.APP_ID = "local-smoke";
process.env.APP_SECRET = "local-smoke-secret";
process.env.SIGNING_KEY = "11".repeat(32);
process.env.VERCEL = "1";
delete process.env.SKIP_SIGNATURE_VERIFICATION;
const originalFetch = globalThis.fetch;
let externalCalls = 0;
globalThis.fetch = (...args) => {
  if (!String(args[0]).startsWith("http://127.0.0.1:")) {
    externalCalls++;
    throw new Error("Unexpected external request during serverless startup");
  }
  return originalFetch(...args);
};
const bundle = resolve(".vercel/output/functions/server.func");
async function checkTree(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = resolve(dir, entry.name);
    assert(
      !/^\.env(?:\.|$)/.test(entry.name),
      `Environment file in bundle: ${path}`,
    );
    if (entry.isSymbolicLink())
      assert(
        !relative(bundle, await realpath(path)).startsWith(".."),
        `Escaping symlink: ${path}`,
      );
    else if (entry.isDirectory()) await checkTree(path);
  }
}
await checkTree(bundle);
const { default: handler } =
  await import("../.vercel/output/functions/server.func/index.mjs");
const server = createServer((req, res) => {
  handler(req, res).catch(() => {
    res.statusCode = 500;
    res.end();
  });
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
try {
  assert.deepEqual(await (await fetch(`${base}/api/health`)).json(), {
    ok: true,
  });
  // Whitespace proves verification uses the original bytes rather than reserialized JSON.
  const body =
    '{ "method" : "extension.command.metadata.getCommands", "params" : {} }';
  const signature = createHmac(
    "sha256",
    Buffer.from(process.env.SIGNING_KEY, "hex"),
  )
    .update(body)
    .digest("base64");
  const send = (path, sig, payload = body) =>
    fetch(`${base}${path}`, {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        ...(sig ? { "x-signature": sig } : {}),
      },
      body: payload,
    });
  const coldResults = await Promise.all([
    send("/functions", signature),
    send("/functions/v1", signature),
  ]);
  for (const result of coldResults) {
    assert.equal(result.status, 200);
    assert.match(await result.text(), /tutorial\.open/);
  }
  for (const path of ["/functions", "/functions/v1"]) {
    assert.equal((await send(path)).status, 401);
    assert.equal((await send(path, "invalid")).status, 401);
    const results = await Promise.all([
      send(path, signature),
      send(path, signature),
    ]);
    for (const result of results) {
      assert.equal(result.status, 200);
      assert.match(await result.text(), /tutorial\.open/);
    }
    assert.equal((await send(path, signature, body + " ")).status, 401);
  }
  assert.equal(externalCalls, 0);
  const html = await readFile(
    ".vercel/output/static/resource/wam/tutorial/index.html",
    "utf8",
  );
  assert.match(html, /assets\//);
  console.log(
    "PASS: isolated bundle, health, signed discovery, invalid/tampered rejection, concurrent calls, zero registration requests, WAM artifact",
  );
} finally {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  globalThis.fetch = originalFetch;
}

// SDK token refresh timers belong to the long-lived runtime; end the smoke worker.
process.exit(0);
