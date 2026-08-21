import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "../src/lib/db";
import { ResponseStatus, SurveyStatus } from "@prisma/client";

describe("P0-6 確定性統計測試資料集 (Deterministic Statistics Dataset Tests)", () => {
  let surveyId: string;
  let q1Id: string; // 單選計分題: A(1分), B(2分), C(3分)
  let q1HiddenId: string; // 條件追問: SHOW IF Q1 in [A]
  let q2NumId: string; // 數值題: 0~100
  let q3ZeroNullId: string; // 0分 vs NULL: Zero(0分), Major(5分), Unspecified(NULL)

  beforeAll(async () => {
    // 建立標準基準問卷
    const survey = await db.survey.create({
      data: {
        organizationId: "default-org-id",
        title: "確定性統計基準問卷",
        status: SurveyStatus.PUBLISHED,
        questions: {
          create: [
            {
              orderNum: 1,
              code: "Q1",
              title: "滿意度",
              questionType: "single_choice",
              scoringEnabled: true,
              required: true,
              choices: {
                create: [
                  { orderNum: 1, label: "不滿意", value: "A", scoreEnabled: true, score: 1 },
                  { orderNum: 2, label: "普通", value: "B", scoreEnabled: true, score: 2 },
                  { orderNum: 3, label: "滿意", value: "C", scoreEnabled: true, score: 3 },
                ],
              },
            },
            {
              orderNum: 2,
              code: "Q1_FEEDBACK",
              title: "不滿意原因 (條件題: SHOW IF Q1 in [A])",
              questionType: "text",
              visibilityRules: "SHOW IF Q1 in [A]",
              scoringEnabled: false,
              required: true,
            },
            {
              orderNum: 3,
              code: "Q2_NUM",
              title: "每週使用次數",
              questionType: "number",
              scoringEnabled: false,
              minValue: 0,
              maxValue: 100,
            },
            {
              orderNum: 4,
              code: "Q3_ZERO_NULL",
              title: "故障情況 (0分 vs NULL)",
              questionType: "single_choice",
              scoringEnabled: true,
              choices: {
                create: [
                  { orderNum: 1, label: "從未故障 (0分)", value: "zero", scoreEnabled: true, score: 0 },
                  { orderNum: 2, label: "嚴重故障 (5分)", value: "major", scoreEnabled: true, score: 5 },
                  { orderNum: 3, label: "不確定 (NULL)", value: "unspecified", scoreEnabled: false, score: null },
                ],
              },
            },
          ],
        },
      },
      include: { questions: { include: { choices: true } } },
    });

    surveyId = survey.id;
    q1Id = survey.questions.find((q) => q.code === "Q1")!.id;
    q1HiddenId = survey.questions.find((q) => q.code === "Q1_FEEDBACK")!.id;
    q2NumId = survey.questions.find((q) => q.code === "Q2_NUM")!.id;
    q3ZeroNullId = survey.questions.find((q) => q.code === "Q3_ZERO_NULL")!.id;

    // 建立 4 筆固定 COMPLETED 回覆 + 1 筆 IN_PROGRESS 草稿
    // Response 1: Q1="A" (1分), Q1_FEEDBACK="速度慢", Q2_NUM=10, Q3="zero" (0分) -> 總分 1分
    await db.response.create({
      data: {
        surveyId,
        status: ResponseStatus.COMPLETED,
        totalScore: 1,
        maxScore: 8,
        percentage: 12.5,
        submittedAt: new Date(),
        answers: {
          create: [
            { questionId: q1Id, rawValue: '"A"', score: 1 },
            { questionId: q1HiddenId, rawValue: '"速度慢"', score: null },
            { questionId: q2NumId, rawValue: "10", score: null },
            { questionId: q3ZeroNullId, rawValue: '"zero"', score: 0 },
          ],
        },
      },
    });

    // Response 2: Q1="B" (2分), Q1_FEEDBACK=隱藏未填, Q2_NUM=20, Q3="major" (5分) -> 總分 7分
    await db.response.create({
      data: {
        surveyId,
        status: ResponseStatus.COMPLETED,
        totalScore: 7,
        maxScore: 8,
        percentage: 87.5,
        submittedAt: new Date(),
        answers: {
          create: [
            { questionId: q1Id, rawValue: '"B"', score: 2 },
            { questionId: q2NumId, rawValue: "20", score: null },
            { questionId: q3ZeroNullId, rawValue: '"major"', score: 5 },
          ],
        },
      },
    });

    // Response 3: Q1="C" (3分), Q1_FEEDBACK=隱藏未填, Q2_NUM=30, Q3="unspecified" (NULL) -> 總分 3分
    await db.response.create({
      data: {
        surveyId,
        status: ResponseStatus.COMPLETED,
        totalScore: 3,
        maxScore: 3,
        percentage: 100,
        submittedAt: new Date(),
        answers: {
          create: [
            { questionId: q1Id, rawValue: '"C"', score: 3 },
            { questionId: q2NumId, rawValue: "30", score: null },
            { questionId: q3ZeroNullId, rawValue: '"unspecified"', score: null },
          ],
        },
      },
    });

    // Response 4: Q1="C" (3分), Q1_FEEDBACK=隱藏未填, Q2_NUM=null未填, Q3="zero" (0分) -> 總分 3分
    await db.response.create({
      data: {
        surveyId,
        status: ResponseStatus.COMPLETED,
        totalScore: 3,
        maxScore: 8,
        percentage: 37.5,
        submittedAt: new Date(),
        answers: {
          create: [
            { questionId: q1Id, rawValue: '"C"', score: 3 },
            { questionId: q3ZeroNullId, rawValue: '"zero"', score: 0 },
          ],
        },
      },
    });

    // Response 5 (草稿 IN_PROGRESS，必須被統計嚴格排除)
    await db.response.create({
      data: {
        surveyId,
        status: ResponseStatus.IN_PROGRESS,
        totalScore: null,
        answers: {
          create: [{ questionId: q1Id, rawValue: '"A"', score: null }],
        },
      },
    });
  });

  afterAll(async () => {
    if (surveyId) {
      await db.survey.delete({ where: { id: surveyId } });
    }
  });

  it("統計指標檢驗：草稿完全排除、總填答數為 4", async () => {
    const completedCount = await db.response.count({
      where: { surveyId, status: ResponseStatus.COMPLETED },
    });
    expect(completedCount).toBe(4);
  });

  it("Q1 單選計分題分佈與平均數檢驗", async () => {
    const answers = await db.answer.findMany({
      where: {
        questionId: q1Id,
        response: { status: ResponseStatus.COMPLETED },
      },
    });
    expect(answers).toHaveLength(4);

    const counts = { A: 0, B: 0, C: 0 };
    answers.forEach((a) => {
      const val = JSON.parse(a.rawValue);
      if (val in counts) counts[val as keyof typeof counts]++;
    });

    expect(counts.A).toBe(1); // 25%
    expect(counts.B).toBe(1); // 25%
    expect(counts.C).toBe(2); // 50%

    const avgScore = answers.reduce((sum, a) => sum + (a.score || 0), 0) / answers.length;
    // (1 + 2 + 3 + 3) / 4 = 9 / 4 = 2.25
    expect(avgScore).toBe(2.25);
  });

  it("Q1_FEEDBACK 條件隱藏題分母檢驗：僅作答 1 筆，不被灌水分母", async () => {
    const feedbackAnswers = await db.answer.findMany({
      where: {
        questionId: q1HiddenId,
        response: { status: ResponseStatus.COMPLETED },
      },
    });
    // 只有 Response 1 選 A 觸發並作答，其餘 3 筆因跳題隱藏未作答
    expect(feedbackAnswers).toHaveLength(1);
    expect(JSON.parse(feedbackAnswers[0].rawValue)).toBe("速度慢");
  });

  it("Q2_NUM 數值平均檢驗：3 筆作答，平均應為 (10+20+30)/3 = 20", async () => {
    const numAnswers = await db.answer.findMany({
      where: {
        questionId: q2NumId,
        response: { status: ResponseStatus.COMPLETED },
      },
    });
    expect(numAnswers).toHaveLength(3);
    const avgNum =
      numAnswers.reduce((sum, a) => sum + Number(JSON.parse(a.rawValue)), 0) / numAnswers.length;
    expect(avgNum).toBe(20);
  });

  it("Q3_ZERO_NULL 0分與 NULL 嚴格區分檢驗：zero佔2筆、major佔1筆、unspecified佔1筆", async () => {
    const zeroNullAnswers = await db.answer.findMany({
      where: {
        questionId: q3ZeroNullId,
        response: { status: ResponseStatus.COMPLETED },
      },
    });
    expect(zeroNullAnswers).toHaveLength(4);

    const zeroScored = zeroNullAnswers.filter((a) => a.score === 0);
    const nullScored = zeroNullAnswers.filter((a) => a.score === null);
    const majorScored = zeroNullAnswers.filter((a) => a.score === 5);

    expect(zeroScored).toHaveLength(2); // 0分有2筆
    expect(nullScored).toHaveLength(1); // NULL有1筆
    expect(majorScored).toHaveLength(1); // 5分有1筆
  });
});
