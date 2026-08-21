import { describe, it, expect } from "vitest";
import { db } from "../src/lib/db";
import { ResponseStatus, SurveyStatus } from "@prisma/client";

describe("M3 草稿暫存與恢復測試 (Draft Response Tests)", () => {
  it("應能建立 IN_PROGRESS 草稿、恢復作答，並在最終提交時轉為 COMPLETED", async () => {
    // 建立測試問卷
    const survey = await db.survey.create({
      data: {
        title: "草稿測試問卷",
        version: 1,
        status: SurveyStatus.PUBLISHED,
        questions: {
          create: [
            {
              orderNum: 1,
              code: "Q1",
              title: "必填單選",
              questionType: "single_choice",
              required: true,
              scoringEnabled: true,
              choices: {
                create: [
                  { orderNum: 1, label: "A", value: "a", scoreEnabled: true, score: 5 },
                  { orderNum: 2, label: "B", value: "b", scoreEnabled: true, score: 10 },
                ],
              },
            },
            {
              orderNum: 2,
              code: "Q2",
              title: "必填問答",
              questionType: "text",
              required: true,
              scoringEnabled: false,
            },
          ],
        },
      },
      include: { questions: true },
    });

    const q1 = survey.questions.find((q) => q.code === "Q1")!;
    const q2 = survey.questions.find((q) => q.code === "Q2")!;

    // 1. 儲存草稿 (只填寫了 Q1，Q2 必填未填)
    const draft = await db.response.create({
      data: {
        surveyId: survey.id,
        version: survey.version,
        status: ResponseStatus.IN_PROGRESS,
        totalScore: null,
        maxScore: null,
        percentage: null,
        answers: {
          create: [
            {
              questionId: q1.id,
              rawValue: JSON.stringify("a"),
            },
          ],
        },
      },
      include: { answers: true },
    });

    expect(draft.status).toBe(ResponseStatus.IN_PROGRESS);
    expect(draft.totalScore).toBeNull();
    expect(draft.answers).toHaveLength(1);

    // 2. 恢復草稿讀取
    const loadedDraft = await db.response.findUnique({
      where: { id: draft.id },
      include: { answers: { include: { question: true } } },
    });
    expect(loadedDraft).not.toBeNull();
    expect(loadedDraft?.status).toBe(ResponseStatus.IN_PROGRESS);
    expect(loadedDraft?.answers[0].question.code).toBe("Q1");
    expect(JSON.parse(loadedDraft?.answers[0].rawValue || "")).toBe("a");

    // 3. 正式提交：補齊 Q2，更新狀態為 COMPLETED 並計算分數
    const completed = await db.response.update({
      where: { id: draft.id },
      data: {
        status: ResponseStatus.COMPLETED,
        totalScore: 5,
        maxScore: 10,
        percentage: 50,
        submittedAt: new Date(),
      },
    });

    await db.answer.create({
      data: {
        responseId: completed.id,
        questionId: q2.id,
        rawValue: JSON.stringify("補齊的回答內容"),
      },
    });

    const finalRecord = await db.response.findUnique({
      where: { id: completed.id },
      include: { answers: true },
    });

    expect(finalRecord?.status).toBe(ResponseStatus.COMPLETED);
    expect(finalRecord?.totalScore).toBe(5);
    expect(finalRecord?.answers).toHaveLength(2);

    // 清理
    await db.survey.delete({ where: { id: survey.id } });
  });
});
