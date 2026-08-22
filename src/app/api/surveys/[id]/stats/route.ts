import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ResponseStatus } from "@prisma/client";
import { getCurrentUser, unauthorizedResponse, isUserInOrganization, forbiddenResponse } from "@/lib/auth";

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
        responses: {
          where: { status: ResponseStatus.COMPLETED },
          orderBy: { submittedAt: "desc" },
          include: {
            answers: {
              include: {
                question: true,
              },
            },
          },
        },
      },
    });

    if (!survey) {
      return NextResponse.json({ error: "找不到該問卷" }, { status: 404 });
    }

    const isMember = await isUserInOrganization(auth.user.id, survey.organizationId);
    if (!isMember) {
      return forbiddenResponse("您無權查看此組織問卷的統計報表");
    }

    const totalResponses = survey.responses.length;
    const scoredResponses = survey.responses.filter((r) => r.totalScore !== null);
    const avgScore =
      scoredResponses.length > 0
        ? scoredResponses.reduce((sum, r) => sum + (r.totalScore || 0), 0) / scoredResponses.length
        : null;

    const avgPercentage =
      scoredResponses.length > 0
        ? scoredResponses.reduce((sum, r) => sum + (r.percentage || 0), 0) / scoredResponses.length
        : null;

    // 計算每題統計（隱藏題自動排除）
    const questionStats = survey.questions.map((q) => {
      const answersForQ = survey.responses.flatMap((r) =>
        r.answers.filter((a) => a.questionId === q.id)
      );

      // 有效作答筆數（排除未作答或因條件隱藏者）
      const totalAnswered = answersForQ.filter((a) => {
        try {
          const val = JSON.parse(a.rawValue);
          return val !== null && val !== undefined && (Array.isArray(val) ? val.length > 0 : String(val) !== "");
        } catch {
          return false;
        }
      }).length;

      // 選項次數統計（以實際有效作答人數為分母）
      const choiceStats = q.choices.map((c) => {
        let count = 0;
        answersForQ.forEach((a) => {
          try {
            const val = JSON.parse(a.rawValue);
            if (Array.isArray(val)) {
              if (val.includes(c.value)) count++;
            } else if (val === c.value) {
              count++;
            }
          } catch {}
        });

        const percentage = totalAnswered > 0 ? (count / totalAnswered) * 100 : 0;
        return {
          id: c.id,
          label: c.label,
          value: c.value,
          count,
          percentage: Math.round(percentage * 10) / 10,
          score: c.score,
          scoreEnabled: c.scoreEnabled,
          isOther: c.isOther,
          requiresText: c.requiresText,
          isNoneOfAbove: c.isNoneOfAbove,
        };
      });

      // 計分題平均分
      const scoredAnswers = answersForQ.filter((a) => a.score !== null);
      const avgQuestionScore =
        scoredAnswers.length > 0
          ? scoredAnswers.reduce((sum, a) => sum + (a.score || 0), 0) / scoredAnswers.length
          : null;

      // 其他文字補充收集
      const otherTexts = answersForQ
        .map((a) => a.otherText?.trim())
        .filter((t): t is string => Boolean(t));

      // 問答題文字回覆收集
      const textResponses =
        q.questionType === "text" || q.questionType === "number"
          ? answersForQ
              .map((a) => {
                try {
                  return JSON.parse(a.rawValue);
                } catch {
                  return null;
                }
              })
              .filter((v) => v !== null && v !== undefined && String(v).trim() !== "")
          : [];

      return {
        id: q.id,
        code: q.code,
        title: q.title,
        description: q.description,
        questionType: q.questionType,
        required: q.required,
        scoringEnabled: q.scoringEnabled,
        reverseScore: q.reverseScore,
        visibilityRules: q.visibilityRules,
        totalAnswered,
        avgQuestionScore: avgQuestionScore !== null ? Math.round(avgQuestionScore * 100) / 100 : null,
        choiceStats,
        otherTexts,
        textResponses,
      };
    });

    return NextResponse.json({
      survey: {
        id: survey.id,
        title: survey.title,
        description: survey.description,
        version: survey.version,
        status: survey.status,
        createdAt: survey.createdAt,
      },
      summary: {
        totalResponses,
        avgScore: avgScore !== null ? Math.round(avgScore * 100) / 100 : null,
        avgPercentage: avgPercentage !== null ? Math.round(avgPercentage * 10) / 10 : null,
      },
      questionStats,
    });
  } catch (error: any) {
    console.error("Error getting survey stats:", error);
    return NextResponse.json(
      { error: "取得統計資料失敗", details: error.message },
      { status: 500 }
    );
  }
}
