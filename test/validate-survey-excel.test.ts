import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { validateSurveyExcel } from "../src/lib/validateSurveyExcel";

// 輔助函式：建立模擬 File 物件（Node.js / Vitest 環境）
async function createMockExcelFile(
  fileName: string,
  builder: (wb: ExcelJS.Workbook) => void
): Promise<File> {
  const wb = new ExcelJS.Workbook();
  builder(wb);
  const buffer = await wb.xlsx.writeBuffer();
  return new File([buffer], fileName, {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

describe("validateSurveyExcel 前端輕量驗證器測試", () => {
  it("1. 合法的 Excel 題庫檔案應通過驗證 (isValid: true)", async () => {
    const file = await createMockExcelFile("valid-survey.xlsx", (wb) => {
      const qSheet = wb.addWorksheet("questions");
      qSheet.addRow(["code", "title", "question_type"]);
      qSheet.addRow(["Q1", "您的滿意度？", "single_choice"]);
      qSheet.addRow(["Q2", "補充說明", "text"]);

      const cSheet = wb.addWorksheet("choices");
      cSheet.addRow(["question_code", "label", "value"]);
      cSheet.addRow(["Q1", "滿意", "sat"]);
      cSheet.addRow(["Q1", "不滿意", "unsat"]);
    });

    const result = await validateSurveyExcel(file);
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.summary?.questionCount).toBe(2);
    expect(result.summary?.choiceCount).toBe(2);
  });

  it("2. 不支援的副檔名應返回 FILE_EXTENSION_INVALID", async () => {
    const file = new File([new ArrayBuffer(10)], "invalid.csv", { type: "text/csv" });
    const result = await validateSurveyExcel(file);

    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.code === "FILE_EXTENSION_INVALID")).toBe(true);
  });

  it("3. 缺少 questions 工作表時應返回 SHEET_MISSING 錯誤", async () => {
    const file = await createMockExcelFile("missing-questions.xlsx", (wb) => {
      const otherSheet = wb.addWorksheet("sheet1");
      otherSheet.addRow(["a", "b", "c"]);
    });

    const result = await validateSurveyExcel(file);
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.code === "SHEET_MISSING")).toBe(true);
  });

  it("4. 題目代碼 (code) 重複時應返回 DUPLICATE_QUESTION_CODE 錯誤", async () => {
    const file = await createMockExcelFile("duplicate-code.xlsx", (wb) => {
      const qSheet = wb.addWorksheet("questions");
      qSheet.addRow(["code", "title", "question_type"]);
      qSheet.addRow(["Q1", "題目 1", "text"]);
      qSheet.addRow(["Q1", "題目 2 重複代碼", "text"]);
    });

    const result = await validateSurveyExcel(file);
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.code === "DUPLICATE_QUESTION_CODE")).toBe(true);
  });

  it("5. 選項指向不存在的題目時應返回 QUESTION_NOT_FOUND 錯誤", async () => {
    const file = await createMockExcelFile("orphan-choice.xlsx", (wb) => {
      const qSheet = wb.addWorksheet("questions");
      qSheet.addRow(["code", "title", "question_type"]);
      qSheet.addRow(["Q1", "題目 1", "single_choice"]);

      const cSheet = wb.addWorksheet("choices");
      cSheet.addRow(["question_code", "label", "value"]);
      cSheet.addRow(["Q_NONEXISTENT", "選項 A", "a"]);
    });

    const result = await validateSurveyExcel(file);
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.code === "QUESTION_NOT_FOUND")).toBe(true);
  });
});
