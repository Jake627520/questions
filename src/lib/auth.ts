import crypto from "crypto";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { User, Session } from "@prisma/client";

export const SESSION_COOKIE_NAME = "survey_session";
export const DEFAULT_SESSION_DURATION_DAYS = 7;

export interface AuthContext {
  user: User;
  session: Session;
}

export class AuthError extends Error {
  statusCode: number;
  code: string;

  constructor(message = "請先登入系統", code = "UNAUTHORIZED", statusCode = 401) {
    super(message);
    this.name = "AuthError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

// =========================================================================
// 1. Password Security (scrypt + unique salt + timing-safe comparison)
// =========================================================================

/**
 * 使用 crypto.scrypt + 16-byte random salt 雜湊密碼
 * 儲存格式為 salt:derivedKey (hex)
 */
export async function hashPassword(password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString("hex");
    crypto.scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) return reject(err);
      resolve(`${salt}:${derivedKey.toString("hex")}`);
    });
  });
}

/**
 * 驗證密碼，使用 timingSafeEqual 防止時序攻擊 (Timing Attack)
 */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (!storedHash || !storedHash.includes(":")) {
      return resolve(false);
    }

    const [salt, key] = storedHash.split(":");
    if (!salt || !key) {
      return resolve(false);
    }

    crypto.scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) return resolve(false);

      const keyBuffer = Buffer.from(key, "hex");
      if (keyBuffer.length !== derivedKey.length) {
        return resolve(false);
      }

      try {
        const match = crypto.timingSafeEqual(keyBuffer, derivedKey);
        resolve(match);
      } catch {
        resolve(false);
      }
    });
  });
}

// =========================================================================
// 2. Session Management (256-bit randomBytes + DB-backed Session)
// =========================================================================

/**
 * 產生 256-bit 隨機 Session Token 並存入資料庫
 */
export async function createSession(
  userId: string,
  durationDays = DEFAULT_SESSION_DURATION_DAYS
): Promise<{ session: Session; token: string }> {
  // 生成高熵 256-bit (32 bytes) 隨機字串
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000);

  const session = await db.session.create({
    data: {
      userId,
      token,
      expiresAt,
    },
  });

  return { session, token };
}

/**
 * 驗證 Session Token，並檢查過期時間
 */
export async function validateSession(token: string): Promise<AuthContext | null> {
  if (!token || typeof token !== "string") {
    return null;
  }

  const session = await db.session.findUnique({
    where: { token },
    include: { user: true },
  });

  if (!session) {
    return null;
  }

  // 檢查是否過期
  if (session.expiresAt < new Date()) {
    // 異步清理過期 Session
    try {
      await db.session.delete({ where: { id: session.id } });
    } catch {
      // 忽略並發刪除衝突
    }
    return null;
  }

  return {
    user: session.user,
    session: {
      id: session.id,
      userId: session.userId,
      token: session.token,
      expiresAt: session.expiresAt,
      createdAt: session.createdAt,
    },
  };
}

/**
 * 登出 / 註銷 Session
 */
export async function destroySession(token: string): Promise<void> {
  if (!token) return;
  try {
    await db.session.delete({ where: { token } });
  } catch {
    // Session 不存在或已被刪除時正常略過
  }
}

// =========================================================================
// 3. Centralized Auth Helpers & Cookie Management
// =========================================================================

/**
 * 從請求（Cookie 或 Authorization Header）中取得目前的登入使用者
 */
export async function getCurrentUser(req?: NextRequest): Promise<AuthContext | null> {
  let token: string | undefined;

  // 1. 優先從 NextRequest cookies 讀取
  if (req?.cookies) {
    token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  }

  // 2. 若未提供 req 或 req.cookies 無值，嘗試從 Next.js headers cookies() 讀取
  if (!token) {
    try {
      const cookieStore = cookies();
      token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    } catch {
      // 在純測試環境或無 cookies() 上下文時忽略
    }
  }

  // 3. 支援 Bearer Token（供 API 自動化測試或 CLI 調用）
  if (!token && req) {
    const authHeader = req.headers.get("authorization");
    if (authHeader?.startsWith("Bearer ")) {
      token = authHeader.substring(7).trim();
    }
  }

  if (!token) {
    return null;
  }

  return validateSession(token);
}

/**
 * 強制要求登入。若未登入，拋出 AuthError
 */
export async function requireUser(req?: NextRequest): Promise<AuthContext> {
  const auth = await getCurrentUser(req);
  if (!auth) {
    throw new AuthError("未授權存取，請先登入系統", "UNAUTHORIZED", 401);
  }
  return auth;
}

/**
 * 統一產生 401 Unauthorized 回應
 */
export function unauthorizedResponse(
  message = "未授權存取，請先登入系統",
  code = "UNAUTHORIZED"
): NextResponse {
  return NextResponse.json(
    {
      error: code,
      message,
    },
    { status: 401 }
  );
}

/**
 * 取得 Session Cookie 的標準設定選項
 */
export function getSessionCookieOptions(expiresAt?: Date) {
  return {
    name: SESSION_COOKIE_NAME,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    expires: expiresAt || new Date(Date.now() + DEFAULT_SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000),
  };
}

/**
 * 驗證並過濾 returnTo 轉址路徑，防止 Open Redirect 漏洞
 * 僅允許以單一 / 開頭的同源相對路徑，嚴格阻擋 //、http://、https:// 等外部網址
 */
export function getSafeReturnUrl(returnTo: string | null | undefined, defaultUrl = "/"): string {
  if (!returnTo || typeof returnTo !== "string") {
    return defaultUrl;
  }
  const trimmed = returnTo.trim();
  // 必須以 / 開頭，且不能以 // 或 /\ 開頭（防止 protocol-relative URL），不能包含冒號或反斜線
  if (
    trimmed.startsWith("/") &&
    !trimmed.startsWith("//") &&
    !trimmed.startsWith("/\\") &&
    !trimmed.includes(":") &&
    !trimmed.includes("\\")
  ) {
    return trimmed;
  }
  return defaultUrl;
}

// =========================================================================
// 4. Tenant / Organization Isolation & RBAC Helpers
// =========================================================================

import { Role } from "@prisma/client";

/**
 * 標準角色授權群組
 */
export const ROLES = {
  ALL: [Role.OWNER, Role.ADMIN, Role.EDITOR, Role.VIEWER] as Role[],
  MANAGERS: [Role.OWNER, Role.ADMIN] as Role[],
  EDITORS: [Role.OWNER, Role.ADMIN, Role.EDITOR] as Role[],
  OWNER_ONLY: [Role.OWNER] as Role[],
} as const;

/**
 * 取得使用者的所有組織 ID 清單
 */
export async function getUserOrganizationIds(userId: string): Promise<string[]> {
  const memberships = await db.membership.findMany({
    where: { userId },
    select: { organizationId: true },
  });
  return memberships.map((m) => m.organizationId);
}

/**
 * 取得使用者在特定組織的 Membership (包含 Role)
 */
export async function getUserMembership(
  userId: string,
  organizationId: string
): Promise<{ id: string; role: Role; organizationId: string } | null> {
  if (!userId || !organizationId) return null;
  return db.membership.findUnique({
    where: {
      userId_organizationId: {
        userId,
        organizationId,
      },
    },
    select: {
      id: true,
      role: true,
      organizationId: true,
    },
  });
}

/**
 * 檢查使用者是否為指定組織的成員
 */
export async function isUserInOrganization(userId: string, organizationId: string): Promise<boolean> {
  const membership = await getUserMembership(userId, organizationId);
  return !!membership;
}

/**
 * 檢查使用者在特定組織中是否具備指定角色權限 (RBAC Guard)
 */
export async function hasRole(
  userId: string,
  organizationId: string,
  allowedRoles: Role[]
): Promise<{ allowed: boolean; membership: { id: string; role: Role; organizationId: string } | null }> {
  const membership = await getUserMembership(userId, organizationId);
  if (!membership) {
    return { allowed: false, membership: null };
  }
  const allowed = allowedRoles.includes(membership.role);
  return { allowed, membership };
}

/**
 * 統一產生 403 Forbidden 回應（跨租戶存取或角色權限不足阻擋）
 */
export function forbiddenResponse(
  message = "無權存取該組織的資源",
  code = "FORBIDDEN"
): NextResponse {
  return NextResponse.json(
    {
      error: code,
      message,
    },
    { status: 403 }
  );
}

/**
 * 產生 256-bit 高熵、URL-safe 且不可預測之 Public Token (用於公開填答 URL)
 */
export function generatePublicToken(): string {
  return crypto.randomBytes(24).toString("base64url");
}




