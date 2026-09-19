import test from "node:test";
import assert from "node:assert/strict";
import { demoTts } from "./demo-tts.js";

const env = {
  DEMO_TTS_TOKEN: "presenter",
  ELEVENLABS_API_KEY: "private-key",
  ELEVENLABS_STUDENT_VOICE_ID: "student-voice",
  ELEVENLABS_ASSISTANT_VOICE_ID: "senior-voice",
};
const request = (body: unknown, token = "presenter") =>
  new Request("http://localhost/api/tts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
test("demo TTS rejects unauthorized and oversized requests before spending credits", async () => {
  const never: typeof fetch = async () => {
    throw new Error("must not call provider");
  };
  assert.equal(
    (
      await demoTts(
        request({ text: "hello", role: "student" }, "wrong"),
        env,
        never,
      )
    ).status,
    401,
  );
  assert.equal(
    (
      await demoTts(
        request({ text: "x".repeat(4001), role: "student" }),
        env,
        never,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await demoTts(
        request({ text: "x".repeat(25000), role: "student" }),
        env,
        never,
      )
    ).status,
    413,
  );
  assert.equal((await demoTts(request(null), env, never)).status, 400);
  assert.equal((await demoTts(request({}), {}, never)).status, 503);
});
test("demo TTS routes each role to the configured voice and streams audio", async () => {
  for (const role of ["student", "assistant"]) {
    const mock: typeof fetch = async (url, init) => {
      assert.ok(
        String(url).includes(
          role === "student" ? "student-voice" : "senior-voice",
        ),
      );
      assert.equal(new Headers(init?.headers).get("xi-api-key"), "private-key");
      assert.equal(JSON.parse(String(init?.body)).text, "안녕하세요");
      return new Response(new Uint8Array([1, 2, 3]));
    };
    const response = await demoTts(
      request({ text: "안녕하세요", role }),
      env,
      mock,
    );
    assert.equal(response.headers.get("Content-Type"), "audio/mpeg");
    assert.deepEqual(
      new Uint8Array(await response.arrayBuffer()),
      new Uint8Array([1, 2, 3]),
    );
  }
});
test("provider failures do not leak keys or provider response bodies", async () => {
  const response = await demoTts(
    request({ text: "안녕", role: "assistant" }),
    env,
    async () => new Response("private-key", { status: 401 }),
  );
  assert.equal(response.status, 502);
  assert.ok(!(await response.text()).includes("private-key"));
});
