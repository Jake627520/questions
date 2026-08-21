import { describe, it, expect } from "vitest";
import { db } from "../src/lib/db";
import { SurveyStatus, ResponseStatus } from "@prisma/client";

describe("P0-1 複選與單選題 AnswerChoice 正規化關聯測試 (AnswerChoice Relation Tests)", () => {
  it("提交複選與單選題答案時，應正確在 answer_choices 關聯表中建立規範化記錄", async () => {
    const survey = await db.survey.create({
      data: {
        organizationId: "default-org-id",
        title: "AnswerChoice 關聯測試問卷",
        status: SurveyStatus.PUBLISHED,
        questions: {
          create: [
            {
              orderNum: 1,
              code: "Q_MULTI",
              title: "複選題",
              questionType: "multiple_choice",
              choices: {
                create: [
                  { orderNum: 1, label: "選項 A", value: "opt_a" },
                  { orderNum: 2, label: "選項 B", value: "opt_b" },
                  { orderNum: 3, label: "選項 C", value: "opt_c" },
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

    const qMulti = survey.questions[0];
    const choiceA = qMulti.choices.find((c) => c.value === "opt_a")!;
    const choiceB = qMulti.choices.find((c) => c.value === "opt_b")!;

    // 模擬提交複選答案：勾選 A 與 B
    const response = await db.response.create({
      data: {
        surveyId: survey.id,
        status: ResponseStatus.COMPLETED,
        answers: {
          create: {
            questionId: qMulti.id,
            rawValue: JSON.stringify(["opt_a", "opt_b"]),
            choices: {
              create: [{ choiceId: choiceA.id }, { choiceId: choiceB.id }],
            },
          },
        },
      },
      include: {
        answers: {
          include: {
            choices: {
              include: { choice: true },
            },
          },
        },
      },
    });

    const savedAnswer = response.answers[0];
    // 1. 保留原始答案向後相容
    expect(savedAnswer.rawValue).toBe('["opt_a","opt_b"]');

    // 2. 驗證 AnswerChoice 關聯正規化資料存在
    expect(savedAnswer.choices).toHaveLength(2);
    const selectedValues = savedAnswer.choices.map((ac) => ac.choice.value);
    expect(selectedValues).toContain("opt_a");
    expect(selectedValues).toContain("opt_b");

    // 3. 透過 Choice 反向查詢關聯答案
    const choiceAWithAnswers = await db.choice.findUnique({
      where: { id: choiceA.id },
      include: { answers: true },
    });
    expect(choiceAWithAnswers?.answers).toHaveLength(1);

    // 清理
    await db.survey.delete({ where: { id: survey.id } });
  });
});
