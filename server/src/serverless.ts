import type { IncomingMessage, ServerResponse } from "node:http";
import { createApplication } from "./application.js";
import { ModelGatewayResolver } from "./failfair/model-config.service.js";

type Handler = (request: IncomingMessage, response: ServerResponse) => void;
let initialization: Promise<Handler> | undefined;
const models = new ModelGatewayResolver();

export default async function handler(
  request: IncomingMessage,
  response: ServerResponse,
) {
  if (
    request.method === "GET" &&
    request.url?.split("?")[0] === "/api/health"
  ) {
    response.setHeader("Content-Type", "application/json");
    // model: 실제로 기동되는 게이트웨이와 출처(env·record·none). Desk 설정 반영 여부를 여기서 본다.
    const modelConfig = await models.describe();
    response.end(
      JSON.stringify({
        ok: true,
        model: modelConfig.provider,
        modelSource: modelConfig.source,
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
