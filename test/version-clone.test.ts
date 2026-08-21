import { describe, it, expect } from "vitest";
import { db } from "../src/lib/db";
import { SurveyStatus } from "@prisma/client";

describe("M3 問卷版本複製測試 (Version Clone Tests)", () => {
  it("應能複製問卷為新版本 (version + 1)，並完整複製題目與選項", async () => {
    const parent = await db.survey.create({
      data: {
        organizationId: "default-org-id",
        title: "版本來源問卷",
        version: 1,
        status: SurveyStatus.PUBLISHED,
        questions: {
          create: [
            {
              orderNum: 1,
              code: "Q1",
              title: "題目 1",
              questionType: "single_choice",
              choices: {
                create: [
                  { orderNum: 1, label: "選項 A", value: "a" },
                  { orderNum: 2, label: "選項 B", value: "b" },
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

    // 模擬版本複製
    const nextVersion = parent.version + 1;
    const cloned = await db.survey.create({
      data: {
        organizationId: parent.organizationId,
        title: `${parent.title} (v${nextVersion})`,
        version: nextVersion,
        parentSurveyId: parent.id,
        status: SurveyStatus.PUBLISHED,
        questions: {
          create: parent.questions.map((q) => ({
            orderNum: q.orderNum,
            code: q.code,
            title: q.title,
            questionType: q.questionType,
            choices: {
              create: q.choices.map((c) => ({
                orderNum: c.orderNum,
                label: c.label,
                value: c.value,
              })),
            },
          })),
        },
      },
      include: {
        questions: {
          include: { choices: true },
        },
      },
    });

    expect(cloned.version).toBe(2);
    expect(cloned.parentSurveyId).toBe(parent.id);
    expect(cloned.questions).toHaveLength(1);
    expect(cloned.questions[0].choices).toHaveLength(2);

    // 清理
    await db.survey.deleteMany({ where: { id: { in: [parent.id, cloned.id] } } });
  });
});
