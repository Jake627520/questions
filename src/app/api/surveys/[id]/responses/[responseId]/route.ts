import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ResponseStatus } from "@prisma/client";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string; responseId: string } }
) {
  try {
    const { id, responseId } = params;
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

    if (!response || response.surveyId !== id) {
      return NextResponse.json({ error: "找不到該作答記錄" }, { status: 404 });
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
      response: {
        id: response.id,
        status: response.status,
        version: response.version,
        submittedAt: response.submittedAt,
        totalScore: response.totalScore,
        maxScore: response.maxScore,
        percentage: response.percentage,
      },
      answers: formattedAnswers,
    });
  } catch (error: any) {
    console.error("Error getting survey response:", error);
    return NextResponse.json(
      { error: "讀取作答記錄失敗", details: error.message },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string; responseId: string } }
) {
  try {
    const { id, responseId } = params;
    const url = new URL(req.url);
    const force = url.searchParams.get("force") === "true";

    const response = await db.response.findUnique({
      where: { id: responseId },
    });

    if (!response || response.surveyId !== id) {
      return NextResponse.json({ error: "找不到該回覆記錄" }, { status: 404 });
    }

    // 正式回覆保護邏輯
    if (response.status === ResponseStatus.COMPLETED && !force) {
      return NextResponse.json(
        { error: "已完成的正式回覆不可直接刪除，避免誤刪正式資料。" },
        { status: 400 }
      );
    }

    await db.response.delete({
      where: { id: responseId },
    });

    return NextResponse.json({
      success: true,
      message: response.status === ResponseStatus.IN_PROGRESS ? "已成功刪除草稿" : "已刪除回覆記錄",
    });
  } catch (error: any) {
    console.error("Error deleting survey response:", error);
    return NextResponse.json(
      { error: "刪除回覆失敗", details: error.message },
      { status: 500 }
    );
  }
}
