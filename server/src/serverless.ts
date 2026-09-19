import type { IncomingMessage, ServerResponse } from "node:http";
import { createApplication } from "./application.js";
import { describeModelConfig } from "./failfair/model-gateway.js";

type Handler = (request: IncomingMessage, response: ServerResponse) => void;
let initialization: Promise<Handler> | undefined;
let modelConfig: ReturnType<typeof describeModelConfig> | undefined;

export default async function handler(
  request: IncomingMessage,
  response: ServerResponse,
) {
  if (
    request.method === "GET" &&
    request.url?.split("?")[0] === "/api/health"
  ) {
    response.setHeader("Content-Type", "application/json");
    // model: 실제로 기동된 게이트웨이. 운영진이 비밀 변수를 넣은 뒤 여기서 확인한다.
    modelConfig ??= describeModelConfig();
    response.end(
      JSON.stringify({
        ok: true,
        model: modelConfig.provider,
        ...(modelConfig.warning ? { modelWarning: modelConfig.warning } : {}),
      }),
    );
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
