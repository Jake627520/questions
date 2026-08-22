export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  getCurrentUser,
  unauthorizedResponse,
  getActiveOrganizationContext,
  getActiveOrgCookieOptions,
} from "@/lib/auth";
import { Role } from "@prisma/client";

/**
 * GET /api/organizations
 * 列出當前登入使用者所屬之組織清單及其個人角色
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await getCurrentUser(req);
    if (!auth) {
      return unauthorizedResponse();
    }

    // 取得所有隸屬組織
    const memberships = await db.membership.findMany({
      where: { userId: auth.user.id },
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            slug: true,
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    const activeContext = await getActiveOrganizationContext(req);

    const organizations = memberships.map((m) => ({
      id: m.organization.id,
      name: m.organization.name,
      slug: m.organization.slug,
      createdAt: m.organization.createdAt,
      role: m.role,
      isActive: activeContext?.organization.id === m.organization.id,
    }));

    return NextResponse.json({
      success: true,
      organizations,
      activeOrganization: activeContext
        ? {
            id: activeContext.organization.id,
            name: activeContext.organization.name,
            slug: activeContext.organization.slug,
            role: activeContext.membership.role,
          }
        : null,
    });
  } catch (error: any) {
    console.error("Get organizations error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "取得組織清單失敗" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/organizations
 * 建立新組織，並在單一 Transaction 內指派建立者為 OWNER
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await getCurrentUser(req);
    if (!auth) {
      return unauthorizedResponse();
    }

    const body = await req.json();
    const { name } = body;

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", message: "組織名稱為必填項目" },
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

    // 產生唯一 slug
    const normalizedSlugBase = trimmedName
      .toLowerCase()
      .replace(/[^\w\u4e00-\u9fa5]+/g, "-")
      .replace(/^-+|-+$/g, "");
    const orgSlug = `${normalizedSlugBase || "org"}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

    // 單一 Transaction 建立 Organization 與 OWNER Membership
    const result = await db.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: {
          name: trimmedName,
          slug: orgSlug,
        },
      });

      const membership = await tx.membership.create({
        data: {
          userId: auth.user.id,
          organizationId: org.id,
          role: Role.OWNER,
        },
      });

      return { org, membership };
    });

    const res = NextResponse.json(
      {
        success: true,
        message: "組織建立成功",
        organization: {
          id: result.org.id,
          name: result.org.name,
          slug: result.org.slug,
          role: result.membership.role,
        },
      },
      { status: 201 }
    );

    // 自動切換為新建立的組織
    const cookieOptions = getActiveOrgCookieOptions();
    res.cookies.set(cookieOptions.name, result.org.id, cookieOptions);

    return res;
  } catch (error: any) {
    console.error("Create organization error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "建立組織失敗，請稍後再試" },
      { status: 500 }
    );
  }
}
