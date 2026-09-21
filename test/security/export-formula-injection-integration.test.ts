import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { generateSurveyExportExcel } from "@/lib/excel-parser";
import type { QuestionInput } from "@/lib/types";
import {
  generateExecutiveReportDTO,
  buildExecutiveCsv,
} from "@/lib/report-engine";
import { calculateExecutiveKPIs } from "@/lib/dashboard-intelligence";
import type { QuestionAnalyticsResult } from "@/lib/analytics/types";

/**
 * 端到端整合測試：確認「使用者可控字串」在流經真正的匯出函式後，
 * 於輸出的 Excel 儲存格 / CSV 欄位中已被公式注入中和 (leading ')，
 * 而合法的安全值 (中文、百分比、數值文字) 完全不被更動。
 */

// 惡意作答字串 (應被中和為以 ' 開頭)
const HYPERLINK = '=HYPERLINK("http://evil")';
const SUM = "@SUM(A1)";
const PLUS = "+1234567890";
// 安全值 (不得被更動)
const SAFE_TEXT = "非常滿意";
const SAFE_PCT = "85%";
const SAFE_NUM = "3.5";

function textQuestion(code: string, title: string): QuestionInput {
  return {
    orderNum: 1,
    code,
    title,
    questionType: "text",
    required: false,
    scoringEnabled: false,
    reverseScore: false,
    choices: [],
  };
}

describe("匯出公式注入 — generateSurveyExportExcel 整合", () => {
  it("惡意作答與惡意標題被中和，安全值不變", async () => {
    const questions: QuestionInput[] = [
      textQuestion("Q1", SAFE_TEXT), // 安全題目標題
      textQuestion("Q2", HYPERLINK), // 惡意題目標題
      textQuestion("Q3", "評語"),
      textQuestion("Q4", "建議"),
      textQuestion("Q5", "分數"),
    ];

    const buffer = await generateSurveyExportExcel({
      survey: { title: HYPERLINK, version: 1 }, // 惡意問卷標題
      questions,
      responses: [
        {
          id: "resp-1",
          status: "COMPLETED",
          answers: [
            { questionCode: "Q1", rawValue: SAFE_TEXT },
            { questionCode: "Q2", rawValue: HYPERLINK },
            { questionCode: "Q3", rawValue: SUM },
            { questionCode: "Q4", rawValue: PLUS },
            { questionCode: "Q5", rawValue: SAFE_PCT },
          ],
        },
      ],
    });

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as any);

    // --- Meta sheet: 問卷標題應被中和 ---
    const meta = wb.getWorksheet("匯出資訊 (Meta)")!;
    let metaTitleVal: string | undefined;
    meta.eachRow((row) => {
      if (String(row.getCell(1).value) === "問卷名稱 (Survey Title)") {
        metaTitleVal = String(row.getCell(2).value);
      }
    });
    expect(metaTitleVal).toBe("'" + HYPERLINK);

    // --- Answers sheet: 逐題 raw_value 與 title ---
    const answers = wb.getWorksheet("作答明細 (Answers)")!;
    const rawByCode = new Map<string, string>();
    const titleByCode = new Map<string, string>();
    answers.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // header
      const code = String(row.getCell(4).value); // D: 題目代碼
      const title = String(row.getCell(5).value); // E: 題目名稱
      const raw = String(row.getCell(7).value); // G: 原始作答內容
      rawByCode.set(code, raw);
      titleByCode.set(code, title);
    });

    // 惡意作答已中和
    expect(rawByCode.get("Q2")).toBe("'" + HYPERLINK);
    expect(rawByCode.get("Q3")).toBe("'" + SUM);
    expect(rawByCode.get("Q4")).toBe("'" + PLUS);
    // 安全作答未被更動
    expect(rawByCode.get("Q1")).toBe(SAFE_TEXT);
    expect(rawByCode.get("Q5")).toBe(SAFE_PCT);

    // 惡意題目標題已中和；安全題目標題未變
    expect(titleByCode.get("Q2")).toBe("'" + HYPERLINK);
    expect(titleByCode.get("Q1")).toBe(SAFE_TEXT);
  });
});

describe("匯出公式注入 — buildExecutiveCsv 整合", () => {
  it("CSV 欄位中的惡意標題/選項被中和 (引號內首字為 ')，安全值不變", () => {
    const kpis = calculateExecutiveKPIs({
      totalResponses: 10,
      completedResponses: 10,
      inProgressResponses: 0,
      averageDurationSeconds: 42,
      averageScore: null,
    });

    const question: QuestionAnalyticsResult = {
      questionId: "q1",
      code: "Q1",
      orderNum: 1,
      title: SUM, // 惡意題目標題
      type: "single_choice",
      required: false,
      scoringEnabled: false,
      totalResponses: 10,
      answeredCount: 10,
      unansweredCount: 0,
      answerRate: 100,
      unansweredRate: 0,
      distribution: [
        {
          choiceId: "c1",
          label: HYPERLINK, // 惡意選項標籤
          value: "v1",
          orderNum: 1,
          count: 6,
          percentage: 60,
        },
        {
          choiceId: "c2",
          label: SAFE_TEXT, // 安全選項標籤
          value: "v2",
          orderNum: 2,
          count: 4,
          percentage: 40,
        },
      ],
      statistics: null,
    };

    const dto = generateExecutiveReportDTO({
      survey: {
        id: "s1",
        title: PLUS, // 惡意問卷標題
        version: 1,
        status: "PUBLISHED",
        organizationId: "org-1",
      },
      filter: { timeRange: "all", dateFrom: null, dateTo: null, status: "COMPLETED" },
      kpis,
      insights: [],
      questions: [question],
    });

    const csv = buildExecutiveCsv(dto);

    // 惡意問卷標題被中和 (escapeCsv 內先套 escapeFormulaString，' 成為引號內首字)
    expect(csv).toContain(`"'${PLUS}"`);
    // 惡意題目標題被中和
    expect(csv).toContain(`"'${SUM}"`);
    // 惡意選項標籤被中和 (內部雙引號被 RFC4180 跳脫為 "")
    const escapedHyperlink = HYPERLINK.replace(/"/g, '""');
    expect(csv).toContain(`"'${escapedHyperlink}"`);
    // 安全選項標籤未被更動 (無前導 ')
    expect(csv).toContain(`"${SAFE_TEXT}"`);
    expect(csv).not.toContain(`"'${SAFE_TEXT}"`);
    // 安全數值文字未被更動
    expect(csv).not.toContain(`"'${SAFE_NUM}"`);
  });
});
