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
      return forbiddenResponse("您非該組織成員，無權還原此問卷");
    }
    if (!allowed) {
      return forbiddenResponse("您的角色權限不足，僅管理員與編輯者可還原問卷");
    }

    const { updated, targetStatus } = await db.$transaction(async (tx) => {
      const survey = await tx.survey.findUnique({
        where: { id },
        include: {
          _count: {
            select: { responses: true },
          },
        },
      });

      if (!survey) {
        throw new Error("NOT_FOUND");
      }

      if (survey.status !== SurveyStatus.ARCHIVED) {
        throw new Error("INVALID_OPERATION");
      }

      // 若從未收集過作答則還原為 DRAFT，否則還原為 CLOSED 保障安全性
      const statusToRestore =
        survey._count.responses === 0 ? SurveyStatus.DRAFT : SurveyStatus.CLOSED;

      const transition = validateStatusTransition(survey.status, statusToRestore);
      if (!transition.valid) {
        throw new InvalidTransitionError(
          survey.status,
          statusToRestore,
          transition.reason || "非法狀態轉換"
        );
      }

      const surveyUpdated = await tx.survey.update({
        where: { id },
        data: {
          status: statusToRestore,
        },
      });

      return { updated: surveyUpdated, targetStatus: statusToRestore };
    });

    return NextResponse.json({
      success: true,
      message: `問卷已成功還原為 ${targetStatus === SurveyStatus.DRAFT ? "草稿 (DRAFT)" : "已關閉 (CLOSED)"} 狀態`,
      survey: updated,
    });
  } catch (error: any) {
    if (error.message === "INVALID_OPERATION") {
      return NextResponse.json(
        { error: "INVALID_OPERATION", message: "僅已歸檔之問卷可進行還原操作。" },
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

    console.error("[Survey Restore Error]:", error);
    return NextResponse.json(
      { error: "還原問卷失敗", details: error.message },
      { status: 500 }
    );
  }
}
