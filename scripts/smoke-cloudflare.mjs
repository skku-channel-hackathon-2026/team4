import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
const origin = process.env.SMOKE_ORIGIN ?? "http://127.0.0.1:8797";
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin)) {
  throw new Error("This synthetic smoke is local-only");
}
for (const path of ["/api/health", "/api/ready"]) {
  const response = await fetch(origin + path);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
}
const body =
  '{ "method": "extension.command.metadata.getCommands", "params": {} }';
const signature = createHmac("sha256", Buffer.from("11".repeat(32), "hex"))
  .update(body)
  .digest("base64");
const send = (path, sig, value = body) =>
  fetch(origin + path, {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      ...(sig ? { "x-signature": sig } : {}),
    },
    body: value,
  });
for (const path of ["/functions", "/functions/v1"]) {
  for (const response of await Promise.all([
    send(path, signature),
    send(path, signature),
  ])) {
    assert.equal(response.status, 200);
    assert.match(await response.text(), /tutorial\.open/);
  }
  assert.equal((await send(path)).status, 401);
  assert.equal((await send(path, "invalid")).status, 401);
  assert.equal((await send(path, signature, body + " ")).status, 401);
}
const wam = await fetch(origin + "/resource/wam/tutorial/");
assert.equal(wam.status, 200);
const html = await wam.text();
const assets = [...html.matchAll(/(?:src|href)="(\.\/assets\/[^"]+)"/g)].map(
  (match) => match[1],
);
assert(assets.length >= 2);
for (const asset of assets)
  assert.equal((await fetch(new URL(asset, wam.url))).status, 200);
console.log(
  "PASS: Workers HTTP adapter, signed concurrent calls, invalid/tampered signatures, D1 readiness, WAM and static assets",
);
