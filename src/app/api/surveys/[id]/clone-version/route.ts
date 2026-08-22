import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { SurveyStatus } from "@prisma/client";
import { getCurrentUser, unauthorizedResponse, forbiddenResponse, hasRole, ROLES, generatePublicToken } from "@/lib/auth";

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

    const { allowed, membership } = await hasRole(auth.user.id, sourceSurvey.organizationId, ROLES.EDITORS);
    if (!membership) {
      return forbiddenResponse("您非該組織成員，無權複製此組織的問卷版本");
    }
    if (!allowed) {
      return forbiddenResponse("您的角色權限不足，需要 EDITOR 以上權限才能複製問卷版本");
    }

    const nextVersion = sourceSurvey.version + 1;
    const newTitle = `${sourceSurvey.title.replace(/\s*\(v\d+\)$/, "")} (v${nextVersion})`;

    const clonedSurvey = await db.survey.create({
      data: {
        organizationId: sourceSurvey.organizationId,
        publicToken: generatePublicToken(),
        createdById: auth.user.id,
        title: newTitle,
        description: sourceSurvey.description,
        status: SurveyStatus.DRAFT,
        version: nextVersion,
        parentSurveyId: sourceSurvey.id,
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
      message: `成功建立問卷新版本 v${clonedSurvey.version}`,
      surveyId: clonedSurvey.id,
      version: clonedSurvey.version,
      survey: clonedSurvey,
    });
  } catch (error: any) {
    console.error("Error cloning survey version:", error);
    return NextResponse.json(
      { error: "複製新版本失敗", details: error.message },
      { status: 500 }
    );
  }
}
