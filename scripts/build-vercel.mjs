import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { tmpdir } from "node:os";

const output = resolve(".vercel/output");
const functionDir = resolve(output, "functions/server.func");
await rm(output, { recursive: true, force: true });
await mkdir(resolve(output, "functions"), { recursive: true });
const staging = await mkdtemp(resolve(tmpdir(), "skku-app-bundle-"));
try {
  const deployed = resolve(staging, "server");
  execFileSync(
    "corepack",
    ["pnpm", "--filter", "@tutorial/server", "deploy", "--prod", deployed],
    { stdio: "inherit" },
  );
  await cp(deployed, functionDir, { recursive: true, verbatimSymlinks: true });
} finally {
  await rm(staging, { recursive: true, force: true });
}
await writeFile(
  resolve(functionDir, "index.mjs"),
  'export { default } from "./dist/src/serverless.js";\n',
);
await writeFile(
  resolve(functionDir, ".vc-config.json"),
  JSON.stringify(
    { runtime: "nodejs24.x", handler: "index.mjs", launcherType: "Nodejs" },
    null,
    2,
  ),
);
await mkdir(resolve(output, "static/resource/wam/tutorial"), {
  recursive: true,
});
await cp("wam/dist", resolve(output, "static/resource/wam/tutorial"), {
  recursive: true,
});
await writeFile(
  resolve(output, "config.json"),
  JSON.stringify(
    {
      version: 3,
      routes: [
        {
          src: "^/resource/wam/tutorial$",
          status: 308,
          headers: { Location: "/resource/wam/tutorial/" },
        },
        {
          src: "^/resource/wam/tutorial/$",
          dest: "/resource/wam/tutorial/index.html",
        },
        { handle: "filesystem" },
        { src: "^/functions(?:/.*)?$", dest: "/server" },
        { src: "^/api/health$", dest: "/server" },
      ],
    },
    null,
    2,
  ),
);
console.log("Vercel Build Output ready: .vercel/output");
