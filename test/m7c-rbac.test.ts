import { describe, it, expect, beforeEach } from "vitest";
import { db } from "../src/lib/db";
import { hashPassword, createSession, SESSION_COOKIE_NAME, ROLES, hasRole, getUserMembership } from "../src/lib/auth";
import { GET as surveyGET, PATCH as surveyPATCH } from "../src/app/api/surveys/[id]/route";
import { GET as responsesGET } from "../src/app/api/surveys/[id]/responses/route";
import { GET as responseSingleGET, DELETE as responseSingleDELETE } from "../src/app/api/surveys/[id]/responses/[responseId]/route";
import { GET as statsGET } from "../src/app/api/surveys/[id]/stats/route";
import { GET as exportGET } from "../src/app/api/surveys/[id]/export/route";
import { POST as clonePOST } from "../src/app/api/surveys/[id]/clone-version/route";
import { POST as importPOST } from "../src/app/api/surveys/import/route";
import { GET as importHistoryGET } from "../src/app/api/surveys/import/history/route";
import { GET as importDetailGET } from "../src/app/api/surveys/import/[importId]/route";
import { GET as importErrorCsvGET } from "../src/app/api/surveys/import/[importId]/errors/route";
import { NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { Role } from "@prisma/client";

describe("Phase M7-C: RBAC Role-Based Access Control 測試", () => {
  const orgId = "m7c-org-main";
  const orgAltId = "m7c-org-alt";

  let userOwner: any;
  let userAdmin: any;
  let userEditor: any;
  let userViewer: any;
  let userCrossRole: any; // Org Main: VIEWER, Org Alt: ADMIN

  let tokenOwner: string;
  let tokenAdmin: string;
  let tokenEditor: string;
  let tokenViewer: string;
  let tokenCrossRole: string;

  let surveyMain: any;
  let responseMain: any;
  let importMainId: string;

  let surveyAlt: any;
  let responseAlt: any;

  beforeEach(async () => {
    // 1. 清理資料
    await db.surveyImport.deleteMany({
      where: { organizationId: { in: [orgId, orgAltId] } },
    });
    await db.response.deleteMany({
      where: { survey: { organizationId: { in: [orgId, orgAltId] } } },
    });
    await db.survey.deleteMany({
      where: { organizationId: { in: [orgId, orgAltId] } },
    });
    await db.membership.deleteMany({
      where: { organizationId: { in: [orgId, orgAltId] } },
    });
    await db.session.deleteMany({
      where: { user: { email: { startsWith: "m7c-" } } },
    });
    await db.user.deleteMany({
      where: { email: { startsWith: "m7c-" } },
    });
    await db.organization.deleteMany({
      where: { id: { in: [orgId, orgAltId] } },
    });

    // 2. 建立組織
    await db.organization.create({
      data: { id: orgId, name: "Main Organization", slug: "main-org" },
    });
    await db.organization.create({
      data: { id: orgAltId, name: "Alternate Organization", slug: "alt-org" },
    });

    const defaultPwdHash = await hashPassword("RbacPass123!");

    // 3. 建立各角色使用者
    userOwner = await db.user.create({
      data: {
        email: "m7c-owner@example.com",
        name: "Owner User",
        passwordHash: defaultPwdHash,
        memberships: { create: { organizationId: orgId, role: Role.OWNER } },
      },
    });
    const sOwner = await createSession(userOwner.id);
    tokenOwner = sOwner.token;

    userAdmin = await db.user.create({
      data: {
        email: "m7c-admin@example.com",
        name: "Admin User",
        passwordHash: defaultPwdHash,
        memberships: { create: { organizationId: orgId, role: Role.ADMIN } },
      },
    });
    const sAdmin = await createSession(userAdmin.id);
    tokenAdmin = sAdmin.token;

    userEditor = await db.user.create({
      data: {
        email: "m7c-editor@example.com",
        name: "Editor User",
        passwordHash: defaultPwdHash,
        memberships: { create: { organizationId: orgId, role: Role.EDITOR } },
      },
    });
    const sEditor = await createSession(userEditor.id);
    tokenEditor = sEditor.token;

    userViewer = await db.user.create({
      data: {
        email: "m7c-viewer@example.com",
        name: "Viewer User",
        passwordHash: defaultPwdHash,
        memberships: { create: { organizationId: orgId, role: Role.VIEWER } },
      },
    });
    const sViewer = await createSession(userViewer.id);
    tokenViewer = sViewer.token;

    // Cross-Role User: Main Org -> VIEWER, Alt Org -> ADMIN
    userCrossRole = await db.user.create({
      data: {
        email: "m7c-cross@example.com",
        name: "Cross Role User",
        passwordHash: defaultPwdHash,
        memberships: {
          create: [
            { organizationId: orgId, role: Role.VIEWER },
            { organizationId: orgAltId, role: Role.ADMIN },
          ],
        },
      },
    });
    const sCross = await createSession(userCrossRole.id);
    tokenCrossRole = sCross.token;

    // 4. 建立測試問卷
    surveyMain = await db.survey.create({
      data: {
        title: "[M7C-TEST] Main Survey",
        organizationId: orgId,
        status: "DRAFT",
        questions: {
          create: {
            code: "QM1",
            title: "主要問卷問題",
            questionType: "single_choice",
            orderNum: 1,
            choices: {
              create: [{ label: "選項A", value: "A", orderNum: 1 }],
            },
          },
        },
      },
    });

    surveyAlt = await db.survey.create({
      data: {
        title: "[M7C-TEST] Alt Survey",
        organizationId: orgAltId,
        status: "DRAFT",
        questions: {
          create: {
            code: "QA1",
            title: "副組織問卷問題",
            questionType: "single_choice",
            orderNum: 1,
            choices: {
              create: [{ label: "選項B", value: "B", orderNum: 1 }],
            },
          },
        },
      },
    });

    // 5. 建立填答紀錄
    responseMain = await db.response.create({
      data: {
        surveyId: surveyMain.id,
        status: "COMPLETED",
        totalScore: 10,
        maxScore: 10,
        percentage: 100,
        submittedAt: new Date(),
        answers: {
          create: {
            questionId: (await db.question.findFirst({ where: { surveyId: surveyMain.id } }))!.id,
            rawValue: JSON.stringify("A"),
          },
        },
      },
    });

    responseAlt = await db.response.create({
      data: {
        surveyId: surveyAlt.id,
        status: "COMPLETED",
        totalScore: 5,
        maxScore: 10,
        percentage: 50,
        submittedAt: new Date(),
        answers: {
          create: {
            questionId: (await db.question.findFirst({ where: { surveyId: surveyAlt.id } }))!.id,
            rawValue: JSON.stringify("B"),
          },
        },
      },
    });

    // 6. 建立匯入紀錄
    importMainId = `IMP-M7C-MAIN-${Date.now()}`;
    await db.surveyImport.create({
      data: {
        importId: importMainId,
        organizationId: orgId,
        surveyId: surveyMain.id,
        fileName: "main-import.xlsx",
        status: "SUCCESS",
        questionCount: 1,
      },
    });
  });

  // =========================================================================
  // 1. RBAC Guard Unit Helpers
  // =========================================================================
  describe("1. RBAC Guard 核心函式驗證", () => {
    it("getUserMembership 能正確取得使用者在該組織的 Membership 與 Role", async () => {
      const memOwner = await getUserMembership(userOwner.id, orgId);
      expect(memOwner?.role).toBe(Role.OWNER);

      const memViewer = await getUserMembership(userViewer.id, orgId);
      expect(memViewer?.role).toBe(Role.VIEWER);

      const memNone = await getUserMembership(userOwner.id, orgAltId);
      expect(memNone).toBeNull();
    });

    it("hasRole 正確判斷角色權限許可", async () => {
      const checkOwner = await hasRole(userOwner.id, orgId, ROLES.EDITORS);
      expect(checkOwner.allowed).toBe(true);

      const checkViewer = await hasRole(userViewer.id, orgId, ROLES.EDITORS);
      expect(checkViewer.allowed).toBe(false);

      const checkAdminManager = await hasRole(userAdmin.id, orgId, ROLES.MANAGERS);
      expect(checkAdminManager.allowed).toBe(true);

      const checkEditorManager = await hasRole(userEditor.id, orgId, ROLES.MANAGERS);
      expect(checkEditorManager.allowed).toBe(false);
    });
  });

  // =========================================================================
  // 2. Read Actions (ALL Roles: OWNER, ADMIN, EDITOR, VIEWER)
  // =========================================================================
  describe("2. 讀取操作權限 (ALL Roles: OWNER / ADMIN / EDITOR / VIEWER)", () => {
    it("所有角色 (含 VIEWER) 皆可查看問卷詳情 (GET /api/surveys/:id?mode=management)", async () => {
      for (const token of [tokenOwner, tokenAdmin, tokenEditor, tokenViewer]) {
        const req = new NextRequest(`http://localhost:3000/api/surveys/${surveyMain.id}?mode=management`, {
          headers: { Cookie: `${SESSION_COOKIE_NAME}=${token}` },
        });
        const res = await surveyGET(req, { params: { id: surveyMain.id } });
        expect(res.status).toBe(200);
      }
    });

    it("所有角色 (含 VIEWER) 皆可查看 Responses 列表 (GET /api/surveys/:id/responses)", async () => {
      for (const token of [tokenOwner, tokenAdmin, tokenEditor, tokenViewer]) {
        const req = new NextRequest(`http://localhost:3000/api/surveys/${surveyMain.id}/responses`, {
          headers: { Cookie: `${SESSION_COOKIE_NAME}=${token}` },
        });
        const res = await responsesGET(req, { params: { id: surveyMain.id } });
        expect(res.status).toBe(200);
      }
    });

    it("所有角色 (含 VIEWER) 皆可查看統計報表 (GET /api/surveys/:id/stats)", async () => {
      for (const token of [tokenOwner, tokenAdmin, tokenEditor, tokenViewer]) {
        const req = new NextRequest(`http://localhost:3000/api/surveys/${surveyMain.id}/stats`, {
          headers: { Cookie: `${SESSION_COOKIE_NAME}=${token}` },
        });
        const res = await statsGET(req, { params: { id: surveyMain.id } });
        expect(res.status).toBe(200);
      }
    });

    it("所有角色 (含 VIEWER) 皆可查看匯入歷史與明細", async () => {
      for (const token of [tokenOwner, tokenAdmin, tokenEditor, tokenViewer]) {
        const reqHist = new NextRequest(`http://localhost:3000/api/surveys/import/history?organizationId=${orgId}`, {
          headers: { Cookie: `${SESSION_COOKIE_NAME}=${token}` },
        });
        const resHist = await importHistoryGET(reqHist);
        expect(resHist.status).toBe(200);

        const reqDetail = new NextRequest(`http://localhost:3000/api/surveys/import/${importMainId}`, {
          headers: { Cookie: `${SESSION_COOKIE_NAME}=${token}` },
        });
        const resDetail = await importDetailGET(reqDetail, { params: { importId: importMainId } });
        expect(resDetail.status).toBe(200);
      }
    });
  });

  // =========================================================================
  // 3. Export Action (EDITORS Allowed, VIEWER Denied)
  // =========================================================================
  describe("3. Excel 報表匯出權限 (OWNER/ADMIN/EDITOR 允許，VIEWER 阻擋)", () => {
    it("OWNER, ADMIN, EDITOR 可匯出報表 (200 OK)", async () => {
      for (const token of [tokenOwner, tokenAdmin, tokenEditor]) {
        const req = new NextRequest(`http://localhost:3000/api/surveys/${surveyMain.id}/export`, {
          headers: { Cookie: `${SESSION_COOKIE_NAME}=${token}` },
        });
        const res = await exportGET(req, { params: { id: surveyMain.id } });
        expect(res.status).toBe(200);
      }
    });

    it("VIEWER 匯出報表應被拒絕回傳 403 Forbidden", async () => {
      const req = new NextRequest(`http://localhost:3000/api/surveys/${surveyMain.id}/export`, {
        headers: { Cookie: `${SESSION_COOKIE_NAME}=${tokenViewer}` },
      });
      const res = await exportGET(req, { params: { id: surveyMain.id } });
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toBe("FORBIDDEN");
    });
  });

  // =========================================================================
  // 4. Survey Mutation & Clone Actions (EDITORS Allowed, VIEWER Denied)
  // =========================================================================
  describe("4. 問卷修改與複製版本權限 (OWNER/ADMIN/EDITOR 允許，VIEWER 阻擋)", () => {
    it("OWNER, ADMIN, EDITOR 可修改問卷 (200 OK)", async () => {
      for (const token of [tokenOwner, tokenAdmin, tokenEditor]) {
        const req = new NextRequest(`http://localhost:3000/api/surveys/${surveyMain.id}`, {
          method: "PATCH",
          headers: { Cookie: `${SESSION_COOKIE_NAME}=${token}` },
          body: JSON.stringify({ title: `Updated by ${token.slice(0, 8)}` }),
        });
        const res = await surveyPATCH(req, { params: { id: surveyMain.id } });
        expect(res.status).toBe(200);
      }
    });

    it("VIEWER 修改問卷應被拒絕回傳 403 Forbidden", async () => {
      const req = new NextRequest(`http://localhost:3000/api/surveys/${surveyMain.id}`, {
        method: "PATCH",
        headers: { Cookie: `${SESSION_COOKIE_NAME}=${tokenViewer}` },
        body: JSON.stringify({ title: "Viewer Illegal Modification" }),
      });
      const res = await surveyPATCH(req, { params: { id: surveyMain.id } });
      expect(res.status).toBe(403);
    });

    it("OWNER, ADMIN, EDITOR 可複製問卷版本 (200 OK)", async () => {
      for (const token of [tokenOwner, tokenAdmin, tokenEditor]) {
        const req = new NextRequest(`http://localhost:3000/api/surveys/${surveyMain.id}/clone-version`, {
          method: "POST",
          headers: { Cookie: `${SESSION_COOKIE_NAME}=${token}` },
        });
        const res = await clonePOST(req, { params: { id: surveyMain.id } });
        expect(res.status).toBe(200);
      }
    });

    it("VIEWER 複製問卷版本應被拒絕回傳 403 Forbidden", async () => {
      const req = new NextRequest(`http://localhost:3000/api/surveys/${surveyMain.id}/clone-version`, {
        method: "POST",
        headers: { Cookie: `${SESSION_COOKIE_NAME}=${tokenViewer}` },
      });
      const res = await clonePOST(req, { params: { id: surveyMain.id } });
      expect(res.status).toBe(403);
    });
  });

  // =========================================================================
  // 5. Excel Import Save Action (EDITORS Allowed, VIEWER Denied)
  // =========================================================================
  describe("5. Excel 匯入建立問卷權限 (OWNER/ADMIN/EDITOR 允許，VIEWER 阻擋)", () => {
    async function createTestExcelBlob(): Promise<Blob> {
      const wb = new ExcelJS.Workbook();
      const qSheet = wb.addWorksheet("questions");
      qSheet.addRow(["code", "title", "question_type"]);
      qSheet.addRow(["Q1", "測試題目", "text"]);
      const buffer = await wb.xlsx.writeBuffer();
      return new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
    }

    it("EDITOR 可匯入問卷 (200 OK)", async () => {
      const blob = await createTestExcelBlob();
      const formData = new FormData();
      formData.append("file", blob, "editor-import.xlsx");
      formData.append("mode", "save");
      formData.append("organizationId", orgId);
      formData.append("copyrightConfirmed", "true");

      const req = new NextRequest("http://localhost:3000/api/surveys/import", {
        method: "POST",
        headers: { Cookie: `${SESSION_COOKIE_NAME}=${tokenEditor}` },
        body: formData,
      });

      const res = await importPOST(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
    });

    it("VIEWER 匯入問卷應被拒絕回傳 403 Forbidden", async () => {
      const blob = await createTestExcelBlob();
      const formData = new FormData();
      formData.append("file", blob, "viewer-import.xlsx");
      formData.append("mode", "save");
      formData.append("organizationId", orgId);
      formData.append("copyrightConfirmed", "true");

      const req = new NextRequest("http://localhost:3000/api/surveys/import", {
        method: "POST",
        headers: { Cookie: `${SESSION_COOKIE_NAME}=${tokenViewer}` },
        body: formData,
      });

      const res = await importPOST(req);
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toBe("FORBIDDEN");
    });
  });

  // =========================================================================
  // 6. Delete Completed Response Action (MANAGERS Allowed, EDITOR/VIEWER Denied)
  // =========================================================================
  describe("6. 刪除正式回覆記錄權限 (OWNER/ADMIN 允許，EDITOR/VIEWER 阻擋)", () => {
    it("EDITOR 與 VIEWER 刪除正式回覆記錄皆應被拒絕回傳 403 Forbidden", async () => {
      // 1. EDITOR 嘗試刪除
      const reqEditor = new NextRequest(
        `http://localhost:3000/api/surveys/${surveyMain.id}/responses/${responseMain.id}?force=true`,
        {
          method: "DELETE",
          headers: { Cookie: `${SESSION_COOKIE_NAME}=${tokenEditor}` },
        }
      );
      const resEditor = await responseSingleDELETE(reqEditor, {
        params: { id: surveyMain.id, responseId: responseMain.id },
      });
      expect(resEditor.status).toBe(403);

      // 2. VIEWER 嘗試刪除
      const reqViewer = new NextRequest(
        `http://localhost:3000/api/surveys/${surveyMain.id}/responses/${responseMain.id}?force=true`,
        {
          method: "DELETE",
          headers: { Cookie: `${SESSION_COOKIE_NAME}=${tokenViewer}` },
        }
      );
      const resViewer = await responseSingleDELETE(reqViewer, {
        params: { id: surveyMain.id, responseId: responseMain.id },
      });
      expect(resViewer.status).toBe(403);
    });

    it("ADMIN 與 OWNER 可刪除正式回覆記錄 (200 OK)", async () => {
      // 建立供 ADMIN 刪除的暫存回覆
      const tempResp = await db.response.create({
        data: {
          surveyId: surveyMain.id,
          status: "COMPLETED",
          totalScore: 8,
          submittedAt: new Date(),
        },
      });

      const reqAdmin = new NextRequest(
        `http://localhost:3000/api/surveys/${surveyMain.id}/responses/${tempResp.id}?force=true`,
        {
          method: "DELETE",
          headers: { Cookie: `${SESSION_COOKIE_NAME}=${tokenAdmin}` },
        }
      );
      const resAdmin = await responseSingleDELETE(reqAdmin, {
        params: { id: surveyMain.id, responseId: tempResp.id },
      });
      expect(resAdmin.status).toBe(200);
    });
  });

  // =========================================================================
  // 7. Multi-Organization Role Isolation (最重要越權防護)
  // =========================================================================
  describe("7. 多組織角色隔離防護 (User 在 Org Main 為 VIEWER，在 Org Alt 為 ADMIN)", () => {
    it("User 在 Org Main 操作時受 VIEWER 約束 (無法修改、無法匯出)，在 Org Alt 操作時享有 ADMIN 權限 (可修改、可匯出)", async () => {
      // 1. User 對 Org Main (身分為 VIEWER) 嘗試 PATCH -> 預期 403
      const reqPatchMain = new NextRequest(`http://localhost:3000/api/surveys/${surveyMain.id}`, {
        method: "PATCH",
        headers: { Cookie: `${SESSION_COOKIE_NAME}=${tokenCrossRole}` },
        body: JSON.stringify({ title: "Cross User Illegal Edit" }),
      });
      const resPatchMain = await surveyPATCH(reqPatchMain, { params: { id: surveyMain.id } });
      expect(resPatchMain.status).toBe(403);

      // 2. User 對 Org Main (身分為 VIEWER) 嘗試 Export -> 預期 403
      const reqExportMain = new NextRequest(`http://localhost:3000/api/surveys/${surveyMain.id}/export`, {
        headers: { Cookie: `${SESSION_COOKIE_NAME}=${tokenCrossRole}` },
      });
      const resExportMain = await exportGET(reqExportMain, { params: { id: surveyMain.id } });
      expect(resExportMain.status).toBe(403);

      // 3. User 對 Org Alt (身分為 ADMIN) 執行 PATCH -> 預期 200 OK
      const reqPatchAlt = new NextRequest(`http://localhost:3000/api/surveys/${surveyAlt.id}`, {
        method: "PATCH",
        headers: { Cookie: `${SESSION_COOKIE_NAME}=${tokenCrossRole}` },
        body: JSON.stringify({ title: "Alt Survey Legally Modified by Admin" }),
      });
      const resPatchAlt = await surveyPATCH(reqPatchAlt, { params: { id: surveyAlt.id } });
      expect(resPatchAlt.status).toBe(200);

      // 4. User 對 Org Alt (身分為 ADMIN) 執行 Export -> 預期 200 OK
      const reqExportAlt = new NextRequest(`http://localhost:3000/api/surveys/${surveyAlt.id}/export`, {
        headers: { Cookie: `${SESSION_COOKIE_NAME}=${tokenCrossRole}` },
      });
      const resExportAlt = await exportGET(reqExportAlt, { params: { id: surveyAlt.id } });
      expect(resExportAlt.status).toBe(200);
    });
  });
});
