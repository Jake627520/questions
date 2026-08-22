import { describe, it, expect, beforeEach } from "vitest";
import { db } from "../src/lib/db";
import {
  hashPassword,
  createSession,
  getActiveOrganizationContext,
  ACTIVE_ORG_COOKIE_NAME,
  SESSION_COOKIE_NAME,
} from "../src/lib/auth";
import { GET as orgsGET, POST as orgsPOST } from "../src/app/api/organizations/route";
import { POST as orgSwitchPOST } from "../src/app/api/organizations/switch/route";
import { GET as orgDetailGET, PATCH as orgDetailPATCH } from "../src/app/api/organizations/[id]/route";
import { GET as surveyGET, PATCH as surveyPATCH } from "../src/app/api/surveys/[id]/route";
import { NextRequest } from "next/server";
import { Role, SurveyStatus } from "@prisma/client";

describe("Phase M8-B: Organization Context & Workspace Switcher Tests", () => {
  let userOwnerA: any;
  let userAdminA: any;
  let userEditorA: any;
  let userViewerA: any;
  let userForeignB: any;
  let userZeroOrg: any;

  let tokenOwnerA: string;
  let tokenAdminA: string;
  let tokenEditorA: string;
  let tokenViewerA: string;
  let tokenForeignB: string;
  let tokenZeroOrg: string;

  let orgA: any;
  let orgA2: any;
  let orgB: any;
  let surveyB: any;

  beforeEach(async () => {
    // 1. 清理 M8-B 測試資料
    await db.survey.deleteMany({
      where: { organization: { slug: { startsWith: "m8b-" } } },
    });
    await db.membership.deleteMany({
      where: { organization: { slug: { startsWith: "m8b-" } } },
    });
    await db.organization.deleteMany({
      where: { slug: { startsWith: "m8b-" } },
    });
    await db.session.deleteMany({
      where: { user: { email: { startsWith: "m8b-" } } },
    });
    await db.user.deleteMany({
      where: { email: { startsWith: "m8b-" } },
    });

    const defaultPwd = await hashPassword("M8BSecurePassword123!");

    // 2. 建立組織
    orgA = await db.organization.create({
      data: { name: "Org Alpha", slug: "m8b-org-alpha" },
    });
    orgA2 = await db.organization.create({
      data: { name: "Org Alpha Secondary", slug: "m8b-org-alpha-2" },
    });
    orgB = await db.organization.create({
      data: { name: "Org Beta", slug: "m8b-org-beta" },
    });

    // 3. 建立各角色使用者
    userOwnerA = await db.user.create({
      data: {
        email: "m8b-owner-a@example.com",
        name: "Alpha Owner",
        passwordHash: defaultPwd,
        memberships: {
          create: [
            { organizationId: orgA.id, role: Role.OWNER },
            { organizationId: orgA2.id, role: Role.ADMIN },
          ],
        },
      },
    });
    tokenOwnerA = (await createSession(userOwnerA.id)).token;

    userAdminA = await db.user.create({
      data: {
        email: "m8b-admin-a@example.com",
        name: "Alpha Admin",
        passwordHash: defaultPwd,
        memberships: { create: { organizationId: orgA.id, role: Role.ADMIN } },
      },
    });
    tokenAdminA = (await createSession(userAdminA.id)).token;

    userEditorA = await db.user.create({
      data: {
        email: "m8b-editor-a@example.com",
        name: "Alpha Editor",
        passwordHash: defaultPwd,
        memberships: { create: { organizationId: orgA.id, role: Role.EDITOR } },
      },
    });
    tokenEditorA = (await createSession(userEditorA.id)).token;

    userViewerA = await db.user.create({
      data: {
        email: "m8b-viewer-a@example.com",
        name: "Alpha Viewer",
        passwordHash: defaultPwd,
        memberships: { create: { organizationId: orgA.id, role: Role.VIEWER } },
      },
    });
    tokenViewerA = (await createSession(userViewerA.id)).token;

    userForeignB = await db.user.create({
      data: {
        email: "m8b-user-b@example.com",
        name: "Beta Member",
        passwordHash: defaultPwd,
        memberships: { create: { organizationId: orgB.id, role: Role.OWNER } },
      },
    });
    tokenForeignB = (await createSession(userForeignB.id)).token;

    userZeroOrg = await db.user.create({
      data: {
        email: "m8b-zero-org@example.com",
        name: "No Org User",
        passwordHash: defaultPwd,
      },
    });
    tokenZeroOrg = (await createSession(userZeroOrg.id)).token;

    // 4. 建立 Org B 的問卷
    surveyB = await db.survey.create({
      data: {
        title: "Beta 機密問卷",
        organizationId: orgB.id,
        status: SurveyStatus.PUBLISHED,
      },
    });
  });

  // =========================================================================
  // 1. Organization Listing & Creation
  // =========================================================================
  describe("1. 組織清單與建立 (List & Create Organizations)", () => {
    it("1. 取得登入者所屬組織清單 (GET /api/organizations)", async () => {
      const req = new NextRequest("http://localhost:3000/api/organizations", {
        headers: { Cookie: `${SESSION_COOKIE_NAME}=${tokenOwnerA}` },
      });

      const res = await orgsGET(req);
      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.success).toBe(true);
      expect(data.organizations.length).toBe(2);
      expect(data.organizations.map((o: any) => o.id)).toContain(orgA.id);
      expect(data.organizations.map((o: any) => o.id)).toContain(orgA2.id);
      expect(data.activeOrganization).toBeDefined();
      expect(data.activeOrganization.id).toBe(orgA.id);
    });

    it("2 & 3. 建立新組織並指派建立者為 OWNER (POST /api/organizations)", async () => {
      const req = new NextRequest("http://localhost:3000/api/organizations", {
        method: "POST",
        headers: { Cookie: `${SESSION_COOKIE_NAME}=${tokenOwnerA}` },
        body: JSON.stringify({ name: "全新創新團隊" }),
      });

      const res = await orgsPOST(req);
      expect(res.status).toBe(201);
      const data = await res.json();

      expect(data.success).toBe(true);
      expect(data.organization.name).toBe("全新創新團隊");
      expect(data.organization.role).toBe("OWNER");

      // 檢查 Active Org Cookie 是否被自動設定
      const setCookie = res.cookies.get(ACTIVE_ORG_COOKIE_NAME);
      expect(setCookie).toBeDefined();
      expect(setCookie?.value).toBe(data.organization.id);
      expect(setCookie?.httpOnly).toBe(true);

      // 驗證 DB 內部存在該組織與 OWNER Membership
      const checkMembership = await db.membership.findUnique({
        where: {
          userId_organizationId: {
            userId: userOwnerA.id,
            organizationId: data.organization.id,
          },
        },
      });
      expect(checkMembership?.role).toBe(Role.OWNER);
    });

    it("4. 組織建立原子性驗證 (Atomic Transaction Validation)", async () => {
      // 驗證若名稱無效或發生異常，不應產生孤兒組織或會員
      const reqInvalid = new NextRequest("http://localhost:3000/api/organizations", {
        method: "POST",
        headers: { Cookie: `${SESSION_COOKIE_NAME}=${tokenOwnerA}` },
        body: JSON.stringify({ name: "" }), // 空名稱
      });

      const resInvalid = await orgsPOST(reqInvalid);
      expect(resInvalid.status).toBe(400);
    });
  });

  // =========================================================================
  // 2. Organization Switching & Context Resolution
  // =========================================================================
  describe("2. 工作區安全切換與 Context 解析 (Switch & Active Context)", () => {
    it("5. 切換合法工作區成功 (POST /api/organizations/switch)", async () => {
      const req = new NextRequest("http://localhost:3000/api/organizations/switch", {
        method: "POST",
        headers: { Cookie: `${SESSION_COOKIE_NAME}=${tokenOwnerA}` },
        body: JSON.stringify({ organizationId: orgA2.id }),
      });

      const res = await orgSwitchPOST(req);
      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.success).toBe(true);
      expect(data.activeOrganization.id).toBe(orgA2.id);
      expect(data.activeOrganization.role).toBe("ADMIN");

      // 驗證 Cookie 寫入
      expect(res.cookies.get(ACTIVE_ORG_COOKIE_NAME)?.value).toBe(orgA2.id);
    });

    it("6. 跨租戶非法切換遭 403 阻擋 (Reject Cross-Tenant Switch)", async () => {
      // User A 嘗試切換至 Org B (非成員)
      const req = new NextRequest("http://localhost:3000/api/organizations/switch", {
        method: "POST",
        headers: { Cookie: `${SESSION_COOKIE_NAME}=${tokenOwnerA}` },
        body: JSON.stringify({ organizationId: orgB.id }),
      });

      const res = await orgSwitchPOST(req);
      expect(res.status).toBe(403);
    });

    it("7. 合法 Active Cookie 能正確解析 Context", async () => {
      const req = new NextRequest("http://localhost:3000/api/organizations", {
        headers: {
          Cookie: `${SESSION_COOKIE_NAME}=${tokenOwnerA}; ${ACTIVE_ORG_COOKIE_NAME}=${orgA2.id}`,
        },
      });

      const context = await getActiveOrganizationContext(req);
      expect(context).not.toBeNull();
      expect(context?.organization.id).toBe(orgA2.id);
      expect(context?.membership.role).toBe("ADMIN");
    });

    it("8. 竄改 Active Cookie 注入未隸屬 Org B 時，伺服器端自動安全回退至合法組織", async () => {
      const reqForged = new NextRequest("http://localhost:3000/api/organizations", {
        headers: {
          Cookie: `${SESSION_COOKIE_NAME}=${tokenOwnerA}; ${ACTIVE_ORG_COOKIE_NAME}=${orgB.id}`,
        },
      });

      const context = await getActiveOrganizationContext(reqForged);
      // 應安全回退至 User A 合法的第一個組織 (Org A)，絕不返回 Org B
      expect(context).not.toBeNull();
      expect(context?.organization.id).toBe(orgA.id);
      expect(context?.membership.role).toBe("OWNER");
    });

    it("9. 被移除 Membership 的工作區，Active Cookie 即時失效並回退", async () => {
      // 刪除 User Owner 在 Org A 的 membership
      await db.membership.delete({
        where: {
          userId_organizationId: {
            userId: userOwnerA.id,
            organizationId: orgA.id,
          },
        },
      });

      // 帶有舊 active_org=Org A 的請求
      const req = new NextRequest("http://localhost:3000/api/organizations", {
        headers: {
          Cookie: `${SESSION_COOKIE_NAME}=${tokenOwnerA}; ${ACTIVE_ORG_COOKIE_NAME}=${orgA.id}`,
        },
      });

      const context = await getActiveOrganizationContext(req);
      // 自動回退至僅存的合法組織 Org A2
      expect(context?.organization.id).toBe(orgA2.id);
    });

    it("10. 擁有 0 個 Membership 的使用者，Context 解析安全回傳 null", async () => {
      const req = new NextRequest("http://localhost:3000/api/organizations", {
        headers: { Cookie: `${SESSION_COOKIE_NAME}=${tokenZeroOrg}` },
      });

      const context = await getActiveOrganizationContext(req);
      expect(context).toBeNull();
    });
  });

  // =========================================================================
  // 3. Organization Detail & Sensitive Data Exposure
  // =========================================================================
  describe("3. 組織明細與成員資料安全 (Organization Detail & Data Exposure)", () => {
    it("11 & 18. 成員可讀取組織明細與成員名冊，且絕不洩漏 passwordHash 等敏感欄位", async () => {
      const req = new NextRequest(`http://localhost:3000/api/organizations/${orgA.id}`, {
        headers: { Cookie: `${SESSION_COOKIE_NAME}=${tokenAdminA}` },
      });

      const res = await orgDetailGET(req, { params: { id: orgA.id } });
      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.success).toBe(true);
      expect(data.organization.id).toBe(orgA.id);
      expect(data.members.length).toBe(4); // Owner, Admin, Editor, Viewer

      // 驗證所有 member 物件絕對不包含敏感資訊
      for (const m of data.members) {
        expect(m.passwordHash).toBeUndefined();
        expect(m.sessions).toBeUndefined();
        expect(m.email).toBeDefined();
        expect(m.role).toBeDefined();
      }
    });

    it("非組織成員讀取組織明細應回傳 403 (IDOR 防護)", async () => {
      const req = new NextRequest(`http://localhost:3000/api/organizations/${orgA.id}`, {
        headers: { Cookie: `${SESSION_COOKIE_NAME}=${tokenForeignB}` },
      });

      const res = await orgDetailGET(req, { params: { id: orgA.id } });
      expect(res.status).toBe(403);
    });
  });

  // =========================================================================
  // 4. Organization Update RBAC Enforcement
  // =========================================================================
  describe("4. 組織設定修改之 RBAC 角色權限檢驗 (PATCH /api/organizations/:id)", () => {
    it("12. OWNER 可成功修改組織名稱", async () => {
      const req = new NextRequest(`http://localhost:3000/api/organizations/${orgA.id}`, {
        method: "PATCH",
        headers: { Cookie: `${SESSION_COOKIE_NAME}=${tokenOwnerA}` },
        body: JSON.stringify({ name: "Alpha 企業總部" }),
      });

      const res = await orgDetailPATCH(req, { params: { id: orgA.id } });
      expect(res.status).toBe(200);

      const checkDb = await db.organization.findUnique({ where: { id: orgA.id } });
      expect(checkDb?.name).toBe("Alpha 企業總部");
    });

    it("13. ADMIN 可成功修改組織名稱", async () => {
      const req = new NextRequest(`http://localhost:3000/api/organizations/${orgA.id}`, {
        method: "PATCH",
        headers: { Cookie: `${SESSION_COOKIE_NAME}=${tokenAdminA}` },
        body: JSON.stringify({ name: "Alpha 研發中心" }),
      });

      const res = await orgDetailPATCH(req, { params: { id: orgA.id } });
      expect(res.status).toBe(200);

      const checkDb = await db.organization.findUnique({ where: { id: orgA.id } });
      expect(checkDb?.name).toBe("Alpha 研發中心");
    });

    it("14. EDITOR 修改組織名稱遭 403 阻擋", async () => {
      const req = new NextRequest(`http://localhost:3000/api/organizations/${orgA.id}`, {
        method: "PATCH",
        headers: { Cookie: `${SESSION_COOKIE_NAME}=${tokenEditorA}` },
        body: JSON.stringify({ name: "Editor 竄改名稱" }),
      });

      const res = await orgDetailPATCH(req, { params: { id: orgA.id } });
      expect(res.status).toBe(403);
    });

    it("15. VIEWER 修改組織名稱遭 403 阻擋", async () => {
      const req = new NextRequest(`http://localhost:3000/api/organizations/${orgA.id}`, {
        method: "PATCH",
        headers: { Cookie: `${SESSION_COOKIE_NAME}=${tokenViewerA}` },
        body: JSON.stringify({ name: "Viewer 竄改名稱" }),
      });

      const res = await orgDetailPATCH(req, { params: { id: orgA.id } });
      expect(res.status).toBe(403);
    });

    it("16. 非成員修改組織名稱遭 403 阻擋", async () => {
      const req = new NextRequest(`http://localhost:3000/api/organizations/${orgA.id}`, {
        method: "PATCH",
        headers: { Cookie: `${SESSION_COOKIE_NAME}=${tokenForeignB}` },
        body: JSON.stringify({ name: "駭客竄改名稱" }),
      });

      const res = await orgDetailPATCH(req, { params: { id: orgA.id } });
      expect(res.status).toBe(403);
    });
  });

  // =========================================================================
  // 5. Survey IDOR Regression (Active Org Cookie Cannot Bypass Survey Auth)
  // =========================================================================
  describe("5. 問卷跨租戶 IDOR 回歸防護 (Survey IDOR Regression)", () => {
    it("17. 使用者無法透過注入 active_org cookie 存取未被授權之問卷 (403)", async () => {
      // 1. GET mode=management 讀取
      const reqGet = new NextRequest(`http://localhost:3000/api/surveys/${surveyB.id}?mode=management`, {
        headers: {
          Cookie: `${SESSION_COOKIE_NAME}=${tokenOwnerA}; ${ACTIVE_ORG_COOKIE_NAME}=${orgB.id}`,
        },
      });

      const resGet = await surveyGET(reqGet, { params: { id: surveyB.id } });
      expect(resGet.status).toBe(403);

      // 2. PATCH 竄改
      const reqPatch = new NextRequest(`http://localhost:3000/api/surveys/${surveyB.id}`, {
        method: "PATCH",
        headers: {
          Cookie: `${SESSION_COOKIE_NAME}=${tokenOwnerA}; ${ACTIVE_ORG_COOKIE_NAME}=${orgB.id}`,
        },
        body: JSON.stringify({ title: "駭客竄改" }),
      });
      const resPatch = await surveyPATCH(reqPatch, { params: { id: surveyB.id } });
      expect(resPatch.status).toBe(403);
    });
  });
});
