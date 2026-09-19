import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import { GeminiGateway } from "../gemini.gateway.js";
import { RuleBasedGateway } from "../model-gateway.js";
import { runConversation, scenarios } from "./conversation.js";

const chosen = process.argv[2];
if (chosen && !scenarios.some((s) => s.id === chosen)) {
  console.error(`시나리오: ${scenarios.map((s) => s.id).join(", ")}`);
  process.exitCode = 2;
} else if (!process.env.GEMINI_API_KEY?.trim()) {
  console.error(
    "실제 테스트 미실행: server/.env에 GEMINI_API_KEY를 설정하세요. 가짜 응답으로 대체하지 않습니다.",
  );
  process.exitCode = 2;
} else {
  const model = process.env.GEMINI_MODEL || "gemini-3.1-flash-lite";
  const responses: unknown[] = [];
  const observedFetch: typeof fetch = async (url, init) => {
    const response = await fetch(url, init);
    const body = (await response.clone().json()) as { candidates?: unknown[] };
    responses.push({ status: response.status, candidates: body.candidates });
    return response;
  };
  const gateway = new GeminiGateway(
    process.env.GEMINI_API_KEY,
    new RuleBasedGateway(),
    model,
    observedFetch,
    process.env.ENABLE_CONTEXT_META_WRITE === "true",
  );
  const results = [];
  for (const scenario of scenarios.filter((s) => !chosen || s.id === chosen)) {
    const result = await runConversation(gateway, scenario);
    results.push(result);
    console.log(
      `${result.passed ? "PASS" : "FAIL"} ${result.id} (${result.turns.length}턴)`,
    );
  }
  const report = {
    model,
    executedAt: new Date().toISOString(),
    syntheticInputs: true,
    results,
    responses,
  };
  await mkdir("evaluation-results", { recursive: true });
  const path = `evaluation-results/gemini-${Date.now()}.json`;
  await writeFile(path, JSON.stringify(report, null, 2) + "\n");
  console.log(`대화·상황 JSON·실패 사유: ${path}`);
  if (results.some((r) => !r.passed)) process.exitCode = 1;
}
