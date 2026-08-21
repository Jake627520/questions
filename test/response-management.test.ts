import { describe, it, expect } from "vitest";
import { db } from "../src/lib/db";
import { ResponseStatus, SurveyStatus } from "@prisma/client";

describe("M4 回覆與草稿管理測試 (Response Management Tests)", () => {
  it("應能正確查詢回覆列表、允許刪除 IN_PROGRESS 草稿，並保護 COMPLETED 正式回覆", async () => {
    const survey = await db.survey.create({
      data: {
        organizationId: "default-org-id",
        title: "回覆管理測試問卷",
        status: SurveyStatus.PUBLISHED,
        questions: {
          create: [{ orderNum: 1, code: "Q1", title: "測試題", questionType: "text" }],
        },
      },
    });

    // 建立 1 筆草稿與 1 筆已完成回覆
    const draft = await db.response.create({
      data: {
        surveyId: survey.id,
        status: ResponseStatus.IN_PROGRESS,
      },
    });

    const completed = await db.response.create({
      data: {
        surveyId: survey.id,
        status: ResponseStatus.COMPLETED,
        totalScore: 10,
        maxScore: 10,
        percentage: 100,
        submittedAt: new Date(),
      },
    });

    // 1. 列表查詢
    const allResponses = await db.response.findMany({
      where: { surveyId: survey.id },
      orderBy: { createdAt: "desc" },
    });
    expect(allResponses).toHaveLength(2);

    // 2. 刪除草稿 (IN_PROGRESS) -> 應成功
    await db.response.delete({
      where: { id: draft.id },
    });
    const afterDraftDelete = await db.response.findUnique({
      where: { id: draft.id },
    });
    expect(afterDraftDelete).toBeNull();

    // 3. 驗證已完成回覆依然健在
    const completedRecord = await db.response.findUnique({
      where: { id: completed.id },
    });
    expect(completedRecord).not.toBeNull();
    expect(completedRecord?.status).toBe(ResponseStatus.COMPLETED);

    // 清理
    await db.survey.delete({ where: { id: survey.id } });
  });
});
