import { describe, it, expect, beforeEach } from "vitest";
import { db } from "../src/lib/db";
import {
  hashPassword,
  createSession,
  destroySession,
  generatePublicToken,
  SESSION_COOKIE_NAME,
} from "../src/lib/auth";
import { GET as authMeGET } from "../src/app/api/auth/me/route";
import { POST as authLogoutPOST } from "../src/app/api/auth/logout/route";
import { GET as surveysGET } from "../src/app/api/surveys/route";
import { GET as surveyGET, PATCH as surveyPATCH } from "../src/app/api/surveys/[id]/route";
import { GET as responsesGET } from "../src/app/api/surveys/[id]/responses/route";
import {
  GET as responseSingleGET,
  DELETE as responseSingleDELETE,
} from "../src/app/api/surveys/[id]/responses/[responseId]/route";
import { GET as statsGET } from "../src/app/api/surveys/[id]/stats/route";
import { GET as exportGET } from "../src/app/api/surveys/[id]/export/route";
import { POST as clonePOST } from "../src/app/api/surveys/[id]/clone-version/route";
import { POST as importPOST } from "../src/app/api/surveys/import/route";
import { GET as importHistoryGET } from "../src/app/api/surveys/import/history/route";
import { GET as importDetailGET } from "../src/app/api/surveys/import/[importId]/route";
import { GET as importErrorCsvGET } from "../src/app/api/surveys/import/[importId]/errors/route";
import { GET as publicSurveyGET } from "../src/app/api/public/surveys/[publicToken]/route";
import { POST as publicSurveySubmitPOST } from "../src/app/api/public/surveys/[publicToken]/submit/route";
import { POST as publicSurveyDraftPOST } from "../src/app/api/public/surveys/[publicToken]/draft/route";
import { GET as publicSurveyDraftGET } from "../src/app/api/public/surveys/[publicToken]/draft/[responseId]/route";
import { NextRequest } from "next/server";
import { Role, SurveyStatus, ResponseStatus } from "@prisma/client";

describe("Phase M7-E: Full Security Regression & Attack Simulation Suite (攻擊者視角全鏈路安全驗收)", () => {
  const orgAId = "m7e-org-alpha";
  const orgBId = "m7e-org-beta";

  let userAdminA: any;
  let userViewerA: any;
  let userAdminB: any;

  let tokenAdminA: string;
  let tokenViewerA: string;
  let tokenAdminB: string;

  let surveyA: any;
  let surveyB: any;
  let draftSurveyA: any;
  let closedSurveyA: any;

  let responseA: any;
  let draftResponseA: any;
  let draftResponseB: any;

  let importAId: string;
  let importBId: string;

  beforeEach(async () => {
    // 1. 清理舊資料
    await db.answerChoice.deleteMany({
      where: { answer: { response: { survey: { organizationId: { in: [orgAId, orgBId] } } } } },
    });
    await db.answer.deleteMany({
      where: { response: { survey: { organizationId: { in: [orgAId, orgBId] } } } },
    });
    await db.surveyImport.deleteMany({
      where: { organizationId: { in: [orgAId, orgBId] } },
    });
    await db.response.deleteMany({
      where: { survey: { organizationId: { in: [orgAId, orgBId] } } },
    });
    await db.question.deleteMany({
      where: { survey: { organizationId: { in: [orgAId, orgBId] } } },
    });
    await db.survey.deleteMany({
      where: { organizationId: { in: [orgAId, orgBId] } },
    });
    await db.membership.deleteMany({
      where: { organizationId: { in: [orgAId, orgBId] } },
    });
    await db.session.deleteMany({
      where: { user: { email: { startsWith: "m7e-" } } },
    });
    await db.user.deleteMany({
      where: { email: { startsWith: "m7e-" } },
    });
    await db.organization.deleteMany({
      where: { id: { in: [orgAId, orgBId] } },
    });

    // 2. 建立組織
    await db.organization.create({
      data: { id: orgAId, name: "Org Alpha", slug: "org-alpha-m7e" },
    });
    await db.organization.create({
      data: { id: orgBId, name: "Org Beta", slug: "org-beta-m7e" },
    });

    const defaultPwdHash = await hashPassword("M7ESecurePass123!");

    // 3. 建立使用者與 Session
    userAdminA = await db.user.create({
      data: {
        email: "m7e-admin-a@example.com",
        name: "Admin Alpha",
        passwordHash: defaultPwdHash,
        memberships: { create: { organizationId: orgAId, role: Role.ADMIN } },
      },
    });
    const sAdminA = await createSession(userAdminA.id);
    tokenAdminA = sAdminA.token;

    userViewerA = await db.user.create({
      data: {
        email: "m7e-viewer-a@example.com",
        name: "Viewer Alpha",
        passwordHash: defaultPwdHash,
        memberships: { create: { organizationId: orgAId, role: Role.VIEWER } },
      },
    });
    const sViewerA = await createSession(userViewerA.id);
    tokenViewerA = sViewerA.token;

    userAdminB = await db.user.create({
      data: {
        email: "m7e-admin-b@example.com",
        name: "Admin Beta",
        passwordHash: defaultPwdHash,
        memberships: { create: { organizationId: orgBId, role: Role.ADMIN } },
      },
    });
    const sAdminB = await createSession(userAdminB.id);
    tokenAdminB = sAdminB.token;

    // 4. 建立測試問卷
    surveyA = await db.survey.create({
      data: {
        title: "Alpha 正式問卷",
        organizationId: orgAId,
        status: SurveyStatus.PUBLISHED,
        publicToken: generatePublicToken(),
        questions: {
          create: [
            {
              code: "Q1",
              title: "服務品質評分",
              questionType: "single_choice",
              orderNum: 1,
              required: true,
              scoringEnabled: true,
              reverseScore: false,
              choices: {
                create: [
                  { label: "優良", value: "opt_good", scoreEnabled: true, score: 10, orderNum: 1 },
                  { label: "尚可", value: "opt_fair", scoreEnabled: true, score: 5, orderNum: 2 },
                ],
              },
            },
          ],
        },
      },
    });

    surveyB = await db.survey.create({
      data: {
        title: "Beta 正式問卷",
        organizationId: orgBId,
        status: SurveyStatus.PUBLISHED,
        publicToken: generatePublicToken(),
        questions: {
          create: {
            code: "QB1",
            title: "Beta 題目",
            questionType: "text",
            orderNum: 1,
          },
        },
      },
    });

    draftSurveyA = await db.survey.create({
      data: {
        title: "Alpha 草稿問卷 (未發布)",
        organizationId: orgAId,
        status: SurveyStatus.DRAFT,
        publicToken: generatePublicToken(),
      },
    });

    closedSurveyA = await db.survey.create({
      data: {
        title: "Alpha 已結束問卷",
        organizationId: orgAId,
        status: SurveyStatus.CLOSED,
        publicToken: generatePublicToken(),
      },
    });

    // 5. 建立填答資料
    responseA = await db.response.create({
      data: {
        surveyId: surveyA.id,
        status: ResponseStatus.COMPLETED,
        totalScore: 10,
        maxScore: 10,
        percentage: 100,
        submittedAt: new Date(),
        answers: {
          create: {
            questionId: (await db.question.findFirst({ where: { surveyId: surveyA.id } }))!.id,
            rawValue: JSON.stringify("opt_good"),
          },
        },
      },
    });

    draftResponseA = await db.response.create({
      data: {
        surveyId: surveyA.id,
        status: ResponseStatus.IN_PROGRESS,
        answers: {
          create: {
            questionId: (await db.question.findFirst({ where: { surveyId: surveyA.id } }))!.id,
            rawValue: JSON.stringify("opt_fair"),
          },
        },
      },
    });

    draftResponseB = await db.response.create({
      data: {
        surveyId: surveyB.id,
        status: ResponseStatus.IN_PROGRESS,
      },
    });

    // 6. 建立匯入紀錄
    importAId = `IMP-M7E-A-${Date.now()}`;
    await db.surveyImport.create({
      data: {
        importId: importAId,
        organizationId: orgAId,
        surveyId: surveyA.id,
        fileName: "alpha.xlsx",
        status: "SUCCESS",
      },
    });

    importBId = `IMP-M7E-B-${Date.now()}`;
    await db.surveyImport.create({
      data: {
        importId: importBId,
        organizationId: orgBId,
        surveyId: surveyB.id,
        fileName: "beta.xlsx",
        status: "SUCCESS",
      },
    });
  });

  // =========================================================================
  // 1. Threat 1: 匿名未登入存取管理 API (全數應阻擋回傳 401)
  // =========================================================================
  describe("1. [威脅情境 1] 匿名未登入存取管理 API", () => {
    it("未登入者存取 GET /api/auth/me 應得到 401", async () => {
      const req = new NextRequest("http://localhost:3000/api/auth/me");
      const res = await authMeGET(req);
      expect(res.status).toBe(401);
    });

    it("未登入者存取 GET /api/surveys 應得到 401", async () => {
      const req = new NextRequest("http://localhost:3000/api/surveys");
      const res = await surveysGET(req);
      expect(res.status).toBe(401);
    });

    it("未登入者存取 GET /api/surveys/:id?mode=management 應得到 401", async () => {
      const req = new NextRequest(`http://localhost:3000/api/surveys/${surveyA.id}?mode=management`);
      const res = await surveyGET(req, { params: { id: surveyA.id } });
      expect(res.status).toBe(401);
    });

    it("未登入者存取 PATCH /api/surveys/:id 應得到 401", async () => {
      const req = new NextRequest(`http://localhost:3000/api/surveys/${surveyA.id}`, {
        method: "PATCH",
        body: JSON.stringify({ title: "駭客修改" }),
      });
      const res = await surveyPATCH(req, { params: { id: surveyA.id } });
      expect(res.status).toBe(401);
    });

    it("未登入者存取 GET /api/surveys/:id/responses 應得到 401", async () => {
      const req = new NextRequest(`http://localhost:3000/api/surveys/${surveyA.id}/responses`);
      const res = await responsesGET(req, { params: { id: surveyA.id } });
      expect(res.status).toBe(401);
    });

    it("未登入者存取 GET /api/surveys/:id/stats 應得到 401", async () => {
      const req = new NextRequest(`http://localhost:3000/api/surveys/${surveyA.id}/stats`);
      const res = await statsGET(req, { params: { id: surveyA.id } });
      expect(res.status).toBe(401);
    });

    it("未登入者存取 GET /api/surveys/:id/export 應得到 401", async () => {
      const req = new NextRequest(`http://localhost:3000/api/surveys/${surveyA.id}/export`);
      const res = await exportGET(req, { params: { id: surveyA.id } });
      expect(res.status).toBe(401);
    });

    it("未登入者存取 POST /api/surveys/:id/clone-version 應得到 401", async () => {
      const req = new NextRequest(`http://localhost:3000/api/surveys/${surveyA.id}/clone-version`, {
        method: "POST",
      });
      const res = await clonePOST(req, { params: { id: surveyA.id } });
      expect(res.status).toBe(401);
    });
  });

  // =========================================================================
  // 2. Threat 2: 跨租戶 IDOR 越權攻擊 (User A 存取 Org B 資源)
  // =========================================================================
  describe("2. [威脅情境 2] 跨租戶 IDOR 攻擊", () => {
    it("User A 竄改 Survey B 應回傳 403 Forbidden", async () => {
      const req = new NextRequest(`http://localhost:3000/api/surveys/${surveyB.id}`, {
        method: "PATCH",
        headers: { Cookie: `${SESSION_COOKIE_NAME}=${tokenAdminA}` },
        body: JSON.stringify({ title: "竄改跨組織問卷" }),
      });
      const res = await surveyPATCH(req, { params: { id: surveyB.id } });
      expect(res.status).toBe(403);
    });

    it("User A 讀取 Survey B 的回覆清單應回傳 403 Forbidden", async () => {
      const req = new NextRequest(`http://localhost:3000/api/surveys/${surveyB.id}/responses`, {
        headers: { Cookie: `${SESSION_COOKIE_NAME}=${tokenAdminA}` },
      });
      const res = await responsesGET(req, { params: { id: surveyB.id } });
      expect(res.status).toBe(403);
    });

    it("User A 讀取 Survey B 統計報表應回傳 403 Forbidden", async () => {
      const req = new NextRequest(`http://localhost:3000/api/surveys/${surveyB.id}/stats`, {
        headers: { Cookie: `${SESSION_COOKIE_NAME}=${tokenAdminA}` },
      });
      const res = await statsGET(req, { params: { id: surveyB.id } });
      expect(res.status).toBe(403);
    });

    it("User A 匯出 Survey B 填答報表應回傳 403 Forbidden", async () => {
      const req = new NextRequest(`http://localhost:3000/api/surveys/${surveyB.id}/export`, {
        headers: { Cookie: `${SESSION_COOKIE_NAME}=${tokenAdminA}` },
      });
      const res = await exportGET(req, { params: { id: surveyB.id } });
      expect(res.status).toBe(403);
    });

    it("User A 複製 Survey B 版本應回傳 403 Forbidden", async () => {
      const req = new NextRequest(`http://localhost:3000/api/surveys/${surveyB.id}/clone-version`, {
        method: "POST",
        headers: { Cookie: `${SESSION_COOKIE_NAME}=${tokenAdminA}` },
      });
      const res = await clonePOST(req, { params: { id: surveyB.id } });
      expect(res.status).toBe(403);
    });

    it("User A 讀取 Import B 明細與錯誤 CSV 應回傳 403 Forbidden", async () => {
      const req = new NextRequest(`http://localhost:3000/api/surveys/import/${importBId}`, {
        headers: { Cookie: `${SESSION_COOKIE_NAME}=${tokenAdminA}` },
      });
      const res = await importDetailGET(req, { params: { importId: importBId } });
      expect(res.status).toBe(403);

      const reqCsv = new NextRequest(`http://localhost:3000/api/surveys/import/${importBId}/errors`, {
        headers: { Cookie: `${SESSION_COOKIE_NAME}=${tokenAdminA}` },
      });
      const resCsv = await importErrorCsvGET(reqCsv, { params: { importId: importBId } });
      expect(resCsv.status).toBe(403);
    });
  });

  // =========================================================================
  // 3. Threat 3: RBAC 權限越權攻擊 (VIEWER 嘗試寫入/匯出)
  // =========================================================================
  describe("3. [威脅情境 3] RBAC 角色垂直越權攻擊", () => {
    it("VIEWER 嘗試 PATCH 修改問卷應回傳 403 Forbidden", async () => {
      const req = new NextRequest(`http://localhost:3000/api/surveys/${surveyA.id}`, {
        method: "PATCH",
        headers: { Cookie: `${SESSION_COOKIE_NAME}=${tokenViewerA}` },
        body: JSON.stringify({ title: "Viewer 越權修改" }),
      });
      const res = await surveyPATCH(req, { params: { id: surveyA.id } });
      expect(res.status).toBe(403);
    });

    it("VIEWER 嘗試 Export 匯出填答報表應回傳 403 Forbidden", async () => {
      const req = new NextRequest(`http://localhost:3000/api/surveys/${surveyA.id}/export`, {
        headers: { Cookie: `${SESSION_COOKIE_NAME}=${tokenViewerA}` },
      });
      const res = await exportGET(req, { params: { id: surveyA.id } });
      expect(res.status).toBe(403);
    });

    it("VIEWER 嘗試複製問卷版本應回傳 403 Forbidden", async () => {
      const req = new NextRequest(`http://localhost:3000/api/surveys/${surveyA.id}/clone-version`, {
        method: "POST",
        headers: { Cookie: `${SESSION_COOKIE_NAME}=${tokenViewerA}` },
      });
      const res = await clonePOST(req, { params: { id: surveyA.id } });
      expect(res.status).toBe(403);
    });

    it("VIEWER 嘗試刪除正式填答紀錄應回傳 403 Forbidden", async () => {
      const req = new NextRequest(
        `http://localhost:3000/api/surveys/${surveyA.id}/responses/${responseA.id}?force=true`,
        {
          method: "DELETE",
          headers: { Cookie: `${SESSION_COOKIE_NAME}=${tokenViewerA}` },
        }
      );
      const res = await responseSingleDELETE(req, {
        params: { id: surveyA.id, responseId: responseA.id },
      });
      expect(res.status).toBe(403);
    });
  });

  // =========================================================================
  // 4. Threat 4: Session 劫持、偽造、過期與註銷重放攻擊
  // =========================================================================
  describe("4. [威脅情境 4] Session 生命週期與防重放攻擊", () => {
    it("偽造的隨機 Session Token 存取管理端應回傳 401", async () => {
      const req = new NextRequest("http://localhost:3000/api/surveys", {
        headers: { Cookie: `${SESSION_COOKIE_NAME}=fake-invalid-token-1234567890` },
      });
      const res = await surveysGET(req);
      expect(res.status).toBe(401);
    });

    it("過期的 Session 存取管理端應回傳 401 並自動清除過期 Session", async () => {
      // 建立已過期的 Session
      const expiredSession = await db.session.create({
        data: {
          userId: userAdminA.id,
          token: "expired-test-token-" + Date.now(),
          expiresAt: new Date(Date.now() - 10000), // 10 秒前已過期
        },
      });

      const req = new NextRequest("http://localhost:3000/api/surveys", {
        headers: { Cookie: `${SESSION_COOKIE_NAME}=${expiredSession.token}` },
      });
      const res = await surveysGET(req);
      expect(res.status).toBe(401);

      // 驗證 DB 內部該過期 Session 已被自動清理
      const checkDb = await db.session.findUnique({
        where: { token: expiredSession.token },
      });
      expect(checkDb).toBeNull();
    });

    it("登出 (Logout) 後重放舊 Session Token 應立即失效 (401)", async () => {
      // 1. 建立一個有效 Session
      const { session, token } = await createSession(userAdminA.id);

      // 2. 驗證登出前可正常存取
      const reqBefore = new NextRequest("http://localhost:3000/api/auth/me", {
        headers: { Cookie: `${SESSION_COOKIE_NAME}=${token}` },
      });
      const resBefore = await authMeGET(reqBefore);
      expect(resBefore.status).toBe(200);

      // 3. 執行登出
      const reqLogout = new NextRequest("http://localhost:3000/api/auth/logout", {
        method: "POST",
        headers: { Cookie: `${SESSION_COOKIE_NAME}=${token}` },
      });
      await authLogoutPOST(reqLogout);

      // 4. 重放舊 Token 存取 -> 應回傳 401
      const reqAfter = new NextRequest("http://localhost:3000/api/auth/me", {
        headers: { Cookie: `${SESSION_COOKIE_NAME}=${token}` },
      });
      const resAfter = await authMeGET(reqAfter);
      expect(resAfter.status).toBe(401);
    });
  });

  // =========================================================================
  // 5. Threat 5: Public Token 邊界、內部 ID 探測與狀態限制
  // =========================================================================
  describe("5. [威脅情境 5] Public Token 邊界與狀態防護", () => {
    it("嘗試拿內部 survey.id 存取公開端點應回傳 404", async () => {
      const req = new NextRequest(`http://localhost:3000/api/public/surveys/${surveyA.id}`);
      const res = await publicSurveyGET(req, { params: { publicToken: surveyA.id } });
      expect(res.status).toBe(404);
    });

    it("DRAFT 草稿問卷透過 publicToken 存取應回傳 404", async () => {
      const req = new NextRequest(`http://localhost:3000/api/public/surveys/${draftSurveyA.publicToken}`);
      const res = await publicSurveyGET(req, { params: { publicToken: draftSurveyA.publicToken } });
      expect(res.status).toBe(404);
    });

    it("CLOSED 結束問卷透過 publicToken 存取應回傳 404", async () => {
      const req = new NextRequest(`http://localhost:3000/api/public/surveys/${closedSurveyA.publicToken}`);
      const res = await publicSurveyGET(req, { params: { publicToken: closedSurveyA.publicToken } });
      expect(res.status).toBe(404);
    });

    it("公開回傳資料完全脫敏（無 score, scoringEnabled, reverseScore, organizationId, createdById）", async () => {
      const req = new NextRequest(`http://localhost:3000/api/public/surveys/${surveyA.publicToken}`);
      const res = await publicSurveyGET(req, { params: { publicToken: surveyA.publicToken } });
      const data = await res.json();

      expect(data.survey.organizationId).toBeUndefined();
      expect(data.survey.createdById).toBeUndefined();

      const q1 = data.survey.questions[0];
      expect(q1.scoringEnabled).toBeUndefined();
      expect(q1.reverseScore).toBeUndefined();
      expect(q1.choices[0].score).toBeUndefined();
      expect(q1.choices[0].scoreEnabled).toBeUndefined();
    });
  });

  // =========================================================================
  // 6. Threat 6: 公開提交參數注入攻擊 (Score / SurveyId / OrgId 竄改)
  // =========================================================================
  describe("6. [威脅情境 6] 公開提交參數注入與防篡改", () => {
    it("Client 端注入 score: 999999 被忽略，伺服器端依真實配分計算為 10 分", async () => {
      const req = new NextRequest(`http://localhost:3000/api/public/surveys/${surveyA.publicToken}/submit`, {
        method: "POST",
        body: JSON.stringify({
          score: 999999,
          totalScore: 999999,
          answers: [{ questionCode: "Q1", rawValue: "opt_good" }],
        }),
      });

      const res = await publicSurveySubmitPOST(req, { params: { publicToken: surveyA.publicToken } });
      expect(res.status).toBe(200);
      const data = await res.json();

      const saved = await db.response.findUnique({ where: { id: data.responseId } });
      expect(saved?.totalScore).toBe(10);
    });

    it("Client 端注入偽造 surveyId 與 organizationId 無法變更問卷真實歸屬", async () => {
      const req = new NextRequest(`http://localhost:3000/api/public/surveys/${surveyA.publicToken}/submit`, {
        method: "POST",
        body: JSON.stringify({
          surveyId: "hacked-survey-id-xxx",
          organizationId: "hacked-org-id-yyy",
          answers: [{ questionCode: "Q1", rawValue: "opt_fair" }],
        }),
      });

      const res = await publicSurveySubmitPOST(req, { params: { publicToken: surveyA.publicToken } });
      expect(res.status).toBe(200);
      const data = await res.json();

      const saved = await db.response.findUnique({
        where: { id: data.responseId },
        include: { survey: true },
      });
      expect(saved?.surveyId).toBe(surveyA.id);
      expect(saved?.survey.organizationId).toBe(orgAId);
    });
  });

  // =========================================================================
  // 7. Threat 7: 公開草稿跨問卷 IDOR 讀取與提交攻擊
  // =========================================================================
  describe("7. [威脅情境 7] 公開草稿跨問卷 IDOR 讀取與提交攻擊", () => {
    it("持 Public Token A 讀取 Draft B 應被拒絕回傳 404", async () => {
      const req = new NextRequest(
        `http://localhost:3000/api/public/surveys/${surveyA.publicToken}/draft/${draftResponseB.id}`
      );
      const res = await publicSurveyDraftGET(req, {
        params: { publicToken: surveyA.publicToken, responseId: draftResponseB.id },
      });
      expect(res.status).toBe(404);
    });

    it("持 Public Token A 提交並指定 Draft B 之 responseId 應被伺服器拒絕 (500/400)", async () => {
      const req = new NextRequest(`http://localhost:3000/api/public/surveys/${surveyA.publicToken}/submit`, {
        method: "POST",
        body: JSON.stringify({
          responseId: draftResponseB.id, // 意圖覆蓋他人問卷的草稿
          answers: [{ questionCode: "Q1", rawValue: "opt_good" }],
        }),
      });

      const res = await publicSurveySubmitPOST(req, { params: { publicToken: surveyA.publicToken } });
      expect(res.status).toBeGreaterThanOrEqual(400);

      // 驗證他人草稿 B 未被污染為 COMPLETED
      const checkDraftB = await db.response.findUnique({ where: { id: draftResponseB.id } });
      expect(checkDraftB?.status).toBe(ResponseStatus.IN_PROGRESS);
    });
  });
});
