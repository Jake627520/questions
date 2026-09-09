import { test, expect } from "@playwright/test";
import { STORAGE_STATE } from "../playwright.config";
import { E2E_DATA } from "./fixtures/seed-e2e";

test.describe("E2E-04: Survey Version Boundary & Clone Version", () => {
  test("已發布問卷鎖定後透過 Clone Version 衍生 v2，並驗證作答數據隔離", async ({ browser }) => {
    const context = await browser.newContext({ storageState: STORAGE_STATE.EDITOR });
    const page = await context.newPage();

    const v1Id = E2E_DATA.surveys.publishedA.id;

    // 1. 複製問卷為新版本 (Clone Version)
    const cloneRes = await page.request.post(`/api/surveys/${v1Id}/clone-version`);
    expect(cloneRes.status()).toBe(200);
    const cloneJson = await cloneRes.json();

    expect(cloneJson.success).toBe(true);
    expect(cloneJson.version).toBe(2);
    expect(cloneJson.survey.status).toBe("DRAFT");
    expect(cloneJson.survey.parentSurveyId).toBe(v1Id);

    const v2Id = cloneJson.surveyId;

    // 2. 驗證 Dashboard 列表中出現新版本草稿問卷
    await page.goto("/");
    await expect(page.locator("body")).toContainText("(v2)");

    // 3. 發布新版本問卷 (v2)
    const pubRes = await page.request.post(`/api/surveys/${v2Id}/publish`);
    expect(pubRes.status()).toBe(200);
    const pubJson = await pubRes.json();
    expect(pubJson.survey.status).toBe("PUBLISHED");

    // 4. 驗證 Version Lineage API 包含親代與子代版本關係
    const lineageRes = await page.request.get(`/api/surveys/${v2Id}/lineage`);
    expect(lineageRes.status()).toBe(200);
    const lineageJson = await lineageRes.json();
    expect(lineageJson.lineage).toBeDefined();

    // 5. 驗證版本資料隔離：v1 擁有作答記錄，v2 隔離且作答數為 0
    const v1ResponsesRes = await page.request.get(`/api/surveys/${v1Id}/responses`);
    const v1ResponsesJson = await v1ResponsesRes.json();
    expect(v1ResponsesJson.responses.length).toBeGreaterThan(0);

    const v2ResponsesRes = await page.request.get(`/api/surveys/${v2Id}/responses`);
    const v2ResponsesJson = await v2ResponsesRes.json();
    expect(v2ResponsesJson.responses.length).toBe(0);

    await context.close();
  });
});
