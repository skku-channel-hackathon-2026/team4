import { createServer } from "node:http";
import { httpServerHandler } from "cloudflare:node";
import { env } from "cloudflare:workers";
import { withDatabase } from "../server/dist/src/database.js";
import handler from "../server/dist/src/serverless.js";
import { demoTts } from "../server/dist/src/demo-tts.js";

const server = createServer((request, response) => {
  void withDatabase(env.DB, () => handler(request, response)).catch((error) => {
    console.error(
      "Request failed",
      error instanceof Error ? error.message : "unknown",
    );
    if (!response.headersSent) response.writeHead(500);
    response.end();
  });
});
const http = httpServerHandler(server);
export default {
  async fetch(request, bindings, context) {
    const url = new URL(request.url);
    if (
      request.method === "GET" &&
      url.pathname === "/" &&
      ["127.0.0.1", "localhost"].includes(url.hostname)
    ) {
      return Response.redirect(
        new URL("/resource/wam/tutorial/?bridge=server", url),
        302,
      );
    }
    if (url.pathname === "/api/tts") {
      return demoTts(request, bindings);
    }
    if (url.pathname === "/api/ready" && request.method === "GET") {
      try {
        await bindings.DB.prepare("SELECT 1 AS ok").first();
        return Response.json({ ok: true });
      } catch {
        return Response.json({ ok: false }, { status: 503 });
      }
    }
    return http.fetch(request, bindings, context);
  },
};
