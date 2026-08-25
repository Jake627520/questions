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
import {
  validateStatusTransition,
  validateSurveyPrePublishChecklist,
  InvalidTransitionError,
} from "@/lib/survey-lifecycle";

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
    const preCheck = await db.survey.findUnique({
      where: { id },
      select: { organizationId: true },
    });

    if (!preCheck) {
      return NextResponse.json({ error: "找不到該問卷" }, { status: 404 });
    }

    const { allowed, membership } = await hasRole(
      auth.user.id,
      preCheck.organizationId,
      ROLES.EDITORS
    );
    if (!membership) {
      return forbiddenResponse("您非該組織成員，無權發布此問卷");
    }
    if (!allowed) {
      return forbiddenResponse("您的角色權限不足，僅管理員與編輯者可發布問卷");
    }

    const updated = await db.$transaction(async (tx) => {
      const survey = await tx.survey.findUnique({
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
        throw new Error("NOT_FOUND");
      }

      // 1. 發布前清單檢查
      const checklist = validateSurveyPrePublishChecklist({
        title: survey.title,
        questions: survey.questions.map((q) => ({
          id: q.id,
          code: q.code,
          title: q.title,
          questionType: q.questionType,
          choices: q.choices,
        })),
      });

      if (!checklist.ready) {
        throw new Error(`PRE_PUBLISH_VALIDATION_FAILED:${JSON.stringify(checklist.errors)}`);
      }

      // 2. 狀態轉換驗證
      const transition = validateStatusTransition(
        survey.status,
        SurveyStatus.PUBLISHED,
        { questionCount: survey.questions.length }
      );
      if (!transition.valid) {
        throw new InvalidTransitionError(
          survey.status,
          SurveyStatus.PUBLISHED,
          transition.reason || "非法狀態轉換"
        );
      }

      return tx.survey.update({
        where: { id },
        data: {
          status: SurveyStatus.PUBLISHED,
          publicToken: survey.publicToken || generatePublicToken(),
        },
      });
    });

    return NextResponse.json({
      success: true,
      message: "問卷已成功發布並開放收集作答",
      survey: updated,
    });
  } catch (error: any) {
    if (error.message?.startsWith("PRE_PUBLISH_VALIDATION_FAILED:")) {
      const errorJson = error.message.replace("PRE_PUBLISH_VALIDATION_FAILED:", "");
      return NextResponse.json(
        {
          error: "PRE_PUBLISH_VALIDATION_FAILED",
          message: "問卷發布檢查未通過，請修正以下問題：",
          errors: JSON.parse(errorJson),
        },
        { status: 400 }
      );
    }
    if (error instanceof InvalidTransitionError || error?.name === "InvalidTransitionError") {
      return NextResponse.json(
        { error: "INVALID_STATUS_TRANSITION", message: error.message },
        { status: 400 }
      );
    }
    if (error.message === "NOT_FOUND") {
      return NextResponse.json({ error: "找不到該問卷" }, { status: 404 });
    }

    console.error("[Survey Publish Error]:", error);
    return NextResponse.json(
      { error: "發布問卷失敗", details: error.message },
      { status: 500 }
    );
  }
}
