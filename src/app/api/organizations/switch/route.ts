export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  getCurrentUser,
  unauthorizedResponse,
  forbiddenResponse,
  getActiveOrgCookieOptions,
} from "@/lib/auth";

/**
 * POST /api/organizations/switch
 * 安全切換目前的工作區 (Active Organization Context)
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await getCurrentUser(req);
    if (!auth) {
      return unauthorizedResponse();
    }

    const body = await req.json();
    const { organizationId } = body;

    if (!organizationId || typeof organizationId !== "string") {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", message: "請指定要切換的組織 ID" },
        { status: 400 }
      );
    }

    // 嚴格驗證使用者是否確實為該目標組織的成員 (Cross-tenant switch defense)
    const membership = await db.membership.findUnique({
      where: {
        userId_organizationId: {
          userId: auth.user.id,
          organizationId: organizationId.trim(),
        },
      },
      include: {
        organization: true,
      },
    });

    if (!membership) {
      return forbiddenResponse("您不具備存取該工作區之權限");
    }

    const res = NextResponse.json({
      success: true,
      message: `已切換至 ${membership.organization.name}`,
      activeOrganization: {
        id: membership.organization.id,
        name: membership.organization.name,
        slug: membership.organization.slug,
        role: membership.role,
      },
    });

    // 設定安全 HttpOnly Context Cookie
    const cookieOptions = getActiveOrgCookieOptions();
    res.cookies.set(cookieOptions.name, membership.organization.id, cookieOptions);

    return res;
  } catch (error: any) {
    console.error("Switch organization error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "工作區切換失敗" },
      { status: 500 }
    );
  }
}
