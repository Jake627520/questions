import { test, expect } from "@playwright/test";
import { STORAGE_STATE } from "../playwright.config";
import { E2E_DATA } from "./fixtures/seed-e2e";

test.describe("E2E-06: Viewer Guard (Privilege Boundary Enforcement)", () => {
  test("1. Viewer 角色檢視團隊頁面時，禁止顯示邀請表單與變更權限操作", async ({ browser }) => {
    const context = await browser.newContext({ storageState: STORAGE_STATE.VIEWER });
    const page = await context.newPage();

    await page.goto("/settings/team");
    await expect(page.locator("h1")).toContainText("團隊協作與成員權限");

    // Viewer 角色不具備管理員權限，不應看到「發送邀請」按鈕或變更角色按鈕
    await expect(page.locator('button:has-text("發送邀請")')).toHaveCount(0);
    await expect(page.locator('button:has-text("變更角色")')).toHaveCount(0);

    await context.close();
  });

  test("2. Viewer 嘗試從瀏覽器 Session 呼叫特權發布、複製與刪除 API 均回傳 403 Forbidden", async ({ browser }) => {
    const context = await browser.newContext({ storageState: STORAGE_STATE.VIEWER });
    const page = await context.newPage();

    const surveyId = E2E_DATA.surveys.publishedA.id;

    // 嘗試發布問卷 (需 EDITOR 以上)
    const pubRes = await page.request.post(`/api/surveys/${surveyId}/publish`);
    expect(pubRes.status()).toBe(403);
    const pubJson = await pubRes.json();
    expect(pubJson.error).toMatch(/權限不足|FORBIDDEN/i);

    // 嘗試複製問卷版本 (需 EDITOR 以上)
    const cloneRes = await page.request.post(`/api/surveys/${surveyId}/clone-version`);
    expect(cloneRes.status()).toBe(403);

    // 嘗試刪除問卷 (需 ADMIN / OWNER)
    const deleteRes = await page.request.delete(`/api/surveys/${surveyId}`);
    expect(deleteRes.status()).toBe(403);

    await context.close();
  });
});
