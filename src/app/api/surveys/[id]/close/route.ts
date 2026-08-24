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
import { validateStatusTransition } from "@/lib/survey-lifecycle";

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
    const survey = await db.survey.findUnique({
      where: { id },
    });

    if (!survey) {
      return NextResponse.json({ error: "找不到該問卷" }, { status: 404 });
    }

    const { allowed, membership } = await hasRole(
      auth.user.id,
      survey.organizationId,
      ROLES.EDITORS
    );
    if (!membership) {
      return forbiddenResponse("您非該組織成員，無權關閉此問卷");
    }
    if (!allowed) {
      return forbiddenResponse("您的角色權限不足，僅管理員與編輯者可關閉問卷");
    }

    const transition = validateStatusTransition(survey.status, SurveyStatus.CLOSED);
    if (!transition.valid) {
      return NextResponse.json(
        { error: "INVALID_STATUS_TRANSITION", message: transition.reason },
        { status: 400 }
      );
    }

    const updated = await db.survey.update({
      where: { id },
      data: {
        status: SurveyStatus.CLOSED,
      },
    });

    return NextResponse.json({
      success: true,
      message: "問卷已關閉，已停止接收新作答",
      survey: updated,
    });
  } catch (error: any) {
    console.error("[Survey Close Error]:", error);
    return NextResponse.json(
      { error: "關閉問卷失敗", details: error.message },
      { status: 500 }
    );
  }
}
