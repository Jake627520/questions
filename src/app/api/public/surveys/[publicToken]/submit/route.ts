import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { evaluateSurveySubmission } from "@/lib/survey-engine";
import { AnswerSubmission } from "@/lib/types";
import { ResponseStatus, SurveyStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

/**
 * 公開問卷提交 API (Public Survey Submission)
 * - 依賴 publicToken，接受匿名大眾填答
 * - 伺服器端完成答題驗證、邏輯跳題計算與分數計算
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { publicToken: string } }
) {
  try {
    const { publicToken } = params;

    if (!publicToken || publicToken.trim().length === 0) {
      return NextResponse.json(
        { error: "無效的公開問卷標識 (Public Token Invalid)" },
        { status: 400 }
      );
    }

    const body = await req.json();
    const responseId = body.responseId as string | undefined;
    const answersInput = (body.answers || []) as AnswerSubmission[];

    // 取得問卷與題目設定
    const survey = await db.survey.findUnique({
      where: { publicToken },
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

    if (!survey || survey.status !== SurveyStatus.PUBLISHED) {
      return NextResponse.json(
        { error: "找不到該公開問卷或問卷目前未開放填答" },
        { status: 404 }
      );
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
        const existingDraft = await tx.response.findUnique({
          where: { id: responseId },
        });

        if (!existingDraft || existingDraft.surveyId !== survey.id) {
          throw new Error("無效的作答草稿記錄 (Cross-survey Draft ID Invalid)");
        }

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
        // 全新提交
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
        if (!qResult.isVisible) continue;

        const qRecord = qMap.get(qResult.questionCode);
        if (!qRecord) continue;
        const sub = inputMap.get(qResult.questionCode);

        const createdAnswer = await tx.answer.create({
          data: {
            responseId: response.id,
            questionId: qRecord.id,
            rawValue: JSON.stringify(sub?.rawValue ?? null),
            otherText: sub?.otherText || null,
            score: qResult.score,
          },
        });

        // 若為選擇題型，儲存關聯的 answer_choices
        if (
          ["single_choice", "multiple_choice", "yes_no"].includes(qRecord.questionType) &&
          qRecord.choices.length > 0
        ) {
          const rawVal = sub?.rawValue;
          const selectedValues = Array.isArray(rawVal)
            ? rawVal.map(String)
            : rawVal !== null && rawVal !== undefined
            ? [String(rawVal)]
            : [];
          const matchedChoiceIds = qRecord.choices
            .filter((c) => selectedValues.includes(c.value))
            .map((c) => c.id);

          if (matchedChoiceIds.length > 0) {
            await tx.answerChoice.createMany({
              data: matchedChoiceIds.map((cid) => ({
                answerId: createdAnswer.id,
                choiceId: cid,
              })),
              skipDuplicates: true,
            });
          }
        }
      }

      return response;
    });

    return NextResponse.json({
      success: true,
      message: "問卷提交成功",
      responseId: savedResponse.id,
    });
  } catch (error: any) {
    console.error("[Public Survey Submit Error]:", error);
    return NextResponse.json(
      { error: "問卷提交失敗，請稍後再試", details: error.message },
      { status: 500 }
    );
  }
}
