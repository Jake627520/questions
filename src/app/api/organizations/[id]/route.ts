export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  getCurrentUser,
  unauthorizedResponse,
  forbiddenResponse,
  getUserMembership,
  hasRole,
  ROLES,
} from "@/lib/auth";

/**
 * GET /api/organizations/[id]
 * 取得指定組織的詳細資訊與成員清單 (限定該組織成員)
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

    // 驗證存取者是否為組織成員 (IDOR 防護)
    const membership = await getUserMembership(auth.user.id, organizationId);
    if (!membership) {
      return forbiddenResponse("您無權存取該組織的詳細資料");
    }

    const organization = await db.organization.findUnique({
      where: { id: organizationId },
      include: {
        memberships: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                avatarUrl: true,
                createdAt: true,
              },
            },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!organization) {
      return NextResponse.json({ error: "找不到該組織" }, { status: 404 });
    }

    const members = organization.memberships.map((m) => ({
      membershipId: m.id,
      userId: m.user.id,
      name: m.user.name,
      email: m.user.email,
      avatarUrl: m.user.avatarUrl,
      role: m.role,
      joinedAt: m.createdAt,
    }));

    return NextResponse.json({
      success: true,
      organization: {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        createdAt: organization.createdAt,
        updatedAt: organization.updatedAt,
      },
      currentUserRole: membership.role,
      members,
    });
  } catch (error: any) {
    console.error("Get organization detail error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "取得組織明細失敗" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/organizations/[id]
 * 修改組織基本設定 (限定 OWNER 與 ADMIN 角色)
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await getCurrentUser(req);
    if (!auth) {
      return unauthorizedResponse();
    }

    const { id: organizationId } = params;

    // RBAC 檢查：僅限 OWNER 與 ADMIN
    const { allowed } = await hasRole(auth.user.id, organizationId, ROLES.MANAGERS);
    if (!allowed) {
      return forbiddenResponse("僅有組織擁有者 (OWNER) 與管理員 (ADMIN) 可以修改組織設定");
    }

    const body = await req.json();
    const { name } = body;

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", message: "組織名稱不能為空" },
        { status: 400 }
      );
    }

    const trimmedName = name.trim();
    if (trimmedName.length > 100) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", message: "組織名稱長度不得超過 100 個字元" },
        { status: 400 }
      );
    }

    const updated = await db.organization.update({
      where: { id: organizationId },
      data: { name: trimmedName },
    });

    return NextResponse.json({
      success: true,
      message: "組織資訊更新成功",
      organization: {
        id: updated.id,
        name: updated.name,
        slug: updated.slug,
        updatedAt: updated.updatedAt,
      },
    });
  } catch (error: any) {
    console.error("Update organization error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "更新組織資訊失敗" },
      { status: 500 }
    );
  }
}
