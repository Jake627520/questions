export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ResponseStatus } from "@prisma/client";
import {
  getCurrentUser,
  unauthorizedResponse,
  forbiddenResponse,
  getUserMembership,
} from "@/lib/auth";
import { analyzeSurveyQuestions } from "@/lib/analytics";

/**
 * GET /api/surveys/[id]/analytics/questions
 * 題目層級作答分析與統計指標端點 (Question-level Analytics & Item Statistics)
 *
 * 核心規範：
 * 1. 100% Deterministic Server-side / DB-side 統計計算。
 * 2. 嚴格租戶邊界：survey.organizationId -> Membership -> Role (VIEWER 以上皆可查閱)。
 * 3. 清楚區分 answeredCount, notAnsweredCount 與 responseRate。
 * 4. 選項分佈百分比分母明確為 answeredCount。
 * 5. 評分題標準差採用樣本標準差 (Sample SD)，N < 2 時嚴格回傳 null。
 * 6. 文字題僅回傳作答統計，零假造 NLP / AI 數據。
 */
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
    const dateFromParam = searchParams.get("dateFrom");
    const dateToParam = searchParams.get("dateTo");
    const statusParam = searchParams.get("status") || "ALL"; // "COMPLETED" | "IN_PROGRESS" | "ALL"

    // 1. 查詢問卷基本資訊與題目結構
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

    // 2. 驗證呼叫者在該組織的 Membership (多租戶邊界)
    const membership = await getUserMembership(auth.user.id, survey.organizationId);
    if (!membership) {
      return forbiddenResponse("您非該組織成員，無權查看此問卷的題目作答統計");
    }

    // 3. 處理時間範圍邊界
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

    // 4. 組合 Response 查詢條件
    const responseWhere: any = {
      surveyId: id,
    };

    if (statusParam === "COMPLETED") {
      responseWhere.status = ResponseStatus.COMPLETED;
    } else if (statusParam === "IN_PROGRESS") {
      responseWhere.status = ResponseStatus.IN_PROGRESS;
    }

    if (startDate || endDate) {
      responseWhere.createdAt = {};
      if (startDate) responseWhere.createdAt.gte = startDate;
      if (endDate) responseWhere.createdAt.lte = endDate;
    }

    // 5. 取得符合條件之 Responses 與其 Answers
    const responses = await db.response.findMany({
      where: responseWhere,
      select: {
        id: true,
        status: true,
        answers: {
          select: {
            questionId: true,
            rawValue: true,
            score: true,
          },
        },
      },
    });

    const totalResponses = responses.length;
    const completedResponses = responses.filter((r) => r.status === ResponseStatus.COMPLETED).length;
    const inProgressResponses = responses.filter((r) => r.status === ResponseStatus.IN_PROGRESS).length;

    // 6. 透過純函數分析引擎計算題目指標
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
      responses
    );

    return NextResponse.json({
      success: true,
      survey: {
        id: survey.id,
        title: survey.title,
        version: survey.version,
        organizationId: survey.organizationId,
      },
      filter: {
        timeRange,
        dateFrom: startDate ? startDate.toISOString() : null,
        dateTo: endDate ? endDate.toISOString() : null,
        status: statusParam,
      },
      summary: {
        totalResponses,
        completedResponses,
        inProgressResponses,
        questionCount: survey.questions.length,
      },
      questions: questionAnalytics,
    });
  } catch (error: any) {
    console.error("Question analytics error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "計算題目層級統計分析失敗" },
      { status: 500 }
    );
  }
}
