import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { AnswerSubmission } from "@/lib/types";
import { ResponseStatus, SurveyStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

/**
 * 公開問卷草稿暫存與讀取 API (Public Survey Draft)
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { publicToken: string } }
) {
  try {
    const { publicToken } = params;

    if (!publicToken || publicToken.trim().length === 0) {
      return NextResponse.json(
        { error: "無效的公開問卷標識" },
        { status: 400 }
      );
    }

    const body = await req.json();
    const responseId = body.responseId as string | undefined;
    const answersInput = (body.answers || []) as AnswerSubmission[];

    const survey = await db.survey.findUnique({
      where: { publicToken },
      include: {
        questions: {
          include: { choices: true },
        },
      },
    });

    if (!survey || survey.status !== SurveyStatus.PUBLISHED) {
      return NextResponse.json(
        { error: "找不到該公開問卷或問卷目前未開放填答" },
        { status: 404 }
      );
    }

    const savedDraft = await db.$transaction(async (tx) => {
      let resp;
      if (responseId) {
        resp = await tx.response.findUnique({ where: { id: responseId } });
        if (resp && resp.surveyId !== survey.id) {
          throw new Error("無效的作答草稿記錄 (Cross-survey Draft ID Invalid)");
        }
      }

      if (!resp) {
        resp = await tx.response.create({
          data: {
            surveyId: survey.id,
            version: survey.version,
            status: ResponseStatus.IN_PROGRESS,
          },
        });
      } else {
        await tx.response.update({
          where: { id: resp.id },
          data: {
            status: ResponseStatus.IN_PROGRESS,
          },
        });
        await tx.answer.deleteMany({ where: { responseId: resp.id } });
      }

      for (const ans of answersInput) {
        const q = survey.questions.find((item) => item.code === ans.questionCode);
        if (!q) continue;

        const createdAnswer = await tx.answer.create({
          data: {
            responseId: resp.id,
            questionId: q.id,
            rawValue: JSON.stringify(ans.rawValue),
            otherText: ans.otherText,
          },
        });

        if (["single_choice", "multiple_choice"].includes(q.questionType)) {
          const selectedVals = Array.isArray(ans.rawValue) ? ans.rawValue : [ans.rawValue];
          const matchedChoices = q.choices.filter((c) => selectedVals.includes(c.value));
          if (matchedChoices.length > 0) {
            await tx.answerChoice.createMany({
              data: matchedChoices.map((c) => ({
                answerId: createdAnswer.id,
                choiceId: c.id,
              })),
            });
          }
        }
      }

      return resp;
    });

    return NextResponse.json({
      success: true,
      message: "草稿已儲存",
      responseId: savedDraft.id,
    });
  } catch (error: any) {
    console.error("[Public Survey Draft Error]:", error);
    return NextResponse.json(
      { error: "草稿儲存失敗", details: error.message },
      { status: 500 }
    );
  }
}
