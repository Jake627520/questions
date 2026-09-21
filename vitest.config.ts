import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.{test,spec}.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "**/e2e/**"],
    // route 層限流在測試環境停用 (見 src/lib/rate-limit.ts enforceRateLimit)；
    // 限流邏輯由 test/security/rate-limit-persistent.test.ts 自行開啟並驗證。
    env: { RATE_LIMIT_DISABLED: "1" },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
