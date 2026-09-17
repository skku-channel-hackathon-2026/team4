import "reflect-metadata";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { Logger } from "@nestjs/common";
import { createApplication } from "./src/application.js";

async function bootstrap() {
  const app = await createApplication();
  app.enableShutdownHooks();
  const wamDist = resolve(process.cwd(), "../wam/dist");
  if (existsSync(wamDist)) {
    app.useStaticAssets(wamDist, { prefix: "/resource/wam/tutorial" });
  } else {
    new Logger("Bootstrap").warn(
      `WAM build not found at ${wamDist}. Run pnpm build from the repository root.`,
    );
  }

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);

  const logger = new Logger("Bootstrap");
  logger.log(`Server: http://localhost:${port}`);
  logger.log(`Function endpoint: http://localhost:${port}/functions`);
  logger.log(`WAM endpoint: http://localhost:${port}/resource/wam`);
}

void bootstrap();
