export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hashInvitationToken, maskEmail } from "@/lib/auth";

/**
 * GET /api/invitations/[token]
 * 取得成員邀請之公開預覽資訊 (Sanitized Public Preview，無需登入)
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const { token } = params;
    if (!token || typeof token !== "string") {
      return NextResponse.json(
        { error: "INVALID_TOKEN", message: "無效的邀請連結" },
        { status: 400 }
      );
    }

    const tokenHash = hashInvitationToken(token);
    const invitation = await db.invitation.findUnique({
      where: { tokenHash },
      include: {
        organization: {
          select: {
            name: true,
            slug: true,
          },
        },
      },
    });

    // 1. 存在性檢查
    if (!invitation) {
      return NextResponse.json(
        { error: "NOT_FOUND", message: "此邀請無效或不存在" },
        { status: 404 }
      );
    }

    // 2. 狀態檢查 (已使用、已撤銷、已過期)
    if (invitation.usedAt) {
      return NextResponse.json(
        { error: "ALREADY_USED", message: "此邀請已被使用" },
        { status: 404 }
      );
    }

    if (invitation.revokedAt) {
      return NextResponse.json(
        { error: "REVOKED", message: "此邀請已被管理員撤銷" },
        { status: 404 }
      );
    }

    if (invitation.expiresAt < new Date()) {
      return NextResponse.json(
        { error: "EXPIRED", message: "此邀請已過期" },
        { status: 404 }
      );
    }

    // 3. 回傳最小化公開預覽資訊 (絕對不洩漏 tokenHash、內部 ID 或建立者，且 Email 進行隱私遮罩)
    return NextResponse.json({
      success: true,
      invitation: {
        organizationName: invitation.organization.name,
        organizationSlug: invitation.organization.slug,
        invitedEmail: maskEmail(invitation.invitedEmail),
        role: invitation.role,
        expiresAt: invitation.expiresAt,
      },
    });
  } catch (error: any) {
    console.error("Get invitation preview error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "讀取邀請資訊失敗" },
      { status: 500 }
    );
  }
}
