import { describe, it, expect, beforeEach } from "vitest";
import { db } from "../src/lib/db";
import {
  hashPassword,
  createSession,
  generateInvitationToken,
  hashInvitationToken,
  ACTIVE_ORG_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  INVITATION_EXPIRY_DAYS,
} from "../src/lib/auth";
import {
  GET as orgInvitationsGET,
  POST as orgInvitationsPOST,
} from "../src/app/api/organizations/[id]/invitations/route";
import { POST as revokePOST } from "../src/app/api/organizations/[id]/invitations/[invitationId]/revoke/route";
import { GET as publicInviteGET } from "../src/app/api/invitations/[token]/route";
import { POST as acceptInvitePOST } from "../src/app/api/invitations/[token]/accept/route";
import { NextRequest } from "next/server";
import { Role } from "@prisma/client";

describe("Phase M8-C: Enterprise Invitation System Security Suite", () => {
  let userOwnerA: any;
  let userAdminA: any;
  let userEditorA: any;
  let userViewerA: any;
  let userForeignB: any;
  let userCandidate: any;
  let userOtherEmail: any;

  let tokenOwnerA: string;
  let tokenAdminA: string;
  let tokenEditorA: string;
  let tokenViewerA: string;
  let tokenForeignB: string;
  let tokenCandidate: string;
  let tokenOtherEmail: string;

  let orgA: any;
  let orgB: any;

  beforeEach(async () => {
    // 1. 清理 M8-C 測試資料
    await db.invitation.deleteMany({
      where: { organization: { slug: { startsWith: "m8c-" } } },
    });
    await db.membership.deleteMany({
      where: { organization: { slug: { startsWith: "m8c-" } } },
    });
    await db.organization.deleteMany({
      where: { slug: { startsWith: "m8c-" } },
    });
    await db.session.deleteMany({
      where: { user: { email: { startsWith: "m8c-" } } },
    });
    await db.user.deleteMany({
      where: { email: { startsWith: "m8c-" } },
    });

    const defaultPwd = await hashPassword("M8CSecurePassword123!");

    // 2. 建立組織
    orgA = await db.organization.create({
      data: { name: "Org Alpha Enterprise", slug: "m8c-org-alpha" },
    });
    orgB = await db.organization.create({
      data: { name: "Org Beta Enterprise", slug: "m8c-org-beta" },
    });

    // 3. 建立各角色使用者
    userOwnerA = await db.user.create({
      data: {
        email: "m8c-owner-a@example.com",
        name: "Alpha Owner",
        passwordHash: defaultPwd,
        memberships: { create: { organizationId: orgA.id, role: Role.OWNER } },
      },
    });
    tokenOwnerA = (await createSession(userOwnerA.id)).token;

    userAdminA = await db.user.create({
      data: {
        email: "m8c-admin-a@example.com",
        name: "Alpha Admin",
        passwordHash: defaultPwd,
        memberships: { create: { organizationId: orgA.id, role: Role.ADMIN } },
      },
    });
    tokenAdminA = (await createSession(userAdminA.id)).token;

    userEditorA = await db.user.create({
      data: {
        email: "m8c-editor-a@example.com",
        name: "Alpha Editor",
        passwordHash: defaultPwd,
        memberships: { create: { organizationId: orgA.id, role: Role.EDITOR } },
      },
    });
    tokenEditorA = (await createSession(userEditorA.id)).token;

    userViewerA = await db.user.create({
      data: {
        email: "m8c-viewer-a@example.com",
        name: "Alpha Viewer",
        passwordHash: defaultPwd,
        memberships: { create: { organizationId: orgA.id, role: Role.VIEWER } },
      },
    });
    tokenViewerA = (await createSession(userViewerA.id)).token;

    userForeignB = await db.user.create({
      data: {
        email: "m8c-user-b@example.com",
        name: "Beta Member",
        passwordHash: defaultPwd,
        memberships: { create: { organizationId: orgB.id, role: Role.OWNER } },
      },
    });
    tokenForeignB = (await createSession(userForeignB.id)).token;

    userCandidate = await db.user.create({
      data: {
        email: "m8c-candidate@example.com",
        name: "Invited Candidate",
        passwordHash: defaultPwd,
      },
    });
    tokenCandidate = (await createSession(userCandidate.id)).token;

    userOtherEmail = await db.user.create({
      data: {
        email: "m8c-other@example.com",
        name: "Other Email User",
        passwordHash: defaultPwd,
      },
    });
    tokenOtherEmail = (await createSession(userOtherEmail.id)).token;
  });

  // =========================================================================
  // 1. Invitation Creation & RBAC Guards
  // =========================================================================
  describe("1. 邀請發起與 RBAC 權限控管", () => {
    it("1. OWNER 可以成功建立成員邀請 (201)", async () => {
      const req = new NextRequest(`http://localhost:3000/api/organizations/${orgA.id}/invitations`, {
        method: "POST",
        headers: { Cookie: `${SESSION_COOKIE_NAME}=${tokenOwnerA}` },
        body: JSON.stringify({ email: "m8c-candidate@example.com", role: "EDITOR" }),
      });

      const res = await orgInvitationsPOST(req, { params: { id: orgA.id } });
      expect(res.status).toBe(201);
      const data = await res.json();

      expect(data.success).toBe(true);
      expect(data.invitation.invitedEmail).toBe("m8c-candidate@example.com");
      expect(data.invitation.role).toBe("EDITOR");
      expect(data.rawToken).toBeDefined();
      expect(data.inviteUrl).toContain(data.rawToken);
    });

    it("2. ADMIN 可以成功建立成員邀請 (201)", async () => {
      const req = new NextRequest(`http://localhost:3000/api/organizations/${orgA.id}/invitations`, {
        method: "POST",
        headers: { Cookie: `${SESSION_COOKIE_NAME}=${tokenAdminA}` },
        body: JSON.stringify({ email: "m8c-candidate@example.com", role: "VIEWER" }),
      });

      const res = await orgInvitationsPOST(req, { params: { id: orgA.id } });
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.success).toBe(true);
    });

    it("3. EDITOR 嘗試建立邀請遭 403 阻擋", async () => {
      const req = new NextRequest(`http://localhost:3000/api/organizations/${orgA.id}/invitations`, {
        method: "POST",
        headers: { Cookie: `${SESSION_COOKIE_NAME}=${tokenEditorA}` },
        body: JSON.stringify({ email: "m8c-candidate@example.com", role: "VIEWER" }),
      });

      const res = await orgInvitationsPOST(req, { params: { id: orgA.id } });
      expect(res.status).toBe(403);
    });

    it("4. VIEWER 嘗試建立邀請遭 403 阻擋", async () => {
      const req = new NextRequest(`http://localhost:3000/api/organizations/${orgA.id}/invitations`, {
        method: "POST",
        headers: { Cookie: `${SESSION_COOKIE_NAME}=${tokenViewerA}` },
        body: JSON.stringify({ email: "m8c-candidate@example.com", role: "VIEWER" }),
      });

      const res = await orgInvitationsPOST(req, { params: { id: orgA.id } });
      expect(res.status).toBe(403);
    });

    it("5. 非成員嘗試建立邀請遭 403 阻擋", async () => {
      const req = new NextRequest(`http://localhost:3000/api/organizations/${orgA.id}/invitations`, {
        method: "POST",
        headers: { Cookie: `${SESSION_COOKIE_NAME}=${tokenForeignB}` },
        body: JSON.stringify({ email: "m8c-candidate@example.com", role: "VIEWER" }),
      });

      const res = await orgInvitationsPOST(req, { params: { id: orgA.id } });
      expect(res.status).toBe(403);
    });

    it("17. 嘗試指派 OWNER 角色或無效角色遭伺服器拒絕 (400)", async () => {
      const reqOwnerRole = new NextRequest(`http://localhost:3000/api/organizations/${orgA.id}/invitations`, {
        method: "POST",
        headers: { Cookie: `${SESSION_COOKIE_NAME}=${tokenOwnerA}` },
        body: JSON.stringify({ email: "m8c-candidate@example.com", role: "OWNER" }),
      });

      const resOwnerRole = await orgInvitationsPOST(reqOwnerRole, { params: { id: orgA.id } });
      expect(resOwnerRole.status).toBe(400);

      const reqInvalidRole = new NextRequest(`http://localhost:3000/api/organizations/${orgA.id}/invitations`, {
        method: "POST",
        headers: { Cookie: `${SESSION_COOKIE_NAME}=${tokenOwnerA}` },
        body: JSON.stringify({ email: "m8c-candidate@example.com", role: "SUPERADMIN" }),
      });
      const resInvalidRole = await orgInvitationsPOST(reqInvalidRole, { params: { id: orgA.id } });
      expect(resInvalidRole.status).toBe(400);
    });

    it("18 & 19. Client 偽造 expiresAt 遭忽略，由伺服器固定計算有效期限 7 天", async () => {
      const beforeTime = Date.now();
      const req = new NextRequest(`http://localhost:3000/api/organizations/${orgA.id}/invitations`, {
        method: "POST",
        headers: { Cookie: `${SESSION_COOKIE_NAME}=${tokenOwnerA}` },
        body: JSON.stringify({
          email: "m8c-candidate@example.com",
          role: "EDITOR",
          expiresAt: "2099-01-01T00:00:00.000Z", // 嘗試偽造超長期限
        }),
      });

      const res = await orgInvitationsPOST(req, { params: { id: orgA.id } });
      expect(res.status).toBe(201);
      const data = await res.json();

      const expiresTime = new Date(data.invitation.expiresAt).getTime();
      const expectedTime = beforeTime + INVITATION_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
      // 容許 5 秒誤差
      expect(Math.abs(expiresTime - expectedTime)).toBeLessThan(5000);
    });
  });

  // =========================================================================
  // 2. Token Security & DB Hashing Verification
  // =========================================================================
  describe("2. Token 雜湊存儲與熵值安全", () => {
    it("6. Token 具備 256-bit CSPRNG 熵值且為 URL-safe Base64URL", () => {
      const token = generateInvitationToken();
      expect(token.length).toBeGreaterThanOrEqual(43);
      expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it("7, 8, 25. 資料庫絕對不儲存明文 Token，僅儲存 SHA-256 Hash，且 API 回應不洩漏 tokenHash", async () => {
      const req = new NextRequest(`http://localhost:3000/api/organizations/${orgA.id}/invitations`, {
        method: "POST",
        headers: { Cookie: `${SESSION_COOKIE_NAME}=${tokenOwnerA}` },
        body: JSON.stringify({ email: "m8c-candidate@example.com", role: "EDITOR" }),
      });

      const res = await orgInvitationsPOST(req, { params: { id: orgA.id } });
      const data = await res.json();
      const rawToken = data.rawToken;
      const expectedHash = hashInvitationToken(rawToken);

      // 檢查 DB
      const dbInv = await db.invitation.findUnique({
        where: { id: data.invitation.id },
      });
      expect(dbInv).not.toBeNull();
      expect(dbInv?.tokenHash).toBe(expectedHash);
      expect((dbInv as any).rawToken).toBeUndefined();

      // 檢查 API 回應絕對不包含 tokenHash
      expect(data.invitation.tokenHash).toBeUndefined();

      // 檢查清單 API 亦絕對不包含 tokenHash
      const reqList = new NextRequest(`http://localhost:3000/api/organizations/${orgA.id}/invitations`, {
        headers: { Cookie: `${SESSION_COOKIE_NAME}=${tokenOwnerA}` },
      });
      const resList = await orgInvitationsGET(reqList, { params: { id: orgA.id } });
      const dataList = await resList.json();
      for (const inv of dataList.invitations) {
        expect(inv.tokenHash).toBeUndefined();
      }
    });
  });

  // =========================================================================
  // 3. Public Preview & Information Leakage Defense
  // =========================================================================
  describe("3. 公開邀請預覽與敏感資訊防護", () => {
    it("8, 26, 27, 28, 29. 公開預覽 API (GET /api/invitations/:token) 僅回傳 Sanitized 預覽，不洩漏敏感資訊", async () => {
      const rawToken = generateInvitationToken();
      const tokenHash = hashInvitationToken(rawToken);
      await db.invitation.create({
        data: {
          organizationId: orgA.id,
          invitedEmail: "m8c-candidate@example.com",
          role: Role.EDITOR,
          tokenHash,
          expiresAt: new Date(Date.now() + 86400000),
          createdById: userOwnerA.id,
        },
      });

      const req = new NextRequest(`http://localhost:3000/api/invitations/${rawToken}`);
      const res = await publicInviteGET(req, { params: { token: rawToken } });
      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.success).toBe(true);
      expect(data.invitation.organizationName).toBe("Org Alpha Enterprise");
      expect(data.invitation.invitedEmail).toBe("m8c-candidate@example.com");
      expect(data.invitation.role).toBe("EDITOR");

      // 嚴格驗證不洩漏的內部欄位
      expect(data.invitation.organizationId).toBeUndefined();
      expect(data.invitation.tokenHash).toBeUndefined();
      expect(data.invitation.createdById).toBeUndefined();
      expect(data.invitation.passwordHash).toBeUndefined();
      expect(data.invitation.sessions).toBeUndefined();
    });

    it("9. 無效的 Token 查詢回傳 404 (防止探測)", async () => {
      const forgedToken = "completely_fake_non_existent_token_123456789";
      const req = new NextRequest(`http://localhost:3000/api/invitations/${forgedToken}`);
      const res = await publicInviteGET(req, { params: { token: forgedToken } });
      expect(res.status).toBe(404);
    });

    it("10. 已過期的 Token 查詢回傳 404", async () => {
      const rawToken = generateInvitationToken();
      const tokenHash = hashInvitationToken(rawToken);
      await db.invitation.create({
        data: {
          organizationId: orgA.id,
          invitedEmail: "m8c-candidate@example.com",
          role: Role.EDITOR,
          tokenHash,
          expiresAt: new Date(Date.now() - 10000), // 已過期
          createdById: userOwnerA.id,
        },
      });

      const req = new NextRequest(`http://localhost:3000/api/invitations/${rawToken}`);
      const res = await publicInviteGET(req, { params: { token: rawToken } });
      expect(res.status).toBe(404);
    });

    it("11. 已撤銷的 Token 查詢回傳 404", async () => {
      const rawToken = generateInvitationToken();
      const tokenHash = hashInvitationToken(rawToken);
      await db.invitation.create({
        data: {
          organizationId: orgA.id,
          invitedEmail: "m8c-candidate@example.com",
          role: Role.EDITOR,
          tokenHash,
          expiresAt: new Date(Date.now() + 86400000),
          revokedAt: new Date(), // 已撤銷
          createdById: userOwnerA.id,
        },
      });

      const req = new NextRequest(`http://localhost:3000/api/invitations/${rawToken}`);
      const res = await publicInviteGET(req, { params: { token: rawToken } });
      expect(res.status).toBe(404);
    });

    it("12. 已使用的 Token 查詢回傳 404", async () => {
      const rawToken = generateInvitationToken();
      const tokenHash = hashInvitationToken(rawToken);
      await db.invitation.create({
        data: {
          organizationId: orgA.id,
          invitedEmail: "m8c-candidate@example.com",
          role: Role.EDITOR,
          tokenHash,
          expiresAt: new Date(Date.now() + 86400000),
          usedAt: new Date(), // 已使用
          createdById: userOwnerA.id,
        },
      });

      const req = new NextRequest(`http://localhost:3000/api/invitations/${rawToken}`);
      const res = await publicInviteGET(req, { params: { token: rawToken } });
      expect(res.status).toBe(404);
    });
  });

  // =========================================================================
  // 4. Invitation Acceptance & Atomic Transaction
  // =========================================================================
  describe("4. 邀請接受、身分比對與原子交易", () => {
    it("13. 正確 Email 登入者接受邀請成功，建立 Membership 並標記 usedAt (200)", async () => {
      const rawToken = generateInvitationToken();
      const tokenHash = hashInvitationToken(rawToken);
      const inv = await db.invitation.create({
        data: {
          organizationId: orgA.id,
          invitedEmail: "m8c-candidate@example.com",
          role: Role.EDITOR,
          tokenHash,
          expiresAt: new Date(Date.now() + 86400000),
          createdById: userOwnerA.id,
        },
      });

      const req = new NextRequest(`http://localhost:3000/api/invitations/${rawToken}/accept`, {
        method: "POST",
        headers: { Cookie: `${SESSION_COOKIE_NAME}=${tokenCandidate}` },
      });

      const res = await acceptInvitePOST(req, { params: { token: rawToken } });
      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.success).toBe(true);
      expect(data.organization.role).toBe("EDITOR");
      expect(res.cookies.get(ACTIVE_ORG_COOKIE_NAME)?.value).toBe(orgA.id);

      // 驗證 DB
      const checkMembership = await db.membership.findUnique({
        where: {
          userId_organizationId: {
            userId: userCandidate.id,
            organizationId: orgA.id,
          },
        },
      });
      expect(checkMembership?.role).toBe(Role.EDITOR);

      const checkInv = await db.invitation.findUnique({ where: { id: inv.id } });
      expect(checkInv?.usedAt).not.toBeNull();
    });

    it("14. 登入 Email 與邀請信箱不一致時遭 403 阻擋 (Email Mismatch Protection)", async () => {
      const rawToken = generateInvitationToken();
      const tokenHash = hashInvitationToken(rawToken);
      await db.invitation.create({
        data: {
          organizationId: orgA.id,
          invitedEmail: "m8c-candidate@example.com",
          role: Role.EDITOR,
          tokenHash,
          expiresAt: new Date(Date.now() + 86400000),
          createdById: userOwnerA.id,
        },
      });

      // 使用 m8c-other@example.com 帳號嘗試接受
      const req = new NextRequest(`http://localhost:3000/api/invitations/${rawToken}/accept`, {
        method: "POST",
        headers: { Cookie: `${SESSION_COOKIE_NAME}=${tokenOtherEmail}` },
      });

      const res = await acceptInvitePOST(req, { params: { token: rawToken } });
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toBe("EMAIL_MISMATCH");
    });

    it("15. 未登入使用者嘗試接受邀請回傳 401 Unauthorized", async () => {
      const rawToken = generateInvitationToken();
      const tokenHash = hashInvitationToken(rawToken);
      await db.invitation.create({
        data: {
          organizationId: orgA.id,
          invitedEmail: "m8c-candidate@example.com",
          role: Role.EDITOR,
          tokenHash,
          expiresAt: new Date(Date.now() + 86400000),
          createdById: userOwnerA.id,
        },
      });

      const req = new NextRequest(`http://localhost:3000/api/invitations/${rawToken}/accept`, {
        method: "POST",
      });

      const res = await acceptInvitePOST(req, { params: { token: rawToken } });
      expect(res.status).toBe(401);
    });

    it("20 & 21. 既有成員接受邀請時不重複建立 Membership，亦不被邀請惡意提權", async () => {
      // userViewerA (目前為 VIEWER) 收到 ADMIN 邀請
      const rawToken = generateInvitationToken();
      const tokenHash = hashInvitationToken(rawToken);
      await db.invitation.create({
        data: {
          organizationId: orgA.id,
          invitedEmail: userViewerA.email,
          role: Role.ADMIN, // 嘗試透過邀請提權為 ADMIN
          tokenHash,
          expiresAt: new Date(Date.now() + 86400000),
          createdById: userOwnerA.id,
        },
      });

      const req = new NextRequest(`http://localhost:3000/api/invitations/${rawToken}/accept`, {
        method: "POST",
        headers: { Cookie: `${SESSION_COOKIE_NAME}=${tokenViewerA}` },
      });

      const res = await acceptInvitePOST(req, { params: { token: rawToken } });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.alreadyMember).toBe(true);
      expect(data.organization.role).toBe(Role.VIEWER); // 保持 VIEWER

      // 檢查 DB Membership 依然為 VIEWER
      const member = await db.membership.findUnique({
        where: {
          userId_organizationId: {
            userId: userViewerA.id,
            organizationId: orgA.id,
          },
        },
      });
      expect(member?.role).toBe(Role.VIEWER);
    });

    it("22. 並發同時接受邀請測試 (Concurrency Race Condition Protection)", async () => {
      const rawToken = generateInvitationToken();
      const tokenHash = hashInvitationToken(rawToken);
      await db.invitation.create({
        data: {
          organizationId: orgA.id,
          invitedEmail: "m8c-candidate@example.com",
          role: Role.EDITOR,
          tokenHash,
          expiresAt: new Date(Date.now() + 86400000),
          createdById: userOwnerA.id,
        },
      });

      // 兩個並發請求同時接受同一 Token
      const makeReq = () =>
        new NextRequest(`http://localhost:3000/api/invitations/${rawToken}/accept`, {
          method: "POST",
          headers: { Cookie: `${SESSION_COOKIE_NAME}=${tokenCandidate}` },
        });

      const [res1, res2] = await Promise.all([
        acceptInvitePOST(makeReq(), { params: { token: rawToken } }),
        acceptInvitePOST(makeReq(), { params: { token: rawToken } }),
      ]);

      // 兩者皆能處理完成，且 DB 中絕對僅有一筆 Membership
      const statuses = [res1.status, res2.status];
      expect(statuses).toContain(200);

      const memberships = await db.membership.findMany({
        where: {
          userId: userCandidate.id,
          organizationId: orgA.id,
        },
      });
      expect(memberships.length).toBe(1);
    });
  });

  // =========================================================================
  // 5. Revocation & Resend Invalidation
  // =========================================================================
  describe("5. 邀請撤銷與重發失效", () => {
    it("16 & 23. 管理員撤銷邀請後，Token 立即失效；非管理員/跨租戶撤銷遭阻擋", async () => {
      const rawToken = generateInvitationToken();
      const tokenHash = hashInvitationToken(rawToken);
      const inv = await db.invitation.create({
        data: {
          organizationId: orgA.id,
          invitedEmail: "m8c-candidate@example.com",
          role: Role.EDITOR,
          tokenHash,
          expiresAt: new Date(Date.now() + 86400000),
          createdById: userOwnerA.id,
        },
      });

      // 1. 非成員嘗試撤銷 -> 403
      const reqCross = new NextRequest(
        `http://localhost:3000/api/organizations/${orgA.id}/invitations/${inv.id}/revoke`,
        {
          method: "POST",
          headers: { Cookie: `${SESSION_COOKIE_NAME}=${tokenForeignB}` },
        }
      );
      const resCross = await revokePOST(reqCross, {
        params: { id: orgA.id, invitationId: inv.id },
      });
      expect(resCross.status).toBe(403);

      // 2. ADMIN 成功撤銷
      const reqAdmin = new NextRequest(
        `http://localhost:3000/api/organizations/${orgA.id}/invitations/${inv.id}/revoke`,
        {
          method: "POST",
          headers: { Cookie: `${SESSION_COOKIE_NAME}=${tokenAdminA}` },
        }
      );
      const resAdmin = await revokePOST(reqAdmin, {
        params: { id: orgA.id, invitationId: inv.id },
      });
      expect(resAdmin.status).toBe(200);

      // 3. 撤銷後受邀人嘗試接受 -> 400
      const reqAccept = new NextRequest(
        `http://localhost:3000/api/invitations/${rawToken}/accept`,
        {
          method: "POST",
          headers: { Cookie: `${SESSION_COOKIE_NAME}=${tokenCandidate}` },
        }
      );
      const resAccept = await acceptInvitePOST(reqAccept, {
        params: { token: rawToken },
      });
      expect(resAccept.status).toBe(400);
    });

    it("24. 重複邀請同一 Email 時，舊 Token 自動失效 (Single Active Token)", async () => {
      // 1. 發送第一封邀請
      const req1 = new NextRequest(`http://localhost:3000/api/organizations/${orgA.id}/invitations`, {
        method: "POST",
        headers: { Cookie: `${SESSION_COOKIE_NAME}=${tokenOwnerA}` },
        body: JSON.stringify({ email: "m8c-candidate@example.com", role: "VIEWER" }),
      });
      const res1 = await orgInvitationsPOST(req1, { params: { id: orgA.id } });
      const data1 = await res1.json();
      const token1 = data1.rawToken;

      // 2. 發送第二封邀請 (同一 Email)
      const req2 = new NextRequest(`http://localhost:3000/api/organizations/${orgA.id}/invitations`, {
        method: "POST",
        headers: { Cookie: `${SESSION_COOKIE_NAME}=${tokenOwnerA}` },
        body: JSON.stringify({ email: "m8c-candidate@example.com", role: "EDITOR" }),
      });
      const res2 = await orgInvitationsPOST(req2, { params: { id: orgA.id } });
      const data2 = await res2.json();
      const token2 = data2.rawToken;

      // 3. 嘗試使用舊 Token1 接受 -> 400 (已撤銷)
      const reqAcceptOld = new NextRequest(`http://localhost:3000/api/invitations/${token1}/accept`, {
        method: "POST",
        headers: { Cookie: `${SESSION_COOKIE_NAME}=${tokenCandidate}` },
      });
      const resAcceptOld = await acceptInvitePOST(reqAcceptOld, { params: { token: token1 } });
      expect(resAcceptOld.status).toBe(400);

      // 4. 使用新 Token2 接受 -> 200 成功
      const reqAcceptNew = new NextRequest(`http://localhost:3000/api/invitations/${token2}/accept`, {
        method: "POST",
        headers: { Cookie: `${SESSION_COOKIE_NAME}=${tokenCandidate}` },
      });
      const resAcceptNew = await acceptInvitePOST(reqAcceptNew, { params: { token: token2 } });
      expect(resAcceptNew.status).toBe(200);
    });
  });
});
