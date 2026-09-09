import { test, expect } from "@playwright/test";
import { E2E_DATA } from "./fixtures/seed-e2e";

test.describe("E2E-03: Respondent Public Journey (Fill -> Save Draft -> Resume -> Submit)", () => {
  test("未登入填答者填寫公開問卷、暫存草稿並最終成功提交", async ({ page }) => {
    const publicToken = E2E_DATA.surveys.publishedA.publicToken;

    // 自動接受所有 native alert dialog (例如提交成功彈窗)
    page.on("dialog", (dialog) => dialog.accept());

    // 1. 導航至公開問卷頁面
    await page.goto(`/s/${publicToken}`);
    await expect(page.locator("h1")).toContainText(E2E_DATA.surveys.publishedA.title);

    // 2. 填寫第一題 (Q1 單選題選項: 非常滿意)
    await page.locator('text="非常滿意"').click();

    // 3. 填寫第三題 (Q3 簡答題: 意見回饋)
    const feedbackInput = page.getByPlaceholder("請輸入您的回答...");
    await feedbackInput.fill("這是一段透過 E2E 驗證的草稿回饋");

    // 4. 點擊暫存草稿
    await page.click('button:has-text("暫存草稿")');

    // 驗證草稿儲存提示
    await expect(page.locator("body")).toContainText("草稿已成功儲存！");

    // 5. 填寫第二題必填 (Q2 單選題選項: 願意推薦)
    await page.locator('text="願意推薦"').click();

    // 6. 提交問卷
    await page.click('button:has-text("提交問卷")');

    // 7. 驗證成功頁面
    await expect(page).toHaveURL(new RegExp(`/s/${publicToken}/success`));
    await expect(page.locator("h1")).toContainText("問卷提交成功");
  });
});
