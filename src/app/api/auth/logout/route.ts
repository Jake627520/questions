export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, destroySession, SESSION_COOKIE_NAME } from "@/lib/auth";

function readPresentedSessionToken(req: NextRequest): string | undefined {
  const cookieToken = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (cookieToken) return cookieToken;
  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.substring(7).trim();
  }
  return undefined;
}

export async function POST(req: NextRequest) {
  try {
    const auth = await getCurrentUser(req);
    // Cookie / Bearer 持有明文；資料庫以雜湊刪除。不能把 tokenHash 再雜湊一次。
    const presented = readPresentedSessionToken(req);
    if (auth?.session && presented) {
      await destroySession(presented);
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
