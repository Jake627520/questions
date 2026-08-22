export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, destroySession, SESSION_COOKIE_NAME } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const auth = await getCurrentUser(req);
    if (auth?.session) {
      await destroySession(auth.session.token);
    }

    const res = NextResponse.json({ success: true, message: "已成功登出" });

    // 清除 Cookie
    res.cookies.set(SESSION_COOKIE_NAME, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });

    return res;
  } catch (error: any) {
    console.error("Logout error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "登出處理失敗" },
      { status: 500 }
    );
  }
}
