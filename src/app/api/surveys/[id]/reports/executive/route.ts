export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, getUserMembership, unauthorizedResponse, forbiddenResponse } from "@/lib/auth";
import { ResponseStatus } from "@prisma/client";
import { analyzeSurveyQuestions } from "@/lib/analytics";
import {
  calculateExecutiveKPIs,
  generateAutomatedInsights,
} from "@/lib/dashboard-intelligence";
import { generateExecutiveReportDTO } from "@/lib/report-engine";

interface RouteParams {
  params: {
    id: string;
  };
}

/**
 * GET /api/surveys/[id]/reports/executive
 * 取得高階主管摘要報告 DTO (Phase M10-D)
 * 權限：VIEWER 以上皆可檢視 (Viewer Read-Only)
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const auth = await getCurrentUser(req);
    if (!auth) {
      return unauthorizedResponse("請先登入以檢視報告");
    }

    const { id } = params;
    const { searchParams } = new URL(req.url);
    const timeRange = searchParams.get("timeRange") || "all";
    const dateFromParam = searchParams.get("dateFrom");
    const dateToParam = searchParams.get("dateTo");
    const statusParam = searchParams.get("status") || "COMPLETED";

    // 1. 查詢問卷基本資訊
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
      return NextResponse.json(
        { error: "NOT_FOUND", message: "找不到該問卷" },
        { status: 404 }
      );
    }

    // 2. 驗證 Membership 與租戶隔離 (VIEWER 以上皆可查閱)
    const membership = await getUserMembership(auth.user.id, survey.organizationId);
    if (!membership) {
      return forbiddenResponse("您非該組織成員，無權查看此問卷的高階主管報告");
    }

    // 3. 建構時間過濾條件
    let dateFilter: { gte?: Date; lte?: Date } | undefined = undefined;
    const now = new Date();

    if (timeRange === "today") {
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      dateFilter = { gte: todayStart };
    } else if (timeRange === "7d") {
      dateFilter = { gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) };
    } else if (timeRange === "30d") {
      dateFilter = { gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) };
    } else if (timeRange === "custom" && (dateFromParam || dateToParam)) {
      dateFilter = {};
      if (dateFromParam) dateFilter.gte = new Date(dateFromParam);
      if (dateToParam) {
        const toDate = new Date(dateToParam);
        toDate.setHours(23, 59, 59, 999);
        dateFilter.lte = toDate;
      }
    }

    // 4. 統計填答數 (Analytics 讀取邊界嚴格以 COMPLETED 進行)
    const [completedCount, inProgressCount, completedResponses] = await Promise.all([
      db.response.count({
        where: {
          surveyId: id,
          status: ResponseStatus.COMPLETED,
          ...(dateFilter ? { submittedAt: dateFilter } : {}),
        },
      }),
      db.response.count({
        where: {
          surveyId: id,
          status: ResponseStatus.IN_PROGRESS,
          ...(dateFilter ? { createdAt: dateFilter } : {}),
        },
      }),
      db.response.findMany({
        where: {
          surveyId: id,
          status: ResponseStatus.COMPLETED,
          ...(dateFilter ? { submittedAt: dateFilter } : {}),
        },
        select: {
          id: true,
          durationSeconds: true,
          totalScore: true,
          submittedAt: true,
          answers: {
            select: {
              questionId: true,
              rawValue: true,
              score: true,
            },
          },
        },
        orderBy: { submittedAt: "asc" },
      }),
    ]);

    const totalTracked = completedCount + inProgressCount;
    let totalDuration = 0;
    let durationCount = 0;
    let totalScore = 0;
    let scoreCount = 0;

    for (const r of completedResponses) {
      if (r.durationSeconds !== null && r.durationSeconds !== undefined) {
        totalDuration += r.durationSeconds;
        durationCount++;
      }
      if (r.totalScore !== null && r.totalScore !== undefined) {
        totalScore += r.totalScore;
        scoreCount++;
      }
    }

    const avgDuration = durationCount > 0 ? Math.round(totalDuration / durationCount) : null;
    const avgScore = scoreCount > 0 ? totalScore / scoreCount : null;

    const kpis = calculateExecutiveKPIs({
      totalResponses: totalTracked,
      completedResponses: completedCount,
      inProgressResponses: inProgressCount,
      averageDurationSeconds: avgDuration,
      averageScore: avgScore,
    });

    // 5. 透過既有純函數分析引擎產出 Question Analytics DTO
    const questionsDto = analyzeSurveyQuestions(
      survey.questions.map((q) => ({
        id: q.id,
        code: q.code,
        orderNum: q.orderNum,
        title: q.title,
        description: q.description,
        questionType: q.questionType,
        required: q.required,
        scoringEnabled: q.scoringEnabled,
        choices: q.choices.map((c) => ({
          id: c.id,
          orderNum: c.orderNum,
          label: c.label,
          value: c.value,
          scoreEnabled: c.scoreEnabled,
          score: c.score,
        })),
      })),
      completedResponses.map((r) => ({
        id: r.id,
        status: ResponseStatus.COMPLETED,
        answers: r.answers.map((a) => ({
          questionId: a.questionId,
          rawValue: a.rawValue,
          score: a.score,
        })),
      }))
    );

    const insights = generateAutomatedInsights({
      questionAnalytics: questionsDto,
      completionRate: kpis.completionRate,
    });

    const reportDto = generateExecutiveReportDTO({
      survey: {
        id: survey.id,
        title: survey.title,
        version: survey.version,
        status: survey.status,
        organizationId: survey.organizationId,
      },
      filter: {
        timeRange,
        dateFrom: dateFromParam,
        dateTo: dateToParam,
        status: statusParam,
      },
      kpis,
      insights,
      questions: questionsDto,
    });

    return NextResponse.json(reportDto);
  } catch (error: any) {
    console.error("[Executive Report Error]:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "產生高階主管報告失敗，請稍後重試" },
      { status: 500 }
    );
  }
}
