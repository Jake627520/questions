import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { SurveyStatus } from "@prisma/client";
import {
  getCurrentUser,
  unauthorizedResponse,
  forbiddenResponse,
  hasRole,
  ROLES,
  generatePublicToken,
} from "@/lib/auth";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await getCurrentUser(req);
    if (!auth) {
      return unauthorizedResponse();
    }

    const { id } = params;
    const sourceSurvey = await db.survey.findUnique({
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

    if (!sourceSurvey) {
      return NextResponse.json({ error: "找不到來源問卷" }, { status: 404 });
    }

    const { allowed, membership } = await hasRole(
      auth.user.id,
      sourceSurvey.organizationId,
      ROLES.EDITORS
    );
    if (!membership) {
      return forbiddenResponse("您非該組織成員，無權複製此問卷");
    }
    if (!allowed) {
      return forbiddenResponse("您的角色權限不足，需要 EDITOR 以上權限才能複製問卷");
    }

    const duplicateTitle = `${sourceSurvey.title.replace(/\s*\(複製\d*\)$/, "")} (複製)`;

    const duplicatedSurvey = await db.survey.create({
      data: {
        organizationId: sourceSurvey.organizationId,
        publicToken: generatePublicToken(),
        createdById: auth.user.id,
        title: duplicateTitle,
        description: sourceSurvey.description,
        status: SurveyStatus.DRAFT,
        version: 1,
        parentSurveyId: null, // 獨立全新問卷，不延續來源問卷的 version lineage
        isAnonymous: sourceSurvey.isAnonymous,
        collectIdentity: sourceSurvey.collectIdentity,
        startDate: sourceSurvey.startDate,
        endDate: sourceSurvey.endDate,
        responseQuota: sourceSurvey.responseQuota,
        questions: {
          create: sourceSurvey.questions.map((q) => ({
            orderNum: q.orderNum,
            code: q.code,
            title: q.title,
            description: q.description,
            questionType: q.questionType,
            required: q.required,
            scoringEnabled: q.scoringEnabled,
            reverseScore: q.reverseScore,
            visibilityRules: q.visibilityRules,
            visibilityHint: q.visibilityHint,
            minSelections: q.minSelections,
            maxSelections: q.maxSelections,
            minValue: q.minValue,
            maxValue: q.maxValue,
            choices: {
              create: q.choices.map((c) => ({
                orderNum: c.orderNum,
                label: c.label,
                value: c.value,
                scoreEnabled: c.scoreEnabled,
                score: c.score,
                isOther: c.isOther,
                requiresText: c.requiresText,
                isNoneOfAbove: c.isNoneOfAbove,
              })),
            },
          })),
        },
      },
      include: {
        questions: {
          include: {
            choices: true,
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      message: `成功複製為全新獨立問卷：${duplicatedSurvey.title}`,
      surveyId: duplicatedSurvey.id,
      version: duplicatedSurvey.version,
    });
  } catch (error: any) {
    console.error("[Survey Duplicate Error]:", error);
    return NextResponse.json(
      { error: "複製問卷失敗", details: error.message },
      { status: 500 }
    );
  }
}
