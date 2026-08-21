import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ResponseStatus } from "@prisma/client";
import { AnswerSubmission } from "@/lib/types";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const body = await req.json();
    const responseId = body.responseId as string | undefined;
    const answersInput = (body.answers || []) as AnswerSubmission[];

    const survey = await db.survey.findUnique({
      where: { id },
      include: {
        questions: {
          include: {
            choices: true,
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

    // 建立或更新草稿（ResponseStatus.IN_PROGRESS）
    const draftResponse = await db.$transaction(async (tx) => {
      let resp;
      if (responseId) {
        resp = await tx.response.findUnique({ where: { id: responseId } });
      }

      if (!resp) {
        resp = await tx.response.create({
          data: {
            surveyId: survey.id,
            version: survey.version,
            status: ResponseStatus.IN_PROGRESS,
            totalScore: null,
            maxScore: null,
            percentage: null,
            submittedAt: null,
          },
        });
      } else {
        // 清理舊答案
        await tx.answer.deleteMany({ where: { responseId: resp.id } });
      }

      const qMap = new Map(survey.questions.map((q) => [q.code, q]));

      for (const ans of answersInput) {
        const qRecord = qMap.get(ans.questionCode);
        if (!qRecord) continue;

        const createdAnswer = await tx.answer.create({
          data: {
            responseId: resp.id,
            questionId: qRecord.id,
            rawValue: JSON.stringify(ans.rawValue ?? null),
            otherText: ans.otherText || null,
            score: null, // 草稿不計分
          },
        });

        if (["single_choice", "multiple_choice", "yes_no"].includes(qRecord.questionType) && qRecord.choices.length > 0) {
          const rawVal = ans.rawValue;
          const selectedValues = Array.isArray(rawVal) ? rawVal.map(String) : (rawVal !== null && rawVal !== undefined ? [String(rawVal)] : []);
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

      return resp;
    }, { maxWait: 15000, timeout: 30000 });

    return NextResponse.json({
      success: true,
      mode: "draft",
      status: "IN_PROGRESS",
      responseId: draftResponse.id,
      savedCount: answersInput.length,
    });
  } catch (error: any) {
    console.error("Error saving survey draft:", error);
    return NextResponse.json(
      { error: "暫存草稿失敗", details: error.message },
      { status: 500 }
    );
  }
}
