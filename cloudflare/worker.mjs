import { createServer } from "node:http";
import { httpServerHandler } from "cloudflare:node";
import { env } from "cloudflare:workers";
import { withDatabase } from "../server/dist/src/database.js";
import handler from "../server/dist/src/serverless.js";

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
    if (
      new URL(request.url).pathname === "/api/ready" &&
      request.method === "GET"
    ) {
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
