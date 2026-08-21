import { describe, it, expect } from "vitest";
import {
  evaluateQuestionAnswer,
  evaluateSurveySubmission,
  isQuestionVisible,
} from "../src/lib/survey-engine";
import { QuestionInput } from "../src/lib/types";

describe("M2 問卷邏輯引擎測試 (M2 Logic Engine & Rules)", () => {
  // Test Case 1: 單選條件跳題 (equals)
  it("M2 Case 1: 單選條件跳題 (Q1選不滿意時顯示追問題 Q1_FEEDBACK；選滿意時隱藏)", () => {
    const qFeedback: QuestionInput = {
      orderNum: 2,
      code: "Q1_FEEDBACK",
      title: "不滿意原因",
      questionType: "text",
      required: true,
      scoringEnabled: false,
      reverseScore: false,
      visibilityRules: {
        action: "SHOW",
        logic: "OR",
        conditions: [
          { dependsOnQuestionCode: "Q1", operator: "equals", value: "very_dissatisfied" },
          { dependsOnQuestionCode: "Q1", operator: "equals", value: "dissatisfied" },
        ],
      },
      choices: [],
    };

    // 情況 A：Q1 勾選 "dissatisfied" -> 應顯示
    const answersDissatisfied = new Map([
      ["Q1", { questionCode: "Q1", rawValue: "dissatisfied" }],
    ]);
    expect(isQuestionVisible(qFeedback, answersDissatisfied)).toBe(true);

    // 情況 B：Q1 勾選 "satisfied" -> 應隱藏
    const answersSatisfied = new Map([
      ["Q1", { questionCode: "Q1", rawValue: "satisfied" }],
    ]);
    expect(isQuestionVisible(qFeedback, answersSatisfied)).toBe(false);
  });

  // Test Case 2: 複選條件跳題 (contains)
  it("M2 Case 2: 複選條件跳題 (複選包含特定選項時顯示關聯題目)", () => {
    const qSub: QuestionInput = {
      orderNum: 3,
      code: "Q_SLACK_CFG",
      title: "Slack Webhook 設定",
      questionType: "text",
      required: true,
      scoringEnabled: false,
      reverseScore: false,
      visibilityRules: {
        action: "SHOW",
        logic: "AND",
        conditions: [
          { dependsOnQuestionCode: "Q_TOOLS", operator: "contains", value: "slack" },
        ],
      },
      choices: [],
    };

    const ansWithSlack = new Map([
      ["Q_TOOLS", { questionCode: "Q_TOOLS", rawValue: ["discord", "slack"] }],
    ]);
    expect(isQuestionVisible(qSub, ansWithSlack)).toBe(true);

    const ansWithoutSlack = new Map([
      ["Q_TOOLS", { questionCode: "Q_TOOLS", rawValue: ["discord"] }],
    ]);
    expect(isQuestionVisible(qSub, ansWithoutSlack)).toBe(false);
  });

  // Test Case 3: 數值條件跳題 (lt / gt)
  it("M2 Case 3: 數值條件跳題 (使用次數 < 2 時顯示關心題目)", () => {
    const qCare: QuestionInput = {
      orderNum: 4,
      code: "Q_CARE",
      title: "是否遇到使用困難？",
      questionType: "single_choice",
      required: true,
      scoringEnabled: false,
      reverseScore: false,
      visibilityRules: {
        action: "SHOW",
        logic: "AND",
        conditions: [
          { dependsOnQuestionCode: "Q_USAGE", operator: "lt", value: 2 },
        ],
      },
      choices: [],
    };

    const ansLowUsage = new Map([
      ["Q_USAGE", { questionCode: "Q_USAGE", rawValue: 1 }],
    ]);
    expect(isQuestionVisible(qCare, ansLowUsage)).toBe(true);

    const ansHighUsage = new Map([
      ["Q_USAGE", { questionCode: "Q_USAGE", rawValue: 5 }],
    ]);
    expect(isQuestionVisible(qCare, ansHighUsage)).toBe(false);
  });

  // Test Case 4: 隱藏題目自動豁免 required 必填檢核
  it("M2 Case 4: 被條件隱藏的題目（即使 required=true 且未作答）不應阻擋問卷提交", () => {
    const questions: QuestionInput[] = [
      {
        orderNum: 1,
        code: "Q1",
        title: "滿意度",
        questionType: "single_choice",
        required: true,
        scoringEnabled: true,
        reverseScore: false,
        choices: [
          { orderNum: 1, label: "滿意", value: "satisfied", scoreEnabled: true, score: 5, isOther: false, requiresText: false, isNoneOfAbove: false },
          { orderNum: 2, label: "不滿意", value: "dissatisfied", scoreEnabled: true, score: 1, isOther: false, requiresText: false, isNoneOfAbove: false },
        ],
      },
      {
        orderNum: 2,
        code: "Q1_FEEDBACK",
        title: "請說明不滿意原因",
        questionType: "text",
        required: true, // 必填，但若被隱藏則不應阻擋
        scoringEnabled: false,
        reverseScore: false,
        visibilityRules: {
          action: "SHOW",
          logic: "AND",
          conditions: [
            { dependsOnQuestionCode: "Q1", operator: "equals", value: "dissatisfied" },
          ],
        },
        choices: [],
      },
    ];

    // Q1 選擇 "satisfied"，Q1_FEEDBACK 未填寫
    const submission = [{ questionCode: "Q1", rawValue: "satisfied" }];

    const result = evaluateSurveySubmission(questions, submission);
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);

    const feedbackResult = result.questionResults.find((r) => r.questionCode === "Q1_FEEDBACK");
    expect(feedbackResult?.isVisible).toBe(false);
    expect(feedbackResult?.isValid).toBe(true);
  });

  // Test Case 5: 隱藏題目的分數不計入 total_score 與 max_score
  it("M2 Case 5: 被隱藏的計分題目，其分數與滿分不應計入問卷總分", () => {
    const questions: QuestionInput[] = [
      {
        orderNum: 1,
        code: "Q1",
        title: "主問題 (滿分10分)",
        questionType: "single_choice",
        required: true,
        scoringEnabled: true,
        reverseScore: false,
        choices: [
          { orderNum: 1, label: "A", value: "a", scoreEnabled: true, score: 10, isOther: false, requiresText: false, isNoneOfAbove: false },
        ],
      },
      {
        orderNum: 2,
        code: "Q_BONUS",
        title: "加分題 (滿分5分，僅在 Q1=b 時顯示)",
        questionType: "single_choice",
        required: false,
        scoringEnabled: true,
        reverseScore: false,
        visibilityRules: {
          action: "SHOW",
          logic: "AND",
          conditions: [
            { dependsOnQuestionCode: "Q1", operator: "equals", value: "b" },
          ],
        },
        choices: [
          { orderNum: 1, label: "Bonus", value: "bonus", scoreEnabled: true, score: 5, isOther: false, requiresText: false, isNoneOfAbove: false },
        ],
      },
    ];

    // Q1 勾選 "a" -> Q_BONUS 隱藏
    const result = evaluateSurveySubmission(questions, [{ questionCode: "Q1", rawValue: "a" }]);
    expect(result.totalScore).toBe(10);
    expect(result.maxScore).toBe(10); // 不包含 Q_BONUS 的 5 分
    expect(result.percentage).toBe(100);
  });

  // Test Case 6: 複選題 min_selections 檢核
  it("M2 Case 6: 複選題選取數量小於 min_selections 時應阻擋提交", () => {
    const qMulti: QuestionInput = {
      orderNum: 1,
      code: "Q_MULTI",
      title: "至少選2項",
      questionType: "multiple_choice",
      required: true,
      scoringEnabled: true,
      reverseScore: false,
      minSelections: 2,
      maxSelections: 3,
      choices: [
        { orderNum: 1, label: "A", value: "a", scoreEnabled: true, score: 1, isOther: false, requiresText: false, isNoneOfAbove: false },
        { orderNum: 2, label: "B", value: "b", scoreEnabled: true, score: 1, isOther: false, requiresText: false, isNoneOfAbove: false },
        { orderNum: 3, label: "C", value: "c", scoreEnabled: true, score: 1, isOther: false, requiresText: false, isNoneOfAbove: false },
      ],
    };

    // 只選 1 項 (少於 2) -> 失敗
    const resFew = evaluateQuestionAnswer(qMulti, { questionCode: "Q_MULTI", rawValue: ["a"] });
    expect(resFew.isValid).toBe(false);
    expect(resFew.error).toContain("至少需選取 2 項");

    // 選 2 項 -> 成功
    const resOk = evaluateQuestionAnswer(qMulti, { questionCode: "Q_MULTI", rawValue: ["a", "b"] });
    expect(resOk.isValid).toBe(true);
  });

  // Test Case 7: 複選題 max_selections 檢核
  it("M2 Case 7: 複選題選取數量大於 max_selections 時應阻擋提交", () => {
    const qMulti: QuestionInput = {
      orderNum: 1,
      code: "Q_MULTI",
      title: "最多選2項",
      questionType: "multiple_choice",
      required: true,
      scoringEnabled: true,
      reverseScore: false,
      minSelections: 1,
      maxSelections: 2,
      choices: [
        { orderNum: 1, label: "A", value: "a", scoreEnabled: true, score: 1, isOther: false, requiresText: false, isNoneOfAbove: false },
        { orderNum: 2, label: "B", value: "b", scoreEnabled: true, score: 1, isOther: false, requiresText: false, isNoneOfAbove: false },
        { orderNum: 3, label: "C", value: "c", scoreEnabled: true, score: 1, isOther: false, requiresText: false, isNoneOfAbove: false },
      ],
    };

    // 選 3 項 (超過 2) -> 失敗
    const resMany = evaluateQuestionAnswer(qMulti, { questionCode: "Q_MULTI", rawValue: ["a", "b", "c"] });
    expect(resMany.isValid).toBe(false);
    expect(resMany.error).toContain("最多只可選取 2 項");
  });

  // Test Case 8: 數值題 min / max 範圍限制
  it("M2 Case 8: 數值題超出 min_value 或 max_value 時應阻擋提交", () => {
    const qNum: QuestionInput = {
      orderNum: 1,
      code: "Q_NUM",
      title: "請輸入分數 (0~100)",
      questionType: "number",
      required: true,
      scoringEnabled: false,
      reverseScore: false,
      minValue: 0,
      maxValue: 100,
      choices: [],
    };

    const resBelow = evaluateQuestionAnswer(qNum, { questionCode: "Q_NUM", rawValue: -5 });
    expect(resBelow.isValid).toBe(false);
    expect(resBelow.error).toContain("不得小於 0");

    const resAbove = evaluateQuestionAnswer(qNum, { questionCode: "Q_NUM", rawValue: 105 });
    expect(resAbove.isValid).toBe(false);
    expect(resAbove.error).toContain("不得大於 100");

    const resValid = evaluateQuestionAnswer(qNum, { questionCode: "Q_NUM", rawValue: 85 });
    expect(resValid.isValid).toBe(true);
  });
});
