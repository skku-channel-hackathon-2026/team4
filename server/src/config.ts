import "dotenv/config";
import type { ChannelAppModuleOptions } from "@channel.io/app-sdk-server";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required. Copy .env.example to .env and fill it in.`);
  }
  return value;
}

export const appId = required("APP_ID");
export const appSecret = required("APP_SECRET");
export const skipSignatureVerification = process.env.SKIP_SIGNATURE_VERIFICATION === "true";
if ((process.env.VERCEL === "1" || process.env.CLOUDFLARE_WORKER === "1") && skipSignatureVerification) {
  throw new Error("Signature verification cannot be disabled in hosted runtimes");
}
export const signingKey = skipSignatureVerification ? process.env.SIGNING_KEY ?? "" : required("SIGNING_KEY");

export const channelAppOptions: ChannelAppModuleOptions = {
  appId,
  appSecret,
  signingKey,
  appStoreUrl: process.env.APP_STORE_URL ?? "https://app-store-api.channel.io",
  autoRegister: process.env.VERCEL !== "1" && process.env.CLOUDFLARE_WORKER !== "1" && process.env.AUTO_REGISTER !== "false",
  skipSignatureVerification,
};
