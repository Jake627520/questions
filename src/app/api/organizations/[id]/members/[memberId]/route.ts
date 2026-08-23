export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  getCurrentUser,
  unauthorizedResponse,
  forbiddenResponse,
  getUserMembership,
  ROLES,
} from "@/lib/auth";
import { Role } from "@prisma/client";

/**
 * PATCH /api/organizations/[id]/members/[memberId]
 * 修改成員在組織中的角色 (RBAC & Tenant Isolation Guarded)
 *
 * 權限規則：
 * 1. 呼叫者必須具備有效 Session 與該組織之 Membership。
 * 2. 呼叫者必須為 OWNER 或 ADMIN 角色 (EDITOR / VIEWER 回傳 403)。
 * 3. 跨租戶隔離：memberId 必須隸屬於 [id] 組織。
 * 4. ADMIN 限制：
 *    - ADMIN 不得修改 OWNER 的角色 (回傳 403)。
 *    - ADMIN 不得將任何成員提升為 OWNER (回傳 403)。
 * 5. OWNER 保護：
 *    - 若目標為組織內唯一的 OWNER，禁止將其降級為其他角色（避免組織無主）。
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; memberId: string } }
) {
  try {
    const auth = await getCurrentUser(req);
    if (!auth) {
      return unauthorizedResponse();
    }

    const { id: organizationId, memberId } = params;

    // 1. 驗證呼叫者在該組織的 Membership
    const callerMembership = await getUserMembership(auth.user.id, organizationId);
    if (!callerMembership) {
      return forbiddenResponse("您非該組織成員，無權管理成員角色");
    }

    // 2. 呼叫者角色檢查：僅 OWNER 與 ADMIN 允許
    if (callerMembership.role !== Role.OWNER && callerMembership.role !== Role.ADMIN) {
      return forbiddenResponse("僅有組織擁有者 (OWNER) 與管理員 (ADMIN) 可以修改成員角色");
    }

    // 3. 查詢目標成員 Membership 並進行租戶邊界比對 (IDOR 防護)
    const targetMembership = await db.membership.findUnique({
      where: { id: memberId },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    if (!targetMembership || targetMembership.organizationId !== organizationId) {
      return NextResponse.json(
        { error: "NOT_FOUND", message: "找不到該組織成員記錄" },
        { status: 404 }
      );
    }

    // 4. 解析欲變更之角色
    const body = await req.json();
    const { role: newRole } = body;

    const validRoles = [Role.OWNER, Role.ADMIN, Role.EDITOR, Role.VIEWER];
    if (!newRole || !validRoles.includes(newRole)) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", message: "無效的角色指定" },
        { status: 400 }
      );
    }

    // 5. 若新舊角色相同，直接返回
    if (targetMembership.role === newRole) {
      return NextResponse.json({
        success: true,
        message: "成員角色未變更",
        member: {
          membershipId: targetMembership.id,
          userId: targetMembership.userId,
          role: targetMembership.role,
        },
      });
    }

    // 6. ADMIN 越權防護規則
    if (callerMembership.role === Role.ADMIN) {
      // ADMIN 不得修改 OWNER
      if (targetMembership.role === Role.OWNER) {
        return forbiddenResponse("管理員 (ADMIN) 不得修改組織擁有者 (OWNER) 之角色");
      }
      // ADMIN 不得提升他人為 OWNER
      if (newRole === Role.OWNER) {
        return forbiddenResponse("僅有組織擁有者 (OWNER) 可以指派或轉移 OWNER 角色");
      }
    }

    // 7. OWNER 孤立保護：禁止將組織唯一的 OWNER 降級
    if (targetMembership.role === Role.OWNER && newRole !== Role.OWNER) {
      const ownerCount = await db.membership.count({
        where: { organizationId, role: Role.OWNER },
      });
      if (ownerCount <= 1) {
        return NextResponse.json(
          {
            error: "LAST_OWNER_PROTECTION",
            message: "無法降級組織唯一的擁有者 (OWNER)。請先指派其他成員為 OWNER 後再行調整。",
          },
          { status: 400 }
        );
      }
    }

    // 8. 執行角色更新
    const updatedMembership = await db.membership.update({
      where: { id: memberId },
      data: { role: newRole },
      include: {
        user: {
          select: { id: true, name: true, email: true, avatarUrl: true },
        },
      },
    });

    return NextResponse.json({
      success: true,
      message: `成員 ${updatedMembership.user.name || updatedMembership.user.email} 角色已更新為 ${newRole}`,
      member: {
        membershipId: updatedMembership.id,
        userId: updatedMembership.userId,
        name: updatedMembership.user.name,
        email: updatedMembership.user.email,
        avatarUrl: updatedMembership.user.avatarUrl,
        role: updatedMembership.role,
        updatedAt: updatedMembership.updatedAt,
      },
    });
  } catch (error: any) {
    console.error("Update member role error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "更新成員角色失敗" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/organizations/[id]/members/[memberId]
 * 將指定成員從組織中移除 (RBAC & Tenant Isolation Guarded)
 *
 * 權限規則：
 * 1. 呼叫者必須具備有效 Session 與該組織之 Membership。
 * 2. 呼叫者必須為 OWNER 或 ADMIN 角色 (EDITOR / VIEWER 回傳 403)。
 * 3. 跨租戶隔離：memberId 必須隸屬於 [id] 組織。
 * 4. ADMIN 限制：
 *    - ADMIN 不得移除 OWNER (回傳 403)。
 * 5. OWNER 保護：
 *    - 若目標為組織內唯一的 OWNER，禁止移除自己（避免組織無主）。
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string; memberId: string } }
) {
  try {
    const auth = await getCurrentUser(req);
    if (!auth) {
      return unauthorizedResponse();
    }

    const { id: organizationId, memberId } = params;

    // 1. 驗證呼叫者在該組織的 Membership
    const callerMembership = await getUserMembership(auth.user.id, organizationId);
    if (!callerMembership) {
      return forbiddenResponse("您非該組織成員，無權管理成員");
    }

    // 2. 呼叫者角色檢查：僅 OWNER 與 ADMIN 允許
    if (callerMembership.role !== Role.OWNER && callerMembership.role !== Role.ADMIN) {
      return forbiddenResponse("僅有組織擁有者 (OWNER) 與管理員 (ADMIN) 可以移除組織成員");
    }

    // 3. 查詢目標成員 Membership 並進行租戶邊界比對 (IDOR 防護)
    const targetMembership = await db.membership.findUnique({
      where: { id: memberId },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    if (!targetMembership || targetMembership.organizationId !== organizationId) {
      return NextResponse.json(
        { error: "NOT_FOUND", message: "找不到該組織成員記錄" },
        { status: 404 }
      );
    }

    // 4. ADMIN 越權防護規則：ADMIN 不得移除 OWNER
    if (callerMembership.role === Role.ADMIN && targetMembership.role === Role.OWNER) {
      return forbiddenResponse("管理員 (ADMIN) 不得移除組織擁有者 (OWNER)");
    }

    // 5. OWNER 孤立保護：禁止移除組織唯一的 OWNER
    if (targetMembership.role === Role.OWNER) {
      const ownerCount = await db.membership.count({
        where: { organizationId, role: Role.OWNER },
      });
      if (ownerCount <= 1) {
        return NextResponse.json(
          {
            error: "LAST_OWNER_PROTECTION",
            message: "無法移除組織唯一的擁有者 (OWNER)。請先轉移擁有權或指定其他 OWNER 後再行操作。",
          },
          { status: 400 }
        );
      }
    }

    // 6. 執行刪除成員 Membership
    await db.membership.delete({
      where: { id: memberId },
    });

    return NextResponse.json({
      success: true,
      message: `成員 ${targetMembership.user.name || targetMembership.user.email} 已成功從組織中移除`,
      removedMemberId: memberId,
    });
  } catch (error: any) {
    console.error("Remove member error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "移除成員失敗" },
      { status: 500 }
    );
  }
}
