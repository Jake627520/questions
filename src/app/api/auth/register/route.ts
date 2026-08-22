export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hashPassword, createSession, getSessionCookieOptions } from "@/lib/auth";
import { Role } from "@prisma/client";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, email, password, confirmPassword } = body;

    // 1. 基本欄位存在性檢查
    if (!email || !password) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", message: "電子郵件與密碼為必填項目" },
        { status: 400 }
      );
    }

    const trimmedEmail = email.toLowerCase().trim();

    // 2. Email 格式檢查
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", message: "電子郵件格式不正確" },
        { status: 400 }
      );
    }

    // 3. 密碼確認檢查
    if (confirmPassword !== undefined && password !== confirmPassword) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", message: "兩次輸入的密碼不相符" },
        { status: 400 }
      );
    }

    // 4. 密碼強度基礎原則 (至少 8 碼)
    if (typeof password !== "string" || password.length < 8) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", message: "密碼長度至少需 8 個字元" },
        { status: 400 }
      );
    }

    // 5. 檢查 Email 是否已存在 (防止重複註冊)
    const existing = await db.user.findUnique({
      where: { email: trimmedEmail },
    });

    if (existing) {
      return NextResponse.json(
        { error: "EMAIL_ALREADY_EXISTS", message: "此電子郵件已被註冊" },
        { status: 409 }
      );
    }

    // 6. 安全雜湊密碼 (scrypt + unique salt)
    const passwordHash = await hashPassword(password);
    const userName = name ? String(name).trim() : trimmedEmail.split("@")[0];

    // 7. 建立 User 與預設個人 Workspace
    const newUser = await db.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: trimmedEmail,
          name: userName,
          passwordHash,
        },
      });

      // 為新註冊使用者建立預設空間
      const orgSlug = `workspace-${user.id.slice(-8)}-${Date.now().toString(36)}`;
      const org = await tx.organization.create({
        data: {
          name: `${userName} 的工作區`,
          slug: orgSlug,
          memberships: {
            create: {
              userId: user.id,
              role: Role.OWNER,
            },
          },
        },
      });

      return { user, org };
    });

    // 8. 建立登入 Session
    const { session, token } = await createSession(newUser.user.id);

    const res = NextResponse.json(
      {
        success: true,
        message: "註冊成功",
        user: {
          id: newUser.user.id,
          email: newUser.user.email,
          name: newUser.user.name,
        },
      },
      { status: 201 }
    );

    // 9. 設定 HttpOnly Cookie
    const cookieOptions = getSessionCookieOptions(session.expiresAt);
    res.cookies.set(cookieOptions.name, token, cookieOptions);

    return res;
  } catch (error: any) {
    console.error("Register error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "註冊處理失敗，請稍後再試" },
      { status: 500 }
    );
  }
}
