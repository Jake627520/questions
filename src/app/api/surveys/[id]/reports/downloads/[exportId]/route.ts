export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  getCurrentUser,
  unauthorizedResponse,
  forbiddenResponse,
  hasRole,
  ROLES,
} from "@/lib/auth";
import { ResponseStatus } from "@prisma/client";
import { analyzeSurveyQuestions } from "@/lib/analytics";
import {
  calculateExecutiveKPIs,
  generateAutomatedInsights,
} from "@/lib/dashboard-intelligence";
import {
  generateExecutiveReportDTO,
  buildExecutiveWorkbook,
  buildExecutiveCsv,
} from "@/lib/report-engine";
import { isExportExpired } from "@/lib/report-governance";

interface RouteParams {
  params: {
    id: string;
    exportId: string;
  };
}

/**
 * GET /api/surveys/[id]/reports/downloads/[exportId]
 * 下載指定歷史匯出檔案 (Download-time Authorization & Expiry Check)
 * 權限要求：僅限 EDITOR, MANAGER, ADMIN, OWNER (Viewer 阻絕 403)
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const auth = await getCurrentUser(req);
    if (!auth) {
      return unauthorizedResponse("請先登入以下載報告");
    }

    const { id, exportId } = params;

    // 1. 查詢匯出審計紀錄
    const exportRecord = await db.reportExport.findUnique({
      where: { id: exportId },
      include: {
        survey: {
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
        },
      },
    });

    if (!exportRecord || exportRecord.surveyId !== id) {
      return NextResponse.json(
        { error: "NOT_FOUND", message: "找不到該匯出紀錄" },
        { status: 404 }
      );
    }

    // 2. 下載當下重新驗證 Membership 與 RBAC (Download-time Authorization)
    const { allowed, membership } = await hasRole(auth.user.id, exportRecord.organizationId, ROLES.EDITORS);
    if (!membership) {
      return forbiddenResponse("您非該組織成員，無權下載此報告");
    }
    if (!allowed) {
      return forbiddenResponse("檢視者角色 (Viewer) 無權下載匯出檔案");
    }

    // 3. 檢查產物是否已過期失效 (Retention & Expiration Guard)
    if (isExportExpired(exportRecord)) {
      return NextResponse.json(
        { error: "ARTIFACT_EXPIRED", message: "該匯出檔案已過期失效 (410 Gone)" },
        { status: 410 }
      );
    }

    // 4. 遞增下載計數 (Download Audit)
    await db.reportExport.update({
      where: { id: exportId },
      data: { downloadCount: { increment: 1 } },
    });

    // 5. 透過同一套 Sanitized Report DTO Pipeline 重新產出檔案
    const survey = exportRecord.survey;
    const timeRange = exportRecord.timeRange || "all";
    const dateFromParam = exportRecord.dateFrom;
    const dateToParam = exportRecord.dateTo;
    const statusParam = "COMPLETED";

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

    const safeTitle = survey.title.replace(/[/\\?%*:|"<>]/g, "_");
    const dateStamp = exportRecord.createdAt.toISOString().split("T")[0];

    if (exportRecord.format === "csv") {
      const csvContent = buildExecutiveCsv(reportDto);
      return new NextResponse(csvContent, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${encodeURIComponent(safeTitle)}_Executive_Report_${dateStamp}.csv"`,
          "X-Export-Id": exportRecord.id,
          "X-Download-Count": String(exportRecord.downloadCount + 1),
        },
      });
    }

    const workbook = await buildExecutiveWorkbook(reportDto);
    const buffer = await workbook.xlsx.writeBuffer();

    return new NextResponse(buffer as any, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(safeTitle)}_Executive_Report_${dateStamp}.xlsx"`,
        "X-Export-Id": exportRecord.id,
        "X-Download-Count": String(exportRecord.downloadCount + 1),
      },
    });
  } catch (error: any) {
    console.error("[Report Download Error]:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "下載報告失敗，請稍後重試" },
      { status: 500 }
    );
  }
}
