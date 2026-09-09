import { test, expect } from "@playwright/test";
import path from "path";
import { STORAGE_STATE } from "../playwright.config";
import { E2E_DATA } from "./fixtures/seed-e2e";

test.describe("E2E-02: Survey Lifecycle (Import -> Draft -> Publish -> Close -> Archive)", () => {
  test("1. 匯入 Excel 題庫建立問卷並成功進入預覽狀態", async ({ browser }) => {
    const context = await browser.newContext({ storageState: STORAGE_STATE.OWNER });
    const page = await context.newPage();

    await page.goto("/surveys/import");
    await expect(page.locator("h1")).toContainText("匯入題庫");

    // 上傳 demo-survey.xlsx
    const sampleExcel = path.join(process.cwd(), "demo-survey.xlsx");
    await page.setInputFiles('input[type="file"]', sampleExcel);

    // 勾選授權確認方塊
    await page.locator('label:has-text("我確認我有權使用並匯入上述內容")').click();

    // 點擊解析題庫預覽
    await page.click('button:has-text("解析題庫預覽")');

    // 預期出現題目解析預覽卡片
    await expect(page.locator("body")).toContainText("題庫預覽");

    await context.close();
  });

  test("2. 驗證問卷生命週期狀態轉換 API (Draft -> Published -> Closed -> Archived)", async ({ browser }) => {
    const context = await browser.newContext({ storageState: STORAGE_STATE.OWNER });
    const page = await context.newPage();

    const draftSurveyId = E2E_DATA.surveys.draftA.id;

    // 1. 發布草稿問卷
    const pubRes = await page.request.post(`/api/surveys/${draftSurveyId}/publish`);
    expect(pubRes.status()).toBe(200);
    const pubJson = await pubRes.json();
    expect(pubJson.survey.status).toBe("PUBLISHED");
    expect(pubJson.survey.publicToken).toBeTruthy();

    // 2. 驗證已發布問卷在首頁顯示
    await page.goto("/");
    await expect(page.locator("body")).toContainText(E2E_DATA.surveys.draftA.title);

    // 3. 關閉問卷 (CLOSED)
    const closeRes = await page.request.post(`/api/surveys/${draftSurveyId}/close`);
    expect(closeRes.status()).toBe(200);
    const closeJson = await closeRes.json();
    expect(closeJson.survey.status).toBe("CLOSED");

    // 4. 封存問卷 (ARCHIVED)
    const archiveRes = await page.request.post(`/api/surveys/${draftSurveyId}/archive`);
    expect(archiveRes.status()).toBe(200);
    const archiveJson = await archiveRes.json();
    expect(archiveJson.survey.status).toBe("ARCHIVED");

    await context.close();
  });
});
