import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ResponseStatus } from "@prisma/client";
import {
  getCurrentUser,
  unauthorizedResponse,
  isUserInOrganization,
  forbiddenResponse,
} from "@/lib/auth";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await getCurrentUser(req);
    if (!auth) {
      return unauthorizedResponse();
    }

    const { id } = params;
    const url = new URL(req.url);
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
    const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get("limit") || "50", 10)));
    const statusParam = url.searchParams.get("status");

    const survey = await db.survey.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        version: true,
        organizationId: true,
      },
    });

    if (!survey) {
      return NextResponse.json({ error: "找不到該問卷" }, { status: 404 });
    }

    const isMember = await isUserInOrganization(auth.user.id, survey.organizationId);
    if (!isMember) {
      return forbiddenResponse("您無權查看此組織問卷的填答紀錄");
    }

    const whereClause: any = { surveyId: id };
    if (statusParam && statusParam !== "all") {
      if (Object.values(ResponseStatus).includes(statusParam as ResponseStatus)) {
        whereClause.status = statusParam as ResponseStatus;
      }
    }

    const total = await db.response.count({ where: whereClause });
    const rawResponses = await db.response.findMany({
      where: whereClause,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        _count: {
          select: { answers: true },
        },
      },
    });

    const responses = rawResponses.map((r) => ({
      id: r.id,
      status: r.status,
      version: r.version,
      idempotencyKey: r.idempotencyKey,
      ipHash: r.ipHash,
      userAgent: r.userAgent,
      durationSeconds: r.durationSeconds,
      startedAt: r.startedAt,
      submittedAt: r.submittedAt,
      createdAt: r.createdAt,
      excludedReason: r.excludedReason,
      excludedAt: r.excludedAt,
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
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
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
