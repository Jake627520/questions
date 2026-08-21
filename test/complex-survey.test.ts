import { describe, it, expect, beforeAll } from "vitest";
import { parseSurveyExcel } from "../src/lib/excel-parser";
import { validateQuestionsStructure, evaluateSurveySubmission } from "../src/lib/survey-engine";
import { generateComplexSurveyExcel } from "../scripts/generate-complex-demo-excel";
import fs from "fs";
import path from "path";

describe("P0-5 25+ 題超大型示範題庫檢驗測試 (Complex Survey 26-Question Tests)", () => {
  const excelPath = path.resolve(process.cwd(), "demo-complex-survey.xlsx");

  beforeAll(async () => {
    if (!fs.existsSync(excelPath)) {
      await generateComplexSurveyExcel(excelPath);
    }
  });

  it("應能完整解析 26 題並涵蓋所有題型與進階規則", async () => {
    expect(fs.existsSync(excelPath)).toBe(true);
    const buffer = fs.readFileSync(excelPath);
    const result = await parseSurveyExcel(buffer);

    expect(result.errors).toHaveLength(0);
    expect(result.questions.length).toBe(26);

    // 驗證結構正確性無循環相依
    const structVal = validateQuestionsStructure(result.questions);
    expect(structVal.isValid).toBe(true);
    expect(structVal.errors).toHaveLength(0);

    // 驗證涵蓋所有題型
    const types = new Set(result.questions.map((q) => q.questionType));
    expect(types.has("single_choice")).toBe(true);
    expect(types.has("multiple_choice")).toBe(true);
    expect(types.has("text")).toBe(true);
    expect(types.has("number")).toBe(true);
    expect(types.has("yes_no")).toBe(true);
    expect(types.has("info")).toBe(true);

    // 驗證特異性設定
    const qReverse = result.questions.find((q) => q.code === "Q5_REVERSE_CONFUSION");
    expect(qReverse?.reverseScore).toBe(true);

    const qNumberRange = result.questions.find((q) => q.code === "Q3_USAGE_FREQ");
    expect(qNumberRange?.minValue).toBe(0);
    expect(qNumberRange?.maxValue).toBe(7);

    const qMultiLimit = result.questions.find((q) => q.code === "Q4_FEATURES_WANTED");
    expect(qMultiLimit?.minSelections).toBe(1);
    expect(qMultiLimit?.maxSelections).toBe(2);

    const qSpecialScore = result.questions.find((q) => q.code === "Q5_TECHNICAL_LEVEL");
    const expertChoice = qSpecialScore?.choices.find((c) => c.value === "lvl_master");
    expect(expertChoice?.score).toBe(10);
  });

  it("模擬完整作答評估：計算總分與正確處理跳題", async () => {
    const buffer = fs.readFileSync(excelPath);
    const result = await parseSurveyExcel(buffer);

    const answers = [
      { questionCode: "Q1", rawValue: "very_satisfied" }, // 得 4 分 -> Q1_FEEDBACK 隱藏, Q1_PRAISE 顯現
      { questionCode: "Q1_PRAISE", rawValue: "界面非常流暢" },
      { questionCode: "Q2_YESNO", rawValue: "yes" }, // 得 2 分
      { questionCode: "Q3_USAGE_FREQ", rawValue: 5 }, // 5 天 -> Q3_HIGH_USAGE_REASON 顯現
      { questionCode: "Q3_HIGH_USAGE_REASON", rawValue: "每日滿意度追蹤" },
      { questionCode: "Q4_FEATURES_WANTED", rawValue: ["realtime_collab", "advanced_stats"] }, // 2 + 5 = 7 分
      { questionCode: "Q4_INTEGRATIONS", rawValue: ["slack"] }, // 2 分 -> Q4_SLACK_DETAIL 顯現
      { questionCode: "Q4_SLACK_DETAIL", rawValue: "警報通知" },
      { questionCode: "Q5_TECHNICAL_LEVEL", rawValue: "lvl_master" }, // 特殊 10 分
      { questionCode: "Q5_OUTAGE_HISTORY", rawValue: "zero_issues" }, // 0 分
      { questionCode: "Q5_REVERSE_CONFUSION", rawValue: "strongly_agree" }, // 原始 5 分 -> 反轉得 1 分
      { questionCode: "Q5_OTHER_CHANNEL", rawValue: "search" },
      { questionCode: "Q6_DEPLOY_ENV", rawValue: "hybrid" }, // 5 分 -> Q6_CLOUD_PROVIDER 顯現
      { questionCode: "Q6_CLOUD_PROVIDER", rawValue: "aws" },
      { questionCode: "Q7_SECURITY_AUDIT", rawValue: "yes" }, // 3 分 -> Q7_COMPLIANCE_STANDARDS 顯現
      { questionCode: "Q7_COMPLIANCE_STANDARDS", rawValue: ["iso27001"] },
      { questionCode: "Q8_TEAM_SIZE", rawValue: 100 }, // 100 -> Q8_LARGE_TEAM_BENEFIT 顯現
      { questionCode: "Q8_LARGE_TEAM_BENEFIT", rawValue: "high_need" },
      { questionCode: "Q9_UI_USABILITY", rawValue: "5" }, // 5 分
      { questionCode: "Q10_DOCUMENTATION", rawValue: "5" }, // 5 分
      { questionCode: "Q11_RECOMMEND_NPS", rawValue: 10 }, // 10 分
      { questionCode: "Q12_GENERAL_ADVICE", rawValue: "繼續保持！" },
    ];

    const evaluation = evaluateSurveySubmission(result.questions, answers);
    expect(evaluation.isValid).toBe(true);
    expect(evaluation.totalScore).toBeGreaterThan(0);

    // Q1_FEEDBACK 應隱藏
    const qFeedbackResult = evaluation.questionResults.find((r: any) => r.questionCode === "Q1_FEEDBACK");
    expect(qFeedbackResult?.isVisible).toBe(false);

    // Q1_PRAISE 應顯現
    const qPraiseResult = evaluation.questionResults.find((r: any) => r.questionCode === "Q1_PRAISE");
    expect(qPraiseResult?.isVisible).toBe(true);
  });
});
