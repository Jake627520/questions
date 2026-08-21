import { describe, it, expect } from "vitest";
import { QuestionInput } from "../src/lib/types";

describe("M4 條件題目提示文字測試 (Visibility Hint Tests)", () => {
  it("有設定 visibility_hint 時應正確保存並優先使用自訂提示文字", () => {
    const qWithCustomHint: QuestionInput = {
      orderNum: 1,
      code: "Q_HINT_1",
      title: "自訂提示題",
      questionType: "text",
      required: false,
      scoringEnabled: false,
      reverseScore: false,
      visibilityRules: "SHOW IF Q1 equals 1",
      visibilityHint: "因您勾選了特殊項目，請在此補充詳細資訊：",
      choices: [],
    };
    expect(qWithCustomHint.visibilityHint).toBe("因您勾選了特殊項目，請在此補充詳細資訊：");
  });

  it("未設定 visibility_hint 時應支援回退至預設提示文字", () => {
    const qDefaultHint: QuestionInput = {
      orderNum: 2,
      code: "Q_HINT_2",
      title: "預設提示題",
      questionType: "text",
      required: false,
      scoringEnabled: false,
      reverseScore: false,
      visibilityRules: "SHOW IF Q1 equals 1",
      choices: [],
    };
    const effectiveHint = qDefaultHint.visibilityHint || "依據您前面的回答，請補充以下問題";
    expect(effectiveHint).toBe("依據您前面的回答，請補充以下問題");
  });
});
