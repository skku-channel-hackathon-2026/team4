import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "./app.module.js";
import { rewriteAppStoreFunctionUrl } from "./function-endpoint.js";

export async function createApplication() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });
  app.use(
    (
      request: { method: string; url: string },
      _response: unknown,
      next: () => void,
    ) => {
      request.url = rewriteAppStoreFunctionUrl(request.method, request.url);
      next();
    },
  );

  return app;
}
