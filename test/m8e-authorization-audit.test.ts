import { describe, it, expect, beforeEach } from "vitest";
import { db } from "../src/lib/db";
import {
  hashPassword,
  createSession,
  generateSessionToken,
  SESSION_COOKIE_NAME,
  generatePublicToken,
  generateInvitationToken,
  hashInvitationToken,
} from "../src/lib/auth";
import { NextRequest } from "next/server";
import { Role, SurveyStatus, ResponseStatus, QuestionType } from "@prisma/client";

// Import API route handlers for direct security testing
import { GET as surveysGET } from "../src/app/api/surveys/route";
import {
  GET as surveyDetailGET,
  PATCH as surveyDetailPATCH,
} from "../src/app/api/surveys/[id]/route";
import { GET as responsesGET } from "../src/app/api/surveys/[id]/responses/route";
import {
  GET as singleResponseGET,
  DELETE as singleResponseDELETE,
} from "../src/app/api/surveys/[id]/responses/[responseId]/route";
import { GET as statsGET } from "../src/app/api/surveys/[id]/stats/route";
import { GET as exportGET } from "../src/app/api/surveys/[id]/export/route";
import { POST as cloneVersionPOST } from "../src/app/api/surveys/[id]/clone-version/route";
import {
  GET as orgDetailGET,
  PATCH as orgDetailPATCH,
} from "../src/app/api/organizations/[id]/route";
import {
  GET as invitationsGET,
  POST as createInvitationPOST,
} from "../src/app/api/organizations/[id]/invitations/route";
import { POST as revokeInvitationPOST } from "../src/app/api/organizations/[id]/invitations/[invitationId]/revoke/route";
import { PATCH as profilePATCH } from "../src/app/api/auth/profile/route";

describe("Phase M8-E: Authorization Boundary & Multi-Tenant Security Audit Suite", () => {
  // Organizations
  let orgAlpha: any;
  let orgBeta: any;

  // Users in Org Alpha
  let userAlphaOwner: any;
  let userAlphaAdmin: any;
  let userAlphaEditor: any;
  let userAlphaViewer: any;

  // Users in Org Beta
  let userBetaOwner: any;
  let userBetaMember: any;

  // Sessions
  let sessionAlphaOwnerToken: string;
  let sessionAlphaAdminToken: string;
  let sessionAlphaEditorToken: string;
  let sessionAlphaViewerToken: string;
  let sessionBetaOwnerToken: string;
  let sessionBetaMemberToken: string;

  // Surveys & Resources
  let surveyAlpha: any;
  let surveyBeta: any;
  let responseAlpha: any;
  let responseBeta: any;
  let invitationAlpha: any;
  let invitationBeta: any;

  // Helper to create authenticated NextRequest
  const makeAuthReq = (
    url: string,
    sessionToken: string | null,
    options: { method?: string; body?: any } = {}
  ) => {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (sessionToken) {
      headers["Cookie"] = `${SESSION_COOKIE_NAME}=${sessionToken}`;
    }
    const init: any = {
      method: options.method || "GET",
      headers,
    };
    if (options.body) {
      init.body = JSON.stringify(options.body);
    }
    return new NextRequest(url, init);
  };

  beforeEach(async () => {
    // 1. 清理 M8-E 測試資料
    await db.passwordResetToken.deleteMany({
      where: { user: { email: { startsWith: "m8e-" } } },
    });
    await db.answer.deleteMany({
      where: { response: { survey: { organization: { slug: { startsWith: "m8e-" } } } } },
    });
    await db.response.deleteMany({
      where: { survey: { organization: { slug: { startsWith: "m8e-" } } } },
    });
    await db.choice.deleteMany({
      where: { question: { survey: { organization: { slug: { startsWith: "m8e-" } } } } },
    });
    await db.question.deleteMany({
      where: { survey: { organization: { slug: { startsWith: "m8e-" } } } },
    });
    await db.survey.deleteMany({
      where: { organization: { slug: { startsWith: "m8e-" } } },
    });
    await db.invitation.deleteMany({
      where: { organization: { slug: { startsWith: "m8e-" } } },
    });
    await db.membership.deleteMany({
      where: { organization: { slug: { startsWith: "m8e-" } } },
    });
    await db.organization.deleteMany({
      where: { slug: { startsWith: "m8e-" } },
    });
    await db.session.deleteMany({
      where: { user: { email: { startsWith: "m8e-" } } },
    });
    await db.user.deleteMany({
      where: { email: { startsWith: "m8e-" } },
    });

    const defaultPwdHash = await hashPassword("M8ESecurePassword123!");

    // 2. 建立組織 Alpha 與 Beta
    orgAlpha = await db.organization.create({
      data: { name: "Org Alpha Enterprises", slug: "m8e-org-alpha" },
    });
    orgBeta = await db.organization.create({
      data: { name: "Org Beta Technologies", slug: "m8e-org-beta" },
    });

    // 3. 建立 Alpha 成員 (涵蓋全角色矩陣：OWNER, ADMIN, EDITOR, VIEWER)
    userAlphaOwner = await db.user.create({
      data: {
        email: "m8e-alpha-owner@alpha.com",
        name: "Alpha Owner",
        passwordHash: defaultPwdHash,
        memberships: { create: { organizationId: orgAlpha.id, role: Role.OWNER } },
      },
    });
    userAlphaAdmin = await db.user.create({
      data: {
        email: "m8e-alpha-admin@alpha.com",
        name: "Alpha Admin",
        passwordHash: defaultPwdHash,
        memberships: { create: { organizationId: orgAlpha.id, role: Role.ADMIN } },
      },
    });
    userAlphaEditor = await db.user.create({
      data: {
        email: "m8e-alpha-editor@alpha.com",
        name: "Alpha Editor",
        passwordHash: defaultPwdHash,
        memberships: { create: { organizationId: orgAlpha.id, role: Role.EDITOR } },
      },
    });
    userAlphaViewer = await db.user.create({
      data: {
        email: "m8e-alpha-viewer@alpha.com",
        name: "Alpha Viewer",
        passwordHash: defaultPwdHash,
        memberships: { create: { organizationId: orgAlpha.id, role: Role.VIEWER } },
      },
    });

    // 4. 建立 Beta 成員
    userBetaOwner = await db.user.create({
      data: {
        email: "m8e-beta-owner@beta.com",
        name: "Beta Owner",
        passwordHash: defaultPwdHash,
        memberships: { create: { organizationId: orgBeta.id, role: Role.OWNER } },
      },
    });
    userBetaMember = await db.user.create({
      data: {
        email: "m8e-beta-member@beta.com",
        name: "Beta Member",
        passwordHash: defaultPwdHash,
        memberships: { create: { organizationId: orgBeta.id, role: Role.VIEWER } },
      },
    });

    // 5. 簽發 Sessions
    sessionAlphaOwnerToken = (await createSession(userAlphaOwner.id)).token;
    sessionAlphaAdminToken = (await createSession(userAlphaAdmin.id)).token;
    sessionAlphaEditorToken = (await createSession(userAlphaEditor.id)).token;
    sessionAlphaViewerToken = (await createSession(userAlphaViewer.id)).token;
    sessionBetaOwnerToken = (await createSession(userBetaOwner.id)).token;
    sessionBetaMemberToken = (await createSession(userBetaMember.id)).token;

    // 6. 建立 Alpha 問卷與題目
    surveyAlpha = await db.survey.create({
      data: {
        organizationId: orgAlpha.id,
        publicToken: generatePublicToken(),
        createdById: userAlphaOwner.id,
        title: "M8E Alpha Confidential Survey",
        description: "Confidential strategy survey for Org Alpha",
        status: SurveyStatus.DRAFT,
        version: 1,
        questions: {
          create: [
            {
              orderNum: 1,
              code: "Q1",
              title: "Alpha Question 1",
              questionType: QuestionType.single_choice,
              choices: {
                create: [
                  { orderNum: 1, label: "Choice A", value: "A", score: 10 },
                  { orderNum: 2, label: "Choice B", value: "B", score: 20 },
                ],
              },
            },
          ],
        },
      },
    });

    // 7. 建立 Beta 問卷與填答
    surveyBeta = await db.survey.create({
      data: {
        organizationId: orgBeta.id,
        publicToken: generatePublicToken(),
        createdById: userBetaOwner.id,
        title: "M8E Beta Financial Survey",
        description: "Financial results for Org Beta",
        status: SurveyStatus.PUBLISHED,
        version: 1,
        questions: {
          create: [
            {
              orderNum: 1,
              code: "BQ1",
              title: "Beta Question 1",
              questionType: QuestionType.single_choice,
              choices: {
                create: [
                  { orderNum: 1, label: "Option 1", value: "1", score: 50 },
                  { orderNum: 2, label: "Option 2", value: "2", score: 100 },
                ],
              },
            },
          ],
        },
      },
    });

    responseAlpha = await db.response.create({
      data: {
        surveyId: surveyAlpha.id,
        status: ResponseStatus.COMPLETED,
        totalScore: 20,
        maxScore: 20,
        percentage: 100,
        submittedAt: new Date(),
      },
    });

    responseBeta = await db.response.create({
      data: {
        surveyId: surveyBeta.id,
        status: ResponseStatus.COMPLETED,
        totalScore: 100,
        maxScore: 100,
        percentage: 100,
        submittedAt: new Date(),
      },
    });

    // 8. 建立邀請
    const rawInvAlpha = generateInvitationToken();
    invitationAlpha = await db.invitation.create({
      data: {
        organizationId: orgAlpha.id,
        invitedEmail: "alpha-invitee@alpha.com",
        role: Role.EDITOR,
        tokenHash: hashInvitationToken(rawInvAlpha),
        expiresAt: new Date(Date.now() + 86400000),
        createdById: userAlphaAdmin.id,
      },
    });

    const rawInvBeta = generateInvitationToken();
    invitationBeta = await db.invitation.create({
      data: {
        organizationId: orgBeta.id,
        invitedEmail: "beta-invitee@beta.com",
        role: Role.ADMIN,
        tokenHash: hashInvitationToken(rawInvBeta),
        expiresAt: new Date(Date.now() + 86400000),
        createdById: userBetaOwner.id,
      },
    });
  });

  // =========================================================================
  // 1. Organization Isolation (跨租戶組織邊界隔離)
  // =========================================================================
  describe("1. Organization Isolation: 組織資源跨租戶嚴格防護", () => {
    it("Org A 使用者無法存取 Org B 的問卷列表 (指定 organizationId 參數跨租戶攻擊)", async () => {
      const req = makeAuthReq(
        `http://localhost:3000/api/surveys?organizationId=${orgBeta.id}`,
        sessionAlphaAdminToken
      );
      const res = await surveysGET(req);
      expect(res.status).toBe(403);
    });

    it("Org A 使用者無法檢視 Org B 的組織詳細資料與成員清單 (GET /api/organizations/:id)", async () => {
      const req = makeAuthReq(
        `http://localhost:3000/api/organizations/${orgBeta.id}`,
        sessionAlphaOwnerToken
      );
      const res = await orgDetailGET(req, { params: { id: orgBeta.id } });
      expect(res.status).toBe(403);
    });

    it("Org A 使用者無法修改 Org B 的組織設定 (PATCH /api/organizations/:id)", async () => {
      const req = makeAuthReq(
        `http://localhost:3000/api/organizations/${orgBeta.id}`,
        sessionAlphaOwnerToken,
        { method: "PATCH", body: { name: "Hacked Org Beta Name" } }
      );
      const res = await orgDetailPATCH(req, { params: { id: orgBeta.id } });
      expect(res.status).toBe(403);

      // 驗證 DB 內組織未被修改
      const checkOrg = await db.organization.findUnique({ where: { id: orgBeta.id } });
      expect(checkOrg?.name).toBe("Org Beta Technologies");
    });
  });

  // =========================================================================
  // 2. Survey Isolation & Lifecycle (問卷管理與生命週期跨租戶隔離)
  // =========================================================================
  describe("2. Survey Isolation: 問卷 CRUD 與版本複製跨租戶防護", () => {
    it("Org A 使用者無法以管理模式檢視 Org B 的問卷詳情 (GET /api/surveys/:id?mode=management)", async () => {
      const req = makeAuthReq(
        `http://localhost:3000/api/surveys/${surveyBeta.id}?mode=management`,
        sessionAlphaAdminToken
      );
      const res = await surveyDetailGET(req, { params: { id: surveyBeta.id } });
      expect(res.status).toBe(403);
    });

    it("Org A 使用者無法修改 Org B 的問卷設定或狀態 (PATCH /api/surveys/:id)", async () => {
      const req = makeAuthReq(
        `http://localhost:3000/api/surveys/${surveyBeta.id}`,
        sessionAlphaOwnerToken,
        { method: "PATCH", body: { title: "Malicious Title Tamper" } }
      );
      const res = await surveyDetailPATCH(req, { params: { id: surveyBeta.id } });
      expect(res.status).toBe(403);

      const checkSurvey = await db.survey.findUnique({ where: { id: surveyBeta.id } });
      expect(checkSurvey?.title).toBe("M8E Beta Financial Survey");
    });

    it("Org A 使用者無法複製 Org B 的問卷版本 (POST /api/surveys/:id/clone-version)", async () => {
      const req = makeAuthReq(
        `http://localhost:3000/api/surveys/${surveyBeta.id}/clone-version`,
        sessionAlphaEditorToken,
        { method: "POST" }
      );
      const res = await cloneVersionPOST(req, { params: { id: surveyBeta.id } });
      expect(res.status).toBe(403);
    });

    it("Org A 使用者無法匯出 Org B 的問卷填答報表 (GET /api/surveys/:id/export)", async () => {
      const req = makeAuthReq(
        `http://localhost:3000/api/surveys/${surveyBeta.id}/export`,
        sessionAlphaAdminToken
      );
      const res = await exportGET(req, { params: { id: surveyBeta.id } });
      expect(res.status).toBe(403);
    });
  });

  // =========================================================================
  // 3. Response Isolation (填答明細與刪除跨租戶隔離)
  // =========================================================================
  describe("3. Response Isolation: 填答資料與明細跨租戶防護", () => {
    it("Org A 使用者無法查看 Org B 問卷的填答列表 (GET /api/surveys/:id/responses)", async () => {
      const req = makeAuthReq(
        `http://localhost:3000/api/surveys/${surveyBeta.id}/responses`,
        sessionAlphaAdminToken
      );
      const res = await responsesGET(req, { params: { id: surveyBeta.id } });
      expect(res.status).toBe(403);
    });

    it("Org A 使用者無法查看 Org B 特定填答記錄明細 (GET /api/surveys/:id/responses/:responseId)", async () => {
      const req = makeAuthReq(
        `http://localhost:3000/api/surveys/${surveyBeta.id}/responses/${responseBeta.id}`,
        sessionAlphaAdminToken
      );
      const res = await singleResponseGET(req, {
        params: { id: surveyBeta.id, responseId: responseBeta.id },
      });
      expect(res.status).toBe(403);
    });

    it("Org A 使用者無法刪除 Org B 的填答記錄 (DELETE /api/surveys/:id/responses/:responseId)", async () => {
      const req = makeAuthReq(
        `http://localhost:3000/api/surveys/${surveyBeta.id}/responses/${responseBeta.id}?force=true`,
        sessionAlphaOwnerToken,
        { method: "DELETE" }
      );
      const res = await singleResponseDELETE(req, {
        params: { id: surveyBeta.id, responseId: responseBeta.id },
      });
      expect(res.status).toBe(403);

      // 驗證紀錄未被刪除
      const checkResp = await db.response.findUnique({ where: { id: responseBeta.id } });
      expect(checkResp).not.toBeNull();
    });
  });

  // =========================================================================
  // 4. Statistics Isolation (統計報表跨租戶隔離)
  // =========================================================================
  describe("4. Statistics Isolation: 統計報表跨租戶防護", () => {
    it("Org A 使用者無法存取 Org B 問卷的統計報表與圖表資料 (GET /api/surveys/:id/stats)", async () => {
      const req = makeAuthReq(
        `http://localhost:3000/api/surveys/${surveyBeta.id}/stats`,
        sessionAlphaAdminToken
      );
      const res = await statsGET(req, { params: { id: surveyBeta.id } });
      expect(res.status).toBe(403);
    });
  });

  // =========================================================================
  // 5. Invitation Isolation (成員邀請管理跨租戶隔離)
  // =========================================================================
  describe("5. Invitation Isolation: 邀請管理與撤銷跨租戶防護", () => {
    it("Org A 管理員無法查看 Org B 的成員邀請清單 (GET /api/organizations/:id/invitations)", async () => {
      const req = makeAuthReq(
        `http://localhost:3000/api/organizations/${orgBeta.id}/invitations`,
        sessionAlphaAdminToken
      );
      const res = await invitationsGET(req, { params: { id: orgBeta.id } });
      expect(res.status).toBe(403);
    });

    it("Org A 管理員無法代表 Org B 建立成員邀請 (POST /api/organizations/:id/invitations)", async () => {
      const req = makeAuthReq(
        `http://localhost:3000/api/organizations/${orgBeta.id}/invitations`,
        sessionAlphaAdminToken,
        {
          method: "POST",
          body: { email: "attacker-inject@alpha.com", role: Role.ADMIN },
        }
      );
      const res = await createInvitationPOST(req, { params: { id: orgBeta.id } });
      expect(res.status).toBe(403);
    });

    it("Org A 管理員無法撤銷 Org B 的成員邀請 (POST /api/organizations/:id/invitations/:invId/revoke)", async () => {
      const req = makeAuthReq(
        `http://localhost:3000/api/organizations/${orgBeta.id}/invitations/${invitationBeta.id}/revoke`,
        sessionAlphaAdminToken,
        { method: "POST" }
      );
      const res = await revokeInvitationPOST(req, {
        params: { id: orgBeta.id, invitationId: invitationBeta.id },
      });
      expect(res.status).toBe(403);

      const checkInv = await db.invitation.findUnique({ where: { id: invitationBeta.id } });
      expect(checkInv?.revokedAt).toBeNull();
    });
  });

  // =========================================================================
  // 6. Membership / Role Authorization (RBAC 矩陣嚴格驗證)
  // =========================================================================
  describe("6. Role Authorization: 角色最小權限 RBAC 矩陣驗證", () => {
    it("VIEWER 角色：具備唯讀權限，嚴格阻擋修改問卷、匯出報表、複製版本、邀請成員與修改組織", async () => {
      // 1. 唯讀操作 -> PASS
      const reqViewSurvey = makeAuthReq(
        `http://localhost:3000/api/surveys/${surveyAlpha.id}?mode=management`,
        sessionAlphaViewerToken
      );
      expect((await surveyDetailGET(reqViewSurvey, { params: { id: surveyAlpha.id } })).status).toBe(200);

      const reqViewStats = makeAuthReq(
        `http://localhost:3000/api/surveys/${surveyAlpha.id}/stats`,
        sessionAlphaViewerToken
      );
      expect((await statsGET(reqViewStats, { params: { id: surveyAlpha.id } })).status).toBe(200);

      const reqViewResp = makeAuthReq(
        `http://localhost:3000/api/surveys/${surveyAlpha.id}/responses`,
        sessionAlphaViewerToken
      );
      expect((await responsesGET(reqViewResp, { params: { id: surveyAlpha.id } })).status).toBe(200);

      // 2. 寫入與敏感操作 -> DENIED (403)
      const reqPatchSurvey = makeAuthReq(
        `http://localhost:3000/api/surveys/${surveyAlpha.id}`,
        sessionAlphaViewerToken,
        { method: "PATCH", body: { title: "Viewer Tamper" } }
      );
      expect((await surveyDetailPATCH(reqPatchSurvey, { params: { id: surveyAlpha.id } })).status).toBe(403);

      const reqExport = makeAuthReq(
        `http://localhost:3000/api/surveys/${surveyAlpha.id}/export`,
        sessionAlphaViewerToken
      );
      expect((await exportGET(reqExport, { params: { id: surveyAlpha.id } })).status).toBe(403);

      const reqClone = makeAuthReq(
        `http://localhost:3000/api/surveys/${surveyAlpha.id}/clone-version`,
        sessionAlphaViewerToken,
        { method: "POST" }
      );
      expect((await cloneVersionPOST(reqClone, { params: { id: surveyAlpha.id } })).status).toBe(403);

      const reqInvite = makeAuthReq(
        `http://localhost:3000/api/organizations/${orgAlpha.id}/invitations`,
        sessionAlphaViewerToken,
        { method: "POST", body: { email: "new@alpha.com", role: Role.VIEWER } }
      );
      expect((await createInvitationPOST(reqInvite, { params: { id: orgAlpha.id } })).status).toBe(403);

      const reqPatchOrg = makeAuthReq(
        `http://localhost:3000/api/organizations/${orgAlpha.id}`,
        sessionAlphaViewerToken,
        { method: "PATCH", body: { name: "Viewer Rename" } }
      );
      expect((await orgDetailPATCH(reqPatchOrg, { params: { id: orgAlpha.id } })).status).toBe(403);
    });

    it("EDITOR 角色：可編輯問卷、匯出與複製版本，但禁止邀請成員與修改組織", async () => {
      // 1. 問卷編輯與匯出 -> PASS (200)
      const reqPatchSurvey = makeAuthReq(
        `http://localhost:3000/api/surveys/${surveyAlpha.id}`,
        sessionAlphaEditorToken,
        { method: "PATCH", body: { title: "Editor Updated Title" } }
      );
      expect((await surveyDetailPATCH(reqPatchSurvey, { params: { id: surveyAlpha.id } })).status).toBe(200);

      const reqExport = makeAuthReq(
        `http://localhost:3000/api/surveys/${surveyAlpha.id}/export`,
        sessionAlphaEditorToken
      );
      expect((await exportGET(reqExport, { params: { id: surveyAlpha.id } })).status).toBe(200);

      // 2. 邀請成員與修改組織 -> DENIED (403)
      const reqInvite = makeAuthReq(
        `http://localhost:3000/api/organizations/${orgAlpha.id}/invitations`,
        sessionAlphaEditorToken,
        { method: "POST", body: { email: "new@alpha.com", role: Role.VIEWER } }
      );
      expect((await createInvitationPOST(reqInvite, { params: { id: orgAlpha.id } })).status).toBe(403);

      const reqPatchOrg = makeAuthReq(
        `http://localhost:3000/api/organizations/${orgAlpha.id}`,
        sessionAlphaEditorToken,
        { method: "PATCH", body: { name: "Editor Rename" } }
      );
      expect((await orgDetailPATCH(reqPatchOrg, { params: { id: orgAlpha.id } })).status).toBe(403);
    });

    it("ADMIN 角色：具備組織管理與邀請權限", async () => {
      const reqInvite = makeAuthReq(
        `http://localhost:3000/api/organizations/${orgAlpha.id}/invitations`,
        sessionAlphaAdminToken,
        { method: "POST", body: { email: "m8e-admin-invited@alpha.com", role: Role.VIEWER } }
      );
      const resInvite = await createInvitationPOST(reqInvite, { params: { id: orgAlpha.id } });
      expect(resInvite.status).toBe(201);

      const reqPatchOrg = makeAuthReq(
        `http://localhost:3000/api/organizations/${orgAlpha.id}`,
        sessionAlphaAdminToken,
        { method: "PATCH", body: { name: "Org Alpha Renamed by Admin" } }
      );
      const resPatchOrg = await orgDetailPATCH(reqPatchOrg, { params: { id: orgAlpha.id } });
      expect(resPatchOrg.status).toBe(200);
    });
  });

  // =========================================================================
  // 7. IDOR / Broken Object Level Authorization (BOLA)
  // =========================================================================
  describe("7. IDOR / BOLA 跨資源 ID 竄改攻擊模擬", () => {
    it("跨問卷填答 ID 錯置 (持 Survey A 查詢 Response B) 立即阻擋 (404 NOT_FOUND)", async () => {
      const req = makeAuthReq(
        `http://localhost:3000/api/surveys/${surveyAlpha.id}/responses/${responseBeta.id}`,
        sessionAlphaAdminToken
      );
      const res = await singleResponseGET(req, {
        params: { id: surveyAlpha.id, responseId: responseBeta.id },
      });
      expect(res.status).toBe(404);
    });

    it("跨組織邀請 ID 錯置 (持 Org A 撤銷 Invitation B) 立即阻擋 (404 NOT_FOUND)", async () => {
      const req = makeAuthReq(
        `http://localhost:3000/api/organizations/${orgAlpha.id}/invitations/${invitationBeta.id}/revoke`,
        sessionAlphaAdminToken,
        { method: "POST" }
      );
      const res = await revokeInvitationPOST(req, {
        params: { id: orgAlpha.id, invitationId: invitationBeta.id },
      });
      expect(res.status).toBe(404);
    });
  });

  // =========================================================================
  // 8. User Isolation (使用者身分與敏感資訊隔離)
  // =========================================================================
  describe("8. User Isolation: 個人資料與身分邊界隔離", () => {
    it("個人資料更新 API (PATCH /api/auth/profile) 僅以 Session 內的使用者 ID 為準，無法竄改他人", async () => {
      const req = makeAuthReq(
        "http://localhost:3000/api/auth/profile",
        sessionAlphaViewerToken,
        {
          method: "PATCH",
          body: {
            name: "Updated Viewer Name",
            userId: userBetaOwner.id, // 惡意嘗試注入其他 userId
          },
        }
      );
      const res = await profilePATCH(req);
      expect(res.status).toBe(200);

      // 驗證僅修改到 sessionAlphaViewer，userBetaOwner 完全不受影響
      const checkViewer = await db.user.findUnique({ where: { id: userAlphaViewer.id } });
      const checkBetaOwner = await db.user.findUnique({ where: { id: userBetaOwner.id } });

      expect(checkViewer?.name).toBe("Updated Viewer Name");
      expect(checkBetaOwner?.name).toBe("Beta Owner");
    });
  });

  // =========================================================================
  // 9. Authentication Boundary (認證邊界完整性檢驗)
  // =========================================================================
  describe("9. Authentication Boundary: 登入階段與 Cookie 防護", () => {
    it("未攜帶 Cookie 存取保護端點一律回傳 401 Unauthorized", async () => {
      const req = makeAuthReq("http://localhost:3000/api/surveys", null);
      const res = await surveysGET(req);
      expect(res.status).toBe(401);
    });

    it("攜帶偽造或隨機 Session Token 回傳 401 Unauthorized", async () => {
      const fakeToken = generateSessionToken();
      const req = makeAuthReq("http://localhost:3000/api/surveys", fakeToken);
      const res = await surveysGET(req);
      expect(res.status).toBe(401);
    });

    it("已過期之 Session Token 回傳 401 Unauthorized", async () => {
      const expiredSession = await db.session.create({
        data: {
          userId: userAlphaOwner.id,
          token: generateSessionToken(),
          expiresAt: new Date(Date.now() - 10000), // 已過期
        },
      });

      const req = makeAuthReq("http://localhost:3000/api/surveys", expiredSession.token);
      const res = await surveysGET(req);
      expect(res.status).toBe(401);
    });
  });
});
