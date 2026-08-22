import { describe, it, expect, beforeEach } from "vitest";
import { db } from "../src/lib/db";
import {
  hashPassword,
  createSession,
  getSafeReturnUrl,
  SESSION_COOKIE_NAME,
} from "../src/lib/auth";
import { POST as loginPOST } from "../src/app/api/auth/login/route";
import { POST as registerPOST } from "../src/app/api/auth/register/route";
import { POST as logoutPOST } from "../src/app/api/auth/logout/route";
import { GET as meGET } from "../src/app/api/auth/me/route";
import { POST as changePasswordPOST } from "../src/app/api/auth/change-password/route";
import { PATCH as profilePATCH } from "../src/app/api/auth/profile/route";
import { GET as surveysGET } from "../src/app/api/surveys/route";
import { NextRequest } from "next/server";

describe("Phase M8-A: Authentication UX & Account Center Tests", () => {
  const testEmail = "m8a-user@example.com";
  const testPassword = "OriginalPassword123!";
  let testUser: any;
  let activeSessionToken: string;

  beforeEach(async () => {
    // 清理測試資料
    await db.session.deleteMany({
      where: { user: { email: { startsWith: "m8a-" } } },
    });
    await db.membership.deleteMany({
      where: { user: { email: { startsWith: "m8a-" } } },
    });
    await db.survey.deleteMany({
      where: { organization: { slug: { startsWith: "m8a-" } } },
    });
    await db.organization.deleteMany({
      where: { slug: { startsWith: "m8a-" } },
    });
    await db.user.deleteMany({
      where: { email: { startsWith: "m8a-" } },
    });

    // 建立基礎使用者
    const passwordHash = await hashPassword(testPassword);
    testUser = await db.user.create({
      data: {
        email: testEmail,
        name: "M8A Test User",
        passwordHash,
      },
    });

    const { token } = await createSession(testUser.id);
    activeSessionToken = token;
  });

  // =========================================================================
  // 1. Login Scenarios
  // =========================================================================
  describe("1. 登入功能驗證 (Login Scenarios)", () => {
    it("1. 登入成功：應回傳 200、使用者資訊並設定安全 Session Cookie", async () => {
      const req = new NextRequest("http://localhost:3000/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: testEmail, password: testPassword }),
      });

      const res = await loginPOST(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.user.email).toBe(testEmail);
      expect(data.user.name).toBe("M8A Test User");

      // 檢查 Session Cookie 是否設置
      const setCookie = res.cookies.get(SESSION_COOKIE_NAME);
      expect(setCookie).toBeDefined();
      expect(setCookie?.value).toBeDefined();
      expect(setCookie?.httpOnly).toBe(true);
      expect(setCookie?.sameSite).toBe("lax");
    });

    it("2. 登入密碼錯誤：應回傳 401 Unauthorized 且不洩漏密碼細節", async () => {
      const req = new NextRequest("http://localhost:3000/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: testEmail, password: "WrongPassword999!" }),
      });

      const res = await loginPOST(req);
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toBe("INVALID_CREDENTIALS");
    });

    it("3. 登入欄位缺失：未提供 email 或 password 應回傳 400 Bad Request", async () => {
      const req = new NextRequest("http://localhost:3000/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: testEmail }),
      });

      const res = await loginPOST(req);
      expect(res.status).toBe(400);
    });
  });

  // =========================================================================
  // 2. Register Scenarios
  // =========================================================================
  describe("2. 註冊功能驗證 (Register Scenarios)", () => {
    it("4. 註冊成功：建立 User、預設 Organization、Session 並自動登入", async () => {
      const regEmail = "m8a-newbie@example.com";
      const req = new NextRequest("http://localhost:3000/api/auth/register", {
        method: "POST",
        body: JSON.stringify({
          name: "新成員",
          email: regEmail,
          password: "SecurePass888!",
          confirmPassword: "SecurePass888!",
        }),
      });

      const res = await registerPOST(req);
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.user.email).toBe(regEmail);

      // 驗證 DB 內部存在該 User 以及自動建立的 OWNER 組織
      const checkUser = await db.user.findUnique({
        where: { email: regEmail },
        include: { memberships: { include: { organization: true } } },
      });
      expect(checkUser).toBeDefined();
      expect(checkUser?.memberships.length).toBe(1);
      expect(checkUser?.memberships[0].role).toBe("OWNER");

      // 驗證 Cookie 成功寫入
      expect(res.cookies.get(SESSION_COOKIE_NAME)).toBeDefined();
    });

    it("5. 重複 Email 註冊：應回傳 409 Conflict 錯誤", async () => {
      const req = new NextRequest("http://localhost:3000/api/auth/register", {
        method: "POST",
        body: JSON.stringify({
          name: "重複使用者",
          email: testEmail, // 已存在的 Email
          password: "AnotherPassword123!",
          confirmPassword: "AnotherPassword123!",
        }),
      });

      const res = await registerPOST(req);
      expect(res.status).toBe(409);
      const data = await res.json();
      expect(data.error).toBe("EMAIL_ALREADY_EXISTS");
    });

    it("6. 兩次輸入密碼不符：應回傳 400 Bad Request", async () => {
      const req = new NextRequest("http://localhost:3000/api/auth/register", {
        method: "POST",
        body: JSON.stringify({
          name: "密碼打錯的人",
          email: "m8a-mismatch@example.com",
          password: "Password1234!",
          confirmPassword: "PasswordDifferent!",
        }),
      });

      const res = await registerPOST(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.message).toContain("兩次輸入的密碼不相符");
    });
  });

  // =========================================================================
  // 3. Logout & Session Invalidation
  // =========================================================================
  describe("3. 登出與 Session 銷毀 (Logout & Expiration)", () => {
    it("8. 登出銷毀 Session：登出後再次存取受保護 API 應得到 401", async () => {
      // 1. 存取 meGET 確認有效
      const reqMe = new NextRequest("http://localhost:3000/api/auth/me", {
        headers: { Cookie: `${SESSION_COOKIE_NAME}=${activeSessionToken}` },
      });
      const resMe = await meGET(reqMe);
      expect(resMe.status).toBe(200);

      // 2. 執行登出
      const reqLogout = new NextRequest("http://localhost:3000/api/auth/logout", {
        method: "POST",
        headers: { Cookie: `${SESSION_COOKIE_NAME}=${activeSessionToken}` },
      });
      const resLogout = await logoutPOST(reqLogout);
      expect(resLogout.status).toBe(200);

      // 3. 再次存取 meGET -> 應為 401
      const reqMeAfter = new NextRequest("http://localhost:3000/api/auth/me", {
        headers: { Cookie: `${SESSION_COOKIE_NAME}=${activeSessionToken}` },
      });
      const resMeAfter = await meGET(reqMeAfter);
      expect(resMeAfter.status).toBe(401);
    });

    it("9. 過期的 Session 存取應被拒絕 (401)", async () => {
      const expiredSession = await db.session.create({
        data: {
          userId: testUser.id,
          token: "m8a-expired-token-" + Date.now(),
          expiresAt: new Date(Date.now() - 60000), // 1 分鐘前過期
        },
      });

      const req = new NextRequest("http://localhost:3000/api/auth/me", {
        headers: { Cookie: `${SESSION_COOKIE_NAME}=${expiredSession.token}` },
      });
      const res = await meGET(req);
      expect(res.status).toBe(401);
    });
  });

  // =========================================================================
  // 4. Change Password & Session Revocation
  // =========================================================================
  describe("4. 密碼修改與多裝置 Session 撤銷", () => {
    it("10 & 12. 密碼修改成功，並自動撤銷其他工作階段 (Revoke Other Sessions)", async () => {
      // 建立第二個 Session (代表另一個裝置)
      const secondSession = await createSession(testUser.id);

      const newSecret = "BrandNewSecretPassword999!";
      const req = new NextRequest("http://localhost:3000/api/auth/change-password", {
        method: "POST",
        headers: { Cookie: `${SESSION_COOKIE_NAME}=${activeSessionToken}` },
        body: JSON.stringify({
          currentPassword: testPassword,
          newPassword: newSecret,
          confirmNewPassword: newSecret,
        }),
      });

      const res = await changePasswordPOST(req);
      expect(res.status).toBe(200);

      // 驗證當前 Session 依然有效 (不突兀斷線)
      const checkCurrent = await db.session.findUnique({
        where: { token: activeSessionToken },
      });
      expect(checkCurrent).toBeDefined();

      // 驗證另一個裝置的 Session 已被刪除撤銷
      const checkSecond = await db.session.findUnique({
        where: { token: secondSession.token },
      });
      expect(checkSecond).toBeNull();

      // 驗證拿新密碼登入成功
      const reqLoginNew = new NextRequest("http://localhost:3000/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: testEmail, password: newSecret }),
      });
      const resLoginNew = await loginPOST(reqLoginNew);
      expect(resLoginNew.status).toBe(200);
    });

    it("11. 修改密碼時舊密碼輸入錯誤應被拒絕 (400)", async () => {
      const req = new NextRequest("http://localhost:3000/api/auth/change-password", {
        method: "POST",
        headers: { Cookie: `${SESSION_COOKIE_NAME}=${activeSessionToken}` },
        body: JSON.stringify({
          currentPassword: "IncorrectOldPassword!",
          newPassword: "BrandNewPassword123!",
          confirmNewPassword: "BrandNewPassword123!",
        }),
      });

      const res = await changePasswordPOST(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("INVALID_CURRENT_PASSWORD");
    });
  });

  // =========================================================================
  // 5. Account Profile & Open Redirect Prevention
  // =========================================================================
  describe("5. 個人資料與 Open Redirect 安全過濾", () => {
    it("13 & 14. 未登入存取 profile 得到 401；登入後可成功更新姓名", async () => {
      // 1. 未登入更新 -> 401
      const reqNoAuth = new NextRequest("http://localhost:3000/api/auth/profile", {
        method: "PATCH",
        body: JSON.stringify({ name: "駭客" }),
      });
      const resNoAuth = await profilePATCH(reqNoAuth);
      expect(resNoAuth.status).toBe(401);

      // 2. 登入更新 -> 200
      const reqAuth = new NextRequest("http://localhost:3000/api/auth/profile", {
        method: "PATCH",
        headers: { Cookie: `${SESSION_COOKIE_NAME}=${activeSessionToken}` },
        body: JSON.stringify({ name: "更新後的新稱呼" }),
      });
      const resAuth = await profilePATCH(reqAuth);
      expect(resAuth.status).toBe(200);

      const checkUser = await db.user.findUnique({ where: { id: testUser.id } });
      expect(checkUser?.name).toBe("更新後的新稱呼");
    });

    it("15, 16 & 17. getSafeReturnUrl 嚴格阻擋 Open Redirect 攻擊", () => {
      // 正常相對路徑
      expect(getSafeReturnUrl("/surveys")).toBe("/surveys");
      expect(getSafeReturnUrl("/surveys/import?mode=test")).toBe("/surveys/import?mode=test");
      expect(getSafeReturnUrl("/account")).toBe("/account");

      // 惡意外部網址
      expect(getSafeReturnUrl("http://evil.com")).toBe("/");
      expect(getSafeReturnUrl("https://evil.com/phishing")).toBe("/");
      expect(getSafeReturnUrl("javascript:alert(1)")).toBe("/");

      // Protocol-relative URL 攻擊 (//evil.com)
      expect(getSafeReturnUrl("//evil.com")).toBe("/");
      expect(getSafeReturnUrl("//evil.com/login")).toBe("/");
      expect(getSafeReturnUrl("/\\evil.com")).toBe("/");

      // 空值或非字串
      expect(getSafeReturnUrl(null)).toBe("/");
      expect(getSafeReturnUrl("")).toBe("/");
      expect(getSafeReturnUrl(undefined, "/dashboard")).toBe("/dashboard");
    });

    it("18. 既有 M7 管理 API 授權邊界完整保持", async () => {
      // 未登入存取問卷管理列表
      const req = new NextRequest("http://localhost:3000/api/surveys");
      const res = await surveysGET(req);
      expect(res.status).toBe(401);
    });
  });
});
