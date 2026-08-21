import { describe, it, expect, beforeEach } from "vitest";
import ExcelJS from "exceljs";
import { db } from "../src/lib/db";
import {
  parseSurveyExcel,
  hasValidXlsxSignature,
  MAX_FILE_SIZE,
  MAX_QUESTION_ROWS,
  MAX_CHOICE_ROWS,
  MAX_SHEETS,
  MAX_CELL_LENGTH,
} from "../src/lib/excel-parser";
import { validateSurveyExcel } from "../src/lib/validateSurveyExcel";
import { POST } from "../src/app/api/surveys/import/route";
import { NextRequest } from "next/server";

describe("Phase M6C: Excel Import UX, Safety & Atomic Transaction 驗證測試", () => {
  beforeEach(async () => {
    // 清理測試資料
    await db.survey.deleteMany({
      where: { title: { startsWith: "[M6C-TEST]" } },
    });
  });

  // =========================================================================
  // 1. Error UX & Suggestions
  // =========================================================================
  describe("1. Error UX & Actionable Suggestions", () => {
    it("驗證問題應包含 sheet, row, column, code, message 以及明確的 suggestion 修正建議", async () => {
      const wb = new ExcelJS.Workbook();
      const qSheet = wb.addWorksheet("questions");
      qSheet.addRow(["code", "title", "question_type"]);
      qSheet.addRow(["", "題目缺少代碼", "single_choice"]); // 缺少 code
      qSheet.addRow(["Q2", "", "single_choice"]); // 缺少 title
      qSheet.addRow(["Q3", "非法題型題目", "unknown_type"]); // 錯誤題型

      const buffer = await wb.xlsx.writeBuffer();
      const result = await parseSurveyExcel(Buffer.from(buffer));

      expect(result.issues.length).toBeGreaterThan(0);

      const emptyCodeIssue = result.issues.find(
        (i) => i.code === "REQUIRED_FIELD_EMPTY" && i.column === "code"
      );
      expect(emptyCodeIssue).toBeDefined();
      expect(emptyCodeIssue?.suggestion).toBeDefined();
      expect(emptyCodeIssue?.suggestion).toContain("code");

      const emptyTitleIssue = result.issues.find(
        (i) => i.code === "REQUIRED_FIELD_EMPTY" && i.column === "title"
      );
      expect(emptyTitleIssue).toBeDefined();
      expect(emptyTitleIssue?.suggestion).toBeDefined();

      const invalidTypeIssue = result.issues.find(
        (i) => i.code === "INVALID_QUESTION_TYPE"
      );
      expect(invalidTypeIssue).toBeDefined();
      expect(invalidTypeIssue?.suggestion).toContain("single_choice");
    });
  });

  // =========================================================================
  // 2. Resource Limits & Cell Limits
  // =========================================================================
  describe("2. Resource Limits & Cell Length Constraints", () => {
    it("檔案大小超過 5MB 應攔截並回傳 FILE_TOO_LARGE 及 suggestion", async () => {
      const bigBuffer = Buffer.alloc(MAX_FILE_SIZE + 1024, 0);
      const result = await parseSurveyExcel(bigBuffer);
      const issue = result.issues.find((i) => i.code === "FILE_TOO_LARGE");
      expect(issue).toBeDefined();
      expect(issue?.suggestion).toContain("5MB");
    });

    it("單一儲存格文字長度超過 5000 字元應攔截並標註 CELL_TOO_LONG", async () => {
      const wb = new ExcelJS.Workbook();
      const qSheet = wb.addWorksheet("questions");
      qSheet.addRow(["code", "title", "question_type"]);
      qSheet.addRow(["Q1", "A".repeat(MAX_CELL_LENGTH + 10), "single_choice"]);

      const buffer = await wb.xlsx.writeBuffer();
      const result = await parseSurveyExcel(Buffer.from(buffer));

      const issue = result.issues.find((i) => i.code === "CELL_TOO_LONG");
      expect(issue).toBeDefined();
      expect(issue?.sheet).toBe("questions");
      expect(issue?.column).toBe("title");
      expect(issue?.suggestion).toContain("5000");
    });
  });

  // =========================================================================
  // 3. Formula Injection & Security
  // =========================================================================
  describe("3. Excel Formula Injection & Safe Data Handling", () => {
    it("以 =, +, -, @ 開頭的公式文字應被安全讀取為純文字資料，不觸發公式執行錯誤", async () => {
      const wb = new ExcelJS.Workbook();
      const qSheet = wb.addWorksheet("questions");
      qSheet.addRow(["code", "title", "question_type", "description"]);
      qSheet.addRow([
        "Q_FORMULA_1",
        "=SUM(1+1)",
        "single_choice",
        "+cmd|' /C calc'!A0",
      ]);
      qSheet.addRow(["Q_FORMULA_2", "@HYPERLINK(\"http://evil.com\")", "text", "-100"]);

      const cSheet = wb.addWorksheet("choices");
      cSheet.addRow(["question_code", "label", "value"]);
      cSheet.addRow(["Q_FORMULA_1", "=1+1", "c1"]);
      cSheet.addRow(["Q_FORMULA_1", "@mention_user", "c2"]);

      const buffer = await wb.xlsx.writeBuffer();
      const result = await parseSurveyExcel(Buffer.from(buffer));

      expect(result.errors).toHaveLength(0);
      expect(result.questions).toHaveLength(2);

      const q1 = result.questions.find((q) => q.code === "Q_FORMULA_1");
      expect(q1?.title).toBe("=SUM(1+1)");
      expect(q1?.description).toBe("+cmd|' /C calc'!A0");
      expect(q1?.choices[0].label).toBe("=1+1");
      expect(q1?.choices[1].label).toBe("@mention_user");
    });
  });

  // =========================================================================
  // 4. Copyright Confirmation
  // =========================================================================
  describe("4. Copyright / User Content Confirmation", () => {
    it("未勾選版權確認時，save 模式應拒絕匯入並回傳 COPYRIGHT_NOT_CONFIRMED (HTTP 400)", async () => {
      const wb = new ExcelJS.Workbook();
      const qSheet = wb.addWorksheet("questions");
      qSheet.addRow(["code", "title", "question_type"]);
      qSheet.addRow(["Q1", "測試版權題目", "single_choice"]);
      const cSheet = wb.addWorksheet("choices");
      cSheet.addRow(["question_code", "label", "value"]);
      cSheet.addRow(["Q1", "選項A", "a"]);

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });

      const formData = new FormData();
      formData.append("file", blob, "test.xlsx");
      formData.append("mode", "save");
      formData.append("title", "[M6C-TEST] 未確認版權問卷");
      formData.append("copyrightConfirmed", "false"); // 未確認

      const req = new NextRequest("http://localhost:3000/api/surveys/import", {
        method: "POST",
        body: formData,
      });

      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.errors.some((e: any) => e.code === "COPYRIGHT_NOT_CONFIRMED")).toBe(true);

      // 確認資料庫完全未建立此問卷
      const existing = await db.survey.findFirst({
        where: { title: "[M6C-TEST] 未確認版權問卷" },
      });
      expect(existing).toBeNull();
    });

    it("勾選版權確認且資料合法時，save 模式應成功建立問卷並回傳 summary 與 importId", async () => {
      const wb = new ExcelJS.Workbook();
      const qSheet = wb.addWorksheet("questions");
      qSheet.addRow(["code", "title", "question_type", "required", "scoring_enabled"]);
      qSheet.addRow(["Q1", "已確認版權單選題", "single_choice", "TRUE", "TRUE"]);
      const cSheet = wb.addWorksheet("choices");
      cSheet.addRow(["question_code", "label", "value", "score_enabled", "score"]);
      cSheet.addRow(["Q1", "滿意", "sat", "TRUE", "5"]);
      cSheet.addRow(["Q1", "不滿意", "unsat", "TRUE", "1"]);

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });

      const formData = new FormData();
      formData.append("file", blob, "test.xlsx");
      formData.append("mode", "save");
      formData.append("title", "[M6C-TEST] 已確認版權問卷");
      formData.append("copyrightConfirmed", "true"); // 已確認

      const req = new NextRequest("http://localhost:3000/api/surveys/import", {
        method: "POST",
        body: formData,
      });

      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.surveyId).toBeDefined();
      expect(data.importId).toMatch(/^IMP-/);
      expect(data.summary.questions).toBe(1);
      expect(data.summary.choices).toBe(2);
      expect(data.summary.requiredQuestions).toBe(1);
      expect(data.summary.scoredQuestions).toBe(1);

      // 檢查資料庫確實建立
      const created = await db.survey.findUnique({
        where: { id: data.surveyId },
        include: { questions: { include: { choices: true } } },
      });
      expect(created).toBeDefined();
      expect(created?.questions).toHaveLength(1);
      expect(created?.questions[0].choices).toHaveLength(2);
    });
  });

  // =========================================================================
  // 5. All-or-Nothing Import / Atomic Transaction Guarantee
  // =========================================================================
  describe("5. All-or-Nothing Import / Atomic Transaction Guarantee", () => {
    it("當 Excel 存在結構驗證錯誤時（如跳題循環相依），不得向資料庫寫入任何問卷或題目", async () => {
      const wb = new ExcelJS.Workbook();
      const qSheet = wb.addWorksheet("questions");
      qSheet.addRow(["code", "title", "question_type", "visibility_rules"]);
      // 建立循環跳題 A -> B -> A
      qSheet.addRow(["QA", "題目 A", "single_choice", "SHOW IF QB = 1"]);
      qSheet.addRow(["QB", "題目 B", "single_choice", "SHOW IF QA = 1"]);

      const cSheet = wb.addWorksheet("choices");
      cSheet.addRow(["question_code", "label", "value"]);
      cSheet.addRow(["QA", "選項 A1", "1"]);
      cSheet.addRow(["QB", "選項 B1", "1"]);

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });

      const formData = new FormData();
      formData.append("file", blob, "test.xlsx");
      formData.append("mode", "save");
      formData.append("title", "[M6C-TEST] 循環跳題問卷");
      formData.append("copyrightConfirmed", "true");

      const req = new NextRequest("http://localhost:3000/api/surveys/import", {
        method: "POST",
        body: formData,
      });

      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(422);
      expect(data.success).toBe(false);
      expect(data.errors.some((e: any) => e.code === "BRANCHING_CYCLE")).toBe(true);

      // 驗證 DB 零資料寫入
      const surveyInDb = await db.survey.findFirst({
        where: { title: "[M6C-TEST] 循環跳題問卷" },
      });
      expect(surveyInDb).toBeNull();
    });

    it("Dry Run / Preview 模式下，僅回傳解析預覽與統計指標，不得向資料庫寫入任何資料", async () => {
      const wb = new ExcelJS.Workbook();
      const qSheet = wb.addWorksheet("questions");
      qSheet.addRow(["code", "title", "question_type"]);
      qSheet.addRow(["Q1", "預覽測試題", "text"]);

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });

      const formData = new FormData();
      formData.append("file", blob, "test.xlsx");
      formData.append("mode", "preview"); // 預覽模式
      formData.append("title", "[M6C-TEST] 純預覽問卷");

      const req = new NextRequest("http://localhost:3000/api/surveys/import", {
        method: "POST",
        body: formData,
      });

      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.mode).toBe("preview");
      expect(data.questions).toHaveLength(1);
      expect(data.surveyId).toBeUndefined();

      // 驗證 DB 零寫入
      const surveyInDb = await db.survey.findFirst({
        where: { title: "[M6C-TEST] 純預覽問卷" },
      });
      expect(surveyInDb).toBeNull();
    });
  });
});
