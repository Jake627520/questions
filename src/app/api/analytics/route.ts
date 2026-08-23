export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  getCurrentUser,
  unauthorizedResponse,
  forbiddenResponse,
  getUserMembership,
  ROLES,
} from "@/lib/auth";
import { ResponseStatus } from "@prisma/client";

/**
 * GET /api/analytics
 * 企業問卷 Response Intelligence & Real-time Analytics 端點
 *
 * 核心原則：
 * 1. 100% Server-side / DB-side Aggregation，嚴禁將全量資料送往前端計算。
 * 2. 嚴格限定呼叫者所屬 Organization 邊界。
 * 3. RBAC：VIEWER, EDITOR, ADMIN, OWNER 均可查詢分析數據。
 * 4. 支援統一篩選定義：timeRange, dateFrom, dateTo, surveyId, status, minScore, maxScore。
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await getCurrentUser(req);
    if (!auth) {
      return unauthorizedResponse();
    }

    const { searchParams } = new URL(req.url);
    const requestedOrgId = searchParams.get("organizationId");
    const surveyId = searchParams.get("surveyId") || undefined;
    const timeRange = searchParams.get("timeRange") || "30d"; // "today" | "7d" | "30d" | "all" | "custom"
    const dateFromParam = searchParams.get("dateFrom");
    const dateToParam = searchParams.get("dateTo");
    const statusParam = searchParams.get("status"); // "COMPLETED" | "IN_PROGRESS" | "ALL"
    const minScoreParam = searchParams.get("minScore");
    const maxScoreParam = searchParams.get("maxScore");

    // 1. 決定目標組織 ID (優先順序：Query -> Cookie -> 使用者第一個組織)
    let organizationId = requestedOrgId;
    if (!organizationId) {
      const activeCookie = req.cookies.get("survey_active_org")?.value;
      if (activeCookie) {
        organizationId = activeCookie;
      } else {
        const firstMembership = await db.membership.findFirst({
          where: { userId: auth.user.id },
          select: { organizationId: true },
        });
        organizationId = firstMembership?.organizationId || null;
      }
    }

    if (!organizationId) {
      return NextResponse.json(
        { error: "NO_ORGANIZATION", message: "使用者尚未加入任何組織" },
        { status: 400 }
      );
    }

    // 2. 驗證呼叫者在該組織的 Membership (租戶隔離與 RBAC Guard)
    const membership = await getUserMembership(auth.user.id, organizationId);
    if (!membership) {
      return forbiddenResponse("您非該組織成員，無權存取該組織的統計分析資料");
    }

    // 3. 若指定 surveyId，驗證該問卷確實屬於此組織 (IDOR 防護)
    if (surveyId) {
      const surveyCheck = await db.survey.findUnique({
        where: { id: surveyId },
        select: { id: true, organizationId: true },
      });
      if (!surveyCheck || surveyCheck.organizationId !== organizationId) {
        return NextResponse.json(
          { error: "NOT_FOUND", message: "找不到該問卷或問卷不屬於當前組織" },
          { status: 404 }
        );
      }
    }

    // 4. 計算時間範圍邊界
    const now = new Date();
    let startDate: Date | undefined;
    let endDate: Date | undefined;

    if (timeRange === "today") {
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    } else if (timeRange === "7d") {
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      startDate.setHours(0, 0, 0, 0);
    } else if (timeRange === "30d") {
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      startDate.setHours(0, 0, 0, 0);
    } else if (timeRange === "custom" && dateFromParam) {
      startDate = new Date(dateFromParam);
      if (dateToParam) {
        endDate = new Date(dateToParam);
        endDate.setHours(23, 59, 59, 999);
      }
    }

    // 5. 組合 DB-side 查詢條件 (全量限定於 organizationId)
    const baseWhere: any = {
      survey: {
        organizationId: organizationId,
      },
    };

    if (surveyId) {
      baseWhere.surveyId = surveyId;
    }

    if (statusParam && statusParam !== "ALL") {
      if (statusParam === "COMPLETED") {
        baseWhere.status = ResponseStatus.COMPLETED;
      } else if (statusParam === "IN_PROGRESS") {
        baseWhere.status = ResponseStatus.IN_PROGRESS;
      }
    }

    if (minScoreParam || maxScoreParam) {
      baseWhere.totalScore = {};
      if (minScoreParam) baseWhere.totalScore.gte = parseFloat(minScoreParam);
      if (maxScoreParam) baseWhere.totalScore.lte = parseFloat(maxScoreParam);
    }

    const timeFilteredWhere: any = {
      ...baseWhere,
    };

    if (startDate || endDate) {
      timeFilteredWhere.createdAt = {};
      if (startDate) timeFilteredWhere.createdAt.gte = startDate;
      if (endDate) timeFilteredWhere.createdAt.lte = endDate;
    }

    // 6. DB-Side Aggregations
    // 6.1 總計指標 (全時段與時段內)
    const [
      totalCount,
      completedCount,
      incompleteCount,
      todayCount,
      last7dCount,
      last30dCount,
      scoreAggregates,
      recentResponses,
      orgSurveys,
    ] = await Promise.all([
      // 符合篩選條件的總筆數
      db.response.count({ where: timeFilteredWhere }),
      // 完成筆數
      db.response.count({
        where: { ...timeFilteredWhere, status: ResponseStatus.COMPLETED },
      }),
      // 未完成/草稿筆數
      db.response.count({
        where: { ...timeFilteredWhere, status: ResponseStatus.IN_PROGRESS },
      }),
      // 今日新增 (Scoped to Org & Survey)
      db.response.count({
        where: {
          ...baseWhere,
          createdAt: {
            gte: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0),
          },
        },
      }),
      // 過去 7 日新增
      db.response.count({
        where: {
          ...baseWhere,
          createdAt: {
            gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
          },
        },
      }),
      // 過去 30 日新增
      db.response.count({
        where: {
          ...baseWhere,
          createdAt: {
            gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
          },
        },
      }),
      // 分數統計聚合 (Avg, Min, Max)
      db.response.aggregate({
        where: {
          ...timeFilteredWhere,
          status: ResponseStatus.COMPLETED,
          totalScore: { not: null },
        },
        _avg: { totalScore: true, percentage: true },
        _min: { totalScore: true, percentage: true },
        _max: { totalScore: true, percentage: true },
        _count: { totalScore: true },
      }),
      // 最近 15 筆作答記錄
      db.response.findMany({
        where: timeFilteredWhere,
        orderBy: { createdAt: "desc" },
        take: 15,
        select: {
          id: true,
          version: true,
          status: true,
          totalScore: true,
          maxScore: true,
          percentage: true,
          submittedAt: true,
          createdAt: true,
          survey: {
            select: {
              id: true,
              title: true,
              version: true,
            },
          },
        },
      }),
      // 組織內問卷清單 (供前端篩選下拉選單使用)
      db.survey.findMany({
        where: { organizationId },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          title: true,
          version: true,
          status: true,
        },
      }),
    ]);

    // 7. 分數分佈分桶 (Score Distribution Bucketing)
    // 僅查詢有分數之完成記錄總量 (限定 1000 筆上限進行精確分桶)
    const scoredResponses = await db.response.findMany({
      where: {
        ...timeFilteredWhere,
        status: ResponseStatus.COMPLETED,
        totalScore: { not: null },
      },
      select: { totalScore: true, percentage: true },
      take: 1000,
    });

    const scoreBuckets = {
      "0-20%": 0,
      "21-40%": 0,
      "41-60%": 0,
      "61-80%": 0,
      "81-100%": 0,
    };

    const scoresList: number[] = [];
    for (const r of scoredResponses) {
      if (r.percentage !== null && r.percentage !== undefined) {
        scoresList.push(r.percentage);
        if (r.percentage <= 20) scoreBuckets["0-20%"]++;
        else if (r.percentage <= 40) scoreBuckets["21-40%"]++;
        else if (r.percentage <= 60) scoreBuckets["41-60%"]++;
        else if (r.percentage <= 80) scoreBuckets["61-80%"]++;
        else scoreBuckets["81-100%"]++;
      } else if (r.totalScore !== null && r.totalScore !== undefined) {
        scoresList.push(r.totalScore);
      }
    }

    // 計算 Median Score
    scoresList.sort((a, b) => a - b);
    let medianScore: number | null = null;
    if (scoresList.length > 0) {
      const mid = Math.floor(scoresList.length / 2);
      medianScore =
        scoresList.length % 2 !== 0
          ? scoresList[mid]
          : (scoresList[mid - 1] + scoresList[mid]) / 2;
    }

    // 8. 每日趨勢聚合 (Daily Response Timeline)
    // 依據目前時間範圍聚合每天的總填答與完成數
    const timelineResponses = await db.response.findMany({
      where: timeFilteredWhere,
      select: { createdAt: true, status: true },
      orderBy: { createdAt: "asc" },
      take: 2000,
    });

    const dailyMap = new Map<string, { date: string; total: number; completed: number }>();
    for (const r of timelineResponses) {
      const dateKey = r.createdAt.toISOString().slice(0, 10);
      const existing = dailyMap.get(dateKey) || { date: dateKey, total: 0, completed: 0 };
      existing.total++;
      if (r.status === ResponseStatus.COMPLETED) {
        existing.completed++;
      }
      dailyMap.set(dateKey, existing);
    }
    const timeline = Array.from(dailyMap.values());

    const completionRate = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

    return NextResponse.json({
      success: true,
      organizationId,
      currentUserRole: membership.role,
      filter: {
        timeRange,
        dateFrom: startDate ? startDate.toISOString() : null,
        dateTo: endDate ? endDate.toISOString() : null,
        surveyId: surveyId || null,
        status: statusParam || "ALL",
        minScore: minScoreParam ? parseFloat(minScoreParam) : null,
        maxScore: maxScoreParam ? parseFloat(maxScoreParam) : null,
      },
      kpis: {
        totalResponses: totalCount,
        completedResponses: completedCount,
        incompleteResponses: incompleteCount,
        completionRate: Math.round(completionRate * 10) / 10,
        responsesToday: todayCount,
        responsesLast7Days: last7dCount,
        responsesLast30Days: last30dCount,
      },
      funnel: {
        started: totalCount,
        completed: completedCount,
        incomplete: incompleteCount,
        completionRate: Math.round(completionRate * 10) / 10,
      },
      scores: {
        scoredCount: scoreAggregates._count.totalScore,
        avgScore: scoreAggregates._avg.totalScore !== null
          ? Math.round(scoreAggregates._avg.totalScore * 10) / 10
          : null,
        avgPercentage: scoreAggregates._avg.percentage !== null
          ? Math.round(scoreAggregates._avg.percentage * 10) / 10
          : null,
        minScore: scoreAggregates._min.totalScore,
        maxScore: scoreAggregates._max.totalScore,
        medianScore: medianScore !== null ? Math.round(medianScore * 10) / 10 : null,
        distribution: scoreBuckets,
      },
      timeline,
      recentResponses: recentResponses.map((r) => ({
        id: r.id,
        surveyId: r.survey.id,
        surveyTitle: r.survey.title,
        version: r.version,
        status: r.status,
        totalScore: r.totalScore,
        maxScore: r.maxScore,
        percentage: r.percentage,
        submittedAt: r.submittedAt,
        createdAt: r.createdAt,
      })),
      surveys: orgSurveys,
    });
  } catch (error: any) {
    console.error("Analytics aggregation error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "計算統計分析指標失敗" },
      { status: 500 }
    );
  }
}
