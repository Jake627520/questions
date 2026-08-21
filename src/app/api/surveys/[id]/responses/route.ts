import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const survey = await db.survey.findUnique({
      where: { id },
      include: {
        responses: {
          orderBy: { createdAt: "desc" },
          include: {
            _count: {
              select: { answers: true },
            },
          },
        },
      },
    });

    if (!survey) {
      return NextResponse.json({ error: "找不到該問卷" }, { status: 404 });
    }

    const responses = survey.responses.map((r) => ({
      id: r.id,
      status: r.status,
      version: r.version,
      submittedAt: r.submittedAt,
      createdAt: r.createdAt,
      totalScore: r.totalScore,
      maxScore: r.maxScore,
      percentage: r.percentage,
      answersCount: r._count.answers,
    }));

    return NextResponse.json({
      survey: {
        id: survey.id,
        title: survey.title,
        version: survey.version,
      },
      responses,
    });
  } catch (error: any) {
    console.error("Error listing responses:", error);
    return NextResponse.json(
      { error: "讀取回覆列表失敗", details: error.message },
      { status: 500 }
    );
  }
}
