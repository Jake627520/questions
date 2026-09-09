import { test, expect } from "@playwright/test";
import { STORAGE_STATE } from "../playwright.config";
import { E2E_DATA } from "./fixtures/seed-e2e";

test.describe("E2E-08: Cross-Tenant Browser Isolation & Zero Data Leakage", () => {
  test("Org B 合法使用者直接導航存取 Org A 私密問卷，驗證瀏覽器 DOM 與 Network 嚴格零洩漏 (Zero Leakage)", async ({ browser }) => {
    // 1. 建立合法 Org B 瀏覽器 Context 與 Session
    const context = await browser.newContext({ storageState: STORAGE_STATE.OWNER_B });
    const page = await context.newPage();

    // 驗證 Org B 使用者身分正常
    await page.goto("/");
    await expect(page.locator("body")).toContainText(E2E_DATA.surveys.privateB.title);

    const orgASurveyId = E2E_DATA.surveys.publishedA.id;
    const orgASurveyTitle = E2E_DATA.surveys.publishedA.title;

    // 2. 監聽所有向 Org A 問卷發出的 API Network 封包，嚴格校驗 Response Payload 零洩漏
    const networkErrors: { url: string; status: number; body: string }[] = [];
    page.on("response", async (response) => {
      if (response.url().includes(`/api/surveys/${orgASurveyId}`)) {
        const status = response.status();
        let bodyText = "";
        try {
          bodyText = await response.text();
        } catch {
          bodyText = "";
        }
        networkErrors.push({ url: response.url(), status, body: bodyText });
      }
    });

    // 3. Org B 瀏覽器直接導航至 Org A 的統計分析頁面
    await page.goto(`/surveys/${orgASurveyId}/stats`);

    // 4. 驗證 UI 顯示拒絕或無權查看訊息
    await expect(page.locator("body")).toContainText("找不到該問卷統計資料或您無權查看");

    // 5. 嚴格驗證 DOM 絕無 Org A 問卷名稱、題目與選項（Zero DOM Leakage）
    const pageContent = await page.content();
    expect(pageContent).not.toContain(orgASurveyTitle);
    expect(pageContent).not.toContain("整體滿意度");
    expect(pageContent).not.toContain("推薦意願");
    expect(pageContent).not.toContain("願意推薦");

    // 6. 驗證所有統計相關 API 回應皆為 403 或 404，且 Response JSON 不含 Org A 數據
    expect(networkErrors.length).toBeGreaterThan(0);
    for (const item of networkErrors) {
      expect([403, 404]).toContain(item.status);
      expect(item.body).not.toContain(orgASurveyTitle);
      expect(item.body).not.toContain("整體滿意度");
      expect(item.body).not.toContain("e2e-org-a");
    }

    // 7. 直接透過 Org B 權限發出越權 API 請求 (IDOR 探測)
    const mgmtRes = await page.request.get(`/api/surveys/${orgASurveyId}?mode=management`);
    expect(mgmtRes.status()).toBe(403);
    const mgmtJson = await mgmtRes.json();
    expect(mgmtJson.error).toMatch(/FORBIDDEN|無權查看/i);

    const responsesRes = await page.request.get(`/api/surveys/${orgASurveyId}/responses`);
    expect(responsesRes.status()).toBe(403);

    const deleteRes = await page.request.delete(`/api/surveys/${orgASurveyId}`);
    expect(deleteRes.status()).toBe(403);

    const exportRes = await page.request.get(`/api/surveys/${orgASurveyId}/export`);
    expect(exportRes.status()).toBe(403);

    await context.close();
  });
});
