/**
 * Dashboard Intelligence Orchestration & Presentation Layer (Phase M10-C)
 *
 * 核心架構原則 (Invariant):
 * 1. Intelligence over Analytics: 僅消費既有純函數 Analytics Engine v1.0.0 與 ProtectedCrossTabResult DTO。
 * 2. 不重新計算 raw responses，不創造第二套統計公式或分母。
 * 3. 嚴格維護隱私抑制 (Suppression State)，禁止 UI 或 Tooltip 產生旁路洩漏。
 */

import { ProtectedCrossTabResult, ProtectedCrossTabCell } from "./analytics";

export interface DashboardTimelinePoint {
  date: string; // YYYY-MM-DD
  count: number;
  cumulativeCount: number;
}

export interface ExecutiveKPIs {
  totalResponses: number;
  completedResponses: number;
  inProgressResponses: number;
  completionRate: number; // 0 ~ 100
  averageDurationSeconds: number | null;
  averageScore: number | null;
  averagePercentage: number | null;
  sampleAdequacy: "ADEQUATE" | "LOW_SAMPLE" | "CRITICAL_LOW";
}

export interface AutomatedInsight {
  id: string;
  type: "STATISTICAL_SIGNIFICANCE" | "POLARIZED_DISTRIBUTION" | "HIGH_CONSENSUS" | "DROP_OFF_WARNING";
  severity: "INFO" | "SUCCESS" | "WARNING";
  title: string;
  description: string;
  metric?: string;
  relatedQuestionCodes: string[];
}

export type CrossTabDisplayMode = "COUNT" | "ROW_PERCENT" | "COL_PERCENT";

export interface CellPresentationModel {
  rowValue: string;
  colValue: string;
  count: number | null;
  percentage: number | null;
  displayValue: string;
  tooltip: string;
  isSuppressed: boolean;
  heatmapIntensity: number; // 0.0 ~ 1.0
}

/**
 * 1. 計算高階主管 KPI 指標 (Executive KPI Layer)
 */
export function calculateExecutiveKPIs(params: {
  totalResponses: number;
  completedResponses: number;
  inProgressResponses: number;
  averageDurationSeconds?: number | null;
  averageScore?: number | null;
  averagePercentage?: number | null;
}): ExecutiveKPIs {
  const { totalResponses, completedResponses, inProgressResponses, averageDurationSeconds, averageScore, averagePercentage } = params;

  const completionRate =
    totalResponses > 0
      ? Math.round((completedResponses / totalResponses) * 1000) / 10
      : 0;

  let sampleAdequacy: "ADEQUATE" | "LOW_SAMPLE" | "CRITICAL_LOW" = "ADEQUATE";
  if (completedResponses === 0) {
    sampleAdequacy = "CRITICAL_LOW";
  } else if (completedResponses < 10) {
    sampleAdequacy = "LOW_SAMPLE";
  }

  return {
    totalResponses,
    completedResponses,
    inProgressResponses,
    completionRate,
    averageDurationSeconds: averageDurationSeconds ?? null,
    averageScore: averageScore !== null && averageScore !== undefined ? Math.round(averageScore * 10) / 10 : null,
    averagePercentage: averagePercentage !== null && averagePercentage !== undefined ? Math.round(averagePercentage * 10) / 10 : null,
    sampleAdequacy,
  };
}

/**
 * 2. 彙整洞察建議 (Insight Aggregation - 純消費 DTO，不重算原始母體)
 */
export function generateAutomatedInsights(params: {
  questionAnalytics?: any[];
  crossTabResult?: ProtectedCrossTabResult | null;
  completionRate?: number;
}): AutomatedInsight[] {
  const insights: AutomatedInsight[] = [];
  const { questionAnalytics = [], crossTabResult, completionRate = 100 } = params;

  // 1. 填答完成率洞察
  if (completionRate < 50 && completionRate > 0) {
    insights.push({
      id: "insight-dropoff-warning",
      type: "DROP_OFF_WARNING",
      severity: "WARNING",
      title: "問卷流失率偏高",
      description: `目前有效完成率僅為 ${completionRate}%，建議檢查問卷長度或必填題目設定。`,
      metric: `${completionRate}%`,
      relatedQuestionCodes: [],
    });
  }

  // 2. 題目分佈特徵洞察 (消費既有 Question Analytics DTO)
  for (const q of questionAnalytics) {
    if (q.statistics?.distributionSignal === "POLARIZED") {
      insights.push({
        id: `insight-polarized-${q.code}`,
        type: "POLARIZED_DISTRIBUTION",
        severity: "INFO",
        title: `題目「${q.title}」意見呈現兩極化`,
        description: `該題標準差顯著 (SD=${q.statistics.standardDeviation})，填答者看法高度分歧。`,
        metric: `SD = ${q.statistics.standardDeviation}`,
        relatedQuestionCodes: [q.code],
      });
    }

    // 檢查高度共識題 (單一選項佔比 >= 80%)
    if (Array.isArray(q.distribution) && q.distribution.length > 1) {
      const dominantOption = q.distribution.find((d: any) => d.percentage >= 80);
      if (dominantOption) {
        insights.push({
          id: `insight-consensus-${q.code}`,
          type: "HIGH_CONSENSUS",
          severity: "SUCCESS",
          title: `題目「${q.title}」具高度共識`,
          description: `超過 ${dominantOption.percentage}% 的受訪者選擇了「${dominantOption.label}」。`,
          metric: `${dominantOption.percentage}%`,
          relatedQuestionCodes: [q.code],
        });
      }
    }
  }

  // 3. 交叉分析顯著性洞察 (消費既有 ProtectedCrossTabResult DTO)
  if (crossTabResult && crossTabResult.statistics) {
    const { pValue, isTestValid, degreesOfFreedom, chiSquare } = crossTabResult.statistics;
    if (isTestValid && pValue !== null && pValue < 0.05) {
      const pFormatted = pValue < 0.001 ? "p < 0.001" : `p = ${pValue.toFixed(3)}`;
      insights.push({
        id: "insight-crosstab-significance",
        type: "STATISTICAL_SIGNIFICANCE",
        severity: "SUCCESS",
        title: `維度交叉呈現統計顯著關聯 (${pFormatted})`,
        description: `卡方檢定統計量 χ²=${chiSquare?.toFixed(2)} (自由度 df=${degreesOfFreedom})，兩維度變數間存在顯著關聯。`,
        metric: pFormatted,
        relatedQuestionCodes: [crossTabResult.rowQuestion.code, crossTabResult.colQuestion.code],
      });
    }
  }

  return insights;
}

/**
 * 3. 視覺化矩陣單元格呈現模型 (Privacy-Preserving Presentation Model)
 * 嚴格防範抑制旁路：isSuppressed 為 true 時，displayValue 永遠為 "*" 且 Tooltip 不包含 raw count/percentage。
 */
export function buildCellPresentation(
  cell: ProtectedCrossTabCell,
  rowTotal: number | null,
  colTotal: number | null,
  grandTotal: number | null,
  mode: CrossTabDisplayMode = "COUNT"
): CellPresentationModel {
  if (cell.isSuppressed || cell.count === null) {
    return {
      rowValue: cell.rowChoiceValue,
      colValue: cell.colChoiceValue,
      count: null,
      percentage: null,
      displayValue: "*",
      tooltip: "🔒 樣本過少已隱藏 (Suppressed for privacy)",
      isSuppressed: true,
      heatmapIntensity: 0,
    };
  }

  let percentage: number | null = null;
  let displayValue = String(cell.count);

  if (mode === "ROW_PERCENT") {
    if (rowTotal && rowTotal > 0) {
      percentage = Math.round((cell.count / rowTotal) * 1000) / 10;
      displayValue = `${percentage}%`;
    } else {
      displayValue = "0%";
    }
  } else if (mode === "COL_PERCENT") {
    if (colTotal && colTotal > 0) {
      percentage = Math.round((cell.count / colTotal) * 1000) / 10;
      displayValue = `${percentage}%`;
    } else {
      displayValue = "0%";
    }
  }

  // 計算熱圖強度 (0.0 ~ 1.0)
  let heatmapIntensity = 0;
  if (mode === "COUNT" && grandTotal && grandTotal > 0) {
    heatmapIntensity = Math.min(1, Math.max(0, cell.count / grandTotal));
  } else if (percentage !== null) {
    heatmapIntensity = Math.min(1, Math.max(0, percentage / 100));
  }

  const tooltip = `次數: ${cell.count} 筆${
    rowTotal ? ` | 列佔比: ${Math.round((cell.count / rowTotal) * 1000) / 10}%` : ""
  }${
    colTotal ? ` | 行佔比: ${Math.round((cell.count / colTotal) * 1000) / 10}%` : ""
  }`;

  return {
    rowValue: cell.rowChoiceValue,
    colValue: cell.colChoiceValue,
    count: cell.count,
    percentage,
    displayValue,
    tooltip,
    isSuppressed: false,
    heatmapIntensity,
  };
}

/**
 * 4. 時間序列資料點聚合 (Temporal Timeline Aggregator - COMPLETED Only)
 */
export function aggregateResponseTimeline(
  timestamps: Date[],
  days: number = 30
): DashboardTimelinePoint[] {
  const result: Map<string, number> = new Map();
  const now = new Date();

  // 初始化連續日期區間
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const dateStr = d.toISOString().split("T")[0];
    result.set(dateStr, 0);
  }

  // 累加時間戳記
  for (const ts of timestamps) {
    const d = ts instanceof Date ? ts : new Date(ts);
    if (!isNaN(d.getTime())) {
      const dateStr = d.toISOString().split("T")[0];
      if (result.has(dateStr)) {
        result.set(dateStr, (result.get(dateStr) || 0) + 1);
      }
    }
  }

  const timeline: DashboardTimelinePoint[] = [];
  let cumulative = 0;

  for (const [date, count] of result.entries()) {
    cumulative += count;
    timeline.push({
      date,
      count,
      cumulativeCount: cumulative,
    });
  }

  return timeline;
}
