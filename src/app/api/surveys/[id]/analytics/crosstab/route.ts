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
import {
  analyzeCrossTabulation,
  analyzeCrossTabStatistics,
  applyCrossTabPrivacy,
  QuestionMeta,
  CrossTabStatistics,
} from "@/lib/analytics";

/**
 * GET /api/surveys/[id]/analytics/crosstab
 * Phase M9-F.4: 2-Way 交叉分析 API 端點與租戶/RBAC 邊界控制
 *
 * 核心規範：
 * 1. 完整認證與 RBAC：未登入 401、跨組織 403、不存在 404。
 * 2. 多租戶隔離：題目必須屬於該問卷，拒絕跨問卷 IDOR 探測。
 * 3. 乾淨純函數管線：DB 篩選 -> F.1 交叉聚合 -> F.2 統計檢定 -> F.3 隱私遮蔽 -> API DTO。
 * 4. 嚴格伺服端隱私防護：minCellSize 強制 >= 5，不洩漏任何個體作答 ID 或原始資料。
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
        k.toLowerCase().startsWith("dim") ||
        k.toLowerCase().includes("rowquestion") ||
        k.toLowerCase().includes("colquestion")
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

    const rowQuestionId =
      searchParams.get("rowQuestionId") || searchParams.get("questionA");
    const colQuestionId =
      searchParams.get("colQuestionId") ||
      searchParams.get("columnQuestionId") ||
      searchParams.get("questionB");

    if (!rowQuestionId || !colQuestionId) {
      return NextResponse.json(
        {
          error: "MISSING_DIMENSIONS",
          message: "請指定分組題目 rowQuestionId 與目標題目 colQuestionId。",
        },
        { status: 400 }
      );
    }

    if (rowQuestionId === colQuestionId) {
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

    // 2. 查詢問卷基本資訊與題目結構
    const survey = await db.survey.findUnique({
      where: { id },
      include: {
        questions: {
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
    const qA = survey.questions.find((q) => q.id === rowQuestionId);
    const qB = survey.questions.find((q) => q.id === colQuestionId);

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

    const responseWhere: any = {
      surveyId: survey.id,
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

    // 6. 查詢符合條件之 Responses 與其 Answers
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

    const totalSurveyResponses = responses.length;

    // 7. 轉換題目資料為純函數領域結構 (QuestionMeta)
    const toQuestionMeta = (q: typeof qA): QuestionMeta => ({
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
    });

    const qRowMeta = toQuestionMeta(qA);
    const qColMeta = toQuestionMeta(qB);

    // 8. 執行純函數分析管線 (F.1 -> F.2 -> F.3)
    // 8.1 Phase M9-F.1: 交叉聚合純函數運算
    const crossTabRaw = analyzeCrossTabulation(qRowMeta, qColMeta, responses);

    // 8.2 Phase M9-F.2: 統計檢定計算 (χ², p-value, Cramer's V)
    const includeStatistics = searchParams.get("includeStatistics") !== "false";
    let stats: CrossTabStatistics | null = null;
    if (includeStatistics) {
      stats = analyzeCrossTabStatistics(crossTabRaw);
      crossTabRaw.statistics = stats;
    }

    // 8.3 Phase M9-F.3: 小樣本隱私遮蔽與補償遮蔽投影
    const minCellSizeParam = parseInt(searchParams.get("minCellSize") || "5", 10);
    const minCellSize =
      isNaN(minCellSizeParam) || minCellSizeParam < 5 ? 5 : minCellSizeParam;
    const protectedCrossTab = applyCrossTabPrivacy(crossTabRaw, { minCellSize });

    // 9. 計算單題作答人數
    let qAAnsweredCount = 0;
    let qBAnsweredCount = 0;
    for (const resp of responses) {
      const ansA = resp.answers.find((a) => a.questionId === qA.id);
      const ansB = resp.answers.find((a) => a.questionId === qB.id);
      if (ansA && ansA.rawValue && ansA.rawValue.trim() !== "" && ansA.rawValue !== "null")
        qAAnsweredCount++;
      if (ansB && ansB.rawValue && ansB.rawValue.trim() !== "" && ansB.rawValue !== "null")
        qBAnsweredCount++;
    }

    // 10. 建構 DTO 回應 (兼顧標準契約與向後相容欄位)
    const rows = protectedCrossTab.rowItems.map((rItem, rIdx) => {
      const choiceA = qA.choices.find((c) => c.value === rItem.value) || {
        id: rItem.value,
        label: rItem.label,
      };

      const cells = protectedCrossTab.colItems.map((cItem, cIdx) => {
        const choiceB = qB.choices.find((c) => c.value === cItem.value) || {
          id: cItem.value,
          label: cItem.label,
        };
        const cell = protectedCrossTab.matrix[rIdx][cIdx];

        return {
          colChoiceId: choiceB.id,
          colLabel: cItem.label,
          count: cell.count,
          displayValue: cell.displayValue,
          rowPercentage: cell.rowPercentage,
          columnPercentage: cell.colPercentage,
          totalPercentage: cell.totalPercentage,
          isSuppressed: cell.isSuppressed,
        };
      });

      return {
        rowChoiceId: choiceA.id,
        rowLabel: rItem.label,
        rowTotalAnswered: rItem.count,
        isRowTotalSuppressed: rItem.isSuppressed,
        cells,
      };
    });

    const columnTotals = protectedCrossTab.colItems.map((cItem) => {
      const choiceB = qB.choices.find((c) => c.value === cItem.value) || {
        id: cItem.value,
        label: cItem.label,
      };
      return {
        colChoiceId: choiceB.id,
        colLabel: cItem.label,
        totalAnswered: cItem.count,
        isColumnTotalSuppressed: cItem.isSuppressed,
      };
    });

    return NextResponse.json({
      success: true,
      survey: {
        id: survey.id,
        title: survey.title,
        version: survey.version,
        organizationId: survey.organizationId,
        isAnonymous: survey.isAnonymous,
      },
      filter: {
        timeRange,
        dateFrom: startDate ? startDate.toISOString() : null,
        dateTo: endDate ? endDate.toISOString() : null,
        status: statusParam,
      },
      result: protectedCrossTab,

      // 向下相容結構
      surveyId: survey.id,
      surveyTitle: survey.title,
      isAnonymous: survey.isAnonymous,
      minCellSize,
      dimensionA: {
        questionId: qA.id,
        code: qA.code,
        title: qA.title,
        type: qA.questionType,
        totalAnswered: qAAnsweredCount,
        notAnsweredCount: totalSurveyResponses - qAAnsweredCount,
        options: qA.choices.map((c) => ({
          choiceId: c.id,
          label: c.label,
          value: c.value,
        })),
      },
      dimensionB: {
        questionId: qB.id,
        code: qB.code,
        title: qB.title,
        type: qB.questionType,
        totalAnswered: qBAnsweredCount,
        notAnsweredCount: totalSurveyResponses - qBAnsweredCount,
        options: qB.choices.map((c) => ({
          choiceId: c.id,
          label: c.label,
          value: c.value,
        })),
      },
      validPopulation: protectedCrossTab.grandTotal ?? 0,
      bothAnsweredCount: crossTabRaw.grandTotal,
      totalSurveyResponses,
      rows,
      columnTotals,
    });
  } catch (error: any) {
    console.error("[Crosstab Analytics Error]:", error);
    return NextResponse.json(
      { error: "INTERNAL_SERVER_ERROR", message: "交叉分析計算發生例外錯誤" },
      { status: 500 }
    );
  }
}
