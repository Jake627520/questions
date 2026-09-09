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
  },
});
