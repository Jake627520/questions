export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  getCurrentUser,
  unauthorizedResponse,
  forbiddenResponse,
  getUserMembership,
  hasRole,
  ROLES,
} from "@/lib/auth";
import { generateSurveyExportExcel } from "@/lib/excel-parser";
import { ResponseStatus } from "@prisma/client";

/**
 * GET /api/analytics/export
 * 依據 Analytics 相同的篩選定義匯出 Excel 報表
 *
 * 權限規則：
 * 1. 呼叫者必須具備有效 Session。
 * 2. RBAC：僅 OWNER, ADMIN, EDITOR 允許匯出 (VIEWER 回傳 403 Forbidden)。
 * 3. 跨租戶隔離：僅能匯出當前組織之資料。
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
    const timeRange = searchParams.get("timeRange") || "30d";
    const dateFromParam = searchParams.get("dateFrom");
    const dateToParam = searchParams.get("dateTo");
    const statusParam = searchParams.get("status");
    const minScoreParam = searchParams.get("minScore");
    const maxScoreParam = searchParams.get("maxScore");

    // 1. 決定目標組織 ID
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

    // 2. 驗證呼叫者在該組織的 Membership & RBAC 匯出權限 (限定 EDITOR 以上)
    const { allowed, membership } = await hasRole(auth.user.id, organizationId, ROLES.EDITORS);
    if (!membership) {
      return forbiddenResponse("您非該組織成員，無權匯出統計報表");
    }
    if (!allowed) {
      return forbiddenResponse("您的角色權限不足，唯讀檢視者 (VIEWER) 無法匯出資料報表");
    }

    // 3. 若指定 surveyId，驗證該問卷確實屬於此組織
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

    // 4. 計算時間範圍邊界 (與 Analytics API 100% 一致)
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

    // 5. 組合 DB-side 查詢條件
    const whereCondition: any = {
      survey: {
        organizationId: organizationId,
      },
    };

    if (surveyId) {
      whereCondition.surveyId = surveyId;
    }

    if (statusParam && statusParam !== "ALL") {
      if (statusParam === "COMPLETED") {
        whereCondition.status = ResponseStatus.COMPLETED;
      } else if (statusParam === "IN_PROGRESS") {
        whereCondition.status = ResponseStatus.IN_PROGRESS;
      }
    }

    if (minScoreParam || maxScoreParam) {
      whereCondition.totalScore = {};
      if (minScoreParam) whereCondition.totalScore.gte = parseFloat(minScoreParam);
      if (maxScoreParam) whereCondition.totalScore.lte = parseFloat(maxScoreParam);
    }

    if (startDate || endDate) {
      whereCondition.createdAt = {};
      if (startDate) whereCondition.createdAt.gte = startDate;
      if (endDate) whereCondition.createdAt.lte = endDate;
    }

    // 6. 查詢符合條件之問卷與填答資料
    // 若為單一問卷，取得題目定義以完整產生題目欄位
    let targetSurvey: any = null;
    if (surveyId) {
      targetSurvey = await db.survey.findUnique({
        where: { id: surveyId },
        include: {
          questions: {
            orderBy: { orderNum: "asc" },
            include: { choices: { orderBy: { orderNum: "asc" } } },
          },
        },
      });
    }

    const responses = await db.response.findMany({
      where: whereCondition,
      orderBy: { createdAt: "desc" },
      take: 5000,
      include: {
        survey: {
          select: { id: true, title: true, version: true },
        },
        answers: {
          include: { question: true },
        },
      },
    });

    const exportQuestions = targetSurvey
      ? targetSurvey.questions.map((q: any) => ({
          orderNum: q.orderNum,
          code: q.code,
          title: q.title,
          description: q.description,
          questionType: q.questionType,
          required: q.required,
          scoringEnabled: q.scoringEnabled,
          reverseScore: q.reverseScore,
          visibilityRules: q.visibilityRules,
          minSelections: q.minSelections,
          maxSelections: q.maxSelections,
          minValue: q.minValue,
          maxValue: q.maxValue,
          choices: q.choices.map((c: any) => ({
            orderNum: c.orderNum,
            label: c.label,
            value: c.value,
            scoreEnabled: c.scoreEnabled,
            score: c.score,
            isOther: c.isOther,
            requiresText: c.requiresText,
            isNoneOfAbove: c.isNoneOfAbove,
          })),
        }))
      : [];

    const exportResponses = responses.map((r) => ({
      id: r.id,
      version: r.version,
      submittedAt: r.submittedAt,
      totalScore: r.totalScore,
      maxScore: r.maxScore,
      percentage: r.percentage,
      answers: r.answers.map((a) => {
        let parsedVal: any = null;
        try {
          parsedVal = JSON.parse(a.rawValue);
        } catch {
          parsedVal = a.rawValue;
        }
        return {
          questionCode: a.question?.code || a.questionId,
          rawValue: parsedVal,
          otherText: a.otherText,
          score: a.score,
        };
      }),
    }));

    const buffer = await generateSurveyExportExcel({
      survey: {
        title: targetSurvey ? targetSurvey.title : "Workspace_Responses_Analytics",
        description: `Exported with filter timeRange=${timeRange}`,
        version: targetSurvey ? targetSurvey.version : 1,
      },
      questions: exportQuestions,
      responses: exportResponses,
    });

    const filename = `analytics_export_${new Date().toISOString().slice(0, 10)}.xlsx`;

    return new NextResponse(buffer as any, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      },
    });
  } catch (error: any) {
    console.error("Analytics export error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "匯出分析資料失敗" },
      { status: 500 }
    );
  }
}
