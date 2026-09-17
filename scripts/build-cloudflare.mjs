import { cp, mkdir, rm } from "node:fs/promises";
await rm("cloudflare/static", { recursive: true, force: true });
await mkdir("cloudflare/static/resource/wam/tutorial", { recursive: true });
await cp("wam/dist", "cloudflare/static/resource/wam/tutorial", {
  recursive: true,
});
