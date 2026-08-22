import { describe, it, expect, beforeEach } from "vitest";
import { db } from "../src/lib/db";
import { hashPassword, createSession, SESSION_COOKIE_NAME } from "../src/lib/auth";
import { GET as surveysGET } from "../src/app/api/surveys/route";
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

describe("Phase M7-B: Multi-Tenant Isolation & IDOR Protection 跨租戶隔離測試", () => {
  const orgAId = "m7b-org-a";
  const orgBId = "m7b-org-b";
  const orgCId = "m7b-org-c";

  let userA: any;
  let userB: any;
  let userNoOrg: any;
  let userMultiOrg: any;

  let tokenA: string;
  let tokenB: string;
  let tokenNoOrg: string;
  let tokenMultiOrg: string;

  let surveyA: any;
  let surveyB: any;

  let responseA: any;
  let responseB: any;

  let importAId: string;
  let importBId: string;

  beforeEach(async () => {
    // 1. 清理舊資料
    await db.surveyImport.deleteMany({
      where: { organizationId: { in: [orgAId, orgBId, orgCId] } },
    });
    await db.response.deleteMany({
      where: { survey: { organizationId: { in: [orgAId, orgBId, orgCId] } } },
    });
    await db.survey.deleteMany({
      where: { organizationId: { in: [orgAId, orgBId, orgCId] } },
    });
    await db.membership.deleteMany({
      where: { organizationId: { in: [orgAId, orgBId, orgCId] } },
    });
    await db.session.deleteMany({
      where: { user: { email: { startsWith: "m7b-" } } },
    });
    await db.user.deleteMany({
      where: { email: { startsWith: "m7b-" } },
    });
    await db.organization.deleteMany({
      where: { id: { in: [orgAId, orgBId, orgCId] } },
    });

    // 2. 建立組織
    await db.organization.create({
      data: { id: orgAId, name: "Organization Alpha", slug: "org-alpha" },
    });
    await db.organization.create({
      data: { id: orgBId, name: "Organization Beta", slug: "org-beta" },
    });
    await db.organization.create({
      data: { id: orgCId, name: "Organization Gamma", slug: "org-gamma" },
    });

    const defaultPwdHash = await hashPassword("TenantPass123!");

    // 3. 建立使用者
    // User A -> Org A
    userA = await db.user.create({
      data: {
        email: "m7b-user-a@example.com",
        name: "User Alpha",
        passwordHash: defaultPwdHash,
        memberships: { create: { organizationId: orgAId, role: "ADMIN" } },
      },
    });
    const sA = await createSession(userA.id);
    tokenA = sA.token;

    // User B -> Org B
    userB = await db.user.create({
      data: {
        email: "m7b-user-b@example.com",
        name: "User Beta",
        passwordHash: defaultPwdHash,
        memberships: { create: { organizationId: orgBId, role: "ADMIN" } },
      },
    });
    const sB = await createSession(userB.id);
    tokenB = sB.token;

    // User No Org (無任何組織成員身分)
    userNoOrg = await db.user.create({
      data: {
        email: "m7b-user-no-org@example.com",
        name: "User No Org",
        passwordHash: defaultPwdHash,
      },
    });
    const sNoOrg = await createSession(userNoOrg.id);
    tokenNoOrg = sNoOrg.token;

    // User Multi Org (同時擁有 Org A 與 Org C)
    userMultiOrg = await db.user.create({
      data: {
        email: "m7b-user-multi@example.com",
        name: "User Multi Org",
        passwordHash: defaultPwdHash,
        memberships: {
          create: [
            { organizationId: orgAId, role: "EDITOR" },
            { organizationId: orgCId, role: "EDITOR" },
          ],
        },
      },
    });
    const sMulti = await createSession(userMultiOrg.id);
    tokenMultiOrg = sMulti.token;

    // 4. 建立測試問卷
    surveyA = await db.survey.create({
      data: {
        title: "[M7B-TEST] Alpha Survey",
        organizationId: orgAId,
        status: "PUBLISHED",
        questions: {
          create: {
            code: "QA1",
            title: "Alpha 滿意度",
            questionType: "single_choice",
            orderNum: 1,
            choices: {
              create: [{ label: "滿意", value: "sat", orderNum: 1 }],
            },
          },
        },
      },
    });

    surveyB = await db.survey.create({
      data: {
        title: "[M7B-TEST] Beta Survey",
        organizationId: orgBId,
        status: "PUBLISHED",
        questions: {
          create: {
            code: "QB1",
            title: "Beta 滿意度",
            questionType: "single_choice",
            orderNum: 1,
            choices: {
              create: [{ label: "極佳", value: "great", orderNum: 1 }],
            },
          },
        },
      },
    });

    // 5. 建立填答紀錄
    responseA = await db.response.create({
      data: {
        surveyId: surveyA.id,
        status: "COMPLETED",
        totalScore: 10,
        maxScore: 10,
        percentage: 100,
        submittedAt: new Date(),
        answers: {
          create: {
            questionId: (await db.question.findFirst({ where: { surveyId: surveyA.id } }))!.id,
            rawValue: JSON.stringify("sat"),
          },
        },
      },
    });

    responseB = await db.response.create({
      data: {
        surveyId: surveyB.id,
        status: "COMPLETED",
        totalScore: 5,
        maxScore: 10,
        percentage: 50,
        submittedAt: new Date(),
        answers: {
          create: {
            questionId: (await db.question.findFirst({ where: { surveyId: surveyB.id } }))!.id,
            rawValue: JSON.stringify("great"),
          },
        },
      },
    });

    // 6. 建立匯入紀錄
    importAId = `IMP-M7B-A-${Date.now()}`;
    await db.surveyImport.create({
      data: {
        importId: importAId,
        organizationId: orgAId,
        surveyId: surveyA.id,
        fileName: "alpha-import.xlsx",
        status: "SUCCESS",
        questionCount: 1,
      },
    });

    importBId = `IMP-M7B-B-${Date.now()}`;
    await db.surveyImport.create({
      data: {
        importId: importBId,
        organizationId: orgBId,
        surveyId: surveyB.id,
        fileName: "beta-import.xlsx",
        status: "FAILED",
        errorCode: "INVALID_FORMAT",
        errorMessage: "格式錯誤",
        errorDetails: JSON.stringify([
          {
            sheet: "questions",
            row: 2,
            code: "INVALID_FORMAT",
            message: "Beta 格式異常",
          },
        ]),
      },
    });
  });

  // =========================================================================
  // 1. Survey List Tenant Scoping (GET /api/surveys)
  // =========================================================================
  describe("1. 問卷清單組織隔離 (GET /api/surveys)", () => {
    it("User A 只能取得 Org A 的問卷，不得看見 Org B 問卷", async () => {
      const req = new NextRequest("http://localhost:3000/api/surveys", {
        headers: { Cookie: `${SESSION_COOKIE_NAME}=${tokenA}` },
      });
      const res = await surveysGET(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.surveys.length).toBe(1);
      expect(data.surveys[0].id).toBe(surveyA.id);
      expect(data.surveys[0].title).toBe("[M7B-TEST] Alpha Survey");
    });

    it("User B 只能取得 Org B 的問卷，不得看見 Org A 問卷", async () => {
      const req = new NextRequest("http://localhost:3000/api/surveys", {
        headers: { Cookie: `${SESSION_COOKIE_NAME}=${tokenB}` },
      });
      const res = await surveysGET(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.surveys.length).toBe(1);
      expect(data.surveys[0].id).toBe(surveyB.id);
    });

    it("User A 帶參數查詢他所屬的 Org A 應成功 (200 OK)", async () => {
      const req = new NextRequest(`http://localhost:3000/api/surveys?organizationId=${orgAId}`, {
        headers: { Cookie: `${SESSION_COOKIE_NAME}=${tokenA}` },
      });
      const res = await surveysGET(req);
      expect(res.status).toBe(200);
    });

    it("User A 嘗試跨租戶指定 organizationId=OrgB 應被攔截回傳 403 Forbidden", async () => {
      const req = new NextRequest(`http://localhost:3000/api/surveys?organizationId=${orgBId}`, {
        headers: { Cookie: `${SESSION_COOKIE_NAME}=${tokenA}` },
      });
      const res = await surveysGET(req);
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toBe("FORBIDDEN");
    });

    it("無組織使用者 (User No Org) 查詢問卷應回傳空清單 []", async () => {
      const req = new NextRequest("http://localhost:3000/api/surveys", {
        headers: { Cookie: `${SESSION_COOKIE_NAME}=${tokenNoOrg}` },
      });
      const res = await surveysGET(req);
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.surveys).toEqual([]);
    });

    it("多組織使用者 (User Multi Org) 應能同時取得 Org A 與 Org C 的所有問卷", async () => {
      // 於 Org C 建立一份問卷
      const surveyC = await db.survey.create({
        data: {
          title: "[M7B-TEST] Gamma Survey",
          organizationId: orgCId,
        },
      });

      const req = new NextRequest("http://localhost:3000/api/surveys", {
        headers: { Cookie: `${SESSION_COOKIE_NAME}=${tokenMultiOrg}` },
      });
      const res = await surveysGET(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      const returnedIds = data.surveys.map((s: any) => s.id);
      expect(returnedIds).toContain(surveyA.id);
      expect(returnedIds).toContain(surveyC.id);
      expect(returnedIds).not.toContain(surveyB.id); // 依然不得看見 Org B
    });
  });

  // =========================================================================
  // 2. Survey Mutation & Detail IDOR Protection (PATCH & GET mode=management)
  // =========================================================================
  describe("2. 問卷管理與修改 IDOR 防護 (PATCH /api/surveys/:id, GET /api/surveys/:id?mode=management)", () => {
    it("User A 修改所屬 Survey A 應成功 (200 OK)", async () => {
      const req = new NextRequest(`http://localhost:3000/api/surveys/${surveyA.id}`, {
        method: "PATCH",
        headers: { Cookie: `${SESSION_COOKIE_NAME}=${tokenA}` },
        body: JSON.stringify({ title: "[M7B-TEST] Alpha Survey Updated" }),
      });
      const res = await surveyPATCH(req, { params: { id: surveyA.id } });
      expect(res.status).toBe(200);
    });

    it("User A 跨租戶竄改 Survey B 應被攔截回傳 403 Forbidden", async () => {
      const req = new NextRequest(`http://localhost:3000/api/surveys/${surveyB.id}`, {
        method: "PATCH",
        headers: { Cookie: `${SESSION_COOKIE_NAME}=${tokenA}` },
        body: JSON.stringify({ title: "惡意竄改他人問卷" }),
      });
      const res = await surveyPATCH(req, { params: { id: surveyB.id } });
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toBe("FORBIDDEN");
    });

    it("User B 跨租戶竄改 Survey A 應被攔截回傳 403 Forbidden", async () => {
      const req = new NextRequest(`http://localhost:3000/api/surveys/${surveyA.id}`, {
        method: "PATCH",
        headers: { Cookie: `${SESSION_COOKIE_NAME}=${tokenB}` },
        body: JSON.stringify({ title: "惡意竄改他人問卷" }),
      });
      const res = await surveyPATCH(req, { params: { id: surveyA.id } });
      expect(res.status).toBe(403);
    });

    it("User A 以管理模式查看 Survey B 應回傳 403 Forbidden", async () => {
      const req = new NextRequest(`http://localhost:3000/api/surveys/${surveyB.id}?mode=management`, {
        headers: { Cookie: `${SESSION_COOKIE_NAME}=${tokenA}` },
      });
      const res = await surveyGET(req, { params: { id: surveyB.id } });
      expect(res.status).toBe(403);
    });
  });

  // =========================================================================
  // 3. Responses & Single Response IDOR Protection
  // =========================================================================
  describe("3. 回覆列表與填答紀錄 IDOR 防護 (/api/surveys/:id/responses)", () => {
    it("User A 讀取 Survey A 的回覆列表應成功 (200 OK)", async () => {
      const req = new NextRequest(`http://localhost:3000/api/surveys/${surveyA.id}/responses`, {
        headers: { Cookie: `${SESSION_COOKIE_NAME}=${tokenA}` },
      });
      const res = await responsesGET(req, { params: { id: surveyA.id } });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.responses.length).toBe(1);
      expect(data.responses[0].id).toBe(responseA.id);
    });

    it("User A 跨租戶讀取 Survey B 的回覆列表應回傳 403 Forbidden", async () => {
      const req = new NextRequest(`http://localhost:3000/api/surveys/${surveyB.id}/responses`, {
        headers: { Cookie: `${SESSION_COOKIE_NAME}=${tokenA}` },
      });
      const res = await responsesGET(req, { params: { id: surveyB.id } });
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toBe("FORBIDDEN");
    });

    it("User A 跨租戶讀取 Response B 單筆明細應回傳 403 Forbidden", async () => {
      const req = new NextRequest(`http://localhost:3000/api/surveys/${surveyB.id}/responses/${responseB.id}`, {
        headers: { Cookie: `${SESSION_COOKIE_NAME}=${tokenA}` },
      });
      const res = await responseSingleGET(req, { params: { id: surveyB.id, responseId: responseB.id } });
      expect(res.status).toBe(403);
    });

    it("User A 跨租戶刪除 Response B 回覆記錄應回傳 403 Forbidden", async () => {
      const req = new NextRequest(
        `http://localhost:3000/api/surveys/${surveyB.id}/responses/${responseB.id}?force=true`,
        {
          method: "DELETE",
          headers: { Cookie: `${SESSION_COOKIE_NAME}=${tokenA}` },
        }
      );
      const res = await responseSingleDELETE(req, { params: { id: surveyB.id, responseId: responseB.id } });
      expect(res.status).toBe(403);
    });
  });

  // =========================================================================
  // 4. Stats & Export IDOR Protection
  // =========================================================================
  describe("4. 統計報表與 Excel 匯出 IDOR 防護 (/stats & /export)", () => {
    it("User A 查看 Survey A 統計報表應成功 (200 OK)", async () => {
      const req = new NextRequest(`http://localhost:3000/api/surveys/${surveyA.id}/stats`, {
        headers: { Cookie: `${SESSION_COOKIE_NAME}=${tokenA}` },
      });
      const res = await statsGET(req, { params: { id: surveyA.id } });
      expect(res.status).toBe(200);
    });

    it("User A 跨租戶查看 Survey B 統計報表應回傳 403 Forbidden", async () => {
      const req = new NextRequest(`http://localhost:3000/api/surveys/${surveyB.id}/stats`, {
        headers: { Cookie: `${SESSION_COOKIE_NAME}=${tokenA}` },
      });
      const res = await statsGET(req, { params: { id: surveyB.id } });
      expect(res.status).toBe(403);
    });

    it("User A 跨租戶匯出 Survey B 填答 Excel 應回傳 403 Forbidden", async () => {
      const req = new NextRequest(`http://localhost:3000/api/surveys/${surveyB.id}/export`, {
        headers: { Cookie: `${SESSION_COOKIE_NAME}=${tokenA}` },
      });
      const res = await exportGET(req, { params: { id: surveyB.id } });
      expect(res.status).toBe(403);
    });
  });

  // =========================================================================
  // 5. Clone Version IDOR Protection
  // =========================================================================
  describe("5. 複製問卷新版本 IDOR 防護 (/clone-version)", () => {
    it("User A 複製 Survey A 應成功 (200 OK)", async () => {
      const req = new NextRequest(`http://localhost:3000/api/surveys/${surveyA.id}/clone-version`, {
        method: "POST",
        headers: { Cookie: `${SESSION_COOKIE_NAME}=${tokenA}` },
      });
      const res = await clonePOST(req, { params: { id: surveyA.id } });
      expect(res.status).toBe(200);
    });

    it("User A 跨租戶複製 Survey B 應回傳 403 Forbidden", async () => {
      const req = new NextRequest(`http://localhost:3000/api/surveys/${surveyB.id}/clone-version`, {
        method: "POST",
        headers: { Cookie: `${SESSION_COOKIE_NAME}=${tokenA}` },
      });
      const res = await clonePOST(req, { params: { id: surveyB.id } });
      expect(res.status).toBe(403);
    });
  });

  // =========================================================================
  // 6. Import & Import Audit IDOR Protection
  // =========================================================================
  describe("6. 匯入與歷史稽核紀錄 IDOR 防護 (/api/surveys/import/*)", () => {
    it("User A 嘗試匯入問卷至 Org B 應被攔截回傳 403 Forbidden", async () => {
      const wb = new ExcelJS.Workbook();
      const qSheet = wb.addWorksheet("questions");
      qSheet.addRow(["code", "title", "question_type"]);
      qSheet.addRow(["Q1", "測試題目", "text"]);

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });

      const formData = new FormData();
      formData.append("file", blob, "test.xlsx");
      formData.append("mode", "save");
      formData.append("organizationId", orgBId); // 意圖匯入至他人組織
      formData.append("copyrightConfirmed", "true");

      const req = new NextRequest("http://localhost:3000/api/surveys/import", {
        method: "POST",
        headers: { Cookie: `${SESSION_COOKIE_NAME}=${tokenA}` },
        body: formData,
      });

      const res = await importPOST(req);
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toBe("FORBIDDEN");
    });

    it("User A 查詢匯入歷史應僅回傳 Org A 紀錄，不得看見 Import B", async () => {
      const req = new NextRequest("http://localhost:3000/api/surveys/import/history", {
        headers: { Cookie: `${SESSION_COOKIE_NAME}=${tokenA}` },
      });
      const res = await importHistoryGET(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.items.length).toBe(1);
      expect(data.items[0].importId).toBe(importAId);
    });

    it("User A 查詢單筆 Import Detail A 應成功，查詢 Import Detail B 應回傳 403 Forbidden", async () => {
      // 1. 查詢自己的 Import A
      const reqA = new NextRequest(`http://localhost:3000/api/surveys/import/${importAId}`, {
        headers: { Cookie: `${SESSION_COOKIE_NAME}=${tokenA}` },
      });
      const resA = await importDetailGET(reqA, { params: { importId: importAId } });
      expect(resA.status).toBe(200);

      // 2. 跨租戶查詢 Import B
      const reqB = new NextRequest(`http://localhost:3000/api/surveys/import/${importBId}`, {
        headers: { Cookie: `${SESSION_COOKIE_NAME}=${tokenA}` },
      });
      const resB = await importDetailGET(reqB, { params: { importId: importBId } });
      expect(resB.status).toBe(403);
    });

    it("User A 下載 Import B 錯誤 CSV 應回傳 403 Forbidden", async () => {
      const req = new NextRequest(`http://localhost:3000/api/surveys/import/${importBId}/errors`, {
        headers: { Cookie: `${SESSION_COOKIE_NAME}=${tokenA}` },
      });
      const res = await importErrorCsvGET(req, { params: { importId: importBId } });
      expect(res.status).toBe(403);
    });
  });
});
