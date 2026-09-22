export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyPassword, createSession, getSessionCookieOptions } from "@/lib/auth";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { extractClientIp } from "@/lib/submission-integrity";
import { parseBody, LoginSchema } from "@/lib/validate";

export async function POST(req: NextRequest) {
  try {
    const ip = extractClientIp(req);
    const limited = await enforceRateLimit({
      key: `login:${ip}`,
      ...RATE_LIMITS.authAttempt,
    });
    if (limited) return limited;

    const parsed = await parseBody(req, LoginSchema);
    if (!parsed.ok) return parsed.response;
    const { email, password } = parsed.data;

    const user = await db.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    if (!user || !user.passwordHash) {
      return NextResponse.json(
        { error: "INVALID_CREDENTIALS", message: "電子郵件或密碼錯誤" },
        { status: 401 }
      );
    }

    const isValid = await verifyPassword(password, user.passwordHash);
    if (!isValid) {
      return NextResponse.json(
        { error: "INVALID_CREDENTIALS", message: "電子郵件或密碼錯誤" },
        { status: 401 }
      );
    }

    // 建立 Session
    const { session, token } = await createSession(user.id);

    const res = NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
      },
    });

    // 設定安全 HttpOnly Cookie
    const cookieOptions = getSessionCookieOptions(session.expiresAt);
    res.cookies.set(cookieOptions.name, token, cookieOptions);

    return res;
  } catch (error: any) {
    console.error("Login error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "登入處理失敗" },
      { status: 500 }
    );
  }
}
