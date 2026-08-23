export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  getCurrentUser,
  unauthorizedResponse,
  forbiddenResponse,
  hasRole,
  ROLES,
  INVITABLE_ROLES,
  INVITATION_EXPIRY_DAYS,
  generateInvitationToken,
  hashInvitationToken,
  normalizeEmail,
} from "@/lib/auth";
import { Role } from "@prisma/client";

/**
 * GET /api/organizations/[id]/invitations
 * 取得指定組織之成員邀請清單 (限定 OWNER / ADMIN 管理員)
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await getCurrentUser(req);
    if (!auth) {
      return unauthorizedResponse();
    }

    const { id: organizationId } = params;

    // 驗證存取者是否具備組織管理員權限 (OWNER / ADMIN)
    const { allowed, membership } = await hasRole(
      auth.user.id,
      organizationId,
      ROLES.MANAGERS
    );

    if (!membership || !allowed) {
      return forbiddenResponse("您無權查看該組織的成員邀請清單");
    }

    const invitations = await db.invitation.findMany({
      where: { organizationId },
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const now = new Date();
    const sanitizedInvitations = invitations.map((inv) => {
      let status: "PENDING" | "ACCEPTED" | "REVOKED" | "EXPIRED" = "PENDING";
      if (inv.usedAt) {
        status = "ACCEPTED";
      } else if (inv.revokedAt) {
        status = "REVOKED";
      } else if (inv.expiresAt < now) {
        status = "EXPIRED";
      }

      return {
        id: inv.id,
        organizationId: inv.organizationId,
        invitedEmail: inv.invitedEmail,
        role: inv.role,
        status,
        expiresAt: inv.expiresAt,
        usedAt: inv.usedAt,
        revokedAt: inv.revokedAt,
        createdAt: inv.createdAt,
        createdBy: {
          id: inv.createdBy.id,
          name: inv.createdBy.name,
          email: inv.createdBy.email,
        },
      };
    });

    return NextResponse.json({
      success: true,
      invitations: sanitizedInvitations,
    });
  } catch (error: any) {
    console.error("Get invitations error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "取得邀請清單失敗" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/organizations/[id]/invitations
 * 發起新成員邀請 (限定 OWNER / ADMIN 管理員)
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await getCurrentUser(req);
    if (!auth) {
      return unauthorizedResponse();
    }

    const { id: organizationId } = params;

    // 驗證存取者是否具備組織管理員權限 (OWNER / ADMIN)
    const { allowed, membership } = await hasRole(
      auth.user.id,
      organizationId,
      ROLES.MANAGERS
    );

    if (!membership || !allowed) {
      return forbiddenResponse("您無權在此組織建立成員邀請");
    }

    const body = await req.json().catch(() => ({}));
    const rawEmail = typeof body.email === "string" ? body.email : "";
    const roleStr = typeof body.role === "string" ? body.role.toUpperCase() : "VIEWER";

    const normalizedEmail = normalizeEmail(rawEmail);
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!normalizedEmail || !emailRegex.test(normalizedEmail)) {
      return NextResponse.json(
        { error: "INVALID_EMAIL", message: "請提供有效的電子郵件地址" },
        { status: 400 }
      );
    }

    // 嚴格檢驗角色權限：禁止透過邀請建立 OWNER
    if (!INVITABLE_ROLES.includes(roleStr as any)) {
      return NextResponse.json(
        {
          error: "INVALID_ROLE",
          message: "不合法的邀請角色，僅能指派 ADMIN, EDITOR 或 VIEWER",
        },
        { status: 400 }
      );
    }

    const targetRole = roleStr as Role;

    // 檢查該 Email 是否已是該組織成員
    const existingMember = await db.membership.findFirst({
      where: {
        organizationId,
        user: { email: normalizedEmail },
      },
    });

    if (existingMember) {
      return NextResponse.json(
        { error: "ALREADY_MEMBER", message: "該使用者已是本工作區成員" },
        { status: 400 }
      );
    }

    // 將該組織中同一 Email 先前未完成之有效邀請標記為撤銷 (Single Active Token 原則)
    await db.invitation.updateMany({
      where: {
        organizationId,
        invitedEmail: normalizedEmail,
        usedAt: null,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: { revokedAt: new Date() },
    });

    // 產生 256-bit CSPRNG 邀請 Token 與 SHA-256 Hash
    const rawToken = generateInvitationToken();
    const tokenHash = hashInvitationToken(rawToken);
    const expiresAt = new Date(
      Date.now() + INVITATION_EXPIRY_DAYS * 24 * 60 * 60 * 1000
    );

    const invitation = await db.invitation.create({
      data: {
        organizationId,
        invitedEmail: normalizedEmail,
        role: targetRole,
        tokenHash,
        expiresAt,
        createdById: auth.user.id,
      },
    });

    const origin = req.nextUrl.origin;
    const inviteUrl = `${origin}/invite/${rawToken}`;

    return NextResponse.json(
      {
        success: true,
        invitation: {
          id: invitation.id,
          organizationId: invitation.organizationId,
          invitedEmail: invitation.invitedEmail,
          role: invitation.role,
          expiresAt: invitation.expiresAt,
          createdAt: invitation.createdAt,
        },
        inviteUrl,
        rawToken,
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("Create invitation error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "建立成員邀請失敗" },
      { status: 500 }
    );
  }
}
