import { describe, it, expect, beforeEach } from "vitest";
import { db } from "../src/lib/db";
import {
  hashPassword,
  createSession,
  SESSION_COOKIE_NAME,
} from "../src/lib/auth";
import { NextRequest } from "next/server";
import { Role } from "@prisma/client";
import {
  PATCH as memberPATCH,
  DELETE as memberDELETE,
} from "../src/app/api/organizations/[id]/members/[memberId]/route";
import { GET as orgDetailGET } from "../src/app/api/organizations/[id]/route";
import {
  POST as invitePOST,
  GET as inviteGET,
} from "../src/app/api/organizations/[id]/invitations/route";
import { POST as revokePOST } from "../src/app/api/organizations/[id]/invitations/[invitationId]/revoke/route";

describe("Phase M9-C: Team Collaboration & Ownership Security Suite", () => {
  let orgA: any;
  let orgB: any;

  let ownerA: any;
  let adminA: any;
  let editorA: any;
  let viewerA: any;

  let membershipOwnerA: any;
  let membershipAdminA: any;
  let membershipEditorA: any;
  let membershipViewerA: any;

  let ownerB: any;
  let adminB: any;
  let membershipOwnerB: any;
  let membershipAdminB: any;

  let tokenOwnerA: string;
  let tokenAdminA: string;
  let tokenEditorA: string;
  let tokenViewerA: string;
  let tokenOwnerB: string;

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
      where: { response: { survey: { organization: { slug: { startsWith: "m9c-" } } } } },
    });
    await db.response.deleteMany({
      where: { survey: { organization: { slug: { startsWith: "m9c-" } } } },
    });
    await db.choice.deleteMany({
      where: { question: { survey: { organization: { slug: { startsWith: "m9c-" } } } } },
    });
    await db.question.deleteMany({
      where: { survey: { organization: { slug: { startsWith: "m9c-" } } } },
    });
    await db.survey.deleteMany({
      where: { organization: { slug: { startsWith: "m9c-" } } },
    });
    await db.invitation.deleteMany({
      where: { organization: { slug: { startsWith: "m9c-" } } },
    });
    await db.membership.deleteMany({
      where: { organization: { slug: { startsWith: "m9c-" } } },
    });
    await db.organization.deleteMany({
      where: { slug: { startsWith: "m9c-" } },
    });
    await db.session.deleteMany({
      where: { user: { email: { startsWith: "m9c-" } } },
    });
    await db.user.deleteMany({
      where: { email: { startsWith: "m9c-" } },
    });

    const defaultPwd = await hashPassword("M9CPassword123!");

    // 2. 建立組織
    orgA = await db.organization.create({
      data: { name: "Org Alpha Team", slug: "m9c-org-alpha" },
    });
    orgB = await db.organization.create({
      data: { name: "Org Beta Team", slug: "m9c-org-beta" },
    });

    // 3. 建立 Org A 成員
    ownerA = await db.user.create({
      data: { email: "m9c-owner-a@alpha.com", name: "Alice Owner", passwordHash: defaultPwd },
    });
    membershipOwnerA = await db.membership.create({
      data: { userId: ownerA.id, organizationId: orgA.id, role: Role.OWNER },
    });

    adminA = await db.user.create({
      data: { email: "m9c-admin-a@alpha.com", name: "Aaron Admin", passwordHash: defaultPwd },
    });
    membershipAdminA = await db.membership.create({
      data: { userId: adminA.id, organizationId: orgA.id, role: Role.ADMIN },
    });

    editorA = await db.user.create({
      data: { email: "m9c-editor-a@alpha.com", name: "Eric Editor", passwordHash: defaultPwd },
    });
    membershipEditorA = await db.membership.create({
      data: { userId: editorA.id, organizationId: orgA.id, role: Role.EDITOR },
    });

    viewerA = await db.user.create({
      data: { email: "m9c-viewer-a@alpha.com", name: "Victor Viewer", passwordHash: defaultPwd },
    });
    membershipViewerA = await db.membership.create({
      data: { userId: viewerA.id, organizationId: orgA.id, role: Role.VIEWER },
    });

    // 4. 建立 Org B 成員
    ownerB = await db.user.create({
      data: { email: "m9c-owner-b@beta.com", name: "Bob Owner", passwordHash: defaultPwd },
    });
    membershipOwnerB = await db.membership.create({
      data: { userId: ownerB.id, organizationId: orgB.id, role: Role.OWNER },
    });

    adminB = await db.user.create({
      data: { email: "m9c-admin-b@beta.com", name: "Bella Admin", passwordHash: defaultPwd },
    });
    membershipAdminB = await db.membership.create({
      data: { userId: adminB.id, organizationId: orgB.id, role: Role.ADMIN },
    });

    // 5. 建立 Sessions
    tokenOwnerA = (await createSession(ownerA.id)).token;
    tokenAdminA = (await createSession(adminA.id)).token;
    tokenEditorA = (await createSession(editorA.id)).token;
    tokenViewerA = (await createSession(viewerA.id)).token;
    tokenOwnerB = (await createSession(ownerB.id)).token;
  });

  describe("1. Multi-Tenant Member Isolation", () => {
    it("1. Org A 成員名冊只回傳 Org A 成員，不包含 Org B 成員", async () => {
      const req = makeAuthReq(`http://localhost:3000/api/organizations/${orgA.id}`, tokenOwnerA);
      const res = await orgDetailGET(req, { params: { id: orgA.id } });
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.members.length).toBe(4);
      const emails = data.members.map((m: any) => m.email);
      expect(emails).toContain("m9c-owner-a@alpha.com");
      expect(emails).toContain("m9c-admin-a@alpha.com");
      expect(emails).not.toContain("m9c-owner-b@beta.com");
    });

    it("2. Org B 成員名冊只回傳 Org B 成員", async () => {
      const req = makeAuthReq(`http://localhost:3000/api/organizations/${orgB.id}`, tokenOwnerB);
      const res = await orgDetailGET(req, { params: { id: orgB.id } });
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.members.length).toBe(2);
      const emails = data.members.map((m: any) => m.email);
      expect(emails).toContain("m9c-owner-b@beta.com");
      expect(emails).not.toContain("m9c-owner-a@alpha.com");
    });

    it("3. Org A 使用者無法存取 Org B 成員名冊 (403 Forbidden)", async () => {
      const req = makeAuthReq(`http://localhost:3000/api/organizations/${orgB.id}`, tokenOwnerA);
      const res = await orgDetailGET(req, { params: { id: orgB.id } });
      expect(res.status).toBe(403);
    });

    it("4. Org A 管理者無法修改 Org B 成員角色 (403/404)", async () => {
      const req = makeAuthReq(
        `http://localhost:3000/api/organizations/${orgB.id}/members/${membershipAdminB.id}`,
        tokenOwnerA,
        { method: "PATCH", body: { role: "VIEWER" } }
      );
      const res = await memberPATCH(req, {
        params: { id: orgB.id, memberId: membershipAdminB.id },
      });
      expect(res.status).toBe(403);
    });

    it("5. Org A 管理者無法移除 Org B 成員 (403/404)", async () => {
      const req = makeAuthReq(
        `http://localhost:3000/api/organizations/${orgB.id}/members/${membershipAdminB.id}`,
        tokenOwnerA,
        { method: "DELETE" }
      );
      const res = await memberDELETE(req, {
        params: { id: orgB.id, memberId: membershipAdminB.id },
      });
      expect(res.status).toBe(403);
    });

    it("6. 竄改 active_org Cookie 試圖越權操作 Org B 一律無效並被阻擋", async () => {
      const req = makeAuthReq(
        `http://localhost:3000/api/organizations/${orgB.id}/members/${membershipAdminB.id}`,
        tokenOwnerA,
        {
          method: "PATCH",
          body: { role: "VIEWER" },
          cookies: { survey_active_org: orgB.id },
        }
      );
      const res = await memberPATCH(req, {
        params: { id: orgB.id, memberId: membershipAdminB.id },
      });
      expect(res.status).toBe(403);
    });
  });

  describe("2. RBAC Member Management Controls", () => {
    it("7. VIEWER 無法修改成員角色與無法移除成員 (403 Forbidden)", async () => {
      // 嘗試修改角色
      const reqPatch = makeAuthReq(
        `http://localhost:3000/api/organizations/${orgA.id}/members/${membershipEditorA.id}`,
        tokenViewerA,
        { method: "PATCH", body: { role: "ADMIN" } }
      );
      const resPatch = await memberPATCH(reqPatch, {
        params: { id: orgA.id, memberId: membershipEditorA.id },
      });
      expect(resPatch.status).toBe(403);

      // 嘗試移除成員
      const reqDel = makeAuthReq(
        `http://localhost:3000/api/organizations/${orgA.id}/members/${membershipEditorA.id}`,
        tokenViewerA,
        { method: "DELETE" }
      );
      const resDel = await memberDELETE(reqDel, {
        params: { id: orgA.id, memberId: membershipEditorA.id },
      });
      expect(resDel.status).toBe(403);
    });

    it("8. EDITOR 無法修改成員角色與無法移除成員 (403 Forbidden)", async () => {
      // 嘗試修改角色
      const reqPatch = makeAuthReq(
        `http://localhost:3000/api/organizations/${orgA.id}/members/${membershipViewerA.id}`,
        tokenEditorA,
        { method: "PATCH", body: { role: "EDITOR" } }
      );
      const resPatch = await memberPATCH(reqPatch, {
        params: { id: orgA.id, memberId: membershipViewerA.id },
      });
      expect(resPatch.status).toBe(403);

      // 嘗試移除成員
      const reqDel = makeAuthReq(
        `http://localhost:3000/api/organizations/${orgA.id}/members/${membershipViewerA.id}`,
        tokenEditorA,
        { method: "DELETE" }
      );
      const resDel = await memberDELETE(reqDel, {
        params: { id: orgA.id, memberId: membershipViewerA.id },
      });
      expect(resDel.status).toBe(403);
    });

    it("9. ADMIN 可以管理非 OWNER 成員 (修改 VIEWER -> EDITOR, 移除 EDITOR)", async () => {
      // 1. 修改 VIEWER 為 EDITOR
      const reqPatch = makeAuthReq(
        `http://localhost:3000/api/organizations/${orgA.id}/members/${membershipViewerA.id}`,
        tokenAdminA,
        { method: "PATCH", body: { role: "EDITOR" } }
      );
      const resPatch = await memberPATCH(reqPatch, {
        params: { id: orgA.id, memberId: membershipViewerA.id },
      });
      expect(resPatch.status).toBe(200);

      const checkMem = await db.membership.findUnique({ where: { id: membershipViewerA.id } });
      expect(checkMem?.role).toBe(Role.EDITOR);

      // 2. 移除成員 (Eric Editor)
      const reqDel = makeAuthReq(
        `http://localhost:3000/api/organizations/${orgA.id}/members/${membershipEditorA.id}`,
        tokenAdminA,
        { method: "DELETE" }
      );
      const resDel = await memberDELETE(reqDel, {
        params: { id: orgA.id, memberId: membershipEditorA.id },
      });
      expect(resDel.status).toBe(200);

      const checkDel = await db.membership.findUnique({ where: { id: membershipEditorA.id } });
      expect(checkDel).toBeNull();
    });

    it("10. OWNER 具備完整成員管理權限 (可將成員提升為 ADMIN 或 OWNER)", async () => {
      const reqPatch = makeAuthReq(
        `http://localhost:3000/api/organizations/${orgA.id}/members/${membershipViewerA.id}`,
        tokenOwnerA,
        { method: "PATCH", body: { role: "OWNER" } }
      );
      const resPatch = await memberPATCH(reqPatch, {
        params: { id: orgA.id, memberId: membershipViewerA.id },
      });
      expect(resPatch.status).toBe(200);

      const checkMem = await db.membership.findUnique({ where: { id: membershipViewerA.id } });
      expect(checkMem?.role).toBe(Role.OWNER);
    });
  });

  describe("3. Owner Protection & Hierarchy Guard", () => {
    it("11. ADMIN 無法修改 OWNER 的角色 (403 Forbidden)", async () => {
      const req = makeAuthReq(
        `http://localhost:3000/api/organizations/${orgA.id}/members/${membershipOwnerA.id}`,
        tokenAdminA,
        { method: "PATCH", body: { role: "EDITOR" } }
      );
      const res = await memberPATCH(req, {
        params: { id: orgA.id, memberId: membershipOwnerA.id },
      });
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toContain("FORBIDDEN");
    });

    it("12. ADMIN 無法移除 OWNER (403 Forbidden)", async () => {
      const req = makeAuthReq(
        `http://localhost:3000/api/organizations/${orgA.id}/members/${membershipOwnerA.id}`,
        tokenAdminA,
        { method: "DELETE" }
      );
      const res = await memberDELETE(req, {
        params: { id: orgA.id, memberId: membershipOwnerA.id },
      });
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toContain("FORBIDDEN");
    });

    it("13. 唯一擁有者保護 (Last Owner Protection)：組織內僅有一位 OWNER 時，禁止自我降級或刪除 (400 Bad Request)", async () => {
      // 嘗試降級唯一 OWNER
      const reqPatch = makeAuthReq(
        `http://localhost:3000/api/organizations/${orgA.id}/members/${membershipOwnerA.id}`,
        tokenOwnerA,
        { method: "PATCH", body: { role: "ADMIN" } }
      );
      const resPatch = await memberPATCH(reqPatch, {
        params: { id: orgA.id, memberId: membershipOwnerA.id },
      });
      expect(resPatch.status).toBe(400);
      const dataPatch = await resPatch.json();
      expect(dataPatch.error).toBe("LAST_OWNER_PROTECTION");

      // 嘗試刪除唯一 OWNER
      const reqDel = makeAuthReq(
        `http://localhost:3000/api/organizations/${orgA.id}/members/${membershipOwnerA.id}`,
        tokenOwnerA,
        { method: "DELETE" }
      );
      const resDel = await memberDELETE(reqDel, {
        params: { id: orgA.id, memberId: membershipOwnerA.id },
      });
      expect(resDel.status).toBe(400);
      const dataDel = await resDel.json();
      expect(dataDel.error).toBe("LAST_OWNER_PROTECTION");
    });
  });

  describe("4. Invitation Integration & Security", () => {
    it("14. 邀請發送與列表受租戶邊界約束 (Org A 邀請僅 Org A 可見)", async () => {
      // Org A 發送邀請
      const reqInvite = makeAuthReq(
        `http://localhost:3000/api/organizations/${orgA.id}/invitations`,
        tokenAdminA,
        { method: "POST", body: { email: "m9c-newbie@alpha.com", role: "EDITOR" } }
      );
      const resInvite = await invitePOST(reqInvite, { params: { id: orgA.id } });
      expect(resInvite.status).toBe(201);
      const inviteData = await resInvite.json();

      // Org A 查詢邀請列表 -> 可見
      const reqGetA = makeAuthReq(
        `http://localhost:3000/api/organizations/${orgA.id}/invitations`,
        tokenOwnerA
      );
      const resGetA = await inviteGET(reqGetA, { params: { id: orgA.id } });
      expect(resGetA.status).toBe(200);
      const dataA = await resGetA.json();
      expect(dataA.invitations.length).toBe(1);

      // Org B 查詢邀請列表 -> 無此邀請
      const reqGetB = makeAuthReq(
        `http://localhost:3000/api/organizations/${orgB.id}/invitations`,
        tokenOwnerB
      );
      const resGetB = await inviteGET(reqGetB, { params: { id: orgB.id } });
      expect(resGetB.status).toBe(200);
      const dataB = await resGetB.json();
      expect(dataB.invitations.length).toBe(0);

      // Org B 嘗試撤銷 Org A 的邀請 -> 403/404
      const reqRevoke = makeAuthReq(
        `http://localhost:3000/api/organizations/${orgB.id}/invitations/${inviteData.invitation.id}/revoke`,
        tokenOwnerB,
        { method: "POST" }
      );
      const resRevoke = await revokePOST(reqRevoke, {
        params: { id: orgB.id, invitationId: inviteData.invitation.id },
      });
      expect(resRevoke.status).toBe(404);
    });
  });
});
