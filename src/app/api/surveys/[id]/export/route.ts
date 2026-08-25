export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { generateSurveyExportExcel } from "@/lib/excel-parser";
import { ResponseStatus } from "@prisma/client";
import {
  getCurrentUser,
  unauthorizedResponse,
  forbiddenResponse,
  hasRole,
  ROLES,
} from "@/lib/auth";
import { analyzeSurveyQuestions } from "@/lib/analytics";

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
    const { searchParams } = new URL(req.url);
    const timeRange = searchParams.get("timeRange") || "all";
    const statusParam = searchParams.get("status") || searchParams.get("statusFilter") || "ALL"; // "ALL" | "COMPLETED" | "IN_PROGRESS"
    const dateFromParam = searchParams.get("dateFrom");
    const dateToParam = searchParams.get("dateTo");

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
      return NextResponse.json({ error: "找不到該問卷" }, { status: 404 });
    }

    const { allowed, membership } = await hasRole(auth.user.id, survey.organizationId, ROLES.EDITORS);
    if (!membership) {
      return forbiddenResponse("您非該組織成員，無權匯出此問卷的統計與填答報表");
    }
    if (!allowed) {
      return forbiddenResponse("您的角色權限不足，需要 EDITOR 以上權限才能匯出報表");
    }

    // 處理時間範圍過濾條件
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

    const normalizedStatus = statusParam?.toUpperCase();
    const responseWhere: any = {
      surveyId: id,
    };

    if (normalizedStatus === "IN_PROGRESS") {
      responseWhere.status = ResponseStatus.IN_PROGRESS;
    } else if (normalizedStatus === "EXCLUDED") {
      responseWhere.status = ResponseStatus.EXCLUDED;
    } else if (normalizedStatus === "ALL") {
      // 顯示全部作答
    } else {
      // 預設嚴格僅匯出正式有效作答 (排除草稿與 EXCLUDED 標記資料)
      responseWhere.status = ResponseStatus.COMPLETED;
    }

    if (startDate || endDate) {
      responseWhere.createdAt = {};
      if (startDate) responseWhere.createdAt.gte = startDate;
      if (endDate) responseWhere.createdAt.lte = endDate;
    }

    const responses = await db.response.findMany({
      where: responseWhere,
      orderBy: { submittedAt: "desc" },
      include: {
        answers: {
          include: {
            question: true,
          },
        },
      },
    });

    const exportQuestions = survey.questions.map((q) => ({
      orderNum: q.orderNum,
      code: q.code,
      title: q.title,
      description: q.description,
      questionType: q.questionType as any,
      required: q.required,
      scoringEnabled: q.scoringEnabled,
      reverseScore: q.reverseScore,
      visibilityRules: q.visibilityRules,
      minSelections: q.minSelections,
      maxSelections: q.maxSelections,
      minValue: q.minValue,
      maxValue: q.maxValue,
      choices: q.choices.map((c) => ({
        orderNum: c.orderNum,
        label: c.label,
        value: c.value,
        scoreEnabled: c.scoreEnabled,
        score: c.score,
        isOther: c.isOther,
        requiresText: c.requiresText,
        isNoneOfAbove: c.isNoneOfAbove,
      })),
    }));

    const exportResponses = responses.map((r) => ({
      id: r.id,
      status: r.status,
      version: r.version,
      submittedAt: r.submittedAt,
      createdAt: r.createdAt,
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
          questionCode: a.question.code,
          questionTitle: a.question.title,
          rawValue: parsedVal,
          otherText: a.otherText,
          score: a.score,
        };
      }),
    }));

    // 使用純函數統計引擎計算 Question Summary
    const questionAnalytics = analyzeSurveyQuestions(
      survey.questions.map((q) => ({
        id: q.id,
        code: q.code,
        orderNum: q.orderNum,
        title: q.title,
        description: q.description,
        questionType: q.questionType,
        required: q.required,
        scoringEnabled: q.scoringEnabled,
        reverseScore: q.reverseScore,
        choices: q.choices.map((c) => ({
          id: c.id,
          orderNum: c.orderNum,
          label: c.label,
          value: c.value,
          scoreEnabled: c.scoreEnabled,
          score: c.score,
        })),
      })),
      responses.map((r) => ({
        id: r.id,
        status: r.status,
        answers: r.answers.map((a) => ({
          questionId: a.questionId,
          rawValue: a.rawValue,
          score: a.score,
        })),
      }))
    );

    const totalResponses = responses.length;
    const completedResponses = responses.filter((r) => r.status === ResponseStatus.COMPLETED).length;
    const inProgressResponses = responses.filter((r) => r.status === ResponseStatus.IN_PROGRESS).length;

    const buffer = await generateSurveyExportExcel({
      survey: {
        title: survey.title,
        description: survey.description,
        version: survey.version,
      },
      filterMeta: {
        status: statusParam,
        timeRange,
        dateFrom: startDate ? startDate.toISOString().slice(0, 10) : null,
        dateTo: endDate ? endDate.toISOString().slice(0, 10) : null,
        exportedBy: auth.user.name ? `${auth.user.name} (${auth.user.email})` : auth.user.email,
        totalResponses,
        completedResponses,
        inProgressResponses,
      },
      questions: exportQuestions,
      questionSummaries: questionAnalytics,
      responses: exportResponses,
    });

    const sanitizedTitle = survey.title.replace(/[\s/\\?%*:|"<>]/g, "_");
    const filename = `survey_export_${sanitizedTitle}_v${survey.version}_${statusParam}_${timeRange}_${new Date().toISOString().slice(0, 10)}.xlsx`;

    return new NextResponse(buffer as any, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      },
    });
  } catch (error: any) {
    console.error("Error exporting survey to Excel:", error);
    return NextResponse.json(
      { error: "匯出 Excel 失敗", details: error.message },
      { status: 500 }
    );
  }
}
