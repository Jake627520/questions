import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { SurveyStatus } from "@prisma/client";
import {
  getCurrentUser,
  unauthorizedResponse,
  forbiddenResponse,
  hasRole,
  ROLES,
} from "@/lib/auth";
import {
  validateStatusTransition,
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
      return forbiddenResponse("您非該組織成員，無權關閉此問卷");
    }
    if (!allowed) {
      return forbiddenResponse("您的角色權限不足，僅管理員與編輯者可關閉問卷");
    }

    const updated = await db.$transaction(async (tx) => {
      const survey = await tx.survey.findUnique({
        where: { id },
      });

      if (!survey) {
        throw new Error("NOT_FOUND");
      }

      const transition = validateStatusTransition(survey.status, SurveyStatus.CLOSED);
      if (!transition.valid) {
        throw new InvalidTransitionError(
          survey.status,
          SurveyStatus.CLOSED,
          transition.reason || "非法狀態轉換"
        );
      }

      return tx.survey.update({
        where: { id },
        data: {
          status: SurveyStatus.CLOSED,
        },
      });
    });

    return NextResponse.json({
      success: true,
      message: "問卷已關閉，已停止接收新作答",
      survey: updated,
    });
  } catch (error: any) {
    if (error instanceof InvalidTransitionError || error?.name === "InvalidTransitionError") {
      return NextResponse.json(
        { error: "INVALID_STATUS_TRANSITION", message: error.message },
        { status: 400 }
      );
    }
    if (error.message === "NOT_FOUND") {
      return NextResponse.json({ error: "找不到該問卷" }, { status: 404 });
    }

    console.error("[Survey Close Error]:", error);
    return NextResponse.json(
      { error: "關閉問卷失敗", details: error.message },
      { status: 500 }
    );
  }
}
