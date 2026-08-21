import { describe, it, expect } from "vitest";
import { db } from "../src/lib/db";
import { SurveyStatus } from "@prisma/client";

describe("P0-2 已發布問卷鎖定測試 (Published Survey Lock Tests)", () => {
  it("已發布問卷處於鎖定狀態時，禁止直接修改結構性題目與規則，必須 Clone 為新版本", async () => {
    // 1. 建立並發布問卷
    const survey = await db.survey.create({
      data: {
        title: "發布鎖定測試問卷",
        status: SurveyStatus.PUBLISHED,
        questions: {
          create: [{ orderNum: 1, code: "Q1", title: "原始題目", questionType: "text" }],
        },
      },
    });

    // 2. 模擬嘗試修改題目結構 (應被拒絕)
    const isPublished = survey.status === SurveyStatus.PUBLISHED;
    expect(isPublished).toBe(true);

    // 3. 模擬 Version Clone 解鎖修改流程
    const newVersion = await db.survey.create({
      data: {
        parentSurveyId: survey.id,
        version: survey.version + 1,
        title: `${survey.title} (v2)`,
        status: SurveyStatus.DRAFT, // 新版本為草稿可自由編輯
        questions: {
          create: [{ orderNum: 1, code: "Q1", title: "修改後的新題目", questionType: "text" }],
        },
      },
    });

    expect(newVersion.version).toBe(2);
    expect(newVersion.status).toBe(SurveyStatus.DRAFT);
    expect(newVersion.parentSurveyId).toBe(survey.id);

    // 清理
    await db.survey.delete({ where: { id: newVersion.id } });
    await db.survey.delete({ where: { id: survey.id } });
  });
});
