import ExcelJS from "exceljs";
import JSZip from "jszip";
import { QuestionInput, ChoiceInput, QuestionType, QuestionTypeEnum } from "./types";
import { ValidationIssue } from "../types/surveyImport";

function parseBoolean(val: any): boolean {
  if (typeof val === "boolean") return val;
  if (typeof val === "number") return val === 1;
  if (typeof val === "string") {
    const s = val.trim().toLowerCase();
    return s === "true" || s === "1" || s === "yes" || s === "y" || s === "是";
  }
  return false;
}

function parseNumber(val: any): number | null {
  if (val === null || val === undefined || val === "") return null;
  const num = Number(val);
  return isNaN(num) ? null : num;
}

function getCellValue(cell: ExcelJS.Cell): any {
  const val = cell.value;
  if (val === null || val === undefined) return null;
  if (typeof val === "object" && "text" in val) {
    return (val as any).text;
  }
  if (typeof val === "object" && "result" in val) {
    return (val as any).result;
  }
  return val;
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
    });
    return {
      questions: [],
      errors,
      issues,
    };
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
    });
    return { questions: [], errors, issues };
  }

  // 1. 解析 Questions
  const questionsMap = new Map<string, QuestionInput>();
  const questionHeaders: { [key: string]: number } = {};

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
      });
      return;
    }

    const orderNum = parseNumber(getVal("order_num")) ?? rowNumber - 1;
    const description = getVal("description") ? String(getVal("description")).trim() : null;
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
      });
      return;
    }

    const questionType = typeParse.data;
    const required = parseBoolean(getVal("required"));
    const scoringEnabled = parseBoolean(getVal("scoring_enabled"));
    const reverseScore = parseBoolean(getVal("reverse_score"));

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
      orderNum,
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
        });
        return;
      }

      const orderNum = parseNumber(getVal("order_num")) ?? (q.choices?.length || 0) + 1;
      const scoreEnabled = parseBoolean(getVal("score_enabled"));
      const score = parseNumber(getVal("score"));
      const isOther = parseBoolean(getVal("is_other"));
      const requiresText = parseBoolean(getVal("requires_text"));
      const isNoneOfAbove = parseBoolean(getVal("is_none_of_above"));

      q.choices.push({
        orderNum,
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

