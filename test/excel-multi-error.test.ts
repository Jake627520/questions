import { describe, it, expect } from "vitest";
import { validateQuestionsStructure } from "../src/lib/survey-engine";
import { QuestionInput } from "../src/lib/types";

describe("M4 Excel 多重錯誤定位與結構檢核測試 (Multi-Error Diagnostics Tests)", () => {
  it("應能一次回傳多筆錯誤，並精確包含列號、題目代碼與錯誤原因", () => {
    const invalidQuestions: QuestionInput[] = [
      {
        rowNum: 2,
        orderNum: 1,
        code: "Q1",
        title: "單選題",
        questionType: "single_choice",
        required: true,
        scoringEnabled: false,
        reverseScore: false,
        choices: [
          { orderNum: 1, label: "選項 A", value: "a", scoreEnabled: false, score: null, isOther: false, requiresText: false, isNoneOfAbove: false },
          { orderNum: 2, label: "選項 A", value: "b", scoreEnabled: false, score: null, isOther: false, requiresText: false, isNoneOfAbove: false }, // 重複 label
        ],
      },
      {
        rowNum: 3,
        orderNum: 2,
        code: "Q2",
        title: "條件題 (指定不存在的選項標籤)",
        questionType: "text",
        required: false,
        scoringEnabled: false,
        reverseScore: false,
        visibilityRules: "SHOW IF Q1 equals 根本不存在的選項",
        choices: [],
      },
      {
        rowNum: 4,
        orderNum: 3,
        code: "Q3",
        title: "條件題 (依賴不存在的題目)",
        questionType: "text",
        required: false,
        scoringEnabled: false,
        reverseScore: false,
        visibilityRules: "SHOW IF Q99 equals test",
        choices: [],
      },
      {
        rowNum: 5,
        orderNum: 4,
        code: "Q4",
        title: "條件題 (語法錯誤)",
        questionType: "text",
        required: false,
        scoringEnabled: false,
        reverseScore: false,
        visibilityRules: "INVALID SYNTAX ???",
        choices: [],
      },
    ];

    const validation = validateQuestionsStructure(invalidQuestions);
    expect(validation.isValid).toBe(false);
    expect(validation.errors.length).toBeGreaterThanOrEqual(4);

    // 驗證錯誤訊息精確度
    expect(validation.errors.some((e) => e.includes("第 2 列 [Q1]") && e.includes("重複的選項標籤"))).toBe(true);
    expect(validation.errors.some((e) => e.includes("第 3 列 [Q2]") && e.includes("根本不存在的選項"))).toBe(true);
    expect(validation.errors.some((e) => e.includes("第 4 列 [Q3]") && e.includes("Q99"))).toBe(true);
    expect(validation.errors.some((e) => e.includes("第 5 列 [Q4]") && e.includes("語法錯誤"))).toBe(true);
  });
});
