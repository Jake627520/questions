import { test, expect } from "@playwright/test";
import { STORAGE_STATE } from "../playwright.config";
import { E2E_DATA } from "./fixtures/seed-e2e";

test.describe("E2E-01: Login & Multi-Tenant Dashboard Journey", () => {
  test("1. 未登入使用者存取登入頁面並成功登入至 Dashboard", async ({ page }) => {
    await page.goto("/login");

    // 驗證登入表單元件
    await expect(page.locator("h1")).toContainText("登入系統");
    await page.fill('input[type="email"]', E2E_DATA.users.ownerA.email);
    await page.fill('input[type="password"]', E2E_DATA.users.ownerA.password);
    await page.click('button[type="submit"]');

    // 登入後導向首頁
    await expect(page).toHaveURL(/\/(#.*)?$/);

    // 驗證首頁出現組織或問卷列表
    await expect(page.locator("body")).toContainText("E2E 產品體驗調查問卷");
  });

  test("2. 輸入錯誤密碼時應被阻絕並顯示警告訊息", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[type="email"]', E2E_DATA.users.ownerA.email);
    await page.fill('input[type="password"]', "WrongPassword123!");
    await page.click('button[type="submit"]');

    // 停留在 /login 並出現錯誤提示
    await expect(page).toHaveURL(/\/login/);
    await expect(page.locator("body")).toContainText("電子郵件或密碼錯誤");
  });

  test("3. 使用預先快取之 Storage State (Owner Session) 直接進入 Dashboard", async ({ browser }) => {
    const context = await browser.newContext({ storageState: STORAGE_STATE.OWNER });
    const page = await context.newPage();

    await page.goto("/");
    // 應無須重新登入即可載入組織問卷
    await expect(page.locator("body")).toContainText("E2E 產品體驗調查問卷");
    await context.close();
  });
});
