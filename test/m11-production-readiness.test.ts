import { describe, it, expect, beforeEach, vi } from "vitest";
import { db } from "../src/lib/db";
import { SurveyStatus, Role } from "@prisma/client";
import {
  hashPassword,
  createSession,
  generatePublicToken,
  SESSION_COOKIE_NAME,
} from "../src/lib/auth";
import { NextRequest } from "next/server";
import { checkRateLimit, createRateLimitResponse, resetRateLimits } from "../src/lib/rate-limit";
import { GET as healthGET } from "../src/app/api/health/route";
import { POST as cronCleanupPOST, GET as cronCleanupGET } from "../src/app/api/cron/cleanup/route";
import { GET as reportDownloadGET } from "../src/app/api/surveys/[id]/reports/downloads/[exportId]/route";
import { generateExecutiveReportDTO, REPORT_SCHEMA_VERSION } from "../src/lib/report-engine";
import { calculateExecutiveKPIs } from "../src/lib/dashboard-intelligence";

describe("Phase M11: Production Readiness & Operational Governance Audit", () => {
  let userOwnerA: any;
  let userViewerA: any;
  let userTenantB: any;
  let orgA: any;
  let orgB: any;
  let tokenOwnerA: string;
  let tokenViewerA: string;
  let tokenTenantB: string;

  const makeAuthReq = (url: string, token?: string) => {
    const headers: Record<string, string> = {};
    if (token) {
      headers["Cookie"] = `${SESSION_COOKIE_NAME}=${token}`;
    }
    return new NextRequest(url, { method: "GET", headers });
  };

  beforeEach(async () => {
    resetRateLimits();

    await db.reportExport.deleteMany({
      where: { organization: { slug: { startsWith: "m11-" } } },
    });
    await db.answerChoice.deleteMany({
      where: { answer: { response: { survey: { organization: { slug: { startsWith: "m11-" } } } } } },
    });
    await db.answer.deleteMany({
      where: { response: { survey: { organization: { slug: { startsWith: "m11-" } } } } },
    });
    await db.response.deleteMany({
      where: { survey: { organization: { slug: { startsWith: "m11-" } } } },
    });
    await db.choice.deleteMany({
      where: { question: { survey: { organization: { slug: { startsWith: "m11-" } } } } },
    });
    await db.question.deleteMany({
      where: { survey: { organization: { slug: { startsWith: "m11-" } } } },
    });
    await db.survey.deleteMany({
      where: { organization: { slug: { startsWith: "m11-" } } },
    });
    await db.membership.deleteMany({
      where: { organization: { slug: { startsWith: "m11-" } } },
    });
    await db.organization.deleteMany({
      where: { slug: { startsWith: "m11-" } },
    });
    await db.session.deleteMany({
      where: { user: { email: { startsWith: "m11-" } } },
    });
    await db.passwordResetToken.deleteMany({
      where: { user: { email: { startsWith: "m11-" } } },
    });
    await db.user.deleteMany({
      where: { email: { startsWith: "m11-" } },
    });

    const defaultPwd = await hashPassword("M11Password123!");

    orgA = await db.organization.create({
      data: { name: "Audit Org Alpha", slug: "m11-org-alpha" },
    });
    orgB = await db.organization.create({
      data: { name: "Audit Org Beta", slug: "m11-org-beta" },
    });

    userOwnerA = await db.user.create({
      data: { email: "m11-owner@alpha.com", name: "Owner Alpha", passwordHash: defaultPwd },
    });
    userViewerA = await db.user.create({
      data: { email: "m11-viewer@alpha.com", name: "Viewer Alpha", passwordHash: defaultPwd },
    });
    userTenantB = await db.user.create({
      data: { email: "m11-tenant@beta.com", name: "Tenant Beta", passwordHash: defaultPwd },
    });

    await db.membership.create({
      data: { userId: userOwnerA.id, organizationId: orgA.id, role: Role.OWNER },
    });
    await db.membership.create({
      data: { userId: userViewerA.id, organizationId: orgA.id, role: Role.VIEWER },
    });
    await db.membership.create({
      data: { userId: userTenantB.id, organizationId: orgB.id, role: Role.OWNER },
    });

    tokenOwnerA = (await createSession(userOwnerA.id)).token;
    tokenViewerA = (await createSession(userViewerA.id)).token;
    tokenTenantB = (await createSession(userTenantB.id)).token;
  });

  describe("Gate M11.1: Health & Observability (Zero-Leak Safety)", () => {
    it("資料庫正常時，/api/health 回傳 200 OK 且絕不洩漏連線字串、密碼或拓撲細節", async () => {
      const res = await healthGET();
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.status).toBe("HEALTHY");
      expect(json.checks.database).toBe("UP");
      expect(json.checks.service).toBe("UP");
      expect(typeof json.uptimeSeconds).toBe("number");
      expect(typeof json.system.heapUsedMB).toBe("number");

      // 嚴格 Zero-Leak 斷言
      const resStr = JSON.stringify(json);
      expect(resStr).not.toContain("postgresql://");
      expect(resStr).not.toContain("postgrespassword");
      expect(resStr).not.toContain("5432");
      expect(resStr).not.toContain("survey_db");
      expect(resStr).not.toContain("stack");
    });

    it("當資料庫連線中斷時，/api/health 回傳 503 Service Unavailable 且隱藏例外細節", async () => {
      // Mock db.$queryRawUnsafe 模擬斷線
      const querySpy = vi.spyOn(db, "$queryRawUnsafe").mockRejectedValueOnce(new Error("Connection refused to 10.0.0.1:5432 with password xyz"));

      const res = await healthGET();
      expect(res.status).toBe(503);

      const json = await res.json();
      expect(json.status).toBe("UNHEALTHY");
      expect(json.checks.database).toBe("DOWN");

      const resStr = JSON.stringify(json);
      expect(resStr).not.toContain("xyz");
      expect(resStr).not.toContain("10.0.0.1");

      querySpy.mockRestore();
    });
  });

  describe("Gate M11.2: Retention Scheduler & Idempotent Cron", () => {
    it("未授權或 Secret 錯誤時回傳 401 Unauthorized", async () => {
      process.env.CRON_SECRET = "super-secure-cron-secret-123";

      const unauthReq = new NextRequest("http://localhost/api/cron/cleanup", {
        method: "POST",
        headers: { authorization: "Bearer wrong-secret" },
      });

      const res = await cronCleanupPOST(unauthReq);
      expect(res.status).toBe(401);

      delete process.env.CRON_SECRET;
    });

    it("持正確 Secret 執行清理成功 (200 OK)，且重複執行保證冪等 (Idempotency)", async () => {
      process.env.CRON_SECRET = "test-cron-secret";

      const survey = await db.survey.create({
        data: {
          organizationId: orgA.id,
          title: "過期清理問卷",
          status: SurveyStatus.PUBLISHED,
          publicToken: generatePublicToken(),
        },
      });

      // 建立 1 筆過期 Export
      await db.reportExport.create({
        data: {
          organizationId: orgA.id,
          surveyId: survey.id,
          actorId: userOwnerA.id,
          actorRole: Role.OWNER,
          format: "xlsx",
          status: "COMPLETED",
          expiresAt: new Date(Date.now() - 10000), // 過去時間
        },
      });

      // 建立 1 筆過期 Token
      await db.passwordResetToken.create({
        data: {
          userId: userOwnerA.id,
          tokenHash: "expired_token_hash_123",
          expiresAt: new Date(Date.now() - 10000),
        },
      });

      const req = new NextRequest("http://localhost/api/cron/cleanup", {
        method: "POST",
        headers: { authorization: "Bearer test-cron-secret" },
      });

      // 第一次執行
      const res1 = await cronCleanupPOST(req);
      expect(res1.status).toBe(200);
      const data1 = await res1.json();
      expect(data1.markedExpiredExports).toBeGreaterThanOrEqual(1);
      expect(data1.deletedExpiredTokens).toBe(1);

      // 第二次執行 (冪等性驗證)
      const res2 = await cronCleanupGET(req);
      expect(res2.status).toBe(200);
      const data2 = await res2.json();
      expect(data2.markedExpiredExports).toBe(0);
      expect(data2.deletedExpiredTokens).toBe(0);

      delete process.env.CRON_SECRET;
    });
  });

  describe("Gate M11.3: Rate Limiting & Abuse Guard", () => {
    it("正常請求放行，超出限制時拒絕並回傳 429 與 Retry-After 標頭", () => {
      const key = "test:user:123";
      const limit = 3;
      const windowMs = 5000;

      // 前 3 次允許
      expect(checkRateLimit(key, limit, windowMs).allowed).toBe(true);
      expect(checkRateLimit(key, limit, windowMs).allowed).toBe(true);
      expect(checkRateLimit(key, limit, windowMs).allowed).toBe(true);

      // 第 4 次拒絕
      const blocked = checkRateLimit(key, limit, windowMs);
      expect(blocked.allowed).toBe(false);
      expect(blocked.retryAfterSeconds).toBeGreaterThanOrEqual(1);

      const res429 = createRateLimitResponse(blocked);
      expect(res429.status).toBe(429);
      expect(res429.headers.get("Retry-After")).toBe(String(blocked.retryAfterSeconds));
      expect(res429.headers.get("X-RateLimit-Limit")).toBe("3");
      expect(res429.headers.get("X-RateLimit-Remaining")).toBe("0");
    });

    it("不同 Key / 租戶之間槽位嚴格隔離，互不影響", () => {
      const keyA = "orgA:user1";
      const keyB = "orgB:user2";
      const limit = 2;
      const windowMs = 10000;

      // Key A 打滿
      checkRateLimit(keyA, limit, windowMs);
      checkRateLimit(keyA, limit, windowMs);
      expect(checkRateLimit(keyA, limit, windowMs).allowed).toBe(false);

      // Key B 仍應完全正常
      expect(checkRateLimit(keyB, limit, windowMs).allowed).toBe(true);
      expect(checkRateLimit(keyB, limit, windowMs).allowed).toBe(true);
      expect(checkRateLimit(keyB, limit, windowMs).allowed).toBe(false);
    });
  });

  describe("Gate M11.7: Operational Failure Drills & Invariant Assertions", () => {
    it("過期產物下載返回 410，跨租戶下載返回 403，Viewer 下載返回 403", async () => {
      const survey = await db.survey.create({
        data: {
          organizationId: orgA.id,
          title: "運維防禦問卷",
          status: SurveyStatus.PUBLISHED,
          publicToken: generatePublicToken(),
        },
      });

      const expiredExport = await db.reportExport.create({
        data: {
          organizationId: orgA.id,
          surveyId: survey.id,
          actorId: userOwnerA.id,
          actorRole: Role.OWNER,
          format: "xlsx",
          status: "EXPIRED",
          expiresAt: new Date(Date.now() - 10000),
        },
      });

      // 1. 過期產物 -> 410 Gone
      const dlReq1 = makeAuthReq(`http://localhost/api/surveys/${survey.id}/reports/downloads/${expiredExport.id}`, tokenOwnerA);
      const dlRes1 = await reportDownloadGET(dlReq1, { params: { id: survey.id, exportId: expiredExport.id } });
      expect(dlRes1.status).toBe(410);

      // 2. Viewer 嘗試下載 -> 403
      const dlReq2 = makeAuthReq(`http://localhost/api/surveys/${survey.id}/reports/downloads/${expiredExport.id}`, tokenViewerA);
      const dlRes2 = await reportDownloadGET(dlReq2, { params: { id: survey.id, exportId: expiredExport.id } });
      expect(dlRes2.status).toBe(403);

      // 3. 跨租戶 Tenant B 嘗試下載 -> 403
      const dlReq3 = makeAuthReq(`http://localhost/api/surveys/${survey.id}/reports/downloads/${expiredExport.id}`, tokenTenantB);
      const dlRes3 = await reportDownloadGET(dlReq3, { params: { id: survey.id, exportId: expiredExport.id } });
      expect(dlRes3.status).toBe(403);
    });

    it("Analytics Engine v1.0.0 與 ExecutiveReportDTO 輸出合約保持不可變", () => {
      const kpis = calculateExecutiveKPIs({
        totalResponses: 10,
        completedResponses: 10,
        inProgressResponses: 0,
        averageDurationSeconds: 60,
        averageScore: 100,
      });

      const reportDto = generateExecutiveReportDTO({
        survey: {
          id: "s1",
          title: "合約穩定問卷",
          version: 1,
          status: SurveyStatus.PUBLISHED,
          organizationId: "org-1",
        },
        filter: { timeRange: "all", dateFrom: null, dateTo: null, status: "COMPLETED" },
        kpis,
        insights: [],
        questions: [],
      });

      expect(reportDto.schemaVersion).toBe("v1.0.0");
      expect(reportDto.audit.schemaVersion).toBe(REPORT_SCHEMA_VERSION);
      expect(reportDto.audit.isSanitized).toBe(true);
      expect(reportDto.kpis.completionRate).toBe(100.0);
    });
  });
});
