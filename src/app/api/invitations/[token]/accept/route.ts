export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  getCurrentUser,
  unauthorizedResponse,
  hashInvitationToken,
  normalizeEmail,
  ACTIVE_ORG_COOKIE_NAME,
  getActiveOrgCookieOptions,
} from "@/lib/auth";

/**
 * POST /api/invitations/[token]/accept
 * 接受成員邀請 (限定已登入使用者，且電子郵件必須與被邀請者一致)
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const auth = await getCurrentUser(req);
    if (!auth) {
      return unauthorizedResponse("請先登入帳號以接受邀請");
    }

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
        organization: true,
      },
    });

    if (!invitation) {
      return NextResponse.json(
        { error: "NOT_FOUND", message: "此邀請無效或不存在" },
        { status: 404 }
      );
    }

    if (invitation.usedAt) {
      return NextResponse.json(
        { error: "ALREADY_USED", message: "此邀請已被使用" },
        { status: 400 }
      );
    }

    if (invitation.revokedAt) {
      return NextResponse.json(
        { error: "REVOKED", message: "此邀請已被管理員撤銷" },
        { status: 400 }
      );
    }

    if (invitation.expiresAt < new Date()) {
      return NextResponse.json(
        { error: "EXPIRED", message: "此邀請已過期" },
        { status: 400 }
      );
    }

    // 嚴格比對目前登入 Email 與受邀 Email
    const currentEmail = normalizeEmail(auth.user.email);
    const invitedEmail = normalizeEmail(invitation.invitedEmail);

    if (currentEmail !== invitedEmail) {
      return NextResponse.json(
        {
          error: "EMAIL_MISMATCH",
          message: `此邀請專屬於 ${invitation.invitedEmail}，您目前登入身分為 ${auth.user.email}，無法接受此邀請。`,
        },
        { status: 403 }
      );
    }

    // 檢查使用者是否已經是該組織成員
    const existingMembership = await db.membership.findUnique({
      where: {
        userId_organizationId: {
          userId: auth.user.id,
          organizationId: invitation.organizationId,
        },
      },
    });

    if (existingMembership) {
      // 既有成員：消耗邀請但絕不覆寫或提權既有 Role
      await db.invitation.update({
        where: { id: invitation.id },
        data: { usedAt: new Date() },
      });

      const res = NextResponse.json({
        success: true,
        alreadyMember: true,
        message: "您已是該工作區成員",
        organization: {
          id: invitation.organization.id,
          name: invitation.organization.name,
          role: existingMembership.role,
        },
      });

      res.cookies.set(
        ACTIVE_ORG_COOKIE_NAME,
        invitation.organizationId,
        getActiveOrgCookieOptions()
      );
      return res;
    }

    // 原子性交易：條件更新鎖定 Invitation 並建立 Membership
    try {
      await db.$transaction(async (tx) => {
        const updateResult = await tx.invitation.updateMany({
          where: {
            id: invitation.id,
            usedAt: null,
            revokedAt: null,
            expiresAt: { gt: new Date() },
          },
          data: {
            usedAt: new Date(),
          },
        });

        if (updateResult.count === 0) {
          throw new Error("INVITATION_ALREADY_CONSUMED");
        }

        await tx.membership.create({
          data: {
            userId: auth.user.id,
            organizationId: invitation.organizationId,
            role: invitation.role,
          },
        });
      });
    } catch (err: any) {
      if (err.message === "INVITATION_ALREADY_CONSUMED") {
        return NextResponse.json(
          { error: "ALREADY_USED", message: "此邀請已被使用" },
          { status: 400 }
        );
      }
      throw err;
    }

    const res = NextResponse.json({
      success: true,
      message: `成功加入工作區「${invitation.organization.name}」！`,
      organization: {
        id: invitation.organization.id,
        name: invitation.organization.name,
        role: invitation.role,
      },
    });

    // 自動切換當前 Active Organization 至新加入之工作區
    res.cookies.set(
      ACTIVE_ORG_COOKIE_NAME,
      invitation.organizationId,
      getActiveOrgCookieOptions()
    );

    return res;
  } catch (error: any) {
    console.error("Accept invitation error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "接受邀請失敗" },
      { status: 500 }
    );
  }
}
