import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { SurveyStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

/**
 * 公開問卷讀取 API (Public Survey Endpoint)
 * - 依賴高熵 publicToken，禁止使用內部 survey.id 存取
 * - 自動脫敏：移除 scoringEnabled, reverseScore, choice.score 等內部敏感資料
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { publicToken: string } }
) {
  try {
    const { publicToken } = params;

    if (!publicToken || publicToken.trim().length === 0) {
      return NextResponse.json(
        { error: "無效的公開問卷標識 (Public Token Invalid)" },
        { status: 400 }
      );
    }

    const survey = await db.survey.findUnique({
      where: { publicToken },
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

    // 必須存在且狀態為 PUBLISHED 才對外公開
    if (!survey || survey.status !== SurveyStatus.PUBLISHED) {
      return NextResponse.json(
        { error: "找不到該公開問卷或問卷目前未開放填答" },
        { status: 404 }
      );
    }

    // 脫敏處理：僅回傳填答端必要之欄位
    const sanitizedQuestions = survey.questions.map((q) => {
      let parsedRules: any = null;
      if (q.visibilityRules) {
        try {
          parsedRules = typeof q.visibilityRules === "string" ? JSON.parse(q.visibilityRules) : q.visibilityRules;
        } catch {
          parsedRules = null;
        }
      }

      return {
        id: q.id,
        code: q.code,
        title: q.title,
        description: q.description,
        questionType: q.questionType,
        required: q.required,
        orderNum: q.orderNum,
        minSelections: q.minSelections,
        maxSelections: q.maxSelections,
        minValue: q.minValue,
        maxValue: q.maxValue,
        visibilityHint: q.visibilityHint,
        visibilityRules: parsedRules,
        choices: q.choices.map((c) => ({
          id: c.id,
          orderNum: c.orderNum,
          label: c.label,
          value: c.value,
          isOther: c.isOther,
          requiresText: c.requiresText,
          isNoneOfAbove: c.isNoneOfAbove,
          // 徹底移除 score 與 scoreEnabled
        })),
        // 徹底移除 scoringEnabled 與 reverseScore
      };
    });

    const publicSurvey = {
      publicToken: survey.publicToken,
      title: survey.title,
      description: survey.description,
      version: survey.version,
      isAnonymous: survey.isAnonymous,
      collectIdentity: survey.collectIdentity,
      questions: sanitizedQuestions,
    };

    return NextResponse.json({
      success: true,
      survey: publicSurvey,
    });
  } catch (error: any) {
    console.error("[Public Survey API Error]:", error);
    return NextResponse.json(
      { error: "讀取公開問卷失敗", details: error.message },
      { status: 500 }
    );
  }
}
