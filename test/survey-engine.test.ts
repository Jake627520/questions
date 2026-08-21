import { describe, it, expect } from "vitest";
import {
  evaluateQuestionAnswer,
  evaluateSurveySubmission,
  calculateQuestionMaxScore,
} from "../src/lib/survey-engine";
import { QuestionInput } from "../src/lib/types";

describe("問卷核心計分與校驗引擎 (Survey Engine Unit Tests)", () => {
  // Test Case 1: 一般單選計分
  it("Case 1: 正常回答一般單選題應正確取得該選項分數", () => {
    const q: QuestionInput = {
      orderNum: 1,
      code: "Q1",
      title: "滿意度",
      questionType: "single_choice",
      required: true,
      scoringEnabled: true,
      reverseScore: false,
      choices: [
        { orderNum: 1, label: "不滿意", value: "dissatisfied", scoreEnabled: true, score: 1, isOther: false, requiresText: false, isNoneOfAbove: false },
        { orderNum: 2, label: "滿意", value: "satisfied", scoreEnabled: true, score: 3, isOther: false, requiresText: false, isNoneOfAbove: false },
      ],
    };

    const res = evaluateQuestionAnswer(q, { questionCode: "Q1", rawValue: "satisfied" });
    expect(res.isValid).toBe(true);
    expect(res.score).toBe(3);
    expect(res.maxPossibleScore).toBe(3);
  });

  // Test Case 2: 特殊分數 (例如選項 4 得到 10 分)
  it("Case 2: 特殊非線性分數（如選項4給予10分）應正確給分", () => {
    const q: QuestionInput = {
      orderNum: 8,
      code: "Q8",
      title: "專業熟練度",
      questionType: "single_choice",
      required: true,
      scoringEnabled: true,
      reverseScore: false,
      choices: [
        { orderNum: 1, label: "初級", value: "lvl_1", scoreEnabled: true, score: 1, isOther: false, requiresText: false, isNoneOfAbove: false },
        { orderNum: 2, label: "中級", value: "lvl_2", scoreEnabled: true, score: 2, isOther: false, requiresText: false, isNoneOfAbove: false },
        { orderNum: 3, label: "專家", value: "lvl_expert", scoreEnabled: true, score: 10, isOther: false, requiresText: false, isNoneOfAbove: false },
      ],
    };

    const res = evaluateQuestionAnswer(q, { questionCode: "Q8", rawValue: "lvl_expert" });
    expect(res.isValid).toBe(true);
    expect(res.score).toBe(10);
    expect(res.maxPossibleScore).toBe(10);
  });

  // Test Case 3: 不計分題與不計分選項 (score 必須為 null，不可為 0)
  it("Case 3: 不計分題目或不計分選項，得分必須為 null，不能為 0", () => {
    const qUnscored: QuestionInput = {
      orderNum: 2,
      code: "Q2",
      title: "常用水時段",
      questionType: "single_choice",
      required: false,
      scoringEnabled: false,
      reverseScore: false,
      choices: [
        { orderNum: 1, label: "早上", value: "morning", scoreEnabled: false, score: null, isOther: false, requiresText: false, isNoneOfAbove: false },
      ],
    };

    const resUnscored = evaluateQuestionAnswer(qUnscored, { questionCode: "Q2", rawValue: "morning" });
    expect(resUnscored.isValid).toBe(true);
    expect(resUnscored.score).toBeNull();
    expect(resUnscored.maxPossibleScore).toBeNull();

    // 計分題但選到不計分選項
    const qPartial: QuestionInput = {
      orderNum: 9,
      code: "Q9",
      title: "問題",
      questionType: "single_choice",
      required: true,
      scoringEnabled: true,
      reverseScore: false,
      choices: [
        { orderNum: 1, label: "有遇過", value: "yes", scoreEnabled: true, score: 5, isOther: false, requiresText: false, isNoneOfAbove: false },
        { orderNum: 2, label: "不確定", value: "unsure", scoreEnabled: false, score: null, isOther: false, requiresText: false, isNoneOfAbove: false },
      ],
    };

    const resPartial = evaluateQuestionAnswer(qPartial, { questionCode: "Q9", rawValue: "unsure" });
    expect(resPartial.isValid).toBe(true);
    expect(resPartial.score).toBeNull();
    expect(resPartial.score).not.toBe(0);
  });

  // Test Case 4: 0 分支援 (score = 0 必須為 0，不可為 null)
  it("Case 4: 選項得分為 0 分時，必須正確計算為 0，不能變成 null", () => {
    const q: QuestionInput = {
      orderNum: 9,
      code: "Q9",
      title: "故障次數",
      questionType: "single_choice",
      required: true,
      scoringEnabled: true,
      reverseScore: false,
      choices: [
        { orderNum: 1, label: "0次", value: "zero", scoreEnabled: true, score: 0, isOther: false, requiresText: false, isNoneOfAbove: false },
        { orderNum: 2, label: "多次", value: "many", scoreEnabled: true, score: 5, isOther: false, requires_text: false, isNoneOfAbove: false } as any,
      ],
    };

    const res = evaluateQuestionAnswer(q, { questionCode: "Q9", rawValue: "zero" });
    expect(res.isValid).toBe(true);
    expect(res.score).toBe(0);
    expect(res.score).not.toBeNull();
  });

  // Test Case 5: 「其他」選項未填寫文字 (requires_text=true) 必須驗證失敗
  it("Case 5: 「其他」選項若 requires_text=true，未填寫說明時必須檢核失敗", () => {
    const q: QuestionInput = {
      orderNum: 6,
      code: "Q6",
      title: "得知管道",
      questionType: "single_choice",
      required: true,
      scoringEnabled: false,
      reverseScore: false,
      choices: [
        { orderNum: 1, label: "其他", value: "other", scoreEnabled: false, score: null, isOther: true, requiresText: true, isNoneOfAbove: false },
      ],
    };

    const resMissing = evaluateQuestionAnswer(q, { questionCode: "Q6", rawValue: "other", otherText: "" });
    expect(resMissing.isValid).toBe(false);
    expect(resMissing.error).toContain("必須填寫補充說明文字");

    const resWhitespace = evaluateQuestionAnswer(q, { questionCode: "Q6", rawValue: "other", otherText: "   " });
    expect(resWhitespace.isValid).toBe(false);
  });

  // Test Case 6: 「其他」選項有填寫文字 (requires_text=true) 必須驗證成功
  it("Case 6: 「其他」選項若 requires_text=true，填寫文字後應驗證通過", () => {
    const q: QuestionInput = {
      orderNum: 6,
      code: "Q6",
      title: "得知管道",
      questionType: "single_choice",
      required: true,
      scoringEnabled: false,
      reverseScore: false,
      choices: [
        { orderNum: 1, label: "其他", value: "other", scoreEnabled: false, score: null, isOther: true, requiresText: true, isNoneOfAbove: false },
      ],
    };

    const resValid = evaluateQuestionAnswer(q, {
      questionCode: "Q6",
      rawValue: "other",
      otherText: "朋友在 Facebook 推薦",
    });
    expect(resValid.isValid).toBe(true);
  });

  // Test Case 7: 「以上皆非」不能與其他選項同時選擇
  it("Case 7: 複選題選取「以上皆非」同時選取其他項目時，必須拋出互斥衝突錯誤", () => {
    const q: QuestionInput = {
      orderNum: 7,
      code: "Q7",
      title: "工具整合",
      questionType: "multiple_choice",
      required: true,
      scoringEnabled: true,
      reverseScore: false,
      choices: [
        { orderNum: 1, label: "Slack", value: "slack", scoreEnabled: true, score: 2, isOther: false, requiresText: false, isNoneOfAbove: false },
        { orderNum: 2, label: "以上皆非", value: "none", scoreEnabled: true, score: 0, isOther: false, requiresText: false, isNoneOfAbove: true },
      ],
    };

    // 同時選取 slack 與 none -> 失敗
    const resConflict = evaluateQuestionAnswer(q, {
      questionCode: "Q7",
      rawValue: ["slack", "none"],
    });
    expect(resConflict.isValid).toBe(false);
    expect(resConflict.error).toContain("不能與其他選項同時選擇");

    // 單獨選取 none -> 成功
    const resOnlyNone = evaluateQuestionAnswer(q, {
      questionCode: "Q7",
      rawValue: ["none"],
    });
    expect(resOnlyNone.isValid).toBe(true);
    expect(resOnlyNone.score).toBe(0);
  });

  // Test Case 8: 問答題 (text) 與 資訊題 (info) 處理
  it("Case 8: 問答題與資訊題不計分且能正確處理填答內容", () => {
    const qText: QuestionInput = {
      orderNum: 3,
      code: "Q3",
      title: "改進建議",
      questionType: "text",
      required: false,
      scoringEnabled: false,
      reverseScore: false,
      choices: [],
    };
    const resText = evaluateQuestionAnswer(qText, { questionCode: "Q3", rawValue: "希望介面更簡潔" });
    expect(resText.isValid).toBe(true);
    expect(resText.score).toBeNull();

    const qInfo: QuestionInput = {
      orderNum: 0,
      code: "Q0",
      title: "填答前說明",
      questionType: "info",
      required: false,
      scoringEnabled: false,
      reverseScore: false,
      choices: [],
    };
    const resInfo = evaluateQuestionAnswer(qInfo, undefined);
    expect(resInfo.isValid).toBe(true);
    expect(resInfo.score).toBeNull();
  });

  // Test Case 9: 反向計分邏輯
  it("Case 9: 反向計分題應正確依據選項分數區間反轉計算", () => {
    const qReverse: QuestionInput = {
      orderNum: 10,
      code: "Q10",
      title: "系統易困惑度 (反向題 1~5分)",
      questionType: "single_choice",
      required: true,
      scoringEnabled: true,
      reverseScore: true,
      choices: [
        { orderNum: 1, label: "非常不同意 (1分)", value: "sd", scoreEnabled: true, score: 1, isOther: false, requiresText: false, isNoneOfAbove: false },
        { orderNum: 2, label: "不同意 (2分)", value: "d", scoreEnabled: true, score: 2, isOther: false, requiresText: false, isNoneOfAbove: false },
        { orderNum: 3, label: "普通 (3分)", value: "n", scoreEnabled: true, score: 3, isOther: false, requiresText: false, isNoneOfAbove: false },
        { orderNum: 4, label: "同意 (4分)", value: "a", scoreEnabled: true, score: 4, isOther: false, requiresText: false, isNoneOfAbove: false },
        { orderNum: 5, label: "非常同意 (5分)", value: "sa", scoreEnabled: true, score: 5, isOther: false, requiresText: false, isNoneOfAbove: false },
      ],
    };

    // 勾選非常同意 (原始5分) -> 反轉計算為 1 分 (5+1-5 = 1)
    const resSA = evaluateQuestionAnswer(qReverse, { questionCode: "Q10", rawValue: "sa" });
    expect(resSA.score).toBe(1);

    // 勾選非常不同意 (原始1分) -> 反轉計算為 5 分 (5+1-1 = 5)
    const resSD = evaluateQuestionAnswer(qReverse, { questionCode: "Q10", rawValue: "sd" });
    expect(resSD.score).toBe(5);

    // 勾選同意 (原始4分) -> 反轉計算為 2 分 (5+1-4 = 2)
    const resA = evaluateQuestionAnswer(qReverse, { questionCode: "Q10", rawValue: "a" });
    expect(resA.score).toBe(2);
  });

  // Test Case 10: 整份問卷自動計算 total_score, max_score, percentage
  it("Case 10: 整份問卷自動計算 total_score, max_score 與 percentage", () => {
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
          { orderNum: 1, label: "A", value: "a", scoreEnabled: true, score: 4, isOther: false, requiresText: false, isNoneOfAbove: false },
          { orderNum: 2, label: "B", value: "b", scoreEnabled: true, score: 10, isOther: false, requiresText: false, isNoneOfAbove: false },
        ],
      },
      {
        orderNum: 2,
        code: "Q2",
        title: "複選題",
        questionType: "multiple_choice",
        required: true,
        scoringEnabled: true,
        reverseScore: false,
        choices: [
          { orderNum: 1, label: "C1", value: "c1", scoreEnabled: true, score: 2, isOther: false, requiresText: false, isNoneOfAbove: false },
          { orderNum: 2, label: "C2", value: "c2", scoreEnabled: true, score: 3, isOther: false, requiresText: false, isNoneOfAbove: false },
        ],
      },
      {
        orderNum: 3,
        code: "Q3",
        title: "不計分題",
        questionType: "single_choice",
        required: false,
        scoringEnabled: false,
        reverseScore: false,
        choices: [
          { orderNum: 1, label: "D", value: "d", scoreEnabled: false, score: null, isOther: false, requiresText: false, isNoneOfAbove: false },
        ],
      },
    ];

    // Q1選 a (4分，滿分10分)
    // Q2選 c1+c2 (2+3 = 5分，滿分5分)
    // Q3選 d (不計分)
    // total_score = 4 + 5 = 9
    // max_score = 10 + 5 = 15
    // percentage = 9 / 15 * 100 = 60.0%
    const submission = [
      { questionCode: "Q1", rawValue: "a" },
      { questionCode: "Q2", rawValue: ["c1", "c2"] },
      { questionCode: "Q3", rawValue: "d" },
    ];

    const result = evaluateSurveySubmission(questions, submission);
    expect(result.isValid).toBe(true);
    expect(result.totalScore).toBe(9);
    expect(result.maxScore).toBe(15);
    expect(result.percentage).toBe(60);
  });
});
