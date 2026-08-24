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
