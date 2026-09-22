import { defineConfig, devices } from "@playwright/test";
import path from "path";

export const STORAGE_STATE = {
  OWNER: path.join(__dirname, "e2e/.auth/owner.json"),
  EDITOR: path.join(__dirname, "e2e/.auth/editor.json"),
  VIEWER: path.join(__dirname, "e2e/.auth/viewer.json"),
  OWNER_B: path.join(__dirname, "e2e/.auth/owner-b.json"),
};

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "playwright-report" }],
    ["json", { outputFile: "playwright-report/results.json" }],
  ],
  use: {
    baseURL: process.env.PLAYWRIGHT_TEST_BASE_URL || "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "setup",
      testMatch: /.*\.setup\.ts/,
    },
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
      },
      dependencies: ["setup"],
    },
  ],
  webServer: {
    command: "npm run start",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
    // E2E 伺服器停用 route 層限流：golden paths 全部從同一個 IP 連打
    // (登入多角色 + retry)，會誤觸每 IP 限流。生產環境不受影響，限流邏輯
    // 由 vitest 的 rate-limit-persistent 測試覆蓋。與 vitest.config 的
    // RATE_LIMIT_DISABLED=1 一致。
    env: { ...process.env, RATE_LIMIT_DISABLED: "1" } as Record<string, string>,
  },
});
