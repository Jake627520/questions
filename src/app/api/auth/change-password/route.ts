export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, unauthorizedResponse, verifyPassword, hashPassword } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const auth = await getCurrentUser(req);
    if (!auth) {
      return unauthorizedResponse();
    }

    const body = await req.json();
    const { currentPassword, newPassword, confirmNewPassword } = body;

    // 1. 必填驗證
    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", message: "請輸入目前密碼與新密碼" },
        { status: 400 }
      );
    }

    // 2. 新密碼確認驗證
    if (confirmNewPassword !== undefined && newPassword !== confirmNewPassword) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", message: "兩次輸入的新密碼不相符" },
        { status: 400 }
      );
    }

    // 3. 新密碼長度驗證 (至少 8 碼)
    if (typeof newPassword !== "string" || newPassword.length < 8) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", message: "新密碼長度至少需 8 個字元" },
        { status: 400 }
      );
    }

    // 4. 取得使用者現有密碼雜湊
    const user = await db.user.findUnique({
      where: { id: auth.user.id },
    });

    if (!user || !user.passwordHash) {
      return NextResponse.json(
        { error: "UNAUTHORIZED", message: "無法驗證帳號資訊" },
        { status: 401 }
      );
    }

    // 5. 驗證目前密碼 (時序安全)
    const isCurrentValid = await verifyPassword(currentPassword, user.passwordHash);
    if (!isCurrentValid) {
      return NextResponse.json(
        { error: "INVALID_CURRENT_PASSWORD", message: "目前密碼不正確" },
        { status: 400 }
      );
    }

    // 6. 新密碼不得與舊密碼相同
    const isSameAsOld = await verifyPassword(newPassword, user.passwordHash);
    if (isSameAsOld) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", message: "新密碼不得與目前密碼相同" },
        { status: 400 }
      );
    }

    // 7. 雜湊新密碼並更新資料庫
    const newHash = await hashPassword(newPassword);

    await db.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { passwordHash: newHash },
      });

      // 撤銷除當前 Session 以外之所有既有 Sessions (防止已被劫持的舊工作階段繼續使用)
      await tx.session.deleteMany({
        where: {
          userId: user.id,
          token: { not: auth.session.token },
        },
      });
    });

    return NextResponse.json({
      success: true,
      message: "密碼變更成功，已為您終止其他裝置的工作階段",
    });
  } catch (error: any) {
    console.error("Change password error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "密碼修改失敗，請稍後再試" },
      { status: 500 }
    );
  }
}
