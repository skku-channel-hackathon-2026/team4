import "reflect-metadata";
import { TokenManager } from "@channel.io/app-sdk-server";
import { channelAppOptions } from "./config.js";
import { createApplication } from "./application.js";

// The SDK starts registration after listening. AppStore callbacks use the deployed URL.
channelAppOptions.autoRegister = true;
let finish!: (success: boolean) => void;
const registered = new Promise<boolean>((resolve) => {
  finish = resolve;
});
channelAppOptions.onAutoRegister = (results) => {
  finish(results.length > 0 && results.every((result) => result.success));
};
const app = await createApplication();
let timeout: ReturnType<typeof setTimeout> | undefined;
try {
  await app.listen(0, "127.0.0.1");
  const successful = await Promise.race([
    registered,
    new Promise<never>((_, reject) => {
      timeout = setTimeout(
        () => reject(new Error("Registration timed out after 90 seconds")),
        90_000,
      );
    }),
  ]);
  if (!successful)
    throw new Error(
      "Extension registration failed; check deployment and credentials",
    );
} finally {
  clearTimeout(timeout);
  app.get(TokenManager).destroy();
  await app.close();
}
