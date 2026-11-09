import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { db } from "../src/lib/db";
import { generatePublicToken } from "../src/lib/auth";
import { SurveyStatus, QuestionType, ResponseStatus } from "@prisma/client";
import { GET as publicSurveyGET } from "../src/app/api/public/surveys/[publicToken]/route";
import { POST as publicSubmitPOST } from "../src/app/api/public/surveys/[publicToken]/submit/route";

// Excel 匯入會把 visibility_rules 以簡寫原文 (SHOW IF ...) 存入資料庫。
describe("公開問卷的簡寫跳題規則", () => {
  const slug = "shorthand-rules-org";
  let publicToken: string;

  const params = () => ({ params: Promise.resolve({ publicToken }) });
  const submit = (answers: unknown[]) =>
    publicSubmitPOST(
      new NextRequest(`http://localhost/api/public/surveys/${publicToken}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers }),
      }),
      params()
    );

  beforeEach(async () => {
    await db.answerChoice.deleteMany({
      where: { answer: { response: { survey: { organization: { slug } } } } },
    });
    await db.answer.deleteMany({ where: { response: { survey: { organization: { slug } } } } });
    await db.response.deleteMany({ where: { survey: { organization: { slug } } } });
    await db.survey.deleteMany({ where: { organization: { slug } } });
    await db.organization.deleteMany({ where: { slug } });

    const org = await db.organization.create({ data: { name: "Shorthand Rules", slug } });
    publicToken = generatePublicToken();
    await db.survey.create({
      data: {
        organizationId: org.id,
        title: "簡寫跳題問卷",
        status: SurveyStatus.PUBLISHED,
        publicToken,
        questions: {
          create: [
            {
              code: "Q1",
              title: "滿意度",
              questionType: QuestionType.single_choice,
              required: true,
              orderNum: 1,
              choices: {
                create: [
                  { label: "不滿意", value: "bad", orderNum: 1 },
                  { label: "滿意", value: "good", orderNum: 2 },
                ],
              },
            },
            {
              code: "Q1_FEEDBACK",
              title: "不滿意的原因",
              questionType: QuestionType.text,
              required: true,
              orderNum: 2,
              visibilityRules: "SHOW IF Q1 in [bad]",
            },
          ],
        },
      },
    });
  });

  it("填答頁取得解析後的規則物件，而不是 null", async () => {
    const res = await publicSurveyGET(
      new NextRequest(`http://localhost/api/public/surveys/${publicToken}`),
      params()
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    const questions = data.questions ?? data.survey.questions;
    const feedback = questions.find((q: { code: string }) => q.code === "Q1_FEEDBACK");
    expect(feedback.visibilityRules).toMatchObject({
      conditions: [{ dependsOnQuestionCode: "Q1" }],
    });
  });

  it("條件不成立時，隱藏的必答題不必作答，提交成功", async () => {
    const res = await submit([{ questionCode: "Q1", value: "good" }]);
    expect(res.status).toBe(200);
    const { responseId } = await res.json();
    const saved = await db.response.findUnique({ where: { id: responseId } });
    expect(saved?.status).toBe(ResponseStatus.COMPLETED);
  });

  it("條件成立時，顯示的必答題仍然必須作答", async () => {
    const res = await submit([{ questionCode: "Q1", value: "bad" }]);
    expect(res.status).toBe(422);
  });
});
