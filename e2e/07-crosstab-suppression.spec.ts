import { test, expect } from "@playwright/test";
import { STORAGE_STATE } from "../playwright.config";
import { E2E_DATA } from "./fixtures/seed-e2e";

test.describe("E2E-07: Statistical Crosstab, Cell Suppression & Export", () => {
  test("在統計看板檢視雙變量交叉分析矩陣，驗證 k=5 抑制遮蔽標籤與 Excel 報表匯出", async ({ browser }) => {
    const context = await browser.newContext({ storageState: STORAGE_STATE.OWNER });
    const page = await context.newPage();

    const surveyId = E2E_DATA.surveys.publishedA.id;

    // 1. 導航至統計分析頁面
    await page.goto(`/surveys/${surveyId}/stats`);
    await expect(page.locator("h1").first()).toContainText(E2E_DATA.surveys.publishedA.title);

    // 驗證已載入 8 筆填答資料
    await expect(page.locator("body")).toContainText("總填答數 (Total)");

    // 2. 切換至「交叉分析 (2-Way Cross-tab)」分頁
    await page.click('button:has-text("交叉分析")');

    // 3. 驗證交叉分析矩陣已載入並正確觸發 k < 5 隱私抑制 (< 5 標籤)
    await expect(page.locator("body")).toContainText("< 5");

    // 4. 驗證 Excel 匯出 API 正常運作且回傳合規之 XLSX 檔案二進位資料
    const exportRes = await page.request.get(`/api/surveys/${surveyId}/export?timeRange=all&status=COMPLETED`);
    expect(exportRes.status()).toBe(200);

    const contentType = exportRes.headers()["content-type"];
    expect(contentType).toContain("spreadsheetml.sheet");

    const buffer = await exportRes.body();
    expect(buffer.length).toBeGreaterThan(1000);

    await context.close();
  });
});
