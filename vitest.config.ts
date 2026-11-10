import { defineConfig } from "vitest/config";
import fs from "fs";
import path from "path";
import { parseEnv } from "util";

// vitest 不會自動讀 .env。這裡只讀 .env 與 .env.test（後者覆寫前者），
// 刻意不讀 .env.local：`vercel env pull` 會把正式環境變數寫進那裡。
// 已存在於 shell 的變數（例如 CI 設的 DATABASE_URL）優先，不會被覆寫。
function loadTestEnv(): Record<string, string> {
  const merged: Record<string, string> = {};
  for (const file of [".env", ".env.test"]) {
    const full = path.resolve(__dirname, file);
    if (fs.existsSync(full)) Object.assign(merged, parseEnv(fs.readFileSync(full, "utf8")));
  }
  for (const key of Object.keys(merged)) {
    if (process.env[key] !== undefined) delete merged[key];
  }
  return merged;
}

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.{test,spec}.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "**/e2e/**"],
    env: {
      ...loadTestEnv(),
      // route 層限流在測試環境停用 (見 src/lib/rate-limit.ts enforceRateLimit)；
      // 限流邏輯由 test/security/rate-limit-persistent.test.ts 自行開啟並驗證。
      RATE_LIMIT_DISABLED: "1",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
