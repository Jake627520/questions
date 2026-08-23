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
import { sanitizeCrosstabMatrix } from "@/lib/crosstab-privacy";

/**
 * GET /api/surveys/[id]/analytics/crosstab
 * 2-Way 交叉分析與分群聚合矩陣端點 (Cross-tabulation & Demographic Segmentation Matrix)
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

    // 1. 禁止 3-Way 或多維交叉查詢
    const allQueryKeys = Array.from(searchParams.keys());
    const questionParamKeys = allQueryKeys.filter(
      (k) =>
        k.toLowerCase().startsWith("question") ||
        k.toLowerCase().startsWith("dim")
    );
    if (questionParamKeys.length > 2) {
      return NextResponse.json(
        {
          error: "INVALID_DIMENSIONS",
          message: "目前僅支援 2-Way 雙題目交叉分析，禁止多維度深度分群。",
        },
        { status: 400 }
      );
    }

    const questionAId = searchParams.get("questionA");
    const questionBId = searchParams.get("questionB");

    if (!questionAId || !questionBId) {
      return NextResponse.json(
        {
          error: "MISSING_DIMENSIONS",
          message: "請指定分組題目 questionA 與目標題目 questionB。",
        },
        { status: 400 }
      );
    }

    if (questionAId === questionBId) {
      return NextResponse.json(
        {
          error: "SAME_DIMENSION",
          message: "分組題目與目標題目不得為同一題目。",
        },
        { status: 400 }
      );
    }

    const timeRange = searchParams.get("timeRange") || "all";
    const dateFromParam = searchParams.get("dateFrom");
    const dateToParam = searchParams.get("dateTo");
    const statusParam = searchParams.get("status") || "ALL";

    // 2. 查詢問卷與兩題目結構
    const survey = await db.survey.findUnique({
      where: { id },
      include: {
        questions: {
          where: {
            id: { in: [questionAId, questionBId] },
          },
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

    // 3. 驗證多租戶隔離與 Membership
    const membership = await getUserMembership(auth.user.id, survey.organizationId);
    if (!membership) {
      return forbiddenResponse("您非該組織成員，無權查看此問卷的交叉分析");
    }

    // 4. 驗證兩題目皆屬於該 Survey
    const qA = survey.questions.find((q) => q.id === questionAId);
    const qB = survey.questions.find((q) => q.id === questionBId);

    if (!qA || !qB) {
      return NextResponse.json(
        { error: "INVALID_QUESTIONS", message: "指定之題目不存在或不屬於此問卷。" },
        { status: 400 }
      );
    }

    // 5. 處理時間範圍篩選
    const now = new Date();
    let startDate: Date | undefined;
    let endDate: Date | undefined;

    if (timeRange === "today") {
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
      endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    } else if (timeRange === "7d") {
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else if (timeRange === "30d") {
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    } else if (timeRange === "custom") {
      if (dateFromParam) startDate = new Date(dateFromParam);
      if (dateToParam) endDate = new Date(dateToParam);
    }

    const whereResponse: any = {
      surveyId: survey.id,
    };
    if (statusParam === "COMPLETED") {
      whereResponse.status = ResponseStatus.COMPLETED;
    } else if (statusParam === "IN_PROGRESS") {
      whereResponse.status = ResponseStatus.IN_PROGRESS;
    }
    if (startDate || endDate) {
      whereResponse.createdAt = {};
      if (startDate) whereResponse.createdAt.gte = startDate;
      if (endDate) whereResponse.createdAt.lte = endDate;
    }

    // 6. 查詢總 Responses 與這兩題的所有 Answers
    const responses = await db.response.findMany({
      where: whereResponse,
      select: {
        id: true,
        answers: {
          where: {
            questionId: { in: [qA.id, qB.id] },
          },
          select: {
            questionId: true,
            rawValue: true,
          },
        },
      },
    });

    const totalSurveyResponses = responses.length;

    // 7. 解析作答資料並計算交叉矩陣
    const parseAnswerValues = (rawValue: string): string[] => {
      if (!rawValue || rawValue.trim() === "") return [];
      try {
        const parsed = JSON.parse(rawValue);
        if (Array.isArray(parsed)) return parsed.map((x) => String(x).trim()).filter(Boolean);
        if (parsed !== null && parsed !== undefined && String(parsed).trim() !== "")
          return [String(parsed).trim()];
      } catch {
        const trimmed = rawValue.trim();
        if (trimmed !== "" && trimmed !== "null") return [trimmed];
      }
      return [];
    };

    const getChoiceIdForVal = (q: typeof qA, val: string): string | null => {
      const match = q.choices.find((c) => c.value === val || c.id === val || c.label === val);
      return match ? match.id : null;
    };

    const rawMatrix: Record<string, Record<string, number>> = {};
    const rowTotals: Record<string, number> = {};
    const colTotals: Record<string, number> = {};

    let bothAnsweredCount = 0;
    let qAAnsweredCount = 0;
    let qBAnsweredCount = 0;

    for (const resp of responses) {
      const ansA = resp.answers.find((a) => a.questionId === qA.id);
      const ansB = resp.answers.find((a) => a.questionId === qB.id);

      const valsA = ansA ? parseAnswerValues(ansA.rawValue) : [];
      const valsB = ansB ? parseAnswerValues(ansB.rawValue) : [];

      const hasA = valsA.length > 0;
      const hasB = valsB.length > 0;

      if (hasA) qAAnsweredCount++;
      if (hasB) qBAnsweredCount++;

      if (hasA && hasB) {
        bothAnsweredCount++;

        const choiceIdsA =
          qA.choices.length > 0
            ? (valsA.map((v) => getChoiceIdForVal(qA, v)).filter(Boolean) as string[])
            : ["val"];

        const choiceIdsB =
          qB.choices.length > 0
            ? (valsB.map((v) => getChoiceIdForVal(qB, v)).filter(Boolean) as string[])
            : ["val"];

        for (const cidA of choiceIdsA) {
          rowTotals[cidA] = (rowTotals[cidA] || 0) + 1;
          if (!rawMatrix[cidA]) rawMatrix[cidA] = {};

          for (const cidB of choiceIdsB) {
            rawMatrix[cidA][cidB] = (rawMatrix[cidA][cidB] || 0) + 1;
          }
        }

        for (const cidB of choiceIdsB) {
          colTotals[cidB] = (colTotals[cidB] || 0) + 1;
        }
      }
    }

    // 8. 執行嚴格伺服端隱私遮蔽與差額保護
    const sanitizedResult = sanitizeCrosstabMatrix({
      surveyId: survey.id,
      surveyTitle: survey.title,
      isAnonymous: survey.isAnonymous,
      qA,
      qB,
      rawMatrix,
      rowTotals,
      colTotals,
      totalSurveyResponses,
      bothAnsweredCount,
      qAAnsweredCount,
      qBAnsweredCount,
    });

    return NextResponse.json(sanitizedResult);
  } catch (error: any) {
    console.error("[Crosstab Analytics Error]:", error);
    return NextResponse.json(
      { error: "INTERNAL_SERVER_ERROR", message: "交叉分析計算發生例外錯誤" },
      { status: 500 }
    );
  }
}
