import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "./app.module.js";
import { rewriteAppStoreFunctionUrl } from "./function-endpoint.js";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { demoTts } from "./demo-tts.js";

export async function createApplication() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });
  app.use((req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (req.url?.split("?")[0] !== "/api/tts") {
      next();
      return;
    }
    const controller = new AbortController();
    res.on("close", () => controller.abort());
    void (async () => {
      const headers = new Headers();
      for (const [name, value] of Object.entries(req.headers)) {
        if (value)
          headers.set(name, Array.isArray(value) ? value.join(",") : value);
      }
      const request = new Request("http://localhost/api/tts", {
        method: req.method,
        headers,
        signal: controller.signal,
        ...(req.method !== "GET" && req.method !== "HEAD"
          ? {
              body: Readable.toWeb(req) as ReadableStream<Uint8Array>,
              duplex: "half",
            }
          : {}),
      });
      const result = await demoTts(request);
      res.statusCode = result.status;
      result.headers.forEach((value, key) => res.setHeader(key, value));
      if (result.body)
        await pipeline(
          Readable.fromWeb(
            result.body as import("node:stream/web").ReadableStream,
          ),
          res,
        );
      else res.end();
    })().catch(() => {
      if (!res.headersSent) res.statusCode = 502;
      res.end();
    });
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
