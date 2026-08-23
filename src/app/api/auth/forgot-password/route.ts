export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  normalizeEmail,
  generatePasswordResetToken,
  hashPasswordResetToken,
  PASSWORD_RESET_EXPIRY_MINUTES,
} from "@/lib/auth";

/**
 * POST /api/auth/forgot-password
 * 密碼重設申請 (盲態防護：無論 Email 是否存在，一律回傳統一 200 回應，防止 Email 枚舉)
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const rawEmail = typeof body.email === "string" ? body.email : "";
    const normalizedEmail = normalizeEmail(rawEmail);

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (normalizedEmail && emailRegex.test(normalizedEmail)) {
      const user = await db.user.findUnique({
        where: { email: normalizedEmail },
      });

      if (user) {
        // Single Active Token 原則：刪除該使用者先前未使用的 reset token
        await db.passwordResetToken.deleteMany({
          where: { userId: user.id },
        });

        // 產生 256-bit CSPRNG Reset Token 與 SHA-256 Hash
        const rawToken = generatePasswordResetToken();
        const tokenHash = hashPasswordResetToken(rawToken);
        const expiresAt = new Date(
          Date.now() + PASSWORD_RESET_EXPIRY_MINUTES * 60 * 1000
        );

        await db.passwordResetToken.create({
          data: {
            userId: user.id,
            tokenHash,
            expiresAt,
          },
        });
      }
    }

    // 統一回傳固定成功訊息，絕不洩漏使用者存在與否或任何識別碼
    return NextResponse.json({
      success: true,
      message: "如果該電子郵件已註冊，重設密碼連結已寄送至信箱。",
    });
  } catch (error: any) {
    console.error("Forgot password error:", error);
    return NextResponse.json({
      success: true,
      message: "如果該電子郵件已註冊，重設密碼連結已寄送至信箱。",
    });
  }
}
