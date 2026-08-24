/**
 * Analytics Type Definitions & Domain Contracts
 * Phase M9-E.1
 */

export interface QuestionMeta {
  id: string;
  code: string;
  orderNum: number;
  title: string;
  description?: string | null;
  questionType: string;
  required: boolean;
  scoringEnabled: boolean;
  reverseScore?: boolean;
  choices?: ChoiceMeta[];
}

export interface ChoiceMeta {
  id: string;
  orderNum: number;
  label: string;
  value: string;
  scoreEnabled?: boolean;
  score?: number | null;
}

export interface RawAnswerData {
  questionId: string;
  rawValue: string;
  score?: number | null;
}

export interface RawResponseData {
  id: string;
  status: string;
  answers: RawAnswerData[];
}

/**
 * 分佈特徵標籤（產品自訂啟發式指標，非普適統計假設檢定）
 */
export type DistributionSignal = "NORMAL" | "POLARIZED";

export interface OptionDistributionItem {
  choiceId: string;
  label: string;
  value: string;
  orderNum: number;
  count: number;
  percentage: number; // 分母為 answeredCount (0 ~ 100)
  score?: number | null;
  scoreEnabled?: boolean;
}

export interface NumericStatistics {
  n: number;
  count: number;
  mean: number;
  median: number;
  min: number;
  max: number;
  standardDeviation: number | null; // N < 2 時為 null
  distributionSignal?: DistributionSignal;
}

export interface ResponseRates {
  totalResponses: number;
  answeredCount: number;
  unansweredCount: number;
  answerRate: number;       // 百分比 (0 ~ 100)
  unansweredRate: number;   // 百分比 (0 ~ 100)
}

export interface QuestionAnalyticsResult {
  questionId: string;
  code: string;
  orderNum: number;
  title: string;
  description?: string | null;
  type: string;
  required: boolean;
  scoringEnabled: boolean;
  totalResponses: number;
  answeredCount: number;
  unansweredCount: number;
  answerRate: number;
  unansweredRate: number;
  // 保持向前相容性 alias
  notAnsweredCount?: number;
  responseRate?: number;
  distribution: OptionDistributionItem[] | null;
  optionDistribution?: OptionDistributionItem[] | null;
  statistics: NumericStatistics | null;
}

export interface SurveyAnalyticsSummary {
  totalResponses: number;
  completedResponses: number;
  inProgressResponses: number;
  questionCount: number;
}

/**
 * =========================================================================
 * Cross-tabulation Types (Phase M9-F.1 Pure Engine & Domain Contract)
 * =========================================================================
 */

export type CrossTabMeasure =
  | "COUNT"
  | "ROW_PERCENTAGE"
  | "COL_PERCENTAGE"
  | "TOTAL_PERCENTAGE";

export interface CrossTabCell {
  rowChoiceValue: string;
  colChoiceValue: string;
  count: number;
  rowPercentage: number;   // (cell.count / rowTotal.count) * 100
  colPercentage: number;   // (cell.count / colTotal.count) * 100
  totalPercentage: number; // (cell.count / grandTotal) * 100
}

export interface CrossTabDimensionItem {
  value: string;
  label: string;
  orderNum: number;
  count: number;           // 選擇此選項之雙重有效作答人數 (Paired Respondent Count)
  percentage: number;      // (count / grandTotal) * 100
}

export interface CrossTabResult {
  rowQuestion: {
    id: string;
    code: string;
    title: string;
    type: string;
  };
  colQuestion: {
    id: string;
    code: string;
    title: string;
    type: string;
  };
  matrix: CrossTabCell[][];
  rowItems: CrossTabDimensionItem[];
  colItems: CrossTabDimensionItem[];
  grandTotal: number;      // 同時有效回答 Row 與 Col 之雙重有效作答 Response 數
  unpairedCount: number;   // 未同時有效回答兩題之 Response 數 (totalResponses - grandTotal)
  totalResponses: number;  // 傳入的總填答數 (符合 status/time 篩選)
  statistics?: CrossTabStatistics | null; // M9-F.2 統計檢定結果 (可選)
}

/**
 * =========================================================================
 * Cross-tabulation Statistics Types (Phase M9-F.2 Pure Statistical Engine)
 * =========================================================================
 */

export interface CrossTabStatistics {
  sampleSize: number;
  chiSquare: number | null;
  pValue: number | null;
  degreesOfFreedom: number;
  cramersV: number | null;

  expectedCounts: number[][];
  minExpectedCount: number;
  cellsBelowExpectedThreshold: number;
  percentageBelowExpectedThreshold: number;

  isTestValid: boolean;
  warning?: string | null;
}

