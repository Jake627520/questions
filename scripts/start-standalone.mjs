/**
 * Local/CI entry for `output: "standalone"`.
 *
 * `next start` warns and is not the supported server for this build.
 * Vercel does not run this script. The image CMD is `node server.js`
 * after the Dockerfile copies the standalone output to /app.
 *
 * Next does not copy `public` or `.next/static` into the standalone
 * folder; this script does that, then runs `.next/standalone/server.js`.
 */
import { spawn } from "node:child_process";
import { cpSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const standaloneDir = path.join(root, ".next", "standalone");
const serverJs = path.join(standaloneDir, "server.js");

if (!existsSync(serverJs)) {
  console.error("Missing .next/standalone/server.js. Run `npm run build` first.");
  process.exit(1);
}

const publicDir = path.join(root, "public");
if (existsSync(publicDir)) {
  cpSync(publicDir, path.join(standaloneDir, "public"), { recursive: true });
}

const staticDir = path.join(root, ".next", "static");
if (!existsSync(staticDir)) {
  console.error("Missing .next/static. Run `npm run build` first.");
  process.exit(1);
}
cpSync(staticDir, path.join(standaloneDir, ".next", "static"), { recursive: true });

// Bind address. The process often inherits HOSTNAME from the OS (a machine
// name), which is not a listen address. Docker sets HOSTNAME itself and
// does not use this script.
const child = spawn(process.execPath, [serverJs], {
  cwd: standaloneDir,
  stdio: "inherit",
  env: {
    ...process.env,
    PORT: process.env.PORT || "3000",
    HOSTNAME: "0.0.0.0",
  },
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
