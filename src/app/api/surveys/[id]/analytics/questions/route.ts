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

    // 6. 計算每一題的統計指標
    const questionAnalytics = survey.questions.map((q) => {
      // 收集該題所有的答案
      const answersForQ = responses.flatMap((r) =>
        r.answers.filter((a) => a.questionId === q.id)
      );

      // 判斷作答有效性 (排除空值、空陣列或空字串)
      const validAnswers = answersForQ.filter((a) => {
        if (!a.rawValue) return false;
        try {
          const val = JSON.parse(a.rawValue);
          if (val === null || val === undefined) return false;
          if (Array.isArray(val)) return val.length > 0;
          return String(val).trim() !== "";
        } catch {
          return String(a.rawValue).trim() !== "";
        }
      });

      const answeredCount = validAnswers.length;
      const notAnsweredCount = Math.max(0, totalResponses - answeredCount);
      const responseRate =
        totalResponses > 0
          ? Math.round((answeredCount / totalResponses) * 1000) / 10
          : 0;

      // A. 選項分佈統計 (針對選擇題)
      let distribution: any[] | null = null;
      if (q.choices && q.choices.length > 0) {
        distribution = q.choices.map((c) => {
          let count = 0;
          validAnswers.forEach((a) => {
            try {
              const val = JSON.parse(a.rawValue);
              if (Array.isArray(val)) {
                if (val.includes(c.value)) count++;
              } else if (val === c.value) {
                count++;
              }
            } catch {
              if (a.rawValue === c.value) count++;
            }
          });

          // 分母明確為 answeredCount，避免未回答拉低選項比例
          const percentage =
            answeredCount > 0
              ? Math.round((count / answeredCount) * 1000) / 10
              : 0;

          return {
            choiceId: c.id,
            label: c.label,
            value: c.value,
            orderNum: c.orderNum,
            count,
            percentage,
            score: c.score,
            scoreEnabled: c.scoreEnabled,
          };
        });
      }

      // B. 數值與評分統計 (Rating / Scored Questions)
      // 收集所有有效數值 (優先取 a.score，若無則若為 number 題型取 numeric rawValue)
      const numericValues: number[] = [];
      validAnswers.forEach((a) => {
        if (a.score !== null && a.score !== undefined) {
          numericValues.push(a.score);
        } else if (q.questionType === "number" || q.scoringEnabled) {
          try {
            const val = JSON.parse(a.rawValue);
            const num = parseFloat(val);
            if (!isNaN(num)) numericValues.push(num);
          } catch {
            const num = parseFloat(a.rawValue);
            if (!isNaN(num)) numericValues.push(num);
          }
        }
      });

      let statistics: {
        n: number;
        mean: number;
        median: number;
        min: number;
        max: number;
        standardDeviation: number | null;
      } | null = null;

      if (numericValues.length > 0) {
        const n = numericValues.length;
        const sum = numericValues.reduce((acc, v) => acc + v, 0);
        const mean = sum / n;

        // 計算 Median
        const sorted = [...numericValues].sort((a, b) => a - b);
        const mid = Math.floor(n / 2);
        const median =
          n % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;

        const min = sorted[0];
        const max = sorted[sorted.length - 1];

        // 計算 Sample Standard Deviation (N >= 2)
        // s = sqrt( sum( (x - mean)^2 ) / (n - 1) )
        let standardDeviation: number | null = null;
        if (n >= 2) {
          const variance =
            numericValues.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) /
            (n - 1);
          standardDeviation = Math.round(Math.sqrt(variance) * 100) / 100;
        }

        statistics = {
          n,
          mean: Math.round(mean * 100) / 100,
          median: Math.round(median * 100) / 100,
          min,
          max,
          standardDeviation,
        };
      }

      return {
        questionId: q.id,
        code: q.code,
        orderNum: q.orderNum,
        title: q.title,
        description: q.description,
        type: q.questionType,
        required: q.required,
        scoringEnabled: q.scoringEnabled,
        totalResponses,
        answeredCount,
        notAnsweredCount,
        responseRate,
        distribution,
        statistics,
      };
    });

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
