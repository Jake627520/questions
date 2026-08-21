import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { evaluateSurveySubmission } from "@/lib/survey-engine";
import { AnswerSubmission } from "@/lib/types";
import { ResponseStatus } from "@prisma/client";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const body = await req.json();
    const responseId = body.responseId as string | undefined;
    const answersInput = (body.answers || []) as AnswerSubmission[];

    // 取得問卷與題目設定
    const survey = await db.survey.findUnique({
      where: { id },
      include: {
        questions: {
          orderBy: { orderNum: "asc" },
          include: {
            choices: {
              orderBy: { orderNum: "asc" },
            },
          },
        },
      },
    });

    if (!survey) {
      return NextResponse.json({ error: "找不到該問卷" }, { status: 404 });
    }

    if (survey.status === "CLOSED") {
      return NextResponse.json({ error: "此問卷已結束作答" }, { status: 400 });
    }

    // 格式化 questions 物件給 survey-engine 運算
    const engineQuestions = survey.questions.map((q) => ({
      id: q.id,
      orderNum: q.orderNum,
      code: q.code,
      title: q.title,
      description: q.description,
      questionType: q.questionType as any,
      required: q.required,
      scoringEnabled: q.scoringEnabled,
      reverseScore: q.reverseScore,
      visibilityRules: q.visibilityRules,
      minSelections: q.minSelections,
      maxSelections: q.maxSelections,
      minValue: q.minValue,
      maxValue: q.maxValue,
      choices: q.choices.map((c) => ({
        id: c.id,
        orderNum: c.orderNum,
        label: c.label,
        value: c.value,
        scoreEnabled: c.scoreEnabled,
        score: c.score,
        isOther: c.isOther,
        requiresText: c.requiresText,
        isNoneOfAbove: c.isNoneOfAbove,
      })),
    }));

    // 執行核心防呆、條件跳題與計分驗證
    const evaluation = evaluateSurveySubmission(engineQuestions, answersInput);

    if (!evaluation.isValid) {
      return NextResponse.json(
        {
          error: "作答檢核未通過，請檢查填寫項目",
          errors: evaluation.errors,
        },
        { status: 422 }
      );
    }

    // 寫入/更新 Response (設為 COMPLETED) 與 Answers
    const savedResponse = await db.$transaction(async (tx) => {
      let response;

      if (responseId) {
        // 更新現有草稿為正式提交
        response = await tx.response.update({
          where: { id: responseId },
          data: {
            status: ResponseStatus.COMPLETED,
            totalScore: evaluation.totalScore,
            maxScore: evaluation.maxScore,
            percentage: evaluation.percentage,
            submittedAt: new Date(),
          },
        });
        // 清理舊答案再重新寫入
        await tx.answer.deleteMany({ where: { responseId: response.id } });
      } else {
        response = await tx.response.create({
          data: {
            surveyId: survey.id,
            version: survey.version,
            status: ResponseStatus.COMPLETED,
            totalScore: evaluation.totalScore,
            maxScore: evaluation.maxScore,
            percentage: evaluation.percentage,
            submittedAt: new Date(),
          },
        });
      }

      const qMap = new Map(survey.questions.map((q) => [q.code, q]));
      const inputMap = new Map(answersInput.map((a) => [a.questionCode, a]));

      for (const qResult of evaluation.questionResults) {
        // 若題目被條件隱藏，不存入答案
        if (!qResult.isVisible) continue;

        const qRecord = qMap.get(qResult.questionCode);
        if (!qRecord) continue;
        const sub = inputMap.get(qResult.questionCode);

        await tx.answer.create({
          data: {
            responseId: response.id,
            questionId: qRecord.id,
            rawValue: JSON.stringify(sub?.rawValue ?? null),
            otherText: sub?.otherText || null,
            score: qResult.score,
          },
        });
      }

      return response;
    });

    return NextResponse.json({
      success: true,
      responseId: savedResponse.id,
      evaluation,
    });
  } catch (error: any) {
    console.error("Error submitting survey response:", error);
    return NextResponse.json(
      { error: "提交問卷失敗", details: error.message },
      { status: 500 }
    );
  }
}
