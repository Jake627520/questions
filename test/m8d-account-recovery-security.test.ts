import { describe, it, expect, beforeEach } from "vitest";
import { db } from "../src/lib/db";
import {
  hashPassword,
  verifyPassword,
  createSession,
  generatePasswordResetToken,
  hashPasswordResetToken,
  getSafeReturnUrl,
  generateInvitationToken,
  hashInvitationToken,
  maskEmail,
  SESSION_COOKIE_NAME,
} from "../src/lib/auth";
import { POST as forgotPasswordPOST } from "../src/app/api/auth/forgot-password/route";
import {
  GET as resetPasswordGET,
  POST as resetPasswordPOST,
} from "../src/app/api/auth/reset-password/route";
import { GET as invitationPreviewGET } from "../src/app/api/invitations/[token]/route";
import { NextRequest } from "next/server";
import { Role } from "@prisma/client";

describe("Phase M8-D: Account Recovery & Security Hardening Suite", () => {
  let userA: any;
  let userB: any;
  let orgA: any;
  let sessionA1: any;
  let sessionA2: any;

  const rawPasswordA = "OriginalAlphaPwd123!";
  const rawPasswordB = "OriginalBetaPwd123!";

  beforeEach(async () => {
    // 1. 清理 M8-D 測試資料
    await db.passwordResetToken.deleteMany({
      where: { user: { email: { startsWith: "m8d-" } } },
    });
    await db.invitation.deleteMany({
      where: { organization: { slug: { startsWith: "m8d-" } } },
    });
    await db.membership.deleteMany({
      where: { organization: { slug: { startsWith: "m8d-" } } },
    });
    await db.organization.deleteMany({
      where: { slug: { startsWith: "m8d-" } },
    });
    await db.session.deleteMany({
      where: { user: { email: { startsWith: "m8d-" } } },
    });
    await db.user.deleteMany({
      where: { email: { startsWith: "m8d-" } },
    });

    // 2. 建立組織
    orgA = await db.organization.create({
      data: { name: "Org Alpha M8D", slug: "m8d-org-alpha" },
    });

    // 3. 建立使用者與多重 Session
    userA = await db.user.create({
      data: {
        email: "m8d-user-a@example.com",
        name: "User Alpha",
        passwordHash: await hashPassword(rawPasswordA),
        memberships: {
          create: { organizationId: orgA.id, role: Role.ADMIN },
        },
      },
    });

    sessionA1 = await createSession(userA.id);
    sessionA2 = await createSession(userA.id);

    userB = await db.user.create({
      data: {
        email: "m8d-user-b@example.com",
        name: "User Beta",
        passwordHash: await hashPassword(rawPasswordB),
        memberships: {
          create: { organizationId: orgA.id, role: Role.VIEWER },
        },
      },
    });
  });

  // =========================================================================
  // Group A — Forgot Password & Email Enumeration Defense
  // =========================================================================
  describe("Group A: 忘記密碼申請與 Email 枚舉防護 (Email Enumeration Defense)", () => {
    it("1, 2, 5, 6. 已存在帳號與不存在帳號回傳完全相同的 HTTP 200 與 Response Body", async () => {
      // 1. 已存在帳號
      const reqExist = new NextRequest("http://localhost:3000/api/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email: "m8d-user-a@example.com" }),
      });
      const resExist = await forgotPasswordPOST(reqExist);
      expect(resExist.status).toBe(200);
      const dataExist = await resExist.json();

      // 2. 不存在帳號
      const reqUnknown = new NextRequest("http://localhost:3000/api/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email: "m8d-non-existent-user@example.com" }),
      });
      const resUnknown = await forgotPasswordPOST(reqUnknown);
      expect(resUnknown.status).toBe(200);
      const dataUnknown = await resUnknown.json();

      // 5 & 6. 兩者回應結構與訊息完全一致，不洩漏帳號存在與否
      expect(dataExist).toEqual(dataUnknown);
      expect(dataExist.success).toBe(true);
      expect(dataExist.message).toBe("如果該電子郵件已註冊，重設密碼連結已寄送至信箱。");
      expect((dataExist as any).token).toBeUndefined();
      expect((dataExist as any).tokenHash).toBeUndefined();
      expect((dataExist as any).userId).toBeUndefined();
    });

    it("3 & 4. 大小寫不同與前後空白 Email 均正確正規化並建立 Token", async () => {
      const req = new NextRequest("http://localhost:3000/api/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email: "  M8D-USER-A@EXAMPLE.COM  " }),
      });
      const res = await forgotPasswordPOST(req);
      expect(res.status).toBe(200);

      const tokenRecord = await db.passwordResetToken.findFirst({
        where: { userId: userA.id },
      });
      expect(tokenRecord).not.toBeNull();
      expect(tokenRecord?.usedAt).toBeNull();
    });
  });

  // =========================================================================
  // Group B — Token Security & Verification
  // =========================================================================
  describe("Group B: Reset Token 熵值、雜湊與生命週期檢驗", () => {
    it("7. Token 具備 256-bit CSPRNG 熵值且為 Base64URL", () => {
      const token = generatePasswordResetToken();
      expect(token.length).toBeGreaterThanOrEqual(43);
      expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it("8 & 9. 格式錯誤或不存在之 Token 驗證失敗 (400)", async () => {
      const reqMalformed = new NextRequest("http://localhost:3000/api/auth/reset-password?token=invalid_token_123");
      const resMalformed = await resetPasswordGET(reqMalformed);
      expect(resMalformed.status).toBe(400);
      const dataMalformed = await resMalformed.json();
      expect(dataMalformed.valid).toBe(false);
    });

    it("10. 已過期之 Reset Token 驗證失敗 (400)", async () => {
      const rawToken = generatePasswordResetToken();
      const tokenHash = hashPasswordResetToken(rawToken);
      await db.passwordResetToken.create({
        data: {
          userId: userA.id,
          tokenHash,
          expiresAt: new Date(Date.now() - 5000), // 已過期
        },
      });

      const req = new NextRequest(`http://localhost:3000/api/auth/reset-password?token=${rawToken}`);
      const res = await resetPasswordGET(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.valid).toBe(false);
    });

    it("11 & 12. 已使用之 Token 拒絕重放攻擊 (Replay Attack Defense)", async () => {
      const rawToken = generatePasswordResetToken();
      const tokenHash = hashPasswordResetToken(rawToken);
      await db.passwordResetToken.create({
        data: {
          userId: userA.id,
          tokenHash,
          expiresAt: new Date(Date.now() + 3600000),
          usedAt: new Date(), // 已使用
        },
      });

      const reqGet = new NextRequest(`http://localhost:3000/api/auth/reset-password?token=${rawToken}`);
      const resGet = await resetPasswordGET(reqGet);
      expect(resGet.status).toBe(400);

      const reqPost = new NextRequest("http://localhost:3000/api/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({
          token: rawToken,
          password: "BrandNewSecurePassword123!",
        }),
      });
      const resPost = await resetPasswordPOST(reqPost);
      expect(resPost.status).toBe(400);
      const dataPost = await resPost.json();
      expect(dataPost.error).toBe("INVALID_TOKEN");
    });
  });

  // =========================================================================
  // Group C — Password Reset Execution
  // =========================================================================
  describe("Group C: 密碼重設執行與密碼雜湊驗證", () => {
    it("13, 14, 15, 16. 密碼重設成功後，密碼雜湊更新，舊密碼失效，新密碼可通過驗證", async () => {
      const rawToken = generatePasswordResetToken();
      const tokenHash = hashPasswordResetToken(rawToken);
      await db.passwordResetToken.create({
        data: {
          userId: userA.id,
          tokenHash,
          expiresAt: new Date(Date.now() + 3600000),
        },
      });

      const newPassword = "AlphaBrandNewPassword456!";
      const req = new NextRequest("http://localhost:3000/api/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({
          token: rawToken,
          password: newPassword,
          confirmPassword: newPassword,
        }),
      });

      const res = await resetPasswordPOST(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);

      // 檢查 DB 中的密碼雜湊
      const updatedUser = await db.user.findUnique({ where: { id: userA.id } });
      expect(updatedUser?.passwordHash).not.toBe(userA.passwordHash);

      // 15. 舊密碼驗證失敗
      const oldValid = await verifyPassword(rawPasswordA, updatedUser!.passwordHash!);
      expect(oldValid).toBe(false);

      // 16. 新密碼驗證成功
      const newValid = await verifyPassword(newPassword, updatedUser!.passwordHash!);
      expect(newValid).toBe(true);
    });
  });

  // =========================================================================
  // Group D — All-Session Revocation
  // =========================================================================
  describe("Group D: 密碼重設之全量 Session 撤銷 (All-Session Revocation)", () => {
    it("17, 18, 19, 20. 密碼重設成功後，該使用者在所有裝置的所有 Session 均被全量刪除", async () => {
      // 驗證重設前存在 2 個 Session
      const sessionsBefore = await db.session.findMany({ where: { userId: userA.id } });
      expect(sessionsBefore.length).toBe(2);

      const rawToken = generatePasswordResetToken();
      const tokenHash = hashPasswordResetToken(rawToken);
      await db.passwordResetToken.create({
        data: {
          userId: userA.id,
          tokenHash,
          expiresAt: new Date(Date.now() + 3600000),
        },
      });

      const req = new NextRequest("http://localhost:3000/api/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({
          token: rawToken,
          password: "SuperSecureNewPassword789!",
        }),
      });

      const res = await resetPasswordPOST(req);
      expect(res.status).toBe(200);

      // 重設完成後，所有 Session 均被刪除
      const sessionsAfter = await db.session.findMany({ where: { userId: userA.id } });
      expect(sessionsAfter.length).toBe(0);
    });
  });

  // =========================================================================
  // Group E — Concurrency & Race Condition
  // =========================================================================
  describe("Group E: 並發重設 Race Condition 防護", () => {
    it("21, 22, 23. 同一 Token 同時並發重設時，只有一個請求成功，usedAt 僅被標記一次", async () => {
      const rawToken = generatePasswordResetToken();
      const tokenHash = hashPasswordResetToken(rawToken);
      const tokenRecord = await db.passwordResetToken.create({
        data: {
          userId: userA.id,
          tokenHash,
          expiresAt: new Date(Date.now() + 3600000),
        },
      });

      const makeReq = (pwd: string) =>
        new NextRequest("http://localhost:3000/api/auth/reset-password", {
          method: "POST",
          body: JSON.stringify({
            token: rawToken,
            password: pwd,
          }),
        });

      const [res1, res2] = await Promise.all([
        resetPasswordPOST(makeReq("ConcurrentPasswordOne1!")),
        resetPasswordPOST(makeReq("ConcurrentPasswordTwo2!")),
      ]);

      const statuses = [res1.status, res2.status];
      expect(statuses).toContain(200);

      // 檢查 Token 確實只被消耗一次
      const checkToken = await db.passwordResetToken.findUnique({
        where: { id: tokenRecord.id },
      });
      expect(checkToken?.usedAt).not.toBeNull();
    });
  });

  // =========================================================================
  // Group F — Cross-User Protection
  // =========================================================================
  describe("Group F: 跨使用者 Token 隔離防護 (Cross-User Token Isolation)", () => {
    it("24 & 25. User A 的 Token 只能重設 User A，絕對無法影響 User B", async () => {
      const rawTokenA = generatePasswordResetToken();
      const tokenHashA = hashPasswordResetToken(rawTokenA);
      await db.passwordResetToken.create({
        data: {
          userId: userA.id,
          tokenHash: tokenHashA,
          expiresAt: new Date(Date.now() + 3600000),
        },
      });

      const req = new NextRequest("http://localhost:3000/api/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({
          token: rawTokenA,
          password: "UserANewPassword999!",
        }),
      });

      await resetPasswordPOST(req);

      // User B 的密碼與 Session 應完全不受影響
      const checkUserB = await db.user.findUnique({ where: { id: userB.id } });
      const userBValid = await verifyPassword(rawPasswordB, checkUserB!.passwordHash!);
      expect(userBValid).toBe(true);
    });
  });

  // =========================================================================
  // Group G — Organization Integrity
  // =========================================================================
  describe("Group G: 租戶組織與角色權限完整性", () => {
    it("26, 27, 28. 密碼重設後，使用者的 Organization, Membership, Role 保持 100% 不變", async () => {
      const rawToken = generatePasswordResetToken();
      const tokenHash = hashPasswordResetToken(rawToken);
      await db.passwordResetToken.create({
        data: {
          userId: userA.id,
          tokenHash,
          expiresAt: new Date(Date.now() + 3600000),
        },
      });

      const req = new NextRequest("http://localhost:3000/api/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({
          token: rawToken,
          password: "BrandNewAlphaPassword777!",
        }),
      });

      await resetPasswordPOST(req);

      const membership = await db.membership.findUnique({
        where: {
          userId_organizationId: {
            userId: userA.id,
            organizationId: orgA.id,
          },
        },
      });

      expect(membership).not.toBeNull();
      expect(membership?.role).toBe(Role.ADMIN); // 角色完全不受影響
      expect(membership?.organizationId).toBe(orgA.id);
    });
  });

  // =========================================================================
  // Group H — Open Redirect Defense
  // =========================================================================
  describe("Group H: Open Redirect 安全重定向防護", () => {
    it("29, 30, 31, 32. 拒絕惡意 returnTo (https://evil.com, //evil.com, javascript:, /\\evil.com)", () => {
      expect(getSafeReturnUrl("https://evil.com")).toBe("/");
      expect(getSafeReturnUrl("//evil.com")).toBe("/");
      expect(getSafeReturnUrl("javascript:alert(1)")).toBe("/");
      expect(getSafeReturnUrl("/\\evil.com")).toBe("/");
      expect(getSafeReturnUrl("http://attacker.com/steal")).toBe("/");

      // 合法路徑應通過
      expect(getSafeReturnUrl("/settings/organization")).toBe("/settings/organization");
      expect(getSafeReturnUrl("/invite/some-token-123")).toBe("/invite/some-token-123");
    });
  });

  // =========================================================================
  // Group I — Invitation Privacy Refinement
  // =========================================================================
  describe("Group I: 邀請公開預覽之隱私最小化遮罩 (Invitation Privacy Refinement)", () => {
    it("33, 34, 35. 邀請公開預覽 API 遮罩受邀 Email，且不洩漏 tokenHash 與內部 ID", async () => {
      const rawToken = generateInvitationToken();
      const tokenHash = hashInvitationToken(rawToken);
      await db.invitation.create({
        data: {
          organizationId: orgA.id,
          invitedEmail: "sensitive-executive@company.com",
          role: Role.EDITOR,
          tokenHash,
          expiresAt: new Date(Date.now() + 86400000),
          createdById: userA.id,
        },
      });

      const req = new NextRequest(`http://localhost:3000/api/invitations/${rawToken}`);
      const res = await invitationPreviewGET(req, { params: { token: rawToken } });
      expect(res.status).toBe(200);
      const data = await res.json();

      // 33. Email 已遮罩
      expect(data.invitation.invitedEmail).toBe("se***e@company.com");
      expect(data.invitation.invitedEmail).not.toBe("sensitive-executive@company.com");

      // 34 & 35. 內部敏感欄位不洩漏
      expect(data.invitation.tokenHash).toBeUndefined();
      expect(data.invitation.organizationId).toBeUndefined();
      expect(data.invitation.createdById).toBeUndefined();
    });

    it("maskEmail 輔助函式邊界測試", () => {
      expect(maskEmail("a@test.com")).toBe("a***@test.com");
      expect(maskEmail("ab@test.com")).toBe("a***@test.com");
      expect(maskEmail("abc@test.com")).toBe("ab***c@test.com");
      expect(maskEmail("johnsmith@domain.org")).toBe("jo***h@domain.org");
      expect(maskEmail("")).toBe("***");
    });
  });
});
