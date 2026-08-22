import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ResponseStatus, SurveyStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

/**
 * 讀取公開問卷暫存草稿作答內容 (Public Survey Draft Retrieval)
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { publicToken: string; responseId: string } }
) {
  try {
    const { publicToken, responseId } = params;

    const survey = await db.survey.findUnique({
      where: { publicToken },
    });

    if (!survey || survey.status !== SurveyStatus.PUBLISHED) {
      return NextResponse.json(
        { error: "找不到該公開問卷或問卷目前未開放填答" },
        { status: 404 }
      );
    }

    const response = await db.response.findUnique({
      where: { id: responseId },
      include: {
        answers: {
          include: {
            question: true,
          },
        },
      },
    });

    if (!response || response.surveyId !== survey.id) {
      return NextResponse.json({ error: "找不到該草稿記錄" }, { status: 404 });
    }

    // 僅允許讀取尚未提交之草稿 (IN_PROGRESS)
    if (response.status !== ResponseStatus.IN_PROGRESS) {
      return NextResponse.json(
        { error: "該作答已正式提交，無法作為草稿讀取" },
        { status: 400 }
      );
    }

    const formattedAnswers = response.answers.map((a) => {
      let parsedVal: any = null;
      try {
        parsedVal = JSON.parse(a.rawValue);
      } catch {
        parsedVal = a.rawValue;
      }
      return {
        questionCode: a.question.code,
        rawValue: parsedVal,
        otherText: a.otherText,
      };
    });

    return NextResponse.json({
      success: true,
      response: {
        id: response.id,
        status: response.status,
        version: response.version,
        createdAt: response.createdAt,
      },
      answers: formattedAnswers,
    });
  } catch (error: any) {
    console.error("[Public Survey Draft Get Error]:", error);
    return NextResponse.json(
      { error: "讀取草稿失敗", details: error.message },
      { status: 500 }
    );
  }
}
