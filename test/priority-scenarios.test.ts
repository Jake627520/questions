import { describe, it, expect } from "vitest";
import { evaluateSurveySubmission, isQuestionVisible } from "../src/lib/survey-engine";
import { QuestionInput } from "../src/lib/types";
import { parseSurveyExcel } from "../src/lib/excel-parser";
import { generateDemoExcel } from "../scripts/generate-demo-excel";
import { db } from "../src/lib/db";
import { SurveyStatus } from "@prisma/client";
import path from "path";
import fs from "fs";

describe("優先測試情境驗證 (Priority Scenarios 1 ~ 10)", () => {
  const priorityTestExcelPath = path.join(process.cwd(), "test-priority.xlsx");
  let demoQuestions: QuestionInput[] = [];

  it("前置準備：載入 Demo 題庫", async () => {
    await generateDemoExcel(priorityTestExcelPath);
    const fileBuffer = fs.readFileSync(priorityTestExcelPath);
    const { questions } = await parseSurveyExcel(fileBuffer);
    demoQuestions = questions;
    expect(demoQuestions.length).toBe(11);
    if (fs.existsSync(priorityTestExcelPath)) fs.unlinkSync(priorityTestExcelPath);
  });

  // 情境 1: Q1 選「非常滿意 / 滿意」→ Q1_FEEDBACK 應隱藏，且不要求必填、不計分
  it("情境 1: Q1 選滿意時，Q1_FEEDBACK 應隱藏、豁免必填、不計分", () => {
    const answers = [
      { questionCode: "Q1", rawValue: "very_satisfied" },
      { questionCode: "Q5", rawValue: ["realtime_collab"] },
      { questionCode: "Q6", rawValue: "friend" },
      { questionCode: "Q7", rawValue: ["slack"] },
      { questionCode: "Q8", rawValue: "lvl_1" },
      { questionCode: "Q9", rawValue: "zero_issues" },
      { questionCode: "Q10", rawValue: "strongly_agree" },
    ];

    const ansMap = new Map(answers.map((a) => [a.questionCode, a]));
    const qFeedback = demoQuestions.find((q) => q.code === "Q1_FEEDBACK")!;
    expect(isQuestionVisible(qFeedback, ansMap)).toBe(false);

    const result = evaluateSurveySubmission(demoQuestions, answers);
    expect(result.isValid).toBe(true);

    const fbResult = result.questionResults.find((r) => r.questionCode === "Q1_FEEDBACK");
    expect(fbResult?.isVisible).toBe(false);
    expect(fbResult?.score).toBeNull();
    expect(fbResult?.maxPossibleScore).toBeNull();
  });

  // 情境 2: Q1 選「不滿意 / 非常不滿意」→ Q1_FEEDBACK 應立即出現，並可填寫
  it("情境 2: Q1 選不滿意時，Q1_FEEDBACK 應為可見狀態", () => {
    const ansMapDissatisfied = new Map([
      ["Q1", { questionCode: "Q1", rawValue: "dissatisfied" }],
    ]);
    const qFeedback = demoQuestions.find((q) => q.code === "Q1_FEEDBACK")!;
    expect(isQuestionVisible(qFeedback, ansMapDissatisfied)).toBe(true);

    const ansMapVeryDissatisfied = new Map([
      ["Q1", { questionCode: "Q1", rawValue: "very_dissatisfied" }],
    ]);
    expect(isQuestionVisible(qFeedback, ansMapVeryDissatisfied)).toBe(true);
  });

  // 情境 3: 提交時若 Q1 為不滿意卻沒填 Q1_FEEDBACK → 應被阻擋
  it("情境 3: Q1 選不滿意但未填 Q1_FEEDBACK 時應被阻擋", () => {
    const answers = [
      { questionCode: "Q1", rawValue: "dissatisfied" },
      // Q1_FEEDBACK 未填寫
      { questionCode: "Q5", rawValue: ["realtime_collab"] },
      { questionCode: "Q6", rawValue: "friend" },
      { questionCode: "Q7", rawValue: ["slack"] },
      { questionCode: "Q8", rawValue: "lvl_1" },
      { questionCode: "Q9", rawValue: "zero_issues" },
      { questionCode: "Q10", rawValue: "strongly_agree" },
    ];

    const result = evaluateSurveySubmission(demoQuestions, answers);
    expect(result.isValid).toBe(false);
    const fbError = result.errors.find((e) => e.questionCode === "Q1_FEEDBACK");
    expect(fbError).toBeDefined();
    expect(fbError?.message).toContain("為必填項目");
  });

  // 情境 4: 提交時若 Q1 為滿意卻帶了 Q1_FEEDBACK 答案 → 系統應忽略（不應影響總分與滿分）
  it("情境 4: Q1 為滿意若前端殘留 Q1_FEEDBACK 答案，系統應正確將其視為隱藏且不影響計分", () => {
    const answers = [
      { questionCode: "Q1", rawValue: "very_satisfied" },
      { questionCode: "Q1_FEEDBACK", rawValue: "殘留舊文字" },
      { questionCode: "Q5", rawValue: ["realtime_collab"] }, // 2分
      { questionCode: "Q6", rawValue: "friend" },
      { questionCode: "Q7", rawValue: ["slack"] }, // 2分
      { questionCode: "Q8", rawValue: "lvl_expert" }, // 10分
      { questionCode: "Q9", rawValue: "zero_issues" }, // 0分
      { questionCode: "Q10", rawValue: "strongly_agree" }, // 反向計分: 5分 -> 1分
    ];
    // Q1(4) + Q5(2) + Q7(2) + Q8(10) + Q9(0) + Q10(1) = 19 分

    const result = evaluateSurveySubmission(demoQuestions, answers);
    expect(result.isValid).toBe(true);

    const fbResult = result.questionResults.find((r) => r.questionCode === "Q1_FEEDBACK");
    expect(fbResult?.isVisible).toBe(false);
    expect(fbResult?.score).toBeNull();
    expect(result.totalScore).toBe(19);
  });

  // 情境 5: Q5 選超過 max_selections 數量 → 前後端都要擋
  it("情境 5: Q5 複選超過 max_selections (選了 3 項，上限 2 項) 應被阻擋", () => {
    const answers = [
      { questionCode: "Q1", rawValue: "very_satisfied" },
      { questionCode: "Q5", rawValue: ["realtime_collab", "automation", "advanced_stats"] },
      { questionCode: "Q6", rawValue: "friend" },
      { questionCode: "Q7", rawValue: ["slack"] },
      { questionCode: "Q8", rawValue: "lvl_1" },
      { questionCode: "Q9", rawValue: "zero_issues" },
      { questionCode: "Q10", rawValue: "strongly_agree" },
    ];

    const result = evaluateSurveySubmission(demoQuestions, answers);
    expect(result.isValid).toBe(false);
    const q5Error = result.errors.find((e) => e.questionCode === "Q5");
    expect(q5Error?.message).toContain("最多只可選取 2 項");
  });

  // 情境 6: Q5 選少於 min_selections (若為 1 項但選了 0 項) → 應擋
  it("情境 6: Q5 複選少於 min_selections (選了 0 項，下限 1 項) 應被阻擋", () => {
    const answers = [
      { questionCode: "Q1", rawValue: "very_satisfied" },
      { questionCode: "Q5", rawValue: [] },
      { questionCode: "Q6", rawValue: "friend" },
      { questionCode: "Q7", rawValue: ["slack"] },
      { questionCode: "Q8", rawValue: "lvl_1" },
      { questionCode: "Q9", rawValue: "zero_issues" },
      { questionCode: "Q10", rawValue: "strongly_agree" },
    ];

    const result = evaluateSurveySubmission(demoQuestions, answers);
    expect(result.isValid).toBe(false);
    const q5Error = result.errors.find((e) => e.questionCode === "Q5");
    expect(q5Error).toBeDefined();
  });

  // 情境 7: 同時勾選「以上皆非」+ 其他選項 → 仍應擋 (M1 互斥規則保持)
  it("情境 7: Q7 複選同時勾選「以上皆非」與其他選項應被阻擋", () => {
    const answers = [
      { questionCode: "Q1", rawValue: "very_satisfied" },
      { questionCode: "Q5", rawValue: ["realtime_collab"] },
      { questionCode: "Q6", rawValue: "friend" },
      { questionCode: "Q7", rawValue: ["slack", "none_of_above"] },
      { questionCode: "Q8", rawValue: "lvl_1" },
      { questionCode: "Q9", rawValue: "zero_issues" },
      { questionCode: "Q10", rawValue: "strongly_agree" },
    ];

    const result = evaluateSurveySubmission(demoQuestions, answers);
    expect(result.isValid).toBe(false);
    const q7Error = result.errors.find((e) => e.questionCode === "Q7");
    expect(q7Error?.message).toContain("不能與其他選項同時選擇");
  });

  // 情境 8: Q4 輸入超過 max_value (100) 或低於 min_value (0) → 應擋
  it("情境 8: Q4 數值題超出 0~100 範圍時應被阻擋", () => {
    const ansAbove = [
      { questionCode: "Q1", rawValue: "very_satisfied" },
      { questionCode: "Q4", rawValue: 150 },
      { questionCode: "Q5", rawValue: ["realtime_collab"] },
      { questionCode: "Q6", rawValue: "friend" },
      { questionCode: "Q7", rawValue: ["slack"] },
      { questionCode: "Q8", rawValue: "lvl_1" },
      { questionCode: "Q9", rawValue: "zero_issues" },
      { questionCode: "Q10", rawValue: "strongly_agree" },
    ];
    const resAbove = evaluateSurveySubmission(demoQuestions, ansAbove);
    expect(resAbove.isValid).toBe(false);
    expect(resAbove.errors.find((e) => e.questionCode === "Q4")?.message).toContain("數值不得大於 100");

    const ansBelow = [
      { questionCode: "Q1", rawValue: "very_satisfied" },
      { questionCode: "Q4", rawValue: -10 },
      { questionCode: "Q5", rawValue: ["realtime_collab"] },
      { questionCode: "Q6", rawValue: "friend" },
      { questionCode: "Q7", rawValue: ["slack"] },
      { questionCode: "Q8", rawValue: "lvl_1" },
      { questionCode: "Q9", rawValue: "zero_issues" },
      { questionCode: "Q10", rawValue: "strongly_agree" },
    ];
    const resBelow = evaluateSurveySubmission(demoQuestions, ansBelow);
    expect(resBelow.isValid).toBe(false);
    expect(resBelow.errors.find((e) => e.questionCode === "Q4")?.message).toContain("數值不得小於 0");
  });

  // 情境 9: 版本控制：確認舊的 response 仍保留原本的 version，新版本問卷不會影響歷史資料
  it("情境 9: 問卷版本建立與歷史 response 隔離保留", async () => {
    const surveyV1 = await db.survey.create({
      data: {
        organizationId: "default-org-id",
        title: "歷史版本測試問卷",
        version: 1,
        status: SurveyStatus.PUBLISHED,
        questions: {
          create: [{ orderNum: 1, code: "Q1", title: "題", questionType: "text" }],
        },
      },
    });

    const responseV1 = await db.response.create({
      data: {
        surveyId: surveyV1.id,
        version: 1,
        totalScore: null,
      },
    });

    const surveyV2 = await db.survey.create({
      data: {
        organizationId: surveyV1.organizationId,
        title: "歷史版本測試問卷 (v2)",
        parentSurveyId: surveyV1.id,
        version: 2,
        status: SurveyStatus.PUBLISHED,
        questions: {
          create: [{ orderNum: 1, code: "Q1", title: "題(改)", questionType: "text" }],
        },
      },
    });

    const savedResp = await db.response.findUnique({ where: { id: responseV1.id } });
    expect(savedResp?.version).toBe(1);
    expect(savedResp?.surveyId).toBe(surveyV1.id);
    expect(surveyV2.version).toBe(2);

    await db.survey.deleteMany({ where: { id: { in: [surveyV1.id, surveyV2.id] } } });
  });

  // 情境 10: 其他回歸測試 (不計分題、特殊分數、0分、其他+文字、反向計分)
  it("情境 10: M1 核心功能全數正常（不計分、特殊給分、0分、其他必填文字、反向計分）", () => {
    const answers = [
      { questionCode: "Q1", rawValue: "very_satisfied" },
      { questionCode: "Q2", rawValue: "morning" },
      { questionCode: "Q3", rawValue: "文字建議" },
      { questionCode: "Q4", rawValue: 50 },
      { questionCode: "Q5", rawValue: ["realtime_collab", "advanced_stats"] },
      { questionCode: "Q6", rawValue: "other", otherText: "研討會推薦" },
      { questionCode: "Q7", rawValue: ["slack", "discord"] },
      { questionCode: "Q8", rawValue: "lvl_expert" },
      { questionCode: "Q9", rawValue: "zero_issues" },
      { questionCode: "Q10", rawValue: "strongly_agree" },
    ];

    const result = evaluateSurveySubmission(demoQuestions, answers);
    expect(result.isValid).toBe(true);
    expect(result.totalScore).toBe(26);

    const q9Res = result.questionResults.find((r) => r.questionCode === "Q9");
    expect(q9Res?.score).toBe(0);
    expect(q9Res?.score).not.toBeNull();

    const q2Res = result.questionResults.find((r) => r.questionCode === "Q2");
    expect(q2Res?.score).toBeNull();

    const q8Res = result.questionResults.find((r) => r.questionCode === "Q8");
    expect(q8Res?.score).toBe(10);

    const q10Res = result.questionResults.find((r) => r.questionCode === "Q10");
    expect(q10Res?.score).toBe(1);
  });
});
