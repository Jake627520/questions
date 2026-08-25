import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ResponseStatus } from "@prisma/client";
import {
  getCurrentUser,
  unauthorizedResponse,
  forbiddenResponse,
  hasRole,
  ROLES,
} from "@/lib/auth";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; responseId: string } }
) {
  try {
    const auth = await getCurrentUser(req);
    if (!auth) {
      return unauthorizedResponse();
    }

    const { id, responseId } = params;
    const body = await req.json();
    const targetStatus = body.status as ResponseStatus;
    const reason = body.reason as string | undefined;

    if (!targetStatus || !Object.values(ResponseStatus).includes(targetStatus)) {
      return NextResponse.json(
        { error: "INVALID_STATUS", message: "請提供有效之目標作答狀態 (COMPLETED, EXCLUDED)" },
        { status: 400 }
      );
    }

    const response = await db.response.findUnique({
      where: { id: responseId },
      include: { survey: { select: { organizationId: true } } },
    });

    if (!response || response.surveyId !== id) {
      return NextResponse.json({ error: "找不到該作答記錄" }, { status: 404 });
    }

    const { allowed, membership } = await hasRole(
      auth.user.id,
      response.survey.organizationId,
      ROLES.EDITORS
    );
    if (!membership) {
      return forbiddenResponse("您非該組織成員，無權修改作答狀態");
    }
    if (!allowed) {
      return forbiddenResponse("您的角色權限不足，需要 EDITOR 以上權限才能修改作答狀態");
    }

    if (targetStatus === ResponseStatus.EXCLUDED) {
      if (!reason || reason.trim().length === 0) {
        return NextResponse.json(
          { error: "MISSING_REASON", message: "將作答標記為排除 (EXCLUDED) 時必須填寫排除原因" },
          { status: 400 }
        );
      }

      const updated = await db.response.update({
        where: { id: responseId },
        data: {
          status: ResponseStatus.EXCLUDED,
          excludedReason: reason.trim(),
          excludedAt: new Date(),
          excludedById: auth.user.id,
        },
      });

      return NextResponse.json({
        success: true,
        message: "作答記錄已成功排除於統計分析之外",
        response: updated,
      });
    } else if (targetStatus === ResponseStatus.COMPLETED) {
      const updated = await db.response.update({
        where: { id: responseId },
        data: {
          status: ResponseStatus.COMPLETED,
          excludedReason: null,
          excludedAt: null,
          excludedById: null,
        },
      });

      return NextResponse.json({
        success: true,
        message: "作答記錄已恢復納入統計分析 (COMPLETED)",
        response: updated,
      });
    } else {
      return NextResponse.json(
        { error: "UNSUPPORTED_TRANSITION", message: "不支援直接修改為草稿狀態" },
        { status: 400 }
      );
    }
  } catch (error: any) {
    console.error("Error updating response status:", error);
    return NextResponse.json(
      { error: "修改作答狀態失敗", details: error.message },
      { status: 500 }
    );
  }
}
