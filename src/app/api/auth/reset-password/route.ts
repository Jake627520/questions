export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  hashPasswordResetToken,
  hashPassword,
} from "@/lib/auth";

/**
 * GET /api/auth/reset-password
 * 檢查重設密碼 Token 之有效性
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const token = searchParams.get("token");

    if (!token || typeof token !== "string") {
      return NextResponse.json(
        { valid: false, message: "無效的重設密碼連結" },
        { status: 400 }
      );
    }

    const tokenHash = hashPasswordResetToken(token);
    const resetRecord = await db.passwordResetToken.findUnique({
      where: { tokenHash },
    });

    if (
      !resetRecord ||
      resetRecord.usedAt !== null ||
      resetRecord.expiresAt < new Date()
    ) {
      return NextResponse.json(
        { valid: false, message: "重設密碼連結無效、已使用或已過期" },
        { status: 400 }
      );
    }

    return NextResponse.json({ valid: true });
  } catch (error: any) {
    console.error("Verify reset token error:", error);
    return NextResponse.json(
      { valid: false, message: "驗證重設密碼連結失敗" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/auth/reset-password
 * 執行密碼重設 (原子性交易：更新密碼 + 標記 Token usedAt + 撤銷該 User 全部 Session)
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { token, password, confirmPassword } = body;

    // 1. 必填校驗
    if (!token || typeof token !== "string") {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", message: "請提供有效的重設密碼 Token" },
        { status: 400 }
      );
    }

    if (!password || typeof password !== "string") {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", message: "請輸入新密碼" },
        { status: 400 }
      );
    }

    // 2. 密碼長度驗證 (至少 8 碼)
    if (password.length < 8) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", message: "新密碼長度至少需 8 個字元" },
        { status: 400 }
      );
    }

    // 3. 密碼確認一致性驗證
    if (confirmPassword !== undefined && password !== confirmPassword) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", message: "兩次輸入的密碼不一致" },
        { status: 400 }
      );
    }

    const tokenHash = hashPasswordResetToken(token);
    const resetRecord = await db.passwordResetToken.findUnique({
      where: { tokenHash },
    });

    if (
      !resetRecord ||
      resetRecord.usedAt !== null ||
      resetRecord.expiresAt < new Date()
    ) {
      return NextResponse.json(
        { error: "INVALID_TOKEN", message: "重設密碼連結無效、已使用或已過期" },
        { status: 400 }
      );
    }

    // 4. 計算新密碼雜湊
    const newPasswordHash = await hashPassword(password);

    // 5. 原子交易：原子標記 Token 為已使用 + 更新密碼 + 全量撤銷 Sessions
    try {
      await db.$transaction(async (tx) => {
        const updateTokenResult = await tx.passwordResetToken.updateMany({
          where: {
            id: resetRecord.id,
            usedAt: null,
            expiresAt: { gt: new Date() },
          },
          data: {
            usedAt: new Date(),
          },
        });

        if (updateTokenResult.count === 0) {
          throw new Error("TOKEN_ALREADY_CONSUMED");
        }

        // 更新使用者密碼雜湊
        await tx.user.update({
          where: { id: resetRecord.userId },
          data: {
            passwordHash: newPasswordHash,
          },
        });

        // 撤銷該使用者在所有裝置上的所有 Session (全量登出)
        await tx.session.deleteMany({
          where: { userId: resetRecord.userId },
        });
      });
    } catch (err: any) {
      if (err.message === "TOKEN_ALREADY_CONSUMED") {
        return NextResponse.json(
          { error: "INVALID_TOKEN", message: "此重設密碼連結已被使用" },
          { status: 400 }
        );
      }
      throw err;
    }

    return NextResponse.json({
      success: true,
      message: "密碼重設成功！所有裝置已全量登出，請使用新密碼重新登入。",
    });
  } catch (error: any) {
    console.error("Reset password error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "重設密碼失敗，請稍後再試" },
      { status: 500 }
    );
  }
}
