export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  getCurrentUser,
  unauthorizedResponse,
  forbiddenResponse,
  hasRole,
  ROLES,
} from "@/lib/auth";

/**
 * POST /api/organizations/[id]/invitations/[invitationId]/revoke
 * 撤銷成員邀請 (限定 OWNER / ADMIN 管理員)
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string; invitationId: string } }
) {
  try {
    const auth = await getCurrentUser(req);
    if (!auth) {
      return unauthorizedResponse();
    }

    const { id: organizationId, invitationId } = params;

    // 驗證存取者是否具備組織管理員權限 (OWNER / ADMIN)
    const { allowed, membership } = await hasRole(
      auth.user.id,
      organizationId,
      ROLES.MANAGERS
    );

    if (!membership || !allowed) {
      return forbiddenResponse("您無權撤銷該組織的成員邀請");
    }

    const invitation = await db.invitation.findUnique({
      where: { id: invitationId },
    });

    // 跨租戶與存在性檢查
    if (!invitation || invitation.organizationId !== organizationId) {
      return NextResponse.json(
        { error: "NOT_FOUND", message: "找不到該成員邀請" },
        { status: 404 }
      );
    }

    if (invitation.usedAt) {
      return NextResponse.json(
        { error: "ALREADY_ACCEPTED", message: "該邀請已被接受，無法撤銷" },
        { status: 400 }
      );
    }

    if (invitation.revokedAt) {
      return NextResponse.json({
        success: true,
        message: "該邀請已處於撤銷狀態",
      });
    }

    await db.invitation.update({
      where: { id: invitationId },
      data: { revokedAt: new Date() },
    });

    return NextResponse.json({
      success: true,
      message: "成員邀請已成功撤銷",
    });
  } catch (error: any) {
    console.error("Revoke invitation error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "撤銷邀請失敗" },
      { status: 500 }
    );
  }
}
