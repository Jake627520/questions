export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  hashPassword,
  createSession,
  getSessionCookieOptions,
  hashInvitationToken,
  normalizeEmail,
  ACTIVE_ORG_COOKIE_NAME,
  getActiveOrgCookieOptions,
} from "@/lib/auth";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { extractClientIp } from "@/lib/submission-integrity";
import { parseBody, RegisterSchema } from "@/lib/validate";

export async function POST(req: NextRequest) {
  try {
    const ip = extractClientIp(req);
    const limited = await enforceRateLimit({
      key: `register:${ip}`,
      ...RATE_LIMITS.authAttempt,
    });
    if (limited) return limited;

    const parsed = await parseBody(req, RegisterSchema);
    if (!parsed.ok) return parsed.response;
    const { name, email, password, confirmPassword, inviteToken } = parsed.data;

    // 1. 註冊僅限受邀：沒有邀請 token 一律拒絕 (不建立任何資料)
    if (!inviteToken) {
      return NextResponse.json(
        { error: "INVITATION_REQUIRED", message: "本系統僅限受邀註冊，請向管理者索取邀請連結" },
        { status: 403 }
      );
    }

    const trimmedEmail = normalizeEmail(email);

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

    // 5. 驗證邀請：存在、未使用、未撤銷、未過期，且受邀 Email 與註冊 Email 一致
    //    (先驗邀請再查 Email 是否存在，避免無邀請者藉 409 枚舉帳號)
    const invitation = await db.invitation.findUnique({
      where: { tokenHash: hashInvitationToken(inviteToken) },
    });
    const now = new Date();
    if (
      !invitation ||
      invitation.usedAt !== null ||
      invitation.revokedAt !== null ||
      invitation.expiresAt <= now
    ) {
      return NextResponse.json(
        { error: "INVALID_INVITATION", message: "邀請連結無效、已使用、已撤銷或已過期" },
        { status: 403 }
      );
    }
    if (normalizeEmail(invitation.invitedEmail) !== trimmedEmail) {
      return NextResponse.json(
        { error: "EMAIL_MISMATCH", message: "註冊的電子郵件必須與受邀電子郵件相同" },
        { status: 403 }
      );
    }

    // 6. 檢查 Email 是否已存在 (防止重複註冊)
    const existing = await db.user.findUnique({
      where: { email: trimmedEmail },
    });

    if (existing) {
      return NextResponse.json(
        { error: "EMAIL_ALREADY_EXISTS", message: "此電子郵件已被註冊" },
        { status: 409 }
      );
    }

    // 7. 安全雜湊密碼 (scrypt + unique salt)
    const passwordHash = await hashPassword(password);
    const userName = name ? String(name).trim() : trimmedEmail.split("@")[0];

    // 8. 原子交易：條件式消耗邀請 (防並發重用) + 建立 User + 加入邀請方組織
    let newUser;
    try {
      newUser = await db.$transaction(async (tx) => {
        const consumed = await tx.invitation.updateMany({
          where: {
            id: invitation.id,
            usedAt: null,
            revokedAt: null,
            expiresAt: { gt: new Date() },
          },
          data: { usedAt: new Date() },
        });
        if (consumed.count === 0) {
          throw new Error("INVITATION_ALREADY_CONSUMED");
        }

        return tx.user.create({
          data: {
            email: trimmedEmail,
            name: userName,
            passwordHash,
            memberships: {
              create: {
                organizationId: invitation.organizationId,
                role: invitation.role,
              },
            },
          },
        });
      });
    } catch (err: any) {
      if (err.message === "INVITATION_ALREADY_CONSUMED") {
        return NextResponse.json(
          { error: "INVALID_INVITATION", message: "此邀請連結已被使用" },
          { status: 403 }
        );
      }
      throw err;
    }

    // 9. 建立登入 Session
    const { session, token } = await createSession(newUser.id);

    const res = NextResponse.json(
      {
        success: true,
        message: "註冊成功",
        user: {
          id: newUser.id,
          email: newUser.email,
          name: newUser.name,
        },
      },
      { status: 201 }
    );

    // 10. 設定 HttpOnly Session Cookie，並把 Active Organization 切到邀請方組織
    const cookieOptions = getSessionCookieOptions(session.expiresAt);
    res.cookies.set(cookieOptions.name, token, cookieOptions);
    res.cookies.set(
      ACTIVE_ORG_COOKIE_NAME,
      invitation.organizationId,
      getActiveOrgCookieOptions()
    );

    return res;
  } catch (error: any) {
    console.error("Register error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "註冊處理失敗，請稍後再試" },
      { status: 500 }
    );
  }
}
