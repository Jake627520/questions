export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, getUserMembership, unauthorizedResponse, forbiddenResponse } from "@/lib/auth";
import { ResponseStatus } from "@prisma/client";
import { analyzeSurveyQuestions } from "@/lib/analytics";
import {
  calculateExecutiveKPIs,
  generateAutomatedInsights,
  aggregateResponseTimeline,
} from "@/lib/dashboard-intelligence";

interface RouteParams {
  params: {
    id: string;
  };
}

/**
 * GET /api/surveys/[id]/analytics/dashboard
 * 取得問卷 Executive Dashboard Intelligence DTO (Phase M10-C)
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const auth = await getCurrentUser(req);
    if (!auth) {
      return unauthorizedResponse("請先登入以檢視儀表板");
    }

    const { id } = params;
    const { searchParams } = new URL(req.url);
    const timeRange = searchParams.get("timeRange") || "30d";
    const dateFromParam = searchParams.get("dateFrom");
    const dateToParam = searchParams.get("dateTo");

    // 1. 查詢問卷基本資訊與組織
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

    // 2. 驗證多租戶隔離與 Membership (Viewer 具備唯讀權限)
    const membership = await getUserMembership(auth.user.id, survey.organizationId);
    if (!membership) {
      return forbiddenResponse("您非該組織成員，無權查看此問卷的分析儀表板");
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

    // 4. 統計總體數量 (僅讀取 COMPLETED 進入分析，同時統計 IN_PROGRESS 用於計算流失率)
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
              choices: {
                select: {
                  choiceId: true,
                },
              },
            },
          },
        },
        orderBy: { submittedAt: "asc" },
      }),
    ]);

    const totalTrackedResponses = completedCount + inProgressCount;

    // 計算平均耗時與平均分數
    let totalDuration = 0;
    let durationCount = 0;
    let totalScoreSum = 0;
    let scoreCount = 0;
    const timestamps: Date[] = [];

    for (const r of completedResponses) {
      if (r.durationSeconds !== null && r.durationSeconds !== undefined) {
        totalDuration += r.durationSeconds;
        durationCount++;
      }
      if (r.totalScore !== null && r.totalScore !== undefined) {
        totalScoreSum += r.totalScore;
        scoreCount++;
      }
      if (r.submittedAt) {
        timestamps.push(r.submittedAt);
      }
    }

    const avgDuration = durationCount > 0 ? Math.round(totalDuration / durationCount) : null;
    const avgScore = scoreCount > 0 ? totalScoreSum / scoreCount : null;

    // 5. 計算高階主管 KPI
    const kpis = calculateExecutiveKPIs({
      totalResponses: totalTrackedResponses,
      completedResponses: completedCount,
      inProgressResponses: inProgressCount,
      averageDurationSeconds: avgDuration,
      averageScore: avgScore,
    });

    // 6. 聚合時間趨勢線
    const daysWindow = timeRange === "7d" ? 7 : timeRange === "today" ? 1 : 30;
    const timeline = aggregateResponseTimeline(timestamps, daysWindow);

    // 7. 透過既有純函數 Analytics Engine 分析題目分佈
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

    // 8. 產生自動化洞察 (純消費 DTO)
    const insights = generateAutomatedInsights({
      questionAnalytics: questionsDto,
      completionRate: kpis.completionRate,
    });

    return NextResponse.json({
      survey: {
        id: survey.id,
        title: survey.title,
        version: survey.version,
        status: survey.status,
        organizationId: survey.organizationId,
      },
      kpis,
      timeline,
      insights,
      questionAnalyticsSummary: {
        totalQuestions: survey.questions.length,
        analyzedQuestionsCount: questionsDto.length,
      },
      filter: {
        timeRange,
        dateFrom: dateFromParam,
        dateTo: dateToParam,
      },
    });
  } catch (error: any) {
    console.error("[Dashboard Analytics Error]:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "分析儀表板載入失敗，請稍後重試" },
      { status: 500 }
    );
  }
}
