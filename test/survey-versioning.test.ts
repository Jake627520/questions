import { describe, it, expect } from "vitest";
import { db } from "../src/lib/db";
import { SurveyStatus } from "@prisma/client";

describe("M2 問卷版本控制測試 (Survey Versioning Tests)", () => {
  it("建立新版本問卷時應繼承並遞增 version，且與前版回覆相互隔離", async () => {
    // 建立 v1 問卷
    const surveyV1 = await db.survey.create({
      data: {
        organizationId: "default-org-id",
        title: "版本測試問卷 v1",
        version: 1,
        status: SurveyStatus.PUBLISHED,
        questions: {
          create: [
            {
              orderNum: 1,
              code: "Q1",
              title: "v1 題目",
              questionType: "single_choice",
              required: true,
              scoringEnabled: true,
              choices: {
                create: [
                  { orderNum: 1, label: "A", value: "a", scoreEnabled: true, score: 5 },
                ],
              },
            },
          ],
        },
      },
    });

    // 建立 v1 回覆
    const respV1 = await db.response.create({
      data: {
        surveyId: surveyV1.id,
        version: surveyV1.version,
        totalScore: 5,
        maxScore: 5,
        percentage: 100,
      },
    });

    // 建立 v2 問卷 (指向 parentSurveyId)
    const surveyV2 = await db.survey.create({
      data: {
        organizationId: surveyV1.organizationId,
        title: "版本測試問卷 v2",
        parentSurveyId: surveyV1.id,
        version: surveyV1.version + 1,
        status: SurveyStatus.PUBLISHED,
        questions: {
          create: [
            {
              orderNum: 1,
              code: "Q1",
              title: "v2 修改後題目",
              questionType: "single_choice",
              required: true,
              scoringEnabled: true,
              choices: {
                create: [
                  { orderNum: 1, label: "A+", value: "a_plus", scoreEnabled: true, score: 10 },
                ],
              },
            },
          ],
        },
      },
    });

    expect(surveyV2.version).toBe(2);
    expect(surveyV2.parentSurveyId).toBe(surveyV1.id);

    // 驗證 v1 responses 依然獨立存在且關聯到 v1
    const v1Responses = await db.response.findMany({ where: { surveyId: surveyV1.id } });
    expect(v1Responses).toHaveLength(1);
    expect(v1Responses[0].version).toBe(1);

    // 驗證 v2 responses 目前為空
    const v2Responses = await db.response.findMany({ where: { surveyId: surveyV2.id } });
    expect(v2Responses).toHaveLength(0);

    // 清理測試資料
    await db.survey.deleteMany({
      where: { id: { in: [surveyV1.id, surveyV2.id] } },
    });
  });
});
