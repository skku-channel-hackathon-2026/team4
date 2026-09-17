import type { IncomingMessage, ServerResponse } from "node:http";
import { createApplication } from "./application.js";

type Handler = (request: IncomingMessage, response: ServerResponse) => void;
let initialization: Promise<Handler> | undefined;

export default async function handler(
  request: IncomingMessage,
  response: ServerResponse,
) {
  if (
    request.method === "GET" &&
    request.url?.split("?")[0] === "/api/health"
  ) {
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({ ok: true }));
    return;
  }
  initialization ??= createApplication()
    .then(async (app) => {
      await app.init();
      return app.getHttpAdapter().getInstance() as Handler;
    })
    .catch((error: unknown) => {
      initialization = undefined;
      throw error;
    });
  const dispatch = await initialization;
  dispatch(request, response);
}
