export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, unauthorizedResponse } from "@/lib/auth";

export async function PATCH(req: NextRequest) {
  try {
    const auth = await getCurrentUser(req);
    if (!auth) {
      return unauthorizedResponse();
    }

    const body = await req.json();
    const { name } = body;

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", message: "姓名不能為空" },
        { status: 400 }
      );
    }

    const updated = await db.user.update({
      where: { id: auth.user.id },
      data: { name: name.trim() },
      select: {
        id: true,
        email: true,
        name: true,
        avatarUrl: true,
      },
    });

    return NextResponse.json({
      success: true,
      message: "個人資料更新成功",
      user: updated,
    });
  } catch (error: any) {
    console.error("Update profile error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "更新失敗，請稍後再試" },
      { status: 500 }
    );
  }
}
