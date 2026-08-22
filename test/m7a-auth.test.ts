import { describe, it, expect, beforeEach } from "vitest";
import { db } from "../src/lib/db";
import {
  hashPassword,
  verifyPassword,
  createSession,
  validateSession,
  destroySession,
  SESSION_COOKIE_NAME,
} from "../src/lib/auth";
import { POST as loginPOST } from "../src/app/api/auth/login/route";
import { POST as logoutPOST } from "../src/app/api/auth/logout/route";
import { GET as meGET } from "../src/app/api/auth/me/route";
import { GET as surveysGET } from "../src/app/api/surveys/route";
import { PATCH as surveyPATCH, GET as surveyGET } from "../src/app/api/surveys/[id]/route";
import { GET as responsesGET } from "../src/app/api/surveys/[id]/responses/route";
import { GET as statsGET } from "../src/app/api/surveys/[id]/stats/route";
import { GET as exportGET } from "../src/app/api/surveys/[id]/export/route";
import { POST as clonePOST } from "../src/app/api/surveys/[id]/clone-version/route";
import { POST as submitPOST } from "../src/app/api/surveys/[id]/submit/route";
import { POST as draftPOST } from "../src/app/api/surveys/[id]/draft/route";
import { GET as templateGET } from "../src/app/api/template/route";
import { NextRequest } from "next/server";

describe("Phase M7-A: Authentication & Session 驗證測試", () => {
  const testEmail = "m7a-admin@example.com";
  const testPassword = "SuperSecretPassword123!";
  let testUserId: string;
  let testSurveyId: string;

  beforeEach(async () => {
    // 清理舊測試資料
    await db.session.deleteMany({
      where: { user: { email: { startsWith: "m7a-" } } },
    });
    await db.survey.deleteMany({
      where: { title: { startsWith: "[M7A-TEST]" } },
    });
    await db.user.deleteMany({
      where: { email: { startsWith: "m7a-" } },
    });

    // 建立測試組織
    const org = await db.organization.upsert({
      where: { slug: "m7a-org" },
      update: {},
      create: { id: "m7a-org-id", name: "M7A Org", slug: "m7a-org" },
    });

    // 建立具備密碼雜湊之測試使用者
    const passwordHash = await hashPassword(testPassword);
    const user = await db.user.create({
      data: {
        email: testEmail,
        name: "M7A Admin User",
        passwordHash,
        memberships: {
          create: {
            organizationId: org.id,
            role: "ADMIN",
          },
        },
      },
    });
    testUserId = user.id;

    // 建立測試問卷
    const survey = await db.survey.create({
      data: {
        title: "[M7A-TEST] 測試問卷",
        organizationId: org.id,
        status: "PUBLISHED",
        questions: {
          create: {
            code: "Q1",
            title: "滿意度",
            questionType: "single_choice",
            orderNum: 1,
            choices: {
              create: [
                { label: "滿意", value: "sat", orderNum: 1 },
                { label: "不滿意", value: "unsat", orderNum: 2 },
              ],
            },
          },
        },
      },
    });
    testSurveyId = survey.id;
  });

  // =========================================================================
  // 1. Password Hashing & Verification Security
  // =========================================================================
  describe("1. Password Security (scrypt + unique salt + timingSafeEqual)", () => {
    it("hashPassword 應產生 salt:hash 格式，且每次加鹽雜湊皆不相同（禁止固定 salt）", async () => {
      const hash1 = await hashPassword(testPassword);
      const hash2 = await hashPassword(testPassword);

      expect(hash1).toMatch(/^[a-f0-9]{32}:[a-f0-9]{128}$/);
      expect(hash2).toMatch(/^[a-f0-9]{32}:[a-f0-9]{128}$/);
      expect(hash1).not.toBe(hash2); // 獨立 random salt
    });

    it("verifyPassword 正確密碼回傳 true，錯誤密碼回傳 false", async () => {
      const hash = await hashPassword(testPassword);
      const isCorrect = await verifyPassword(testPassword, hash);
      const isWrong = await verifyPassword("WrongPassword!", hash);

      expect(isCorrect).toBe(true);
      expect(isWrong).toBe(false);
    });

    it("verifyPassword 對於空值或異常格式 hash 應安全回傳 false", async () => {
      expect(await verifyPassword(testPassword, "")).toBe(false);
      expect(await verifyPassword(testPassword, "invalid_hash_string")).toBe(false);
      expect(await verifyPassword(testPassword, "salt_only:")).toBe(false);
    });
  });

  // =========================================================================
  // 2. Session Lifecycle & Expiration
  // =========================================================================
  describe("2. Session Management (256-bit random token, validation, expiration & destruction)", () => {
    it("createSession 應建立 256-bit 高熵 Token 並成功持久化至 PostgreSQL", async () => {
      const { session, token } = await createSession(testUserId, 7);

      expect(token).toMatch(/^[a-f0-9]{64}$/); // 32 bytes hex = 64 chars (256 bits)
      expect(session.userId).toBe(testUserId);
      expect(session.expiresAt.getTime()).toBeGreaterThan(Date.now());

      const dbSession = await db.session.findUnique({ where: { token } });
      expect(dbSession).not.toBeNull();
    });

    it("validateSession 有效 Token 應回傳完整 AuthContext", async () => {
      const { token } = await createSession(testUserId, 7);
      const auth = await validateSession(token);

      expect(auth).not.toBeNull();
      expect(auth?.user.id).toBe(testUserId);
      expect(auth?.user.email).toBe(testEmail);
      expect(auth?.session.token).toBe(token);
    });

    it("validateSession 遇到不存在或過期 Token 應回傳 null，並自動清除過期 Session", async () => {
      // 1. 不存在 Token
      expect(await validateSession("non_existent_token")).toBeNull();

      // 2. 建立已過期 Session (expiresAt 在過去)
      const expiredToken = "expired_token_1234567890abcdef1234567890abcdef1234567890abcdef";
      await db.session.create({
        data: {
          userId: testUserId,
          token: expiredToken,
          expiresAt: new Date(Date.now() - 1000 * 60), // 1 分鐘前過期
        },
      });

      const auth = await validateSession(expiredToken);
      expect(auth).toBeNull();

      // 驗證過期 Session 是否已被清除
      const dbRecord = await db.session.findUnique({ where: { token: expiredToken } });
      expect(dbRecord).toBeNull();
    });

    it("destroySession (Logout) 應徹底註銷資料庫中的 Session", async () => {
      const { token } = await createSession(testUserId, 7);
      await destroySession(token);

      const auth = await validateSession(token);
      expect(auth).toBeNull();
    });
  });

  // =========================================================================
  // 3. Auth API Endpoints (Login, Logout, Me)
  // =========================================================================
  describe("3. Auth API Endpoints (POST /api/auth/login, POST /api/auth/logout, GET /api/auth/me)", () => {
    it("POST /api/auth/login 正確帳密應回傳 200 並設定安全 HttpOnly Cookie", async () => {
      const req = new NextRequest("http://localhost:3000/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: testEmail, password: testPassword }),
      });

      const res = await loginPOST(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.user.email).toBe(testEmail);

      // 驗證 Set-Cookie Header
      const setCookie = res.headers.get("set-cookie");
      expect(setCookie).not.toBeNull();
      expect(setCookie).toContain(`${SESSION_COOKIE_NAME}=`);
      expect(setCookie).toContain("HttpOnly");
      expect(setCookie?.toLowerCase()).toContain("samesite=lax");
      expect(setCookie).toContain("Path=/");
    });

    it("POST /api/auth/login 密碼錯誤應回傳 401 Unauthorized", async () => {
      const req = new NextRequest("http://localhost:3000/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: testEmail, password: "BadPassword" }),
      });

      const res = await loginPOST(req);
      const data = await res.json();

      expect(res.status).toBe(401);
      expect(data.error).toBe("INVALID_CREDENTIALS");
    });

    it("GET /api/auth/me 未登入回傳 401，已登入回傳使用者與組織資訊", async () => {
      // 1. 未帶 Cookie -> 401
      const unauthReq = new NextRequest("http://localhost:3000/api/auth/me");
      const unauthRes = await meGET(unauthReq);
      expect(unauthRes.status).toBe(401);

      // 2. 帶有效 Session Token -> 200
      const { token } = await createSession(testUserId, 7);
      const authReq = new NextRequest("http://localhost:3000/api/auth/me", {
        headers: {
          Cookie: `${SESSION_COOKIE_NAME}=${token}`,
        },
      });

      const authRes = await meGET(authReq);
      const data = await authRes.json();

      expect(authRes.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.user.email).toBe(testEmail);
      expect(data.user.memberships.length).toBeGreaterThan(0);
    });

    it("POST /api/auth/logout 應註銷 Session 並清除 Cookie", async () => {
      const { token } = await createSession(testUserId, 7);
      const req = new NextRequest("http://localhost:3000/api/auth/logout", {
        method: "POST",
        headers: {
          Cookie: `${SESSION_COOKIE_NAME}=${token}`,
        },
      });

      const res = await logoutPOST(req);
      expect(res.status).toBe(200);

      // 驗證 DB session 已不存在
      const dbSession = await db.session.findUnique({ where: { token } });
      expect(dbSession).toBeNull();
    });
  });

  // =========================================================================
  // 4. API Authentication Boundary Enforcement (401 for Anonymous)
  // =========================================================================
  describe("4. 管理 API 邊界驗證（未登入者存取必須回傳 401 Unauthorized）", () => {
    it("未登入呼叫 GET /api/surveys 應回傳 401", async () => {
      const req = new NextRequest("http://localhost:3000/api/surveys");
      const res = await surveysGET(req);
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toBe("UNAUTHORIZED");
    });

    it("已登入呼叫 GET /api/surveys 應回傳 200", async () => {
      const { token } = await createSession(testUserId, 7);
      const req = new NextRequest("http://localhost:3000/api/surveys", {
        headers: {
          Cookie: `${SESSION_COOKIE_NAME}=${token}`,
        },
      });
      const res = await surveysGET(req);
      expect(res.status).toBe(200);
    });

    it("未登入呼叫 PATCH /api/surveys/:id 應回傳 401", async () => {
      const req = new NextRequest(`http://localhost:3000/api/surveys/${testSurveyId}`, {
        method: "PATCH",
        body: JSON.stringify({ title: "竄改標題" }),
      });
      const res = await surveyPATCH(req, { params: { id: testSurveyId } });
      expect(res.status).toBe(401);
    });

    it("未登入呼叫 GET /api/surveys/:id/responses 應回傳 401", async () => {
      const req = new NextRequest(`http://localhost:3000/api/surveys/${testSurveyId}/responses`);
      const res = await responsesGET(req, { params: { id: testSurveyId } });
      expect(res.status).toBe(401);
    });

    it("未登入呼叫 GET /api/surveys/:id/stats 應回傳 401", async () => {
      const req = new NextRequest(`http://localhost:3000/api/surveys/${testSurveyId}/stats`);
      const res = await statsGET(req, { params: { id: testSurveyId } });
      expect(res.status).toBe(401);
    });

    it("未登入呼叫 GET /api/surveys/:id/export 應回傳 401", async () => {
      const req = new NextRequest(`http://localhost:3000/api/surveys/${testSurveyId}/export`);
      const res = await exportGET(req, { params: { id: testSurveyId } });
      expect(res.status).toBe(401);
    });

    it("未登入呼叫 POST /api/surveys/:id/clone-version 應回傳 401", async () => {
      const req = new NextRequest(`http://localhost:3000/api/surveys/${testSurveyId}/clone-version`, {
        method: "POST",
      });
      const res = await clonePOST(req, { params: { id: testSurveyId } });
      expect(res.status).toBe(401);
    });
  });

  // =========================================================================
  // 5. Public Survey Boundary Exception (Fill, Submit, Draft, Template)
  // =========================================================================
  describe("5. 公開填答例外（Public Survey Endpoints 不受 Management Auth Guard 阻擋）", () => {
    it("公開填答讀取 GET /api/surveys/:id 應允許未登入存取 (200 OK)", async () => {
      const req = new NextRequest(`http://localhost:3000/api/surveys/${testSurveyId}`);
      const res = await surveyGET(req, { params: { id: testSurveyId } });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.survey.id).toBe(testSurveyId);
    });

    it("公開填答提交 POST /api/surveys/:id/submit 應允許未登入填答者送出 (200 OK)", async () => {
      const req = new NextRequest(`http://localhost:3000/api/surveys/${testSurveyId}/submit`, {
        method: "POST",
        body: JSON.stringify({
          answers: [{ questionCode: "Q1", rawValue: "sat" }],
        }),
      });
      const res = await submitPOST(req, { params: { id: testSurveyId } });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.responseId).toBeDefined();
    });

    it("公開暫存作答 POST /api/surveys/:id/draft 應允許未登入填答者暫存 (200 OK)", async () => {
      const req = new NextRequest(`http://localhost:3000/api/surveys/${testSurveyId}/draft`, {
        method: "POST",
        body: JSON.stringify({
          answers: [{ questionCode: "Q1", rawValue: "unsat" }],
        }),
      });
      const res = await draftPOST(req, { params: { id: testSurveyId } });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
    });

    it("示範範本下載 GET /api/template 應允許未登入存取 (200 OK)", async () => {
      const res = await templateGET();
      expect(res.status).toBe(200);
    });
  });
});
