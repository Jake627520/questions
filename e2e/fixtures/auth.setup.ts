import { test as setup, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { seedE2E, E2E_DATA } from "./seed-e2e";
import { STORAGE_STATE } from "../../playwright.config";

setup("seed test database and setup storage states", async ({ page, context }) => {
  // 1. 確保 DB 注入測試 Fixture
  await seedE2E();

  // 確保 .auth 目錄存在
  const authDir = path.dirname(STORAGE_STATE.OWNER);
  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true });
  }

  // 2. 依序為各角色產生 Storage State (Session Cookie)
  const usersToAuth = [
    { user: E2E_DATA.users.ownerA, statePath: STORAGE_STATE.OWNER },
    { user: E2E_DATA.users.editorA, statePath: STORAGE_STATE.EDITOR },
    { user: E2E_DATA.users.viewerA, statePath: STORAGE_STATE.VIEWER },
    { user: E2E_DATA.users.ownerB, statePath: STORAGE_STATE.OWNER_B },
  ];

  for (const { user, statePath } of usersToAuth) {
    await page.goto("/login");
    await page.fill('input[type="email"]', user.email);
    await page.fill('input[type="password"]', user.password);
    await page.click('button[type="submit"]');

    // 登入後應成功導向主控台或首頁
    await expect(page).toHaveURL(/\/(#.*)?$/);

    // 儲存目前使用者瀏覽器狀態 (Cookie & LocalStorage)
    await context.storageState({ path: statePath });

    // 清理 context cookies 準備下一個使用者
    await context.clearCookies();
  }

  console.log("✅ All E2E Storage States successfully configured.");
});
