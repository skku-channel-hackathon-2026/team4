type TtsEnv = Record<string, string | undefined>;

// A separate presenter token prevents the paid endpoint from being public.
export async function demoTts(
  request: Request,
  env: TtsEnv = process.env,
  upstream: typeof fetch = fetch,
): Promise<Response> {
  const fail = (status: number, error: string) =>
    Response.json(
      { error },
      { status, headers: { "Cache-Control": "no-store" } },
    );
  if (request.method !== "POST") return fail(405, "POST required");
  if (!env.DEMO_TTS_TOKEN || !env.ELEVENLABS_API_KEY)
    return fail(503, "음성 시연 설정이 필요해요.");
  if (request.headers.get("Authorization") !== `Bearer ${env.DEMO_TTS_TOKEN}`)
    return fail(401, "시연 토큰을 확인해 주세요.");
  if (!request.headers.get("content-type")?.includes("application/json"))
    return fail(415, "JSON required");
  let input: { text?: unknown; role?: unknown };
  try {
    // Limit streamed bodies as well as Content-Length to bound paid input.
    const reader = request.body?.getReader();
    if (!reader) return fail(400, "Empty body");
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 24000) {
        await reader.cancel();
        return fail(413, "메시지가 너무 길어요.");
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    input = JSON.parse(new TextDecoder().decode(bytes));
    if (!input || typeof input !== "object") return fail(400, "Invalid input");
  } catch {
    return fail(400, "Invalid JSON");
  }
  if (
    typeof input.text !== "string" ||
    !input.text.trim() ||
    input.text.length > 4000 ||
    (input.role !== "student" && input.role !== "assistant")
  )
    return fail(400, "Invalid text or role");
  const voice =
    input.role === "student"
      ? env.ELEVENLABS_STUDENT_VOICE_ID
      : env.ELEVENLABS_ASSISTANT_VOICE_ID;
  if (!voice) return fail(503, "학생·선배 목소리를 설정해 주세요.");
  const headerTimeout = new AbortController();
  const timer = setTimeout(() => headerTimeout.abort(), 30000);
  try {
    const audio = await upstream(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}/stream?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: {
          "xi-api-key": env.ELEVENLABS_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: input.text.trim(),
          model_id: env.ELEVENLABS_MODEL_ID || "eleven_flash_v2_5",
          language_code: "ko",
        }),
        // The 30s limit is only for receiving response headers. Once streaming
        // starts, the caller's signal controls the lifetime of the audio body.
        signal: AbortSignal.any([request.signal, headerTimeout.signal]),
      },
    );
    clearTimeout(timer);
    if (!audio.ok || !audio.body)
      return fail(502, "음성을 만들지 못했어요. 텍스트로 계속 진행해 주세요.");
    return new Response(audio.body, {
      headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
    });
  } catch {
    return fail(502, "음성 연결이 지연돼요. 텍스트로 계속 진행해 주세요.");
  } finally {
    clearTimeout(timer);
  }
}
