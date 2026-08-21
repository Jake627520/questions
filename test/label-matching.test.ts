import { describe, it, expect } from "vitest";
import { isQuestionVisible } from "../src/lib/survey-engine";
import { QuestionInput } from "../src/lib/types";

describe("M4 選項標籤 (Label) 智慧比對測試 (Choice Label Matching Tests)", () => {
  const questions: QuestionInput[] = [
    {
      orderNum: 1,
      code: "Q1",
      title: "滿意度",
      questionType: "single_choice",
      choices: [
        { orderNum: 1, label: "非常不滿意", value: "very_dissatisfied", scoreEnabled: false, score: null, isOther: false, requiresText: false, isNoneOfAbove: false },
        { orderNum: 2, label: "不太滿意", value: "dissatisfied", scoreEnabled: false, score: null, isOther: false, requiresText: false, isNoneOfAbove: false },
        { orderNum: 3, label: "滿意", value: "satisfied", scoreEnabled: false, score: null, isOther: false, requiresText: false, isNoneOfAbove: false },
        { orderNum: 4, label: "非常滿意", value: "very_satisfied", scoreEnabled: false, score: null, isOther: false, requiresText: false, isNoneOfAbove: false },
      ],
    },
    {
      orderNum: 2,
      code: "Q1_FEEDBACK_LABEL",
      title: "不滿意原因 (使用中文 Label 比對: SHOW IF Q1 in [非常不滿意, 不太滿意])",
      questionType: "text",
      visibilityRules: "SHOW IF Q1 in [非常不滿意, 不太滿意]",
      choices: [],
    },
    {
      orderNum: 3,
      code: "Q1_FEEDBACK_EQUALS_LABEL",
      title: "滿意原因 (使用 Label equals 比對: SHOW IF Q1 equals 非常滿意)",
      questionType: "text",
      visibilityRules: "SHOW IF Q1 equals 非常滿意",
      choices: [],
    },
    {
      orderNum: 4,
      code: "Q_TOOLS",
      title: "整合工具 (複選)",
      questionType: "multiple_choice",
      choices: [
        { orderNum: 1, label: "Slack 官方整合", value: "slack", scoreEnabled: false, score: null, isOther: false, requiresText: false, isNoneOfAbove: false },
        { orderNum: 2, label: "Discord 機器人", value: "discord", scoreEnabled: false, score: null, isOther: false, requiresText: false, isNoneOfAbove: false },
      ],
    },
    {
      orderNum: 5,
      code: "Q_SLACK_DETAIL",
      title: "Slack 回饋 (使用 Label contains 比對: SHOW IF Q_TOOLS contains Slack)",
      questionType: "text",
      visibilityRules: "SHOW IF Q_TOOLS contains Slack",
      choices: [],
    },
  ];

  const questionsMap = new Map<string, QuestionInput>();
  questions.forEach((q) => questionsMap.set(q.code, q));

  it("應能使用中文 Label 比對 'in [非常不滿意, 不太滿意]' 正確觸發題目顯示", () => {
    const qFeedback = questions.find((q) => q.code === "Q1_FEEDBACK_LABEL")!;

    // 1. 選不太滿意 (value: dissatisfied, label: 不太滿意) -> 應顯示
    const ansMap1 = new Map([["Q1", { questionCode: "Q1", rawValue: "dissatisfied" }]]);
    expect(isQuestionVisible(qFeedback, ansMap1, questionsMap)).toBe(true);

    // 2. 選非常不滿意 (value: very_dissatisfied, label: 非常不滿意) -> 應顯示
    const ansMap2 = new Map([["Q1", { questionCode: "Q1", rawValue: "very_dissatisfied" }]]);
    expect(isQuestionVisible(qFeedback, ansMap2, questionsMap)).toBe(true);

    // 3. 選滿意 (value: satisfied, label: 滿意) -> 應隱藏
    const ansMap3 = new Map([["Q1", { questionCode: "Q1", rawValue: "satisfied" }]]);
    expect(isQuestionVisible(qFeedback, ansMap3, questionsMap)).toBe(false);
  });

  it("應能使用中文 Label 比對 'equals 非常滿意' 正確觸發題目顯示", () => {
    const qEquals = questions.find((q) => q.code === "Q1_FEEDBACK_EQUALS_LABEL")!;

    // 1. 選非常滿意 -> 應顯示
    const ansMap1 = new Map([["Q1", { questionCode: "Q1", rawValue: "very_satisfied" }]]);
    expect(isQuestionVisible(qEquals, ansMap1, questionsMap)).toBe(true);

    // 2. 選滿意 -> 應隱藏
    const ansMap2 = new Map([["Q1", { questionCode: "Q1", rawValue: "satisfied" }]]);
    expect(isQuestionVisible(qEquals, ansMap2, questionsMap)).toBe(false);
  });

  it("應能使用複選 Label 'contains Slack' 比對選中項目的標籤字串", () => {
    const qSlack = questions.find((q) => q.code === "Q_SLACK_DETAIL")!;

    // 1. 複選勾選了 slack (標籤為 'Slack 官方整合') -> 包含 'Slack' 應顯示
    const ansMap1 = new Map([["Q_TOOLS", { questionCode: "Q_TOOLS", rawValue: ["slack"] }]]);
    expect(isQuestionVisible(qSlack, ansMap1, questionsMap)).toBe(true);

    // 2. 複選僅勾選 discord (標籤為 'Discord 機器人') -> 應隱藏
    const ansMap2 = new Map([["Q_TOOLS", { questionCode: "Q_TOOLS", rawValue: ["discord"] }]]);
    expect(isQuestionVisible(qSlack, ansMap2, questionsMap)).toBe(false);
  });

  it("向後相容：原本直接寫 value (如 'equals very_satisfied') 仍 100% 正常運作", () => {
    const qValueRule: QuestionInput = {
      orderNum: 10,
      code: "Q_VAL_RULE",
      title: "Value 規則",
      questionType: "text",
      visibilityRules: "SHOW IF Q1 equals very_satisfied",
      choices: [],
    };
    const ansMap = new Map([["Q1", { questionCode: "Q1", rawValue: "very_satisfied" }]]);
    expect(isQuestionVisible(qValueRule, ansMap, questionsMap)).toBe(true);
  });
});
