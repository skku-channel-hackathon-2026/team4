// Server-only: do not bundle API keys or this gateway into WAM.
export function createGeminiGateway({
  apiKey,
  model = "gemini-3.1-flash-lite",
  fetchImpl = fetch,
  timeoutMs = 20000,
}) {
  if (!apiKey || !/^gemini-[a-z0-9.-]+$/.test(model ?? ""))
    throw new Error("GEMINI_API_KEY와 정확한 GEMINI_MODEL이 필요합니다.");
  return {
    async generate({ instruction, schema, input }) {
      // Full conditional JSON Schema is enforced locally; use JSON mode on the provider.
      const response = await fetchImpl(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: "POST",
          signal: AbortSignal.timeout(timeoutMs),
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey,
          },
          body: JSON.stringify({
            systemInstruction: {
              parts: [
                {
                  text:
                    instruction +
                    "\ncontext의 JSON Schema:\n" +
                    JSON.stringify(schema),
                },
              ],
            },
            contents: [
              { role: "user", parts: [{ text: JSON.stringify(input) }] },
            ],
            generationConfig: {
              responseMimeType: "application/json",
              maxOutputTokens: 8192,
            },
          }),
        },
      );
      if (!response.ok) throw new Error(`Gemini HTTP ${response.status}`);
      const data = await response.json();
      const candidate = data.candidates?.[0];
      if (candidate?.finishReason !== "STOP")
        throw new Error("Gemini 응답 미완료 또는 차단");
      const text = (candidate.content?.parts ?? [])
        .filter((p) => !p.thought && typeof p.text === "string")
        .map((p) => p.text)
        .join("");
      return JSON.parse(text);
    },
  };
}
