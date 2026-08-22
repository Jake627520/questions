import { describe, it, expect, beforeEach } from "vitest";
import ExcelJS from "exceljs";
import { db } from "../src/lib/db";
import { POST as importPOST } from "../src/app/api/surveys/import/route";
import { GET as historyGET } from "../src/app/api/surveys/import/history/route";
import { GET as detailGET } from "../src/app/api/surveys/import/[importId]/route";
import { GET as errorCsvGET } from "../src/app/api/surveys/import/[importId]/errors/route";
import { NextRequest } from "next/server";

describe("Phase M6D: Enterprise Import History & Audit 驗證測試", () => {
  const orgAId = "test-org-m6d-a";
  const orgBId = "test-org-m6d-b";

  beforeEach(async () => {
    // 清理舊測試資料
    await db.surveyImport.deleteMany({
      where: {
        organizationId: { in: [orgAId, orgBId, "default-org-id"] },
      },
    });
    await db.survey.deleteMany({
      where: {
        title: { startsWith: "[M6D-TEST]" },
      },
    });

    // 建立測試組織
    await db.organization.upsert({
      where: { id: orgAId },
      update: {},
      create: { id: orgAId, name: "Org A", slug: "org-a" },
    });
    await db.organization.upsert({
      where: { id: orgBId },
      update: {},
      create: { id: orgBId, name: "Org B", slug: "org-b" },
    });
  });

  // =========================================================================
  // 1. Success Import creates SurveyImport Audit Record with full metrics
  // =========================================================================
  describe("1. 成功匯入稽核紀錄 (SurveyImport SUCCESS)", () => {
    it("成功匯入問卷應建立 SurveyImport (status: SUCCESS)，且 5 項題目結構指標 100% 精準對齊", async () => {
      const wb = new ExcelJS.Workbook();
      const qSheet = wb.addWorksheet("questions");
      qSheet.addRow(["code", "title", "question_type", "required", "scoring_enabled", "visibility_rules"]);
      // 建立 2 題：1 題必填+計分、1 題條件跳題
      qSheet.addRow(["Q1", "產品滿意度", "single_choice", "TRUE", "TRUE", ""]);
      qSheet.addRow(["Q2", "補充說明", "text", "FALSE", "FALSE", "SHOW IF Q1 = sat"]);

      const cSheet = wb.addWorksheet("choices");
      cSheet.addRow(["question_code", "label", "value", "score_enabled", "score"]);
      cSheet.addRow(["Q1", "滿意", "sat", "TRUE", "5"]);
      cSheet.addRow(["Q1", "不滿意", "unsat", "TRUE", "1"]);

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });

      const formData = new FormData();
      formData.append("file", blob, "customer-feedback.xlsx");
      formData.append("mode", "save");
      formData.append("title", "[M6D-TEST] 客戶回饋調查");
      formData.append("organizationId", orgAId);
      formData.append("copyrightConfirmed", "true");

      const req = new NextRequest("http://localhost:3000/api/surveys/import", {
        method: "POST",
        body: formData,
      });

      const res = await importPOST(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.importId).toMatch(/^IMP-/);

      // 檢查資料庫 SurveyImport 紀錄
      const auditRecord = await db.surveyImport.findUnique({
        where: { importId: data.importId },
        include: { survey: true },
      });

      expect(auditRecord).toBeDefined();
      expect(auditRecord?.status).toBe("SUCCESS");
      expect(auditRecord?.organizationId).toBe(orgAId);
      expect(auditRecord?.surveyId).toBe(data.surveyId);
      expect(auditRecord?.fileName).toBe("customer-feedback.xlsx");
      expect(auditRecord?.fileSize).toBeGreaterThan(0);
      expect(auditRecord?.copyrightConfirmed).toBe(true);
      expect(auditRecord?.completedAt).not.toBeNull();

      // 驗證 5 大結構統計指標
      expect(auditRecord?.questionCount).toBe(2);
      expect(auditRecord?.choiceCount).toBe(2);
      expect(auditRecord?.requiredCount).toBe(1);
      expect(auditRecord?.scoredCount).toBe(1);
      expect(auditRecord?.conditionalCount).toBe(1);
    });
  });

  // =========================================================================
  // 2. Failed Import Audit Tracking
  // =========================================================================
  describe("2. 失敗匯入稽核追蹤 (SurveyImport FAILED)", () => {
    it("未勾選版權確認之失敗請求，應留存 status: FAILED 稽核紀錄與 errorCode", async () => {
      const wb = new ExcelJS.Workbook();
      const qSheet = wb.addWorksheet("questions");
      qSheet.addRow(["code", "title", "question_type"]);
      qSheet.addRow(["Q1", "未授權題庫", "text"]);

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });

      const formData = new FormData();
      formData.append("file", blob, "unauthorized.xlsx");
      formData.append("mode", "save");
      formData.append("title", "[M6D-TEST] 未授權問卷");
      formData.append("organizationId", orgAId);
      formData.append("copyrightConfirmed", "false"); // 未確認版權

      const req = new NextRequest("http://localhost:3000/api/surveys/import", {
        method: "POST",
        body: formData,
      });

      const res = await importPOST(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.importId).toBeDefined();

      const auditRecord = await db.surveyImport.findUnique({
        where: { importId: data.importId },
      });

      expect(auditRecord).toBeDefined();
      expect(auditRecord?.status).toBe("FAILED");
      expect(auditRecord?.errorCode).toBe("COPYRIGHT_NOT_CONFIRMED");
      expect(auditRecord?.surveyId).toBeNull();
      expect(auditRecord?.copyrightConfirmed).toBe(false);
    });

    it("Excel 驗證失敗（如循環跳題）之請求，應記錄 FAILED 與結構化 errorDetails JSON", async () => {
      const wb = new ExcelJS.Workbook();
      const qSheet = wb.addWorksheet("questions");
      qSheet.addRow(["code", "title", "question_type", "visibility_rules"]);
      qSheet.addRow(["QA", "題目 A", "text", "SHOW IF QB = 1"]);
      qSheet.addRow(["QB", "題目 B", "text", "SHOW IF QA = 1"]);

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });

      const formData = new FormData();
      formData.append("file", blob, "cycle-error.xlsx");
      formData.append("mode", "save");
      formData.append("title", "[M6D-TEST] 循環跳題問卷");
      formData.append("organizationId", orgAId);
      formData.append("copyrightConfirmed", "true");

      const req = new NextRequest("http://localhost:3000/api/surveys/import", {
        method: "POST",
        body: formData,
      });

      const res = await importPOST(req);
      const data = await res.json();

      expect(res.status).toBe(422);
      expect(data.importId).toBeDefined();

      const auditRecord = await db.surveyImport.findUnique({
        where: { importId: data.importId },
      });

      expect(auditRecord?.status).toBe("FAILED");
      expect(auditRecord?.errorCode).toBe("BRANCHING_CYCLE");
      expect(auditRecord?.errorDetails).toBeDefined();
      expect(auditRecord?.errorDetails).toContain("循環相依");
    });
  });

  // =========================================================================
  // 3. Import ID Uniqueness Constraint
  // =========================================================================
  describe("3. Import ID 唯一性約束 (@unique)", () => {
    it("重複新增相同 importId 應觸發 Prisma Unique constraint 異常", async () => {
      const uniqueId = `IMP-TEST-UNIQUE-${Date.now()}`;
      await db.surveyImport.create({
        data: {
          importId: uniqueId,
          organizationId: orgAId,
          fileName: "test1.xlsx",
          status: "SUCCESS",
        },
      });

      await expect(
        db.surveyImport.create({
          data: {
            importId: uniqueId,
            organizationId: orgAId,
            fileName: "test2.xlsx",
            status: "SUCCESS",
          },
        })
      ).rejects.toThrow();
    });
  });

  // =========================================================================
  // 4. Import History API & Organization Isolation
  // =========================================================================
  describe("4. 匯入歷史清單 API 與多租戶組織隔離 (Organization Isolation)", () => {
    beforeEach(async () => {
      // 建立 Org A 紀錄 (1 筆成功, 1 筆失敗)
      await db.surveyImport.create({
        data: {
          importId: "IMP-ORG-A-1",
          organizationId: orgAId,
          fileName: "a1.xlsx",
          status: "SUCCESS",
          questionCount: 5,
        },
      });
      await db.surveyImport.create({
        data: {
          importId: "IMP-ORG-A-2",
          organizationId: orgAId,
          fileName: "a2.xlsx",
          status: "FAILED",
          errorCode: "FILE_TOO_LARGE",
        },
      });

      // 建立 Org B 紀錄 (1 筆成功)
      await db.surveyImport.create({
        data: {
          importId: "IMP-ORG-B-1",
          organizationId: orgBId,
          fileName: "b1.xlsx",
          status: "SUCCESS",
          questionCount: 10,
        },
      });
    });

    it("查詢 Org A 的歷史紀錄應僅回傳 Org A 的 2 筆紀錄，不得洩漏 Org B 資料", async () => {
      const req = new NextRequest(`http://localhost:3000/api/surveys/import/history?organizationId=${orgAId}`);
      const res = await historyGET(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.total).toBe(2);
      expect(data.items.every((i: any) => i.organizationId === orgAId)).toBe(true);
      expect(data.items.some((i: any) => i.importId === "IMP-ORG-B-1")).toBe(false);
    });

    it("支援 status 篩選（只看 SUCCESS）與分頁計算", async () => {
      const req = new NextRequest(
        `http://localhost:3000/api/surveys/import/history?organizationId=${orgAId}&status=SUCCESS&page=1&pageSize=10`
      );
      const res = await historyGET(req);
      const data = await res.json();

      expect(data.success).toBe(true);
      expect(data.total).toBe(1);
      expect(data.items[0].importId).toBe("IMP-ORG-A-1");
      expect(data.page).toBe(1);
      expect(data.totalPages).toBe(1);
    });
  });

  // =========================================================================
  // 5. Import Detail API & Error Report CSV Export
  // =========================================================================
  describe("5. 稽核詳情與 CSV 錯誤診斷報告匯出 (P1)", () => {
    it("GET /api/surveys/import/:importId 應回傳單筆完整稽核紀錄", async () => {
      await db.surveyImport.create({
        data: {
          importId: "IMP-DETAIL-TEST",
          organizationId: orgAId,
          fileName: "demo-detail.xlsx",
          status: "SUCCESS",
          questionCount: 8,
          choiceCount: 24,
        },
      });

      const req = new NextRequest("http://localhost:3000/api/surveys/import/IMP-DETAIL-TEST");
      const res = await detailGET(req, { params: { importId: "IMP-DETAIL-TEST" } });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.item.importId).toBe("IMP-DETAIL-TEST");
      expect(data.item.questionCount).toBe(8);
    });

    it("GET /api/surveys/import/:importId/errors 應回傳標準 UTF-8 CSV 檔案", async () => {
      const issues = [
        {
          sheet: "questions",
          row: 3,
          column: "question_type",
          field: "questionType",
          code: "INVALID_QUESTION_TYPE",
          message: "第 3 列題型「invalid_type」不合法",
          suggestion: "請使用支援的 6 種題型之一。",
        },
      ];

      await db.surveyImport.create({
        data: {
          importId: "IMP-CSV-ERR-TEST",
          organizationId: orgAId,
          fileName: "bad-survey.xlsx",
          status: "FAILED",
          errorCode: "INVALID_QUESTION_TYPE",
          errorMessage: "驗證未通過",
          errorDetails: JSON.stringify(issues),
        },
      });

      const req = new NextRequest("http://localhost:3000/api/surveys/import/IMP-CSV-ERR-TEST/errors");
      const res = await errorCsvGET(req, { params: { importId: "IMP-CSV-ERR-TEST" } });
      const csvText = await res.text();

      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/csv");
      expect(res.headers.get("content-disposition")).toContain("import-IMP-CSV-ERR-TEST-errors.csv");

      // 檢查 CSV 標頭與資料列
      expect(csvText).toContain("sheet,row,column,field,errorCode,message,suggestion");
      expect(csvText).toContain('"questions","3","question_type","questionType","INVALID_QUESTION_TYPE"');
      expect(csvText).toContain("第 3 列題型「invalid_type」不合法");
    });
  });
});
