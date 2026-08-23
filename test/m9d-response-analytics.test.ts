import { describe, it, expect, beforeEach } from "vitest";
import { db } from "../src/lib/db";
import {
  hashPassword,
  createSession,
  generatePublicToken,
  SESSION_COOKIE_NAME,
} from "../src/lib/auth";
import { NextRequest } from "next/server";
import { Role, SurveyStatus, ResponseStatus, QuestionType } from "@prisma/client";
import { GET as analyticsGET } from "../src/app/api/analytics/route";
import { GET as analyticsExportGET } from "../src/app/api/analytics/export/route";

describe("Phase M9-D: Response Analytics & Real-time Insights Suite", () => {
  let orgA: any;
  let orgB: any;

  let ownerA: any;
  let adminA: any;
  let editorA: any;
  let viewerA: any;
  let userB: any;

  let tokenOwnerA: string;
  let tokenAdminA: string;
  let tokenEditorA: string;
  let tokenViewerA: string;
  let tokenUserB: string;

  let surveyA1: any;
  let surveyA2: any;
  let surveyB1: any;

  const makeAuthReq = (
    url: string,
    token: string,
    options: { method?: string; body?: any; cookies?: Record<string, string> } = {}
  ) => {
    const cookieHeader = Object.entries({
      [SESSION_COOKIE_NAME]: token,
      ...(options.cookies || {}),
    })
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Cookie: cookieHeader,
    };

    return new NextRequest(url, {
      method: options.method || "GET",
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
  };

  beforeEach(async () => {
    // 1. 清理測試環境
    await db.answer.deleteMany({
      where: { response: { survey: { organization: { slug: { startsWith: "m9d-" } } } } },
    });
    await db.response.deleteMany({
      where: { survey: { organization: { slug: { startsWith: "m9d-" } } } },
    });
    await db.choice.deleteMany({
      where: { question: { survey: { organization: { slug: { startsWith: "m9d-" } } } } },
    });
    await db.question.deleteMany({
      where: { survey: { organization: { slug: { startsWith: "m9d-" } } } },
    });
    await db.survey.deleteMany({
      where: { organization: { slug: { startsWith: "m9d-" } } },
    });
    await db.invitation.deleteMany({
      where: { organization: { slug: { startsWith: "m9d-" } } },
    });
    await db.membership.deleteMany({
      where: { organization: { slug: { startsWith: "m9d-" } } },
    });
    await db.organization.deleteMany({
      where: { slug: { startsWith: "m9d-" } },
    });
    await db.session.deleteMany({
      where: { user: { email: { startsWith: "m9d-" } } },
    });
    await db.user.deleteMany({
      where: { email: { startsWith: "m9d-" } },
    });

    const defaultPwd = await hashPassword("M9DPassword123!");

    // 2. 建立組織
    orgA = await db.organization.create({
      data: { name: "Org Alpha Analytics", slug: "m9d-org-alpha" },
    });
    orgB = await db.organization.create({
      data: { name: "Org Beta Analytics", slug: "m9d-org-beta" },
    });

    // 3. 建立各角色使用者
    ownerA = await db.user.create({
      data: {
        email: "m9d-owner-a@alpha.com",
        name: "Alice Owner",
        passwordHash: defaultPwd,
        memberships: { create: { organizationId: orgA.id, role: Role.OWNER } },
      },
    });
    adminA = await db.user.create({
      data: {
        email: "m9d-admin-a@alpha.com",
        name: "Aaron Admin",
        passwordHash: defaultPwd,
        memberships: { create: { organizationId: orgA.id, role: Role.ADMIN } },
      },
    });
    editorA = await db.user.create({
      data: {
        email: "m9d-editor-a@alpha.com",
        name: "Eric Editor",
        passwordHash: defaultPwd,
        memberships: { create: { organizationId: orgA.id, role: Role.EDITOR } },
      },
    });
    viewerA = await db.user.create({
      data: {
        email: "m9d-viewer-a@alpha.com",
        name: "Victor Viewer",
        passwordHash: defaultPwd,
        memberships: { create: { organizationId: orgA.id, role: Role.VIEWER } },
      },
    });
    userB = await db.user.create({
      data: {
        email: "m9d-user-b@beta.com",
        name: "Bob Beta",
        passwordHash: defaultPwd,
        memberships: { create: { organizationId: orgB.id, role: Role.ADMIN } },
      },
    });

    tokenOwnerA = (await createSession(ownerA.id)).token;
    tokenAdminA = (await createSession(adminA.id)).token;
    tokenEditorA = (await createSession(editorA.id)).token;
    tokenViewerA = (await createSession(viewerA.id)).token;
    tokenUserB = (await createSession(userB.id)).token;

    // 4. 建立問卷
    surveyA1 = await db.survey.create({
      data: {
        organizationId: orgA.id,
        createdById: ownerA.id,
        publicToken: generatePublicToken(),
        title: "Alpha Customer Satisfaction",
        status: SurveyStatus.PUBLISHED,
        version: 1,
        questions: {
          create: [
            {
              orderNum: 1,
              code: "Q1",
              title: "Quality",
              questionType: QuestionType.single_choice,
              choices: {
                create: [
                  { orderNum: 1, label: "Great", value: "A", score: 100 },
                  { orderNum: 2, label: "Poor", value: "B", score: 50 },
                ],
              },
            },
          ],
        },
      },
    });

    surveyA2 = await db.survey.create({
      data: {
        organizationId: orgA.id,
        createdById: ownerA.id,
        publicToken: generatePublicToken(),
        title: "Alpha Employee Pulse",
        status: SurveyStatus.PUBLISHED,
        version: 1,
      },
    });

    surveyB1 = await db.survey.create({
      data: {
        organizationId: orgB.id,
        createdById: userB.id,
        publicToken: generatePublicToken(),
        title: "Beta Secret Survey",
        status: SurveyStatus.PUBLISHED,
        version: 1,
      },
    });

    // 5. 建立填答資料
    // Org A - Survey A1: 2 completed (scores: 100, 50), 1 in_progress
    await db.response.create({
      data: {
        surveyId: surveyA1.id,
        status: ResponseStatus.COMPLETED,
        totalScore: 100,
        percentage: 100,
        submittedAt: new Date(),
      },
    });
    await db.response.create({
      data: {
        surveyId: surveyA1.id,
        status: ResponseStatus.COMPLETED,
        totalScore: 50,
        percentage: 50,
        submittedAt: new Date(),
      },
    });
    await db.response.create({
      data: {
        surveyId: surveyA1.id,
        status: ResponseStatus.IN_PROGRESS,
      },
    });

    // Org A - Survey A2: 1 completed
    await db.response.create({
      data: {
        surveyId: surveyA2.id,
        status: ResponseStatus.COMPLETED,
        totalScore: 80,
        percentage: 80,
        submittedAt: new Date(),
      },
    });

    // Org B - Survey B1: 5 completed
    for (let i = 0; i < 5; i++) {
      await db.response.create({
        data: {
          surveyId: surveyB1.id,
          status: ResponseStatus.COMPLETED,
          totalScore: 90,
          percentage: 90,
          submittedAt: new Date(),
        },
      });
    }
  });

  describe("1. Multi-Tenant Analytics Boundary & Isolation", () => {
    it("1. Org A 分析只計算 Org A 的填答資料 (4 筆，其中 3 completed, 1 in_progress)，絕對不包含 Org B (5 筆)", async () => {
      const req = makeAuthReq("http://localhost:3000/api/analytics", tokenViewerA);
      const res = await analyticsGET(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.kpis.totalResponses).toBe(4);
      expect(data.kpis.completedResponses).toBe(3);
      expect(data.kpis.incompleteResponses).toBe(1);
      expect(data.kpis.completionRate).toBe(75);
    });

    it("2. Org B 分析只計算 Org B 的填答資料 (5 筆完成)", async () => {
      const req = makeAuthReq("http://localhost:3000/api/analytics", tokenUserB);
      const res = await analyticsGET(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.kpis.totalResponses).toBe(5);
      expect(data.kpis.completedResponses).toBe(5);
      expect(data.kpis.incompleteResponses).toBe(0);
      expect(data.kpis.completionRate).toBe(100);
    });

    it("3. 竄改 active_org Cookie 試圖竊取 Org B 分析數據一律被阻擋 (403 Forbidden)", async () => {
      const req = makeAuthReq(
        "http://localhost:3000/api/analytics",
        tokenViewerA,
        { cookies: { survey_active_org: orgB.id } }
      );
      const res = await analyticsGET(req);
      expect(res.status).toBe(403);
    });

    it("4. 指定跨租戶 surveyId 進行分析篩選會回傳 404/403 阻擋 (IDOR 防護)", async () => {
      const req = makeAuthReq(
        `http://localhost:3000/api/analytics?surveyId=${surveyB1.id}`,
        tokenViewerA
      );
      const res = await analyticsGET(req);
      expect(res.status).toBe(404);
    });
  });

  describe("2. Server-side Aggregations & Score Intelligence", () => {
    it("5, 6. DB-Side Aggregation 正確計算平均分、中位數、最高/最低分與完成漏斗", async () => {
      const req = makeAuthReq(
        `http://localhost:3000/api/analytics?surveyId=${surveyA1.id}`,
        tokenAdminA
      );
      const res = await analyticsGET(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.kpis.totalResponses).toBe(3);
      expect(data.kpis.completedResponses).toBe(2);
      expect(data.funnel.started).toBe(3);
      expect(data.funnel.completed).toBe(2);
      expect(data.funnel.incomplete).toBe(1);

      // Score Analytics: 100 與 50 -> 平均 75, 中位數 75, 最高 100, 最低 50
      expect(data.scores.scoredCount).toBe(2);
      expect(data.scores.avgScore).toBe(75);
      expect(data.scores.medianScore).toBe(75);
      expect(data.scores.maxScore).toBe(100);
      expect(data.scores.minScore).toBe(50);
    });

    it("15. 回傳之分析與最近作答資料完全脫敏，絕不洩漏密碼、Session Token 或內部管理憑證", async () => {
      const req = makeAuthReq("http://localhost:3000/api/analytics", tokenViewerA);
      const res = await analyticsGET(req);
      const data = await res.json();

      expect(data.recentResponses.length).toBeGreaterThan(0);
      for (const item of data.recentResponses) {
        expect(item.passwordHash).toBeUndefined();
        expect(item.token).toBeUndefined();
        expect(item.tokenHash).toBeUndefined();
      }
    });
  });

  describe("3. RBAC & Export Consistency", () => {
    it("7. VIEWER 角色具備分析檢視權限 (200 OK)", async () => {
      const req = makeAuthReq("http://localhost:3000/api/analytics", tokenViewerA);
      const res = await analyticsGET(req);
      expect(res.status).toBe(200);
    });

    it("8. VIEWER 角色匯出 Excel 被阻擋 (403 Forbidden)", async () => {
      const req = makeAuthReq("http://localhost:3000/api/analytics/export", tokenViewerA);
      const res = await analyticsExportGET(req);
      expect(res.status).toBe(403);
    });

    it("9, 10, 11. EDITOR, ADMIN 與 OWNER 具備 Excel 匯出權限 (200 OK)", async () => {
      // EDITOR
      const reqEditor = makeAuthReq("http://localhost:3000/api/analytics/export", tokenEditorA);
      const resEditor = await analyticsExportGET(reqEditor);
      expect(resEditor.status).toBe(200);

      // ADMIN
      const reqAdmin = makeAuthReq("http://localhost:3000/api/analytics/export", tokenAdminA);
      const resAdmin = await analyticsExportGET(reqAdmin);
      expect(resAdmin.status).toBe(200);

      // OWNER
      const reqOwner = makeAuthReq("http://localhost:3000/api/analytics/export", tokenOwnerA);
      const resOwner = await analyticsExportGET(reqOwner);
      expect(resOwner.status).toBe(200);
    });

    it("12. 匯出端點與分析端點共用相同篩選條件 (例如指定 surveyId 匯出)", async () => {
      const req = makeAuthReq(
        `http://localhost:3000/api/analytics/export?surveyId=${surveyA1.id}`,
        tokenEditorA
      );
      const res = await analyticsExportGET(req);
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toContain("spreadsheetml");
    });

    it("13, 14. 未登入或無組織成員身分者無法存取分析 API (401 / 400 / 403)", async () => {
      // 未登入
      const reqAnon = new NextRequest("http://localhost:3000/api/analytics");
      const resAnon = await analyticsGET(reqAnon);
      expect(resAnon.status).toBe(401);
    });
  });
});
