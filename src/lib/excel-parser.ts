import ExcelJS from "exceljs";
import JSZip from "jszip";
import { QuestionInput, ChoiceInput, QuestionType, QuestionTypeEnum } from "./types";
import { ValidationIssue } from "../types/surveyImport";

export function parseStrictBoolean(
  val: any,
  fieldName: string,
  rowNum: number,
  sheet: "questions" | "choices" | "system",
  issues: ValidationIssue[],
  errors: string[]
): boolean {
  if (val === null || val === undefined) return false;
  if (typeof val === "boolean") return val;
  if (typeof val === "number") {
    if (val === 1) return true;
    if (val === 0) return false;
  }
  if (typeof val === "string") {
    const s = val.trim().toLowerCase();
    if (s === "") return false;
    if (s === "true" || s === "1" || s === "yes" || s === "y" || s === "是") return true;
    if (s === "false" || s === "0" || s === "no" || s === "n" || s === "否") return false;
  }

  const strVal = String(val).slice(0, 50);
  const msg = `${sheet} 工作表第 ${rowNum} 列「${fieldName}」欄位的值「${strVal}」不是合法的布林值`;
  errors.push(msg);
  issues.push({
    code: "INVALID_BOOLEAN_VALUE",
    severity: "error",
    sheet,
    row: rowNum,
    column: fieldName,
    field: fieldName,
    value: strVal,
    message: msg,
    suggestion: "請填寫 TRUE/FALSE、1/0、YES/NO 或保留空白（預設為 FALSE）。",
  });
  return false;
}


export function parseStrictOrderNum(
  val: any,
  fieldName: string,
  rowNum: number,
  sheet: "questions" | "choices" | "system",
  issues: ValidationIssue[],
  errors: string[]
): number | null {
  if (val === null || val === undefined || (typeof val === "string" && val.trim() === "")) {
    const msg = `${sheet} 工作表第 ${rowNum} 列：未填寫排序序號（${fieldName}）`;
    errors.push(msg);
    issues.push({
      code: "REQUIRED_FIELD_EMPTY",
      severity: "error",
      sheet,
      row: rowNum,
      column: fieldName,
      field: fieldName,
      value: "",
      message: msg,
      suggestion: "請填寫大於或等於 1 的正整數序號（例如 1, 2, 3）。",
    });
    return null;
  }

  const num = typeof val === "number" ? val : Number(String(val).trim());
  if (isNaN(num) || !Number.isInteger(num) || num <= 0) {
    const strVal = String(val).slice(0, 50);
    const msg = `${sheet} 工作表第 ${rowNum} 列「${fieldName}」欄位的值「${strVal}」不是合法的正整數序號`;
    errors.push(msg);
    issues.push({
      code: "INVALID_ORDER_NUM",
      severity: "error",
      sheet,
      row: rowNum,
      column: fieldName,
      field: fieldName,
      value: strVal,
      message: msg,
      suggestion: "請填寫大於或等於 1 的正整數（例如 1, 2, 3）。",
    });
    return null;
  }

  return num;
}

function parseNumber(val: any): number | null {
  if (val === null || val === undefined || val === "") return null;
  const num = Number(val);
  return isNaN(num) ? null : num;
}

function getCellValue(cell: ExcelJS.Cell): any {
  const val = cell.value;
  if (val === null || val === undefined) return null;
  if (typeof val === "object") {
    if ("text" in val) {
      return (val as any).text;
    }
    if ("result" in val) {
      return (val as any).result;
    }
    if ("formula" in val) {
      // 將公式視為純文字或提取計算結果，禁止作為執行代碼
      return (val as any).result !== undefined ? (val as any).result : (val as any).formula;
    }
    if ("richText" in val && Array.isArray((val as any).richText)) {
      return (val as any).richText.map((r: any) => r.text).join("");
    }
  }
  return val;
}

export const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
export const MAX_QUESTION_ROWS = 500;         // 含標頭
export const MAX_CHOICE_ROWS = 5000;          // 含標頭
export const MAX_SHEETS = 20;
export const MAX_CELL_LENGTH = 5000;

/**
 * 檢查是否為合法的 XLSX（OOXML）檔案
 * XLSX 本質是 ZIP 容器，開頭 magic bytes 必須是 PK\x03\x04 (0x50, 0x4B, 0x03, 0x04)
 */
export function hasValidXlsxSignature(buffer: ArrayBuffer | Buffer): boolean {
  const bytes = Buffer.isBuffer(buffer)
    ? buffer
    : Buffer.from(buffer);

  if (bytes.length < 4) return false;

  return (
    bytes[0] === 0x50 && // P
    bytes[1] === 0x4b && // K
    bytes[2] === 0x03 &&
    bytes[3] === 0x04
  );
}

/**
 * 清理 Excel 檔案中可能引發 ExcelJS 崩潰的 comments/vmlDrawing 關聯
 */
async function sanitizeExcelBuffer(buffer: ArrayBuffer | Buffer): Promise<Buffer> {
  try {
    const zip = await JSZip.loadAsync(buffer);
    const relFiles = Object.keys(zip.files).filter((name) =>
      name.includes("worksheets/_rels/")
    );
    for (const relFile of relFiles) {
      const entry = zip.files[relFile];
      if (entry && !entry.dir) {
        let content = await entry.async("string");
        content = content.replace(
          /<Relationship[^>]*Type="[^"]*(comments|vmlDrawing)"[^>]*\/>/gi,
          ""
        );
        zip.file(relFile, content);
      }
    }
    return await zip.generateAsync({ type: "nodebuffer" });
  } catch {
    return Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  }
}

/**
 * 解析題庫 Excel 檔案 (包含 questions 與 choices 兩個 Sheet)
 */
export async function parseSurveyExcel(
  buffer: ArrayBuffer | Buffer
): Promise<{ questions: QuestionInput[]; errors: string[]; issues: ValidationIssue[] }> {
  const errors: string[] = [];
  const issues: ValidationIssue[] = [];

  const size = Buffer.isBuffer(buffer) ? buffer.length : buffer.byteLength;
  if (size > MAX_FILE_SIZE) {
    const msg = `檔案大小不可超過 ${MAX_FILE_SIZE / 1024 / 1024}MB`;
    errors.push(msg);
    issues.push({
      code: "FILE_TOO_LARGE",
      severity: "error",
      sheet: "system",
      message: msg,
      suggestion: "請精簡檔案內容、移除多餘工作表或過大圖片，確保檔案小於 5MB。",
    });
    return { questions: [], errors, issues };
  }

  const workbook = new ExcelJS.Workbook();

  try {
    const cleanBuffer = await sanitizeExcelBuffer(buffer);
    // @ts-ignore
    await workbook.xlsx.load(cleanBuffer);
  } catch (err: any) {
    const msg = `Excel 檔案讀取失敗：${err.message || "檔案損毀或非標準 XLSX 格式"}`;
    errors.push(msg);
    issues.push({
      code: "FILE_PARSE_FAILED",
      severity: "error",
      sheet: "system",
      message: msg,
      suggestion: "請使用 Microsoft Excel 或 Google Sheets 重新匯出標準 .xlsx 活頁簿後再上傳。",
    });
    return {
      questions: [],
      errors,
      issues,
    };
  }

  if (workbook.worksheets.length > MAX_SHEETS) {
    const msg = `工作表數量過多（最多 ${MAX_SHEETS} 個，目前包含 ${workbook.worksheets.length} 個）`;
    errors.push(msg);
    issues.push({
      code: "SHEET_LIMIT_EXCEEDED",
      severity: "error",
      sheet: "system",
      message: msg,
      suggestion: "請將非必要工作表刪除，使活頁簿的工作表總數在 20 個以內。",
    });
    return { questions: [], errors, issues };
  }

  const questionsSheet =
    workbook.getWorksheet("questions") || workbook.getWorksheet("Questions") || workbook.worksheets[0];
  const choicesSheet =
    workbook.getWorksheet("choices") || workbook.getWorksheet("Choices") || workbook.worksheets[1];

  if (!questionsSheet) {
    const msg = "Excel 檔案中未找到 questions 工作表";
    errors.push(msg);
    issues.push({
      code: "SHEET_MISSING",
      severity: "error",
      sheet: "system",
      message: msg,
      suggestion: "請將包含題目資料的工作表名稱命名為「questions」（英文小寫）。",
    });
    return { questions: [], errors, issues };
  }

  const qRowCount = questionsSheet.rowCount || 0;
  if (qRowCount > MAX_QUESTION_ROWS) {
    const msg = `questions 工作表列數過多（最多 ${MAX_QUESTION_ROWS} 列，目前約 ${qRowCount} 列）`;
    errors.push(msg);
    issues.push({
      code: "ROW_LIMIT_EXCEEDED",
      severity: "error",
      sheet: "questions",
      message: msg,
      suggestion: "請將題數控制在 500 列以內（含標頭），超長問卷請拆分或分批匯入。",
    });
    return { questions: [], errors, issues };
  }

  if (choicesSheet) {
    const cRowCount = choicesSheet.rowCount || 0;
    if (cRowCount > MAX_CHOICE_ROWS) {
      const msg = `choices 工作表列數過多（最多 ${MAX_CHOICE_ROWS} 列，目前約 ${cRowCount} 列）`;
      errors.push(msg);
      issues.push({
        code: "ROW_LIMIT_EXCEEDED",
        severity: "error",
        sheet: "choices",
        message: msg,
        suggestion: "請將選項列數控制在 5000 列以內（含標頭）。",
      });
      return { questions: [], errors, issues };
    }
  }

  // 1. 解析 Questions
  const questionsMap = new Map<string, QuestionInput>();
  const questionHeaders: { [key: string]: number } = {};
  const seenQuestionOrders = new Set<number>();
  const seenChoiceOrders = new Map<string, Set<number>>();

  questionsSheet.getRow(1).eachCell((cell, colNumber) => {
    const header = String(getCellValue(cell) || "").trim().toLowerCase();
    questionHeaders[header] = colNumber;
  });

  questionsSheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // Skip header

    const getVal = (headerName: string) => {
      const colIdx = questionHeaders[headerName];
      if (!colIdx) return null;
      return getCellValue(row.getCell(colIdx));
    };

    const code = String(getVal("code") || "").trim();
    const title = String(getVal("title") || "").trim();
    if (!code && !title) return; // Skip completely empty rows

    if (!code) {
      const msg = `第 ${rowNumber} 列：題目代碼（code）為空`;
      errors.push(msg);
      issues.push({
        code: "REQUIRED_FIELD_EMPTY",
        severity: "error",
        sheet: "questions",
        row: rowNumber,
        column: "code",
        field: "code",
        message: msg,
        suggestion: "請在 code 欄位填寫唯一的英數代碼（例如 Q1, Q2）。",
      });
      return;
    }
    if (!title) {
      const msg = `第 ${rowNumber} 列 [${code}]：題目內容（title）為空`;
      errors.push(msg);
      issues.push({
        code: "REQUIRED_FIELD_EMPTY",
        severity: "error",
        sheet: "questions",
        row: rowNumber,
        column: "title",
        field: "title",
        value: code,
        message: msg,
        suggestion: "請在 title 欄位填寫該題目的問題說明文字。",
      });
      return;
    }

    if (title.length > MAX_CELL_LENGTH) {
      const msg = `第 ${rowNumber} 列 [${code}]：題目標題過長（最多 ${MAX_CELL_LENGTH} 字元）`;
      errors.push(msg);
      issues.push({
        code: "CELL_TOO_LONG",
        severity: "error",
        sheet: "questions",
        row: rowNumber,
        column: "title",
        field: "title",
        message: msg,
        suggestion: "請精簡題目標題文字至 5000 字以內。",
      });
      return;
    }

    const hasOrderCol = questionHeaders["order_num"] !== undefined;
    let orderNum = rowNumber - 1;
    if (hasOrderCol) {
      const parsedOrder = parseStrictOrderNum(getVal("order_num"), "order_num", rowNumber, "questions", issues, errors);
      if (parsedOrder !== null) {
        if (seenQuestionOrders.has(parsedOrder)) {
          const msg = `questions 工作表第 ${rowNumber} 列 [${code}]：題目排序序號「${parsedOrder}」重複`;
          errors.push(msg);
          issues.push({
            code: "DUPLICATE_ORDER",
            severity: "error",
            sheet: "questions",
            row: rowNumber,
            column: "order_num",
            field: "order_num",
            value: String(parsedOrder),
            message: msg,
            suggestion: "請確保每個題目的 order_num 為唯一且不重複的正整數。",
          });
        }
        seenQuestionOrders.add(parsedOrder);
        orderNum = parsedOrder;
      }
    }
    const description = getVal("description") ? String(getVal("description")).trim() : null;
    if (description && description.length > MAX_CELL_LENGTH) {
      const msg = `第 ${rowNumber} 列 [${code}]：題目說明過長（最多 ${MAX_CELL_LENGTH} 字元）`;
      errors.push(msg);
      issues.push({
        code: "CELL_TOO_LONG",
        severity: "error",
        sheet: "questions",
        row: rowNumber,
        column: "description",
        field: "description",
        message: msg,
        suggestion: "請精簡題目說明文字至 5000 字以內。",
      });
      return;
    }

    const rawType = String(getVal("question_type") || "single_choice").trim();

    const typeParse = QuestionTypeEnum.safeParse(rawType);
    if (!typeParse.success) {
      const msg = `第 ${rowNumber} 列 [${code}]：題型「${rawType}」不合法`;
      errors.push(msg);
      issues.push({
        code: "INVALID_QUESTION_TYPE",
        severity: "error",
        sheet: "questions",
        row: rowNumber,
        column: "question_type",
        field: "question_type",
        value: rawType,
        message: msg,
        suggestion: "請使用支援的 6 種題型之一：single_choice, multiple_choice, text, number, yes_no, info。",
      });
      return;
    }

    const questionType = typeParse.data;
    const required = parseStrictBoolean(getVal("required"), "required", rowNumber, "questions", issues, errors);
    const scoringEnabled = parseStrictBoolean(getVal("scoring_enabled"), "scoring_enabled", rowNumber, "questions", issues, errors);
    const reverseScore = parseStrictBoolean(getVal("reverse_score"), "reverse_score", rowNumber, "questions", issues, errors);

    // M2 / M3 / M4 欄位
    const visibilityRules = getVal("visibility_rules")
      ? String(getVal("visibility_rules")).trim()
      : null;
    const visibilityHint = getVal("visibility_hint")
      ? String(getVal("visibility_hint")).trim()
      : null;
    const minSelections = parseNumber(getVal("min_selections"));
    const maxSelections = parseNumber(getVal("max_selections"));
    const minValue = parseNumber(getVal("min_value"));
    const maxValue = parseNumber(getVal("max_value"));

    questionsMap.set(code, {
      rowNum: rowNumber,
      orderNum: orderNum ?? rowNumber - 1,
      code,
      title,
      description,
      questionType,
      required,
      scoringEnabled,
      reverseScore,
      visibilityRules,
      visibilityHint,
      minSelections,
      maxSelections,
      minValue,
      maxValue,
      choices: [],
    });
  });

  // 2. 解析 Choices
  if (choicesSheet) {
    const choiceHeaders: { [key: string]: number } = {};
    choicesSheet.getRow(1).eachCell((cell, colNumber) => {
      const header = String(getCellValue(cell) || "").trim().toLowerCase();
      choiceHeaders[header] = colNumber;
    });

    choicesSheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // Skip header

      const getVal = (headerName: string) => {
        const colIdx = choiceHeaders[headerName];
        if (!colIdx) return null;
        return getCellValue(row.getCell(colIdx));
      };

      const qCode = String(getVal("question_code") || "").trim();
      const label = String(getVal("label") || "").trim();
      const value = String(getVal("value") || "").trim();

      if (!qCode && !label && !value) return; // Skip empty rows

      if (!qCode) {
        const msg = `choices 工作表第 ${rowNumber} 列：未指定題目代碼 (question_code)`;
        errors.push(msg);
        issues.push({
          code: "REQUIRED_FIELD_EMPTY",
          severity: "error",
          sheet: "choices",
          row: rowNumber,
          column: "question_code",
          field: "question_code",
          message: msg,
          suggestion: "請在 question_code 欄位填寫所屬題目的 code（例如 Q1）。",
        });
        return;
      }

      const q = questionsMap.get(qCode);
      if (!q) {
        const msg = `choices 工作表第 ${rowNumber} 列：指定的題目代碼「${qCode}」不存在於 questions 表中`;
        errors.push(msg);
        issues.push({
          code: "QUESTION_NOT_FOUND",
          severity: "error",
          sheet: "choices",
          row: rowNumber,
          column: "question_code",
          field: "question_code",
          value: qCode,
          message: msg,
          suggestion: `請確認 questions 工作表中已定義代碼為「${qCode}」的題目。`,
        });
        return;
      }

      if (!label || !value) {
        const msg = `choices 工作表第 ${rowNumber} 列 [${qCode}]：選項標題 (label) 或代碼 (value) 為空`;
        errors.push(msg);
        issues.push({
          code: "REQUIRED_FIELD_EMPTY",
          severity: "error",
          sheet: "choices",
          row: rowNumber,
          column: !label ? "label" : "value",
          field: !label ? "label" : "value",
          message: msg,
          suggestion: "請填寫選項的顯示名稱 (label) 與儲存值代碼 (value)。",
        });
        return;
      }

      if (label.length > MAX_CELL_LENGTH) {
        const msg = `choices 工作表第 ${rowNumber} 列 [${qCode}]：選項標題過長（最多 ${MAX_CELL_LENGTH} 字元）`;
        errors.push(msg);
        issues.push({
          code: "CELL_TOO_LONG",
          severity: "error",
          sheet: "choices",
          row: rowNumber,
          column: "label",
          field: "label",
          message: msg,
          suggestion: "請精簡選項標籤文字至 5000 字以內。",
        });
        return;
      }

      const hasChoiceOrderCol = choiceHeaders["order_num"] !== undefined;
      let orderNum = (q.choices?.length || 0) + 1;
      if (hasChoiceOrderCol) {
        const parsedOrder = parseStrictOrderNum(getVal("order_num"), "order_num", rowNumber, "choices", issues, errors);
        if (parsedOrder !== null && q) {
          if (!seenChoiceOrders.has(qCode)) seenChoiceOrders.set(qCode, new Set<number>());
          const qChoiceOrders = seenChoiceOrders.get(qCode)!;
          if (qChoiceOrders.has(parsedOrder)) {
            const msg = `choices 工作表第 ${rowNumber} 列 [${qCode}]：選項排序序號「${parsedOrder}」在題目「${qCode}」中重複`;
            errors.push(msg);
            issues.push({
              code: "DUPLICATE_CHOICE_ORDER",
              severity: "error",
              sheet: "choices",
              row: rowNumber,
              column: "order_num",
              field: "order_num",
              value: String(parsedOrder),
              message: msg,
              suggestion: "請確保同一題目下的每個選項 order_num 為唯一且不重複的正整數。",
            });
          }
          qChoiceOrders.add(parsedOrder);
          orderNum = parsedOrder;
        }
      }
      const scoreEnabled = parseStrictBoolean(getVal("score_enabled"), "score_enabled", rowNumber, "choices", issues, errors);
      const score = parseNumber(getVal("score"));
      const isOther = parseStrictBoolean(getVal("is_other"), "is_other", rowNumber, "choices", issues, errors);
      const requiresText = parseStrictBoolean(getVal("requires_text"), "requires_text", rowNumber, "choices", issues, errors);
      const isNoneOfAbove = parseStrictBoolean(getVal("is_none_of_above"), "is_none_of_above", rowNumber, "choices", issues, errors);

      q.choices.push({
        orderNum: orderNum ?? (q.choices?.length || 0) + 1,
        label,
        value,
        scoreEnabled,
        score: scoreEnabled ? (score ?? 0) : null,
        isOther,
        requiresText: isOther ? requiresText : false,
        isNoneOfAbove,
      });
    });
  }

  // 整理與排序
  const questionsList = Array.from(questionsMap.values()).sort((a, b) => a.orderNum - b.orderNum);
  questionsList.forEach((q) => {
    q.choices.sort((a, b) => a.orderNum - b.orderNum);
  });

  return {
    questions: questionsList,
    errors,
    issues,
  };
}

/**
 * 匯出問卷結果統計與填答明細為 Excel 報表
 */
export async function generateSurveyExportExcel(data: {
  survey: { title: string; description?: string | null; version?: number };
  questions: QuestionInput[];
  responses: Array<{
    id: string;
    version?: number;
    submittedAt?: Date | null;
    totalScore?: number | null;
    maxScore?: number | null;
    percentage?: number | null;
    answers: Array<{
      questionCode: string;
      rawValue: any;
      otherText?: string | null;
      score?: number | null;
    }>;
  }>;
}): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Survey System MVP";
  workbook.created = new Date();

  // Sheet 1: 填答明細 (Responses Detail)
  const detailSheet = workbook.addWorksheet("填答明細");

  const detailCols: Array<{ header: string; key: string; width: number }> = [
    { header: "Response ID", key: "response_id", width: 25 },
    { header: "版本 (Version)", key: "version", width: 14 },
    { header: "提交時間", key: "submitted_at", width: 22 },
    { header: "總得分 (Total Score)", key: "total_score", width: 18 },
    { header: "最高滿分 (Max Score)", key: "max_score", width: 18 },
    { header: "得分率 (%)", key: "percentage", width: 14 },
  ];

  data.questions.forEach((q) => {
    detailCols.push({
      header: `[${q.code}] 原始作答`,
      key: `raw_${q.code}`,
      width: 25,
    });
    if (q.choices.some((c) => c.isOther)) {
      detailCols.push({
        header: `[${q.code}] 其他說明文字`,
        key: `other_${q.code}`,
        width: 22,
      });
    }
    if (q.scoringEnabled) {
      detailCols.push({
        header: `[${q.code}] 題得分`,
        key: `score_${q.code}`,
        width: 15,
      });
    }
  });

  detailSheet.columns = detailCols;
  detailSheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  detailSheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF2563EB" },
  };

  data.responses.forEach((resp) => {
    const row: any = {
      response_id: resp.id,
      version: resp.version || 1,
      submitted_at: resp.submittedAt ? new Date(resp.submittedAt).toLocaleString("zh-TW") : "未提交",
      total_score: resp.totalScore !== null ? resp.totalScore : "不計分",
      max_score: resp.maxScore !== null ? resp.maxScore : "-",
      percentage: resp.percentage !== null ? `${resp.percentage}%` : "-",
    };

    const ansMap = new Map<string, any>();
    resp.answers.forEach((a) => ansMap.set(a.questionCode, a));

    data.questions.forEach((q) => {
      const a = ansMap.get(q.code);
      if (a) {
        let displayVal = a.rawValue;
        if (Array.isArray(displayVal)) {
          displayVal = displayVal.join(", ");
        } else if (displayVal === null || displayVal === undefined) {
          displayVal = "-";
        }
        row[`raw_${q.code}`] = String(displayVal);
        if (q.choices.some((c) => c.isOther)) {
          row[`other_${q.code}`] = a.otherText || "";
        }
        if (q.scoringEnabled) {
          row[`score_${q.code}`] = a.score !== null ? a.score : "不計分";
        }
      } else {
        row[`raw_${q.code}`] = "(條件隱藏/未作答)";
        if (q.choices.some((c) => c.isOther)) row[`other_${q.code}`] = "";
        if (q.scoringEnabled) row[`score_${q.code}`] = "-";
      }
    });

    detailSheet.addRow(row);
  });

  // Sheet 2: 題目與選項總覽
  const qSheet = workbook.addWorksheet("題目與選項設定");
  qSheet.columns = [
    { header: "題目代碼", key: "code", width: 14 },
    { header: "題目名稱", key: "title", width: 35 },
    { header: "題型", key: "question_type", width: 16 },
    { header: "必填", key: "required", width: 10 },
    { header: "計分啟用", key: "scoring_enabled", width: 12 },
    { header: "反向計分", key: "reverse_score", width: 12 },
    { header: "條件顯示規則", key: "visibility_rules", width: 35 },
    { header: "條件提示文字", key: "visibility_hint", width: 30 },
    { header: "選項代碼", key: "choice_value", width: 18 },
    { header: "選項標題", key: "choice_label", width: 25 },
    { header: "選項分值", key: "choice_score", width: 12 },
    { header: "其他選項", key: "is_other", width: 12 },
    { header: "以上皆非", key: "is_none_of_above", width: 12 },
  ];

  qSheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  qSheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF059669" },
  };

  data.questions.forEach((q) => {
    if (q.choices.length === 0) {
      qSheet.addRow({
        code: q.code,
        title: q.title,
        question_type: q.questionType,
        required: q.required ? "是" : "否",
        scoring_enabled: q.scoringEnabled ? "是" : "否",
        reverse_score: q.reverseScore ? "是" : "否",
        visibility_rules: q.visibilityRules ? (typeof q.visibilityRules === "string" ? q.visibilityRules : JSON.stringify(q.visibilityRules)) : "-",
        visibility_hint: q.visibilityHint || "-",
        choice_value: "-",
        choice_label: "-",
        choice_score: "-",
        is_other: "-",
        is_none_of_above: "-",
      });
    } else {
      q.choices.forEach((c) => {
        qSheet.addRow({
          code: q.code,
          title: q.title,
          question_type: q.questionType,
          required: q.required ? "是" : "否",
          scoring_enabled: q.scoringEnabled ? "是" : "否",
          reverse_score: q.reverseScore ? "是" : "否",
          visibility_rules: q.visibilityRules ? (typeof q.visibilityRules === "string" ? q.visibilityRules : JSON.stringify(q.visibilityRules)) : "-",
          visibility_hint: q.visibilityHint || "-",
          choice_value: c.value,
          choice_label: c.label,
          choice_score: c.scoreEnabled ? (c.score !== null ? c.score : 0) : "不計分",
          is_other: c.isOther ? "是" : "否",
          is_none_of_above: c.isNoneOfAbove ? "是" : "否",
        });
      });
    }
  });

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * 將 Survey 定義導出為標準雙 Sheet 題庫 Excel (questions 與 choices)，供無損匯入測試與備份
 */
export async function exportSurveyToExcel(
  survey: {
    title: string;
    description?: string | null;
    questions: Array<{
      orderNum: number;
      code: string;
      title: string;
      description?: string | null;
      questionType: QuestionType;
      required: boolean;
      scoringEnabled: boolean;
      reverseScore: boolean;
      visibilityRules?: any;
      visibilityHint?: string | null;
      minSelections?: number | null;
      maxSelections?: number | null;
      minValue?: number | null;
      maxValue?: number | null;
      choices: Array<{
        orderNum: number;
        label: string;
        value: string;
        scoreEnabled: boolean;
        score?: number | null;
        isOther: boolean;
        requiresText: boolean;
        isNoneOfAbove: boolean;
      }>;
    }>;
  },
  _responses: any[] = []
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Survey System MVP";

  // Sheet 1: questions
  const qSheet = workbook.addWorksheet("questions");
  qSheet.columns = [
    { header: "order_num", key: "order_num", width: 10 },
    { header: "code", key: "code", width: 18 },
    { header: "title", key: "title", width: 45 },
    { header: "description", key: "description", width: 40 },
    { header: "question_type", key: "question_type", width: 18 },
    { header: "required", key: "required", width: 12 },
    { header: "scoring_enabled", key: "scoring_enabled", width: 15 },
    { header: "reverse_score", key: "reverse_score", width: 14 },
    { header: "visibility_rules", key: "visibility_rules", width: 45 },
    { header: "visibility_hint", key: "visibility_hint", width: 40 },
    { header: "min_selections", key: "min_selections", width: 15 },
    { header: "max_selections", key: "max_selections", width: 15 },
    { header: "min_value", key: "min_value", width: 12 },
    { header: "max_value", key: "max_value", width: 12 },
  ];

  survey.questions.forEach((q) => {
    qSheet.addRow({
      order_num: q.orderNum,
      code: q.code,
      title: q.title,
      description: q.description || "",
      question_type: q.questionType,
      required: q.required ? "TRUE" : "FALSE",
      scoring_enabled: q.scoringEnabled ? "TRUE" : "FALSE",
      reverse_score: q.reverseScore ? "TRUE" : "FALSE",
      visibility_rules: q.visibilityRules ? (typeof q.visibilityRules === "string" ? q.visibilityRules : JSON.stringify(q.visibilityRules)) : "",
      visibility_hint: q.visibilityHint || "",
      min_selections: q.minSelections ?? "",
      max_selections: q.maxSelections ?? "",
      min_value: q.minValue ?? "",
      max_value: q.maxValue ?? "",
    });
  });

  // Sheet 2: choices
  const cSheet = workbook.addWorksheet("choices");
  cSheet.columns = [
    { header: "question_code", key: "question_code", width: 18 },
    { header: "order_num", key: "order_num", width: 10 },
    { header: "label", key: "label", width: 35 },
    { header: "value", key: "value", width: 25 },
    { header: "score_enabled", key: "score_enabled", width: 15 },
    { header: "score", key: "score", width: 10 },
    { header: "is_other", key: "is_other", width: 12 },
    { header: "requires_text", key: "requires_text", width: 14 },
    { header: "is_none_of_above", key: "is_none_of_above", width: 16 },
  ];

  survey.questions.forEach((q) => {
    q.choices.forEach((c) => {
      cSheet.addRow({
        question_code: q.code,
        order_num: c.orderNum,
        label: c.label,
        value: c.value,
        score_enabled: c.scoreEnabled ? "TRUE" : "FALSE",
        score: c.scoreEnabled ? (c.score ?? 0) : "",
        is_other: c.isOther ? "TRUE" : "FALSE",
        requires_text: c.requiresText ? "TRUE" : "FALSE",
        is_none_of_above: c.isNoneOfAbove ? "TRUE" : "FALSE",
      });
    });
  });

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

