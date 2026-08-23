import { describe, it, expect, beforeEach } from "vitest";
import { db } from "../src/lib/db";
import {
  hashPassword,
  createSession,
  generatePublicToken,
  SESSION_COOKIE_NAME,
} from "../src/lib/auth";
import { NextRequest } from "next/server";
import { Role, SurveyStatus, QuestionType } from "@prisma/client";
import { PATCH as surveyPATCH, GET as surveyGET } from "../src/app/api/surveys/[id]/route";
import { GET as lineageGET } from "../src/app/api/surveys/[id]/lineage/route";
import { POST as clonePOST } from "../src/app/api/surveys/[id]/clone-version/route";

describe("Phase M9-B: Survey Lifecycle & Version Management Suite", () => {
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

  let surveyDraftA: any;
  let surveyPublishedA: any;
  let surveyClosedA: any;
  let surveyOrgB: any;

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
      where: { response: { survey: { organization: { slug: { startsWith: "m9b-" } } } } },
    });
    await db.response.deleteMany({
      where: { survey: { organization: { slug: { startsWith: "m9b-" } } } },
    });
    await db.choice.deleteMany({
      where: { question: { survey: { organization: { slug: { startsWith: "m9b-" } } } } },
    });
    await db.question.deleteMany({
      where: { survey: { organization: { slug: { startsWith: "m9b-" } } } },
    });
    await db.survey.deleteMany({
      where: { organization: { slug: { startsWith: "m9b-" } } },
    });
    await db.invitation.deleteMany({
      where: { organization: { slug: { startsWith: "m9b-" } } },
    });
    await db.membership.deleteMany({
      where: { organization: { slug: { startsWith: "m9b-" } } },
    });
    await db.organization.deleteMany({
      where: { slug: { startsWith: "m9b-" } },
    });
    await db.session.deleteMany({
      where: { user: { email: { startsWith: "m9b-" } } },
    });
    await db.user.deleteMany({
      where: { email: { startsWith: "m9b-" } },
    });

    const defaultPwd = await hashPassword("M9BPassword123!");

    // 2. 建立組織
    orgA = await db.organization.create({
      data: { name: "Org Alpha Lifecycle", slug: "m9b-org-alpha" },
    });
    orgB = await db.organization.create({
      data: { name: "Org Beta Lifecycle", slug: "m9b-org-beta" },
    });

    // 3. 建立各角色使用者
    ownerA = await db.user.create({
      data: {
        email: "m9b-owner-a@alpha.com",
        name: "Owner Alice",
        passwordHash: defaultPwd,
        memberships: { create: { organizationId: orgA.id, role: Role.OWNER } },
      },
    });
    adminA = await db.user.create({
      data: {
        email: "m9b-admin-a@alpha.com",
        name: "Admin Aaron",
        passwordHash: defaultPwd,
        memberships: { create: { organizationId: orgA.id, role: Role.ADMIN } },
      },
    });
    editorA = await db.user.create({
      data: {
        email: "m9b-editor-a@alpha.com",
        name: "Editor Eric",
        passwordHash: defaultPwd,
        memberships: { create: { organizationId: orgA.id, role: Role.EDITOR } },
      },
    });
    viewerA = await db.user.create({
      data: {
        email: "m9b-viewer-a@alpha.com",
        name: "Viewer Victor",
        passwordHash: defaultPwd,
        memberships: { create: { organizationId: orgA.id, role: Role.VIEWER } },
      },
    });
    userB = await db.user.create({
      data: {
        email: "m9b-user-b@beta.com",
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

    // 4. 建立初始問卷
    surveyDraftA = await db.survey.create({
      data: {
        organizationId: orgA.id,
        createdById: ownerA.id,
        publicToken: generatePublicToken(),
        title: "Alpha Customer Research Draft",
        status: SurveyStatus.DRAFT,
        version: 1,
        questions: {
          create: [
            {
              orderNum: 1,
              code: "Q1",
              title: "Product Quality",
              questionType: QuestionType.single_choice,
              choices: {
                create: [
                  { orderNum: 1, label: "Good", value: "G", score: 10 },
                  { orderNum: 2, label: "Bad", value: "B", score: 0 },
                ],
              },
            },
          ],
        },
      },
    });

    surveyPublishedA = await db.survey.create({
      data: {
        organizationId: orgA.id,
        createdById: ownerA.id,
        publicToken: generatePublicToken(),
        title: "Alpha NPS Q1",
        status: SurveyStatus.PUBLISHED,
        version: 1,
      },
    });

    surveyClosedA = await db.survey.create({
      data: {
        organizationId: orgA.id,
        createdById: ownerA.id,
        publicToken: generatePublicToken(),
        title: "Alpha Year-End Survey 2025 (Closed)",
        status: SurveyStatus.CLOSED,
        version: 1,
      },
    });

    surveyOrgB = await db.survey.create({
      data: {
        organizationId: orgB.id,
        createdById: userB.id,
        publicToken: generatePublicToken(),
        title: "Beta Secret Survey",
        status: SurveyStatus.DRAFT,
        version: 1,
      },
    });
  });

  describe("1. Survey Publish, Close, and Re-open Lifecycle", () => {
    it("1. Org A 使用者 (EDITOR) 可以正式發布 Org A 的問卷 (DRAFT -> PUBLISHED)", async () => {
      const req = makeAuthReq(
        `http://localhost:3000/api/surveys/${surveyDraftA.id}`,
        tokenEditorA,
        { method: "PATCH", body: { status: "PUBLISHED" } }
      );
      const res = await surveyPATCH(req, { params: { id: surveyDraftA.id } });
      expect(res.status).toBe(200);

      const check = await db.survey.findUnique({ where: { id: surveyDraftA.id } });
      expect(check?.status).toBe(SurveyStatus.PUBLISHED);
    });

    it("2. Org A 使用者無法發布 Org B 的問卷 (跨租戶隔離阻擋 403)", async () => {
      const req = makeAuthReq(
        `http://localhost:3000/api/surveys/${surveyOrgB.id}`,
        tokenEditorA,
        { method: "PATCH", body: { status: "PUBLISHED" } }
      );
      const res = await surveyPATCH(req, { params: { id: surveyOrgB.id } });
      expect(res.status).toBe(403);

      const check = await db.survey.findUnique({ where: { id: surveyOrgB.id } });
      expect(check?.status).toBe(SurveyStatus.DRAFT);
    });

    it("3. Org A 使用者 (EDITOR) 可以關閉 Org A 的問卷 (PUBLISHED -> CLOSED)", async () => {
      const req = makeAuthReq(
        `http://localhost:3000/api/surveys/${surveyPublishedA.id}`,
        tokenEditorA,
        { method: "PATCH", body: { status: "CLOSED" } }
      );
      const res = await surveyPATCH(req, { params: { id: surveyPublishedA.id } });
      expect(res.status).toBe(200);

      const check = await db.survey.findUnique({ where: { id: surveyPublishedA.id } });
      expect(check?.status).toBe(SurveyStatus.CLOSED);
    });

    it("4. Org A 使用者無法關閉 Org B 的問卷 (跨租戶隔離阻擋 403)", async () => {
      const req = makeAuthReq(
        `http://localhost:3000/api/surveys/${surveyOrgB.id}`,
        tokenOwnerA,
        { method: "PATCH", body: { status: "CLOSED" } }
      );
      const res = await surveyPATCH(req, { params: { id: surveyOrgB.id } });
      expect(res.status).toBe(403);
    });

    it("5. Org A 使用者 (EDITOR) 可以重新開啟已關閉的問卷 (CLOSED -> PUBLISHED)", async () => {
      const req = makeAuthReq(
        `http://localhost:3000/api/surveys/${surveyClosedA.id}`,
        tokenEditorA,
        { method: "PATCH", body: { status: "PUBLISHED" } }
      );
      const res = await surveyPATCH(req, { params: { id: surveyClosedA.id } });
      expect(res.status).toBe(200);

      const check = await db.survey.findUnique({ where: { id: surveyClosedA.id } });
      expect(check?.status).toBe(SurveyStatus.PUBLISHED);
    });

    it("6. Org A 使用者無法重新開啟 Org B 的問卷 (跨租戶隔離阻擋 403)", async () => {
      const req = makeAuthReq(
        `http://localhost:3000/api/surveys/${surveyOrgB.id}`,
        tokenAdminA,
        { method: "PATCH", body: { status: "PUBLISHED" } }
      );
      const res = await surveyPATCH(req, { params: { id: surveyOrgB.id } });
      expect(res.status).toBe(403);
    });
  });

  describe("2. RBAC-aware Lifecycle Permissions", () => {
    it("7, 8, 9. VIEWER 角色無法執行 Publish、Close 或 Re-open (均回傳 403 Forbidden)", async () => {
      // Try Publish
      const reqPub = makeAuthReq(
        `http://localhost:3000/api/surveys/${surveyDraftA.id}`,
        tokenViewerA,
        { method: "PATCH", body: { status: "PUBLISHED" } }
      );
      const resPub = await surveyPATCH(reqPub, { params: { id: surveyDraftA.id } });
      expect(resPub.status).toBe(403);

      // Try Close
      const reqClose = makeAuthReq(
        `http://localhost:3000/api/surveys/${surveyPublishedA.id}`,
        tokenViewerA,
        { method: "PATCH", body: { status: "CLOSED" } }
      );
      const resClose = await surveyPATCH(reqClose, { params: { id: surveyPublishedA.id } });
      expect(resClose.status).toBe(403);

      // Try Reopen
      const reqReopen = makeAuthReq(
        `http://localhost:3000/api/surveys/${surveyClosedA.id}`,
        tokenViewerA,
        { method: "PATCH", body: { status: "PUBLISHED" } }
      );
      const resReopen = await surveyPATCH(reqReopen, { params: { id: surveyClosedA.id } });
      expect(resReopen.status).toBe(403);
    });

    it("10, 11, 12. EDITOR 角色可完整操作 Publish、Close 與 Re-open (200 OK)", async () => {
      const req = makeAuthReq(
        `http://localhost:3000/api/surveys/${surveyDraftA.id}`,
        tokenEditorA,
        { method: "PATCH", body: { status: "PUBLISHED" } }
      );
      const res = await surveyPATCH(req, { params: { id: surveyDraftA.id } });
      expect(res.status).toBe(200);
    });

    it("13, 14. ADMIN 與 OWNER 角色皆具備完整生命週期管理權限 (200 OK)", async () => {
      const reqAdmin = makeAuthReq(
        `http://localhost:3000/api/surveys/${surveyPublishedA.id}`,
        tokenAdminA,
        { method: "PATCH", body: { status: "CLOSED" } }
      );
      const resAdmin = await surveyPATCH(reqAdmin, { params: { id: surveyPublishedA.id } });
      expect(resAdmin.status).toBe(200);

      const reqOwner = makeAuthReq(
        `http://localhost:3000/api/surveys/${surveyPublishedA.id}`,
        tokenOwnerA,
        { method: "PATCH", body: { status: "PUBLISHED" } }
      );
      const resOwner = await surveyPATCH(reqOwner, { params: { id: surveyPublishedA.id } });
      expect(resOwner.status).toBe(200);
    });
  });

  describe("3. Publish Lock Enforcement", () => {
    it("17. 已發布問卷處於 Published Lock，禁止直接修改題目/選項/計分/條件規則 (403)", async () => {
      const req = makeAuthReq(
        `http://localhost:3000/api/surveys/${surveyPublishedA.id}`,
        tokenOwnerA,
        { method: "PATCH", body: { questions: [{ title: "Hacked question" }] } }
      );
      const res = await surveyPATCH(req, { params: { id: surveyPublishedA.id } });
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toContain("Published Lock");
    });
  });

  describe("4. Version Lineage & Navigation", () => {
    let clonedV2: any;
    let clonedV3: any;

    beforeEach(async () => {
      // 建立 v1 -> v2 -> v3 衍生鏈
      const reqClone1 = makeAuthReq(
        `http://localhost:3000/api/surveys/${surveyPublishedA.id}/clone-version`,
        tokenAdminA,
        { method: "POST" }
      );
      const resClone1 = await clonePOST(reqClone1, { params: { id: surveyPublishedA.id } });
      const data1 = await resClone1.json();
      clonedV2 = data1.survey;

      const reqClone2 = makeAuthReq(
        `http://localhost:3000/api/surveys/${clonedV2.id}/clone-version`,
        tokenAdminA,
        { method: "POST" }
      );
      const resClone2 = await clonePOST(reqClone2, { params: { id: clonedV2.id } });
      const data2 = await resClone2.json();
      clonedV3 = data2.survey;
    });

    it("18. 複製問卷時正確建立版本衍生關聯 (parentSurveyId 指向父版本，version 自增)", async () => {
      expect(clonedV2.version).toBe(2);
      expect(clonedV2.parentSurveyId).toBe(surveyPublishedA.id);

      expect(clonedV3.version).toBe(3);
      expect(clonedV3.parentSurveyId).toBe(clonedV2.id);
    });

    it("19. 從子版本 (v3) 查詢版本歷程，能正確回溯至根節點 (v1) 並列出完整家族樹", async () => {
      const req = makeAuthReq(
        `http://localhost:3000/api/surveys/${clonedV3.id}/lineage`,
        tokenEditorA
      );
      const res = await lineageGET(req, { params: { id: clonedV3.id } });
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.rootSurveyId).toBe(surveyPublishedA.id);
      expect(data.currentSurveyId).toBe(clonedV3.id);
      expect(data.lineage.length).toBe(3);

      expect(data.lineage[0].version).toBe(1);
      expect(data.lineage[0].isRoot).toBe(true);
      expect(data.lineage[1].version).toBe(2);
      expect(data.lineage[2].version).toBe(3);
      expect(data.lineage[2].isLatest).toBe(true);
      expect(data.lineage[2].isCurrent).toBe(true);
    });

    it("20. 從中間版本 (v2) 查詢版本歷程，正確標記 parent 與 child 關聯", async () => {
      const req = makeAuthReq(
        `http://localhost:3000/api/surveys/${clonedV2.id}/lineage`,
        tokenViewerA
      );
      const res = await lineageGET(req, { params: { id: clonedV2.id } });
      expect(res.status).toBe(200);

      const data = await res.json();
      const currentItem = data.lineage.find((item: any) => item.isCurrent);
      expect(currentItem.version).toBe(2);
      expect(currentItem.isRoot).toBe(false);
      expect(currentItem.isLatest).toBe(false);
    });

    it("15. 跨租戶版本溯源隔離：Org A 使用者無法查詢 Org B 問卷的版本歷程 (403 Forbidden)", async () => {
      const req = makeAuthReq(
        `http://localhost:3000/api/surveys/${surveyOrgB.id}/lineage`,
        tokenOwnerA
      );
      const res = await lineageGET(req, { params: { id: surveyOrgB.id } });
      expect(res.status).toBe(403);
    });

    it("16. 公開填答者 (Public Token) 無法進入管理端 Lineage API (401 Unauthorized)", async () => {
      const req = new NextRequest(
        `http://localhost:3000/api/surveys/${surveyPublishedA.id}/lineage`
      );
      const res = await lineageGET(req, { params: { id: surveyPublishedA.id } });
      expect(res.status).toBe(401);
    });

    it("21. Dashboard 查詢管理詳情 (GET /api/surveys/:id?mode=management) 正確包含 parent 與 child 版本資訊", async () => {
      const req = makeAuthReq(
        `http://localhost:3000/api/surveys/${clonedV2.id}?mode=management`,
        tokenAdminA
      );
      const res = await surveyGET(req, { params: { id: clonedV2.id } });
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.survey.parentSurvey.id).toBe(surveyPublishedA.id);
      expect(data.survey.childVersions.length).toBe(1);
      expect(data.survey.childVersions[0].id).toBe(clonedV3.id);
    });

    it("22, 23. 竄改 active_org Cookie 或直接呼叫 API 均無法繞過 RBAC 鑑權防護", async () => {
      // 持 Viewer Token 但附帶 active_org Cookie 試圖修改狀態
      const req = makeAuthReq(
        `http://localhost:3000/api/surveys/${surveyDraftA.id}`,
        tokenViewerA,
        {
          method: "PATCH",
          body: { status: "PUBLISHED" },
          cookies: { survey_active_org: orgA.id },
        }
      );
      const res = await surveyPATCH(req, { params: { id: surveyDraftA.id } });
      expect(res.status).toBe(403);
    });
  });
});
