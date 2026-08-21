/**
 * 前端輕量 Excel 驗證（僅作為 UX 提示）
 * 不可視為安全邊界，後端必須完整重驗證。
 *
 * Phase 1 版本：只做最基本、快速的檢查
 * - 副檔名 / 檔案大小
 * - 必要工作表是否存在
 * - 標頭是否大致正確
 * - 題目 code 是否重複 / 空值
 * - choices 的 question_code 是否指向存在的題目
 */

import ExcelJS from 'exceljs';
import {
  ValidationIssue,
  ClientValidationResult,
  safeDisplayValue,
} from '../types/surveyImport';

// ============================================================
// 設定（可依需求調整）
// ============================================================
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_EXTENSIONS = ['.xlsx'];

// 預期標頭（小寫比對）
const EXPECTED_QUESTION_HEADERS = [
  'code',
  'title',
  'question_type',
];

const EXPECTED_CHOICE_HEADERS = [
  'question_code',
  'label',
  'value',
];

// ============================================================
// 輔助函式
// ============================================================
function buildResult(
  errors: ValidationIssue[],
  warnings: ValidationIssue[],
  summary?: { questionCount: number; choiceCount: number }
): ClientValidationResult {
  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    summary,
  };
}

// ============================================================
// 主要驗證函式
// ============================================================

/**
 * 前端快速驗證上傳的 Excel 檔案
 * @param file 使用者選擇的 File 物件
 */
export async function validateSurveyExcel(
  file: File
): Promise<ClientValidationResult> {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  // ----------------------------------------------------------
  // 1. 檔案基本檢查
  // ----------------------------------------------------------
  const fileName = file.name.toLowerCase();
  const hasValidExtension = ALLOWED_EXTENSIONS.some((ext) =>
    fileName.endsWith(ext)
  );

  if (!hasValidExtension) {
    errors.push({
      code: 'FILE_EXTENSION_INVALID',
      severity: 'error',
      sheet: 'system',
      message: `僅支援 ${ALLOWED_EXTENSIONS.join(', ')} 格式的 Excel 檔案`,
      suggestion: '請確認檔案副檔名為 .xlsx，若是 .csv 或 .xls 請先另存為標準 .xlsx 格式。',
    });
    return buildResult(errors, warnings);
  }

  if (file.size > MAX_FILE_SIZE) {
    errors.push({
      code: 'FILE_TOO_LARGE',
      severity: 'error',
      sheet: 'system',
      message: `檔案大小不可超過 ${MAX_FILE_SIZE / 1024 / 1024}MB`,
      suggestion: '請精簡檔案內容、移除多餘工作表或過大圖片，確保檔案小於 5MB。',
    });
    return buildResult(errors, warnings);
  }

  // ----------------------------------------------------------
  // 2. 解析 Excel
  // ----------------------------------------------------------
  let workbook: ExcelJS.Workbook;
  try {
    const buffer = await file.arrayBuffer();
    workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
  } catch (err: any) {
    errors.push({
      code: 'FILE_PARSE_FAILED',
      severity: 'error',
      sheet: 'system',
      message: `Excel 檔案解析失敗：${err?.message || '檔案可能損毀或非標準 XLSX 格式'}`,
      suggestion: '請使用 Microsoft Excel 或 Google Sheets 重新匯出標準 .xlsx 活頁簿後再上傳。',
    });
    return buildResult(errors, warnings);
  }

  // ----------------------------------------------------------
  // 3. 檢查必要工作表
  // ----------------------------------------------------------
  const questionsSheet =
    workbook.getWorksheet('questions') ||
    workbook.getWorksheet('Questions');

  const choicesSheet =
    workbook.getWorksheet('choices') ||
    workbook.getWorksheet('Choices');

  if (!questionsSheet) {
    errors.push({
      code: 'SHEET_MISSING',
      severity: 'error',
      sheet: 'system',
      message: '缺少名為 "questions" 的工作表',
      suggestion: '請將儲存題目設定的工作表名稱命名為「questions」（英文小寫）。',
    });
  }

  // choices 不是強制，但建議有
  if (!choicesSheet) {
    warnings.push({
      code: 'SHEET_MISSING',
      severity: 'warning',
      sheet: 'system',
      message: '未找到 "choices" 工作表（若問卷包含選擇題，將導致選項缺失）',
      suggestion: '若問卷包含單選題 (single_choice) 或複選題 (multiple_choice)，請新增「choices」工作表並填寫選項。',
    });
  }

  if (!questionsSheet) {
    return buildResult(errors, warnings);
  }

  // ----------------------------------------------------------
  // 4. 檢查 questions 標頭
  // ----------------------------------------------------------
  const questionHeaders: Record<string, number> = {};
  questionsSheet.getRow(1).eachCell((cell, colNumber) => {
    const header = String(cell.value ?? '')
      .trim()
      .toLowerCase();
    if (header) questionHeaders[header] = colNumber;
  });

  for (const required of EXPECTED_QUESTION_HEADERS) {
    if (!questionHeaders[required]) {
      errors.push({
        code: 'HEADER_MISSING_REQUIRED',
        severity: 'error',
        sheet: 'questions',
        column: required,
        field: required,
        message: `questions 工作表缺少必要欄位「${required}」`,
        suggestion: `請在 questions 工作表第 1 列新增標頭「${required}」。`,
      });
    }
  }

  // ----------------------------------------------------------
  // 5. 解析 questions 並檢查 code 重複 / 空值
  // ----------------------------------------------------------
  const questionCodeSet = new Set<string>();
  let questionCount = 0;

  questionsSheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // 跳過標頭

    const getVal = (header: string) => {
      const col = questionHeaders[header];
      if (!col) return '';
      const val = row.getCell(col).value;
      return val === null || val === undefined ? '' : String(val).trim();
    };

    const code = getVal('code');
    const title = getVal('title');
    const questionType = getVal('question_type');

    // 完全空白列 → 忽略
    if (!code && !title && !questionType) return;

    questionCount++;

    // code 不可空
    if (!code) {
      errors.push({
        code: 'REQUIRED_FIELD_EMPTY',
        severity: 'error',
        sheet: 'questions',
        row: rowNumber,
        column: 'code',
        field: 'code',
        message: `第 ${rowNumber} 列：題目代碼（code）不可為空`,
        suggestion: '請在 code 欄位填寫唯一的英數代碼（例如 Q1, Q2）。',
      });
      return;
    }

    // code 重複檢查
    if (questionCodeSet.has(code)) {
      errors.push({
        code: 'DUPLICATE_QUESTION_CODE',
        severity: 'error',
        sheet: 'questions',
        row: rowNumber,
        column: 'code',
        field: 'code',
        value: safeDisplayValue(code),
        message: `第 ${rowNumber} 列：重複的題目代碼「${code}」`,
        suggestion: `題目代碼必須在全問卷唯一，請修改「${code}」為其他不重複的代碼。`,
      });
    } else {
      questionCodeSet.add(code);
    }

    // title 不可空
    if (!title) {
      errors.push({
        code: 'REQUIRED_FIELD_EMPTY',
        severity: 'error',
        sheet: 'questions',
        row: rowNumber,
        column: 'title',
        field: 'title',
        value: safeDisplayValue(code),
        message: `第 ${rowNumber} 列 [${code}]：題目標題（title）不可為空`,
        suggestion: '請在 title 欄位填寫該題目的問題說明文字。',
      });
    }

    // question_type 基本檢查（後端會做更嚴格驗證）
    if (!questionType) {
      errors.push({
        code: 'REQUIRED_FIELD_EMPTY',
        severity: 'error',
        sheet: 'questions',
        row: rowNumber,
        column: 'question_type',
        field: 'question_type',
        value: safeDisplayValue(code),
        message: `第 ${rowNumber} 列 [${code}]：題型（question_type）不可為空`,
        suggestion: '請填寫題型，可使用：single_choice, multiple_choice, text, number, yes_no, info。',
      });
    }
  });

  if (questionCount === 0) {
    errors.push({
      code: 'REQUIRED_FIELD_EMPTY',
      severity: 'error',
      sheet: 'questions',
      message: 'questions 工作表中沒有有效的資料列',
      suggestion: '請在 questions 工作表填寫至少一題問卷題目。',
    });
  }

  // ----------------------------------------------------------
  // 6. 解析 choices（若存在）
  // ----------------------------------------------------------
  let choiceCount = 0;

  if (choicesSheet) {
    const choiceHeaders: Record<string, number> = {};
    choicesSheet.getRow(1).eachCell((cell, colNumber) => {
      const header = String(cell.value ?? '')
        .trim()
        .toLowerCase();
      if (header) choiceHeaders[header] = colNumber;
    });

    for (const required of EXPECTED_CHOICE_HEADERS) {
      if (!choiceHeaders[required]) {
        warnings.push({
          code: 'HEADER_MISSING_REQUIRED',
          severity: 'warning',
          sheet: 'choices',
          column: required,
          field: required,
          message: `choices 工作表缺少欄位「${required}」`,
          suggestion: `建議在 choices 工作表第 1 列加入「${required}」標頭。`,
        });
      }
    }

    const choiceValSet = new Set<string>();

    choicesSheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;

      const getVal = (header: string) => {
        const col = choiceHeaders[header];
        if (!col) return '';
        const val = row.getCell(col).value;
        return val === null || val === undefined ? '' : String(val).trim();
      };

      const qCode = getVal('question_code');
      const label = getVal('label');
      const value = getVal('value');

      // 空白列 → 忽略
      if (!qCode && !label && !value) return;

      choiceCount++;

      if (!qCode) {
        errors.push({
          code: 'REQUIRED_FIELD_EMPTY',
          severity: 'error',
          sheet: 'choices',
          row: rowNumber,
          column: 'question_code',
          field: 'question_code',
          message: `第 ${rowNumber} 列：選項所屬題目代碼（question_code）不可為空`,
          suggestion: '請在 question_code 欄位填寫所屬題目的 code（例如 Q1）。',
        });
        return;
      }

      // 檢查是否指向存在的題目
      if (questionCodeSet.size > 0 && !questionCodeSet.has(qCode)) {
        errors.push({
          code: 'QUESTION_NOT_FOUND',
          severity: 'error',
          sheet: 'choices',
          row: rowNumber,
          column: 'question_code',
          field: 'question_code',
          value: safeDisplayValue(qCode),
          message: `第 ${rowNumber} 列：選項參照的題目代碼「${qCode}」不存在於 questions 工作表`,
          suggestion: `請確認 questions 工作表中是否定義了 code 為「${qCode}」的題目，或修正此選項的 question_code。`,
        });
      }

      if (!label && !value) {
        errors.push({
          code: 'REQUIRED_FIELD_EMPTY',
          severity: 'error',
          sheet: 'choices',
          row: rowNumber,
          column: 'label',
          field: 'label',
          message: `第 ${rowNumber} 列 [${qCode}]：選項標籤（label）與代碼（value）不可同時為空`,
          suggestion: '請填寫選項的顯示名稱 (label) 與選項代碼 (value)。',
        });
      }

      // 檢查同一題目的選項值是否重複
      const choiceKey = `${qCode}:::${value || label}`;
      if (choiceValSet.has(choiceKey)) {
        warnings.push({
          code: 'DUPLICATE_CHOICE_VALUE',
          severity: 'warning',
          sheet: 'choices',
          row: rowNumber,
          column: 'value',
          field: 'value',
          value: safeDisplayValue(value || label),
          message: `第 ${rowNumber} 列 [${qCode}]：題目內有重複的選項值/標籤「${value || label}」`,
          suggestion: '建議同一題內的各選項代碼 (value) 與標籤 (label) 保持唯一以利統計。',
        });
      } else {
        choiceValSet.add(choiceKey);
      }
    });
  }

  return buildResult(errors, warnings, { questionCount, choiceCount });
}
