import { describe, it, expect } from "vitest";
import { db } from "../src/lib/db";
import { ResponseStatus, SurveyStatus } from "@prisma/client";

describe("M3 隱藏題與草稿在統計中的排除測試 (Stats Hidden & Draft Exclusion Tests)", () => {
  it("統計時應排除 IN_PROGRESS 草稿，且跳題隱藏的題目不納入各題作答分母", async () => {
    const survey = await db.survey.create({
      data: {
        title: "統計排除測試問卷",
        version: 1,
        status: SurveyStatus.PUBLISHED,
        questions: {
          create: [
            {
              orderNum: 1,
              code: "Q1",
              title: "主問題 (單選)",
              questionType: "single_choice",
              required: true,
              scoringEnabled: true,
              choices: {
                create: [
                  { orderNum: 1, label: "滿意", value: "satisfied", scoreEnabled: true, score: 5 },
                  { orderNum: 2, label: "不滿意", value: "dissatisfied", scoreEnabled: true, score: 1 },
                ],
              },
            },
            {
              orderNum: 2,
              code: "Q1_FEEDBACK",
              title: "不滿意原因 (條件題：僅不滿意顯示)",
              questionType: "single_choice",
              required: true,
              scoringEnabled: false,
              visibilityRules: "SHOW IF Q1 equals dissatisfied",
              choices: {
                create: [
                  { orderNum: 1, label: "介面卡頓", value: "lag" },
                  { orderNum: 2, label: "功能缺失", value: "missing_features" },
                ],
              },
            },
          ],
        },
      },
      include: {
        questions: {
          include: { choices: true },
        },
      },
    });

    const q1 = survey.questions.find((q) => q.code === "Q1")!;
    const qFeedback = survey.questions.find((q) => q.code === "Q1_FEEDBACK")!;

    // 填答 1：Q1 選「滿意」-> Q1_FEEDBACK 隱藏（未建立 answer）
    await db.response.create({
      data: {
        surveyId: survey.id,
        version: 1,
        status: ResponseStatus.COMPLETED,
        totalScore: 5,
        maxScore: 5,
        percentage: 100,
        submittedAt: new Date(),
        answers: {
          create: [
            { questionId: q1.id, rawValue: JSON.stringify("satisfied"), score: 5 },
          ],
        },
      },
    });

    // 填答 2：Q1 選「不滿意」-> Q1_FEEDBACK 顯示並選了 "lag"
    await db.response.create({
      data: {
        surveyId: survey.id,
        version: 1,
        status: ResponseStatus.COMPLETED,
        totalScore: 1,
        maxScore: 5,
        percentage: 20,
        submittedAt: new Date(),
        answers: {
          create: [
            { questionId: q1.id, rawValue: JSON.stringify("dissatisfied"), score: 1 },
            { questionId: qFeedback.id, rawValue: JSON.stringify("lag"), score: null },
          ],
        },
      },
    });

    // 填答 3：草稿 (IN_PROGRESS) -> 應被排除在統計外
    await db.response.create({
      data: {
        surveyId: survey.id,
        version: 1,
        status: ResponseStatus.IN_PROGRESS,
        totalScore: null,
        answers: {
          create: [
            { questionId: q1.id, rawValue: JSON.stringify("satisfied"), score: null },
          ],
        },
      },
    });

    // 執行統計查詢
    const completedResponses = await db.response.findMany({
      where: { surveyId: survey.id, status: ResponseStatus.COMPLETED },
      include: { answers: true },
    });

    expect(completedResponses).toHaveLength(2); // 排除草稿

    // Q1 統計：總作答人數 2，滿意 1 (50%)，不滿意 1 (50%)
    const q1Answers = completedResponses.flatMap((r) => r.answers.filter((a) => a.questionId === q1.id));
    expect(q1Answers).toHaveLength(2);

    // Q1_FEEDBACK 統計：總作答人數僅 1（非 2，因為填答1隱藏），"lag" 佔 100% (1/1)
    const qFbAnswers = completedResponses.flatMap((r) => r.answers.filter((a) => a.questionId === qFeedback.id));
    expect(qFbAnswers).toHaveLength(1);
    expect(JSON.parse(qFbAnswers[0].rawValue)).toBe("lag");

    // 清理
    await db.survey.delete({ where: { id: survey.id } });
  });
});
