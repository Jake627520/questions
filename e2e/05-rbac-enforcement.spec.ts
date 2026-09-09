import { test, expect } from "@playwright/test";
import { STORAGE_STATE } from "../playwright.config";

test.describe("E2E-05: Tenant RBAC Enforcement & Role Updates", () => {
  test("組織擁有者在團隊管理頁面檢視成員、變更成員角色並即時反映於 UI", async ({ browser }) => {
    const context = await browser.newContext({ storageState: STORAGE_STATE.OWNER });
    const page = await context.newPage();

    await page.goto("/settings/team");
    await expect(page.locator("h1")).toContainText("團隊協作與成員權限");

    // 1. 驗證所有成員名單顯示
    await expect(page.locator("body")).toContainText("Alpha Owner");
    await expect(page.locator("body")).toContainText("Alpha Editor");
    await expect(page.locator("body")).toContainText("Alpha Member");

    // 2. 找到 Alpha Member 的「變更角色」按鈕並點擊
    const memberRow = page.locator("tr", { hasText: "Alpha Member" });
    await memberRow.locator('button:has-text("變更角色")').click();

    // 3. 在彈出視窗中切換角色至 EDITOR
    await page.locator('label:has-text("Editor")').click();

    // 4. 點擊確認更新角色
    await page.click('button:has-text("確認更新角色")');

    // 5. 驗證成功通知提示
    await expect(page.locator("body")).toContainText("角色已更新為 EDITOR");

    // 6. 驗證列表中的 Alpha Member 角色已更新為 Editor
    await expect(memberRow).toContainText("Editor");

    await context.close();
  });
});
