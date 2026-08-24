/**
 * 問卷 Excel 匯入共用型別定義
 * Phase 1 基礎型別（可安全新增，不影響既有功能）
 *
 * 對齊現有專案：
 * - question_type: single_choice | multiple_choice | text | number | yes_no | info
 * - 主鍵使用 code（非 id）
 * - 跳題使用 visibility_rules（非 next_question_id）
 */

// ============================================================
// 1. 錯誤 / 警告 標準結構（前後端共用）
// ============================================================

export type ValidationSeverity = 'error' | 'warning';

export type ValidationSheet = 'questions' | 'choices' | 'system';

/**
 * 穩定錯誤碼（後續 Phase 會持續擴充）
 * 命名規則：大寫 + 底線
 */
export type ValidationErrorCode =
  // 檔案層級
  | 'FILE_EXTENSION_INVALID'
  | 'INVALID_FILE_TYPE'
  | 'FILE_SIGNATURE_INVALID'      // magic bytes 不符
  | 'FILE_TOO_LARGE'
  | 'FILE_MIME_INVALID'
  | 'FILE_PARSE_FAILED'
  | 'INVALID_FILE'
  | 'ROW_LIMIT_EXCEEDED'          // 列數超過上限
  | 'SHEET_LIMIT_EXCEEDED'        // 工作表數量超過上限
  | 'CELL_TOO_LONG'               // 儲存格文字過長
  | 'FORMULA_NOT_ALLOWED'         // 偵測到未允許或潛在惡意公式
  | 'COPYRIGHT_NOT_CONFIRMED'     // 未確認版權宣告
  // 工作表 / 結構
  | 'SHEET_MISSING'
  | 'MISSING_SHEET'
  | 'HEADER_INVALID'
  | 'INVALID_HEADER'
  | 'HEADER_MISSING_REQUIRED'
  | 'MISSING_HEADER'
  | 'EXTRA_COLUMN'                // 多餘欄位（可 warning）
  // 資料列
  | 'REQUIRED_FIELD_EMPTY'
  | 'EMPTY_REQUIRED_FIELD'
  | 'INVALID_QUESTION_TYPE'
  | 'INVALID_BOOLEAN'
  | 'INVALID_BOOLEAN_VALUE'
  | 'INVALID_NUMBER'
  | 'INVALID_ORDER_NUM'
  | 'INVALID_VALUE'
  | 'DUPLICATE_QUESTION_CODE'
  | 'DUPLICATE_ORDER'
  | 'DUPLICATE_CHOICE_ORDER'
  | 'DUPLICATE_ID'
  | 'DUPLICATE_CHOICE_VALUE'
  | 'DUPLICATE_CHOICE_ID'
  | 'DUPLICATE_CHOICE_LABEL'
  | 'IMPORT_CANNOT_PUBLISH'
  // 關聯與條件
  | 'QUESTION_NOT_FOUND'          // choices.question_code 不存在
  | 'REFERENCE_NOT_FOUND'
  | 'INVALID_VISIBILITY_RULE'
  | 'INVALID_REFERENCE'
  | 'INVALID_BRANCH'
  | 'BRANCH_TARGET_NOT_FOUND'
  | 'BRANCHING_CYCLE'
  | 'BRANCH_CYCLE_DETECTED'
  | 'ORPHAN_QUESTION'
  | 'ORPHAN_CHOICE'
  // 商業規則
  | 'CHOICE_REQUIRED_FOR_TYPE'    // 選擇題沒有選項
  | 'UNEXPECTED_CHOICES'          // text/number/info 不應有選項
  | 'INVALID_MIN_MAX'
  // 系統 / 資料庫
  | 'DATABASE_IMPORT_FAILED'
  | 'SURVEY_ALREADY_EXISTS'
  | 'UNAUTHORIZED'
  | 'RATE_LIMITED'
  | 'UNKNOWN_ERROR';

/**
 * 單一驗證問題（前後端、UI 統一使用）
 */
export interface ValidationIssue {
  /** 穩定錯誤碼，方便前端做 i18n 或篩選 */
  code: ValidationErrorCode | string;
  severity: ValidationSeverity;
  sheet: ValidationSheet;
  /** Excel 列號（1-based，含標頭時從 2 開始） */
  row?: number;
  /** 欄位名稱（例如 code、title、question_type） */
  column?: string;
  /** 邏輯欄位名（與 column 可相同） */
  field?: string;
  /** 實際出問題的值（截斷後顯示，避免 XSS） */
  value?: string;
  /** 人類可讀訊息 */
  message: string;
  /** 修正建議（Actionable suggestion） */
  suggestion?: string;
}

// ============================================================
// 2. API 標準回應格式
// ============================================================

export interface ImportSummary {
  questions: number;
  choices: number;
  requiredQuestions?: number;
  scoredQuestions?: number;
  conditionalQuestions?: number;
  sheets?: number;
  warnings: number;
}

export interface ImportResponse {
  success: boolean;
  /** 錯誤提示訊息（相容舊版） */
  error?: string;
  /** 執行模式 */
  mode?: ImportMode | string;
  /** 成功時回傳建立的 surveyId（或 importId） */
  surveyId?: string;
  importId?: string;
  version?: number;
  survey?: any;
  questionCount?: number;
  summary?: ImportSummary;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  /** 預覽模式時可回傳解析後的題目（可選） */
  questions?: any[]; // QuestionInput[]
}

// ============================================================
// 3. 前端驗證結果（輕量）
// ============================================================

export interface ClientValidationResult {
  isValid: boolean;               // 沒有 error 才為 true（warning 可通過）
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  summary?: {
    questionCount: number;
    choiceCount: number;
  };
}

// ============================================================
// 4. 匯入模式與狀態
// ============================================================

export type ImportMode = 'preview' | 'save';

export type SurveyPublishStatus = 'DRAFT' | 'PUBLISHED';

// ============================================================
// 5. 匯入稽核與歷史紀錄型別 (M6D)
// ============================================================

export type ImportAuditStatus = 'PREVIEW' | 'IMPORTING' | 'SUCCESS' | 'FAILED';

export interface SurveyImportRecord {
  id: string;
  importId: string;
  surveyId?: string | null;
  organizationId: string;
  createdById?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
  mode: string;
  status: ImportAuditStatus;
  questionCount: number;
  choiceCount: number;
  requiredCount: number;
  scoredCount: number;
  conditionalCount: number;
  copyrightConfirmed: boolean;
  errorCode?: string | null;
  errorMessage?: string | null;
  errorDetails?: string | null;
  createdAt: string | Date;
  completedAt?: string | Date | null;
  survey?: {
    id: string;
    title: string;
    status: string;
    version: number;
  } | null;
}

export interface ImportHistoryResponse {
  success: boolean;
  items: SurveyImportRecord[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

// ============================================================
// 6. 輔助型別（方便後續 Phase 使用）
// ============================================================

/** 題型（與現有 QuestionTypeEnum 保持一致） */
export type SurveyQuestionType =
  | 'single_choice'
  | 'multiple_choice'
  | 'text'
  | 'number'
  | 'yes_no'
  | 'info';

/** 布林解析允許的明確值（未知值必須報錯） */
export const VALID_BOOLEAN_TRUE = ['true', '1', 'yes', 'y', '是'] as const;
export const VALID_BOOLEAN_FALSE = ['false', '0', 'no', 'n', '否'] as const;

/**
 * 安全截斷顯示用字串（避免超長或含特殊字元影響 UI）
 */
export function safeDisplayValue(value: unknown, maxLength = 80): string {
  if (value === null || value === undefined) return '';
  const str = String(value).trim();
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength) + '…';
}
