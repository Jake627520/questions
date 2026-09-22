import { describe, it, expect, beforeEach } from "vitest";
import ExcelJS from "exceljs";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { parseSurveyExcel } from "@/lib/excel-parser";
import { POST as importPOST } from "@/app/api/surveys/import/route";
import { GET as importHistoryGET } from "@/app/api/surveys/import/history/route";
import { GET as importDetailGET } from "@/app/api/surveys/import/[importId]/route";
import { GET as importErrorCsvGET } from "@/app/api/surveys/import/[importId]/errors/route";
import { createSession, SESSION_COOKIE_NAME, hashPassword } from "@/lib/auth";
import { Role } from "@prisma/client";

describe("Authentication Boundary & Parser Data Integrity Tests", () => {
  const orgId = "auth-boundary-org";
  let editorUser: any;
  let editorToken: string;

  beforeEach(async () => {
    // 1. 清理測試資料
    await db.surveyImport.deleteMany({
      where: { organizationId: orgId },
    });
    await db.survey.deleteMany({
      where: { organizationId: orgId },
    });
    await db.membership.deleteMany({
      where: { organizationId: orgId },
    });
    await db.session.deleteMany({
      where: { user: { email: { startsWith: "boundary-test-" } } },
    });
    await db.user.deleteMany({
      where: { email: { startsWith: "boundary-test-" } },
    });
    await db.organization.deleteMany({
      where: { id: orgId },
    });

    // 2. 建立組織與 EDITOR 使用者
    await db.organization.create({
      data: { id: orgId, name: "Boundary Test Org", slug: "boundary-test-org" },
    });

    const pwdHash = await hashPassword("BoundaryPass123!");
    editorUser = await db.user.create({
      data: {
        email: "boundary-test-editor@example.com",
        name: "Boundary Editor",
        passwordHash: pwdHash,
        memberships: {
          create: { organizationId: orgId, role: Role.EDITOR },
        },
      },
    });

    const session = await createSession(editorUser.id);
    editorToken = session.token;
  });

  // =========================================================================
  // 1. Authentication Boundary Enforcement (401 Unauthorized for Anonymous)
  // =========================================================================
  describe("1. Authentication Boundary (Anonymous Access Prevention)", () => {
    it("未登入呼叫 POST /api/surveys/import (mode=save) 應回傳 401 Unauthorized", async () => {
      const wb = new ExcelJS.Workbook();
      const qSheet = wb.addWorksheet("questions");
      qSheet.addRow(["code", "title", "question_type"]);
      qSheet.addRow(["Q1", "題目 1", "text"]);

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });

      const formData = new FormData();
      formData.append("file", blob, "test.xlsx");
      formData.append("mode", "save");
      formData.append("organizationId", orgId);
      formData.append("copyrightConfirmed", "true");

      const req = new NextRequest("http://localhost:3000/api/surveys/import", {
        method: "POST",
        body: formData,
        // 無 Cookie session
      });

      const res = await importPOST(req);
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toBe("UNAUTHORIZED");
    });

    it("未登入呼叫 POST /api/surveys/import (mode=preview) 應回傳 401 Unauthorized", async () => {
      const wb = new ExcelJS.Workbook();
      const qSheet = wb.addWorksheet("questions");
      qSheet.addRow(["code", "title", "question_type"]);
      qSheet.addRow(["Q1", "題目 1", "text"]);

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });

      const formData = new FormData();
      formData.append("file", blob, "test.xlsx");
      formData.append("mode", "preview");
      formData.append("organizationId", orgId);

      const req = new NextRequest("http://localhost:3000/api/surveys/import", {
        method: "POST",
        body: formData,
      });

      const res = await importPOST(req);
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toBe("UNAUTHORIZED");
    });

    it("未登入呼叫 GET /api/surveys/import/history 應回傳 401 Unauthorized", async () => {
      const req = new NextRequest(`http://localhost:3000/api/surveys/import/history?organizationId=${orgId}`);
      const res = await importHistoryGET(req);
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toBe("UNAUTHORIZED");
    });

    it("未登入呼叫 GET /api/surveys/import/:importId 應回傳 401 Unauthorized", async () => {
      const testImportId = "IMP-TEST-401";
      await db.surveyImport.create({
        data: {
          importId: testImportId,
          organizationId: orgId,
          fileName: "test.xlsx",
          status: "SUCCESS",
        },
      });

      const req = new NextRequest(`http://localhost:3000/api/surveys/import/${testImportId}`);
      const res = await importDetailGET(req, { params: { importId: testImportId } });
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toBe("UNAUTHORIZED");
    });

    it("未登入呼叫 GET /api/surveys/import/:importId/errors 應回傳 401 Unauthorized", async () => {
      const testImportId = "IMP-ERR-401";
      await db.surveyImport.create({
        data: {
          importId: testImportId,
          organizationId: orgId,
          fileName: "test.xlsx",
          status: "FAILED",
        },
      });

      const req = new NextRequest(`http://localhost:3000/api/surveys/import/${testImportId}/errors`);
      const res = await importErrorCsvGET(req, { params: { importId: testImportId } });
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toBe("UNAUTHORIZED");
    });

    it("已登入 EDITOR 呼叫 POST /api/surveys/import 應成功 (200 OK)", async () => {
      const wb = new ExcelJS.Workbook();
      const qSheet = wb.addWorksheet("questions");
      qSheet.addRow(["code", "title", "question_type"]);
      qSheet.addRow(["Q1", "題目 1", "text"]);

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });

      const formData = new FormData();
      formData.append("file", blob, "test.xlsx");
      formData.append("mode", "save");
      formData.append("organizationId", orgId);
      formData.append("copyrightConfirmed", "true");

      const req = new NextRequest("http://localhost:3000/api/surveys/import", {
        method: "POST",
        headers: { Cookie: `${SESSION_COOKIE_NAME}=${editorToken}` },
        body: formData,
      });

      const res = await importPOST(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.surveyId).toBeDefined();
    });

    it("若 parentSurveyId 指向無權限之跨組織問卷，覆寫 organizationId 後重驗應回傳 403 Forbidden", async () => {
      // 建立另一外部組織與其問卷
      const otherOrgId = "other-org-cross-tenant";
      await db.survey.deleteMany({ where: { organizationId: otherOrgId } });
      await db.organization.deleteMany({ where: { id: otherOrgId } });
      await db.organization.create({
        data: { id: otherOrgId, name: "Other Org", slug: "other-org-cross-tenant" },
      });

      const parentSurvey = await db.survey.create({
        data: {
          organizationId: otherOrgId,
          publicToken: "other-org-token-xyz",
          title: "Other Org Survey",
          status: "DRAFT",
          version: 1,
        },
      });

      const wb = new ExcelJS.Workbook();
      const qSheet = wb.addWorksheet("questions");
      qSheet.addRow(["code", "title", "question_type"]);
      qSheet.addRow(["Q1", "跨租戶版本測試", "text"]);

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });

      const formData = new FormData();
      formData.append("file", blob, "test.xlsx");
      formData.append("mode", "save");
      formData.append("organizationId", orgId);
      formData.append("parentSurveyId", parentSurvey.id);
      formData.append("copyrightConfirmed", "true");

      const req = new NextRequest("http://localhost:3000/api/surveys/import", {
        method: "POST",
        headers: { Cookie: `${SESSION_COOKIE_NAME}=${editorToken}` },
        body: formData,
      });

      const res = await importPOST(req);
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toBe("FORBIDDEN");

      // 清理外部測試資料
      await db.survey.deleteMany({ where: { organizationId: otherOrgId } });
      await db.organization.deleteMany({ where: { id: otherOrgId } });
    });
  });

  // =========================================================================
  // 2. Parser Data Integrity: question_type, parseStrictNumber, Code/Value Regex
  // =========================================================================
  describe("2. Parser Data Integrity & Strict Validations", () => {
    it("題目缺少 question_type 時，不得自動補為 single_choice，應回傳 REQUIRED_FIELD_EMPTY", async () => {
      const wb = new ExcelJS.Workbook();
      const qSheet = wb.addWorksheet("questions");
      qSheet.addRow(["code", "title", "question_type"]);
      qSheet.addRow(["Q1", "測試題目", ""]); // 空題型

      const buffer = await wb.xlsx.writeBuffer();
      const result = await parseSurveyExcel(Buffer.from(buffer));

      expect(result.issues.length).toBeGreaterThan(0);
      const emptyTypeIssue = result.issues.find(
        (i) => i.code === "REQUIRED_FIELD_EMPTY" && i.column === "question_type"
      );
      expect(emptyTypeIssue).toBeDefined();
      expect(emptyTypeIssue?.sheet).toBe("questions");
      expect(emptyTypeIssue?.row).toBe(2);
    });

    it("選項分數 score 填入非法字串 (例如 ABC) 時，應回傳 INVALID_NUMBER 而非靜默吞噬為 0", async () => {
      const wb = new ExcelJS.Workbook();
      const qSheet = wb.addWorksheet("questions");
      qSheet.addRow(["code", "title", "question_type", "scoring_enabled"]);
      qSheet.addRow(["Q1", "滿意度調查", "single_choice", "TRUE"]);

      const cSheet = wb.addWorksheet("choices");
      cSheet.addRow(["question_code", "label", "value", "score_enabled", "score"]);
      cSheet.addRow(["Q1", "非常滿意", "1", "TRUE", "ABC"]); // 垃圾值

      const buffer = await wb.xlsx.writeBuffer();
      const result = await parseSurveyExcel(Buffer.from(buffer));

      expect(result.issues.length).toBeGreaterThan(0);
      const invalidNumberIssue = result.issues.find(
        (i) => i.code === "INVALID_NUMBER" && i.column === "score"
      );
      expect(invalidNumberIssue).toBeDefined();
      expect(invalidNumberIssue?.value).toBe("ABC");
      expect(invalidNumberIssue?.sheet).toBe("choices");
    });

    it("題目代碼 code 包含空格或特殊符號時，應回傳 INVALID_VALUE", async () => {
      const wb = new ExcelJS.Workbook();
      const qSheet = wb.addWorksheet("questions");
      qSheet.addRow(["code", "title", "question_type"]);
      qSheet.addRow(["Q 1", "題目含空格", "text"]); // 含空格
      qSheet.addRow(["Q@2", "題目含特殊符號", "text"]); // 含 @

      const buffer = await wb.xlsx.writeBuffer();
      const result = await parseSurveyExcel(Buffer.from(buffer));

      const invalidCodeIssues = result.issues.filter(
        (i) => i.code === "INVALID_VALUE" && i.column === "code"
      );
      expect(invalidCodeIssues.length).toBe(2);
      expect(invalidCodeIssues[0].value).toBe("Q 1");
      expect(invalidCodeIssues[1].value).toBe("Q@2");
    });

    it("選項代碼 value 包含空格或特殊符號時，應回傳 INVALID_VALUE", async () => {
      const wb = new ExcelJS.Workbook();
      const qSheet = wb.addWorksheet("questions");
      qSheet.addRow(["code", "title", "question_type"]);
      qSheet.addRow(["Q1", "選擇題", "single_choice"]);

      const cSheet = wb.addWorksheet("choices");
      cSheet.addRow(["question_code", "label", "value"]);
      cSheet.addRow(["Q1", "選項一", "opt 1"]); // 含空格
      cSheet.addRow(["Q1", "選項二", "opt@2"]); // 含特殊符號

      const buffer = await wb.xlsx.writeBuffer();
      const result = await parseSurveyExcel(Buffer.from(buffer));

      const invalidValueIssues = result.issues.filter(
        (i) => i.code === "INVALID_VALUE" && i.column === "value"
      );
      expect(invalidValueIssues.length).toBe(2);
      expect(invalidValueIssues[0].value).toBe("opt 1");
      expect(invalidValueIssues[1].value).toBe("opt@2");
    });

    it("合法的題型、數字與代碼格式應能順利通過解析", async () => {
      const wb = new ExcelJS.Workbook();
      const qSheet = wb.addWorksheet("questions");
      qSheet.addRow(["code", "title", "question_type", "min_selections", "max_selections"]);
      qSheet.addRow(["Q_VALID_1", "合規多選題", "multiple_choice", "1", "3"]);

      const cSheet = wb.addWorksheet("choices");
      cSheet.addRow(["question_code", "label", "value", "score_enabled", "score"]);
      cSheet.addRow(["Q_VALID_1", "選項 A", "OPT_A", "TRUE", "10"]);
      cSheet.addRow(["Q_VALID_1", "選項 B", "opt_b", "TRUE", "5"]);
      cSheet.addRow(["Q_VALID_1", "選項 C", "opt_3", "FALSE", ""]);

      const buffer = await wb.xlsx.writeBuffer();
      const result = await parseSurveyExcel(Buffer.from(buffer));

      expect(result.errors.length).toBe(0);
      expect(result.questions.length).toBe(1);
      expect(result.questions[0].choices.length).toBe(3);
      expect(result.questions[0].choices[0].score).toBe(10);
      expect(result.questions[0].choices[1].score).toBe(5);
      expect(result.questions[0].choices[2].score).toBe(null);
    });
  });
});
