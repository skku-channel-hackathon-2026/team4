/** Local-only matching inspector. No database, model, credentials or production routes. */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import {
  ACTION_TAGS,
  CATEGORIES,
  DEMO_CASES,
  GOLDEN_QUERIES,
  SituationSchema,
  URGENCY_LABELS,
} from "@tutorial/shared";
import {
  matchActions,
  rankCases,
  MATCH_WEIGHTS,
} from "../retrieval.service.js";
import { DIMENSIONS } from "../distributed-score.js";
import { CHALLENGE_QUERIES } from "./fixtures/matching-challenges.js";
const port = Number(process.env.MATCHING_PLAYGROUND_PORT ?? 8798);
const origin = `http://127.0.0.1:${port}`;
const presets = [
  ...GOLDEN_QUERIES.map((q) => ({
    id: q.id,
    label: q.id + " · " + q.situation.situation.slice(0, 45),
    situation: q.situation,
    actionTag: q.actions[0].actionTag,
    cases: DEMO_CASES,
  })),
  ...CHALLENGE_QUERIES.map((q) => ({
    id: q.id,
    label: "한계 검사 · " + q.situation.situation,
    situation: q.situation,
    actionTag: q.actionTag,
    cases: q.cases!,
  })),
];
const RequestSchema = z.object({
  situation: SituationSchema,
  actionTag: z.string().max(100),
  dataset: z.string(),
  omit: z
    .array(z.enum(["problem", "context", "constraints", "goal", "urgency"]))
    .max(5)
    .default([]),
});
createServer(async (req, res) => {
  const send = (status: number, body: unknown) => {
    res.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    });
    res.end(JSON.stringify(body));
  };
  // Loopback only, with Host/Origin checks to reject cross-site browser requests.
  if (
    req.headers.host !== `127.0.0.1:${port}` ||
    (req.headers.origin && req.headers.origin !== origin)
  )
    return send(403, { error: "로컬 검사 화면에서만 접근할 수 있습니다." });
  try {
    if (req.method === "GET" && req.url === "/") {
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      });
      return res.end(
        await readFile(new URL("./playground.html", import.meta.url)),
      );
    }
    if (req.method === "GET" && req.url === "/config")
      return send(200, {
        categories: CATEGORIES,
        actions: ACTION_TAGS,
        urgencies: URGENCY_LABELS,
        weights: MATCH_WEIGHTS,
        dimensions: DIMENSIONS,
        presets: presets.map(({ cases, ...q }) => q),
      });
    if (req.method !== "POST" || req.url !== "/inspect")
      return send(404, { error: "경로를 찾을 수 없습니다." });
    let body = "";
    for await (const chunk of req) {
      body += chunk.toString();
      if (Buffer.byteLength(body) > 64000)
        return send(413, { error: "입력이 너무 깁니다." });
    }
    const input = RequestSchema.parse(JSON.parse(body));
    const dataset = presets.find((q) => q.id === input.dataset);
    if (!dataset) return send(400, { error: "사례 집합을 선택해주세요." });
    const supported = ACTION_TAGS[input.situation.category].find(
      (a) => a.tag === input.actionTag,
    );
    const action = {
      id: "inspect",
      label: supported?.label ?? "미지원 행동",
      actionTag: supported?.tag,
      origin: "student" as const,
      confirmed: true,
    };
    const options = { source: "demo" as const, omitDimensions: input.omit };
    const ranked = rankCases(input.situation, action, dataset.cases, options);
    return send(200, {
      input,
      weights: MATCH_WEIGHTS,
      counts: {
        all: dataset.cases.length,
        category: dataset.cases.filter(
          (c) =>
            c.status === "approved" && c.category === input.situation.category,
        ).length,
        eligible: ranked.length,
      },
      cards: matchActions(input.situation, [action], dataset.cases, options),
      ranked,
      cases: dataset.cases,
    });
  } catch (error) {
    return send(400, {
      error:
        error instanceof z.ZodError
          ? error.issues
              .map((i) => i.path.join(".") + ": " + i.message)
              .join("\n")
          : "입력 형식 또는 로컬 처리 오류를 확인해주세요.",
    });
  }
}).listen(port, "127.0.0.1", () =>
  console.log(`Matching inspector: ${origin}`),
);
