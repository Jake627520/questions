export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, unauthorizedResponse } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const auth = await getCurrentUser(req);
    if (!auth) {
      return unauthorizedResponse();
    }

    // 取得使用者及其所屬組織
    const userWithMemberships = await db.user.findUnique({
      where: { id: auth.user.id },
      select: {
        id: true,
        email: true,
        name: true,
        avatarUrl: true,
        memberships: {
          include: {
            organization: true,
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      user: userWithMemberships,
    });
  } catch (error: any) {
    console.error("Auth me error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "取得使用者資訊失敗" },
      { status: 500 }
    );
  }
}
