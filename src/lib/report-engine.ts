/**
 * Phase M10-D: Executive Reporting & Export Delivery Engine
 *
 * 核心不變量 (Release Invariants):
 * 1. Analytics Engine v1.0.0 Frozen: 僅消費既有 DTO，不重算 raw responses。
 * 2. Single Input Principle: 同一份 Sanitized ExecutiveReportDTO 是所有 Renderers (Web/PDF/XLSX/CSV) 的唯一輸入源。
 * 3. Export Parity & Zero Side-Channels: isSuppressed 單元格在 Excel/CSV 嚴格輸出 "*"，杜絕公式/隱藏欄洩漏。
 * 4. Audit 與 PII 分離: 審計表僅包含環境與政策 Metadata，零個人識別個資。
 */

import ExcelJS from "exceljs";
import {
  QuestionAnalyticsResult,
  ProtectedCrossTabResult,
} from "./analytics";
import { ExecutiveKPIs, AutomatedInsight } from "./dashboard-intelligence";

export const REPORT_SCHEMA_VERSION = "v1.0.0";
export const PRIVACY_POLICY_VERSION = "v1.0-suppression-k5";

export interface ReportFilterMetadata {
  timeRange: string;
  dateFrom: string | null;
  dateTo: string | null;
  status: string;
}

export interface ReportAuditMetadata {
  schemaVersion: string;
  privacyPolicyVersion: string;
  minCellSize: number;
  generatedAt: string; // ISO 8601
  isSanitized: true;
  totalSurveyQuestions: number;
  totalResponsesAnalyzed: number;
}

export interface ExecutiveReportDTO {
  schemaVersion: typeof REPORT_SCHEMA_VERSION;
  survey: {
    id: string;
    title: string;
    version: number;
    status: string;
    organizationId: string;
  };
  filter: ReportFilterMetadata;
  kpis: ExecutiveKPIs;
  insights: AutomatedInsight[];
  questions: QuestionAnalyticsResult[];
  crossTab?: ProtectedCrossTabResult | null;
  audit: ReportAuditMetadata;
}

/**
 * D1: 建立高階主管標準化報表 DTO (純函數整合)
 */
export function generateExecutiveReportDTO(params: {
  survey: {
    id: string;
    title: string;
    version: number;
    status: string;
    organizationId: string;
  };
  filter: ReportFilterMetadata;
  kpis: ExecutiveKPIs;
  insights: AutomatedInsight[];
  questions: QuestionAnalyticsResult[];
  crossTab?: ProtectedCrossTabResult | null;
}): ExecutiveReportDTO {
  const { survey, filter, kpis, insights, questions, crossTab } = params;

  return {
    schemaVersion: REPORT_SCHEMA_VERSION,
    survey,
    filter,
    kpis,
    insights,
    questions,
    crossTab: crossTab || null,
    audit: {
      schemaVersion: REPORT_SCHEMA_VERSION,
      privacyPolicyVersion: PRIVACY_POLICY_VERSION,
      minCellSize: 5,
      generatedAt: new Date().toISOString(),
      isSanitized: true,
      totalSurveyQuestions: questions.length,
      totalResponsesAnalyzed: kpis.completedResponses,
    },
  };
}

/**
 * D3: 多工作表 Excel 活頁簿產生器 (XLSX Parity with Strict Suppression)
 * 嚴格防範 Side-Channel: 隱私抑制單元格輸出純字串 "*" 或 "<5 (隱藏)"，禁止使用公式還原原始數值。
 */
export async function buildExecutiveWorkbook(report: ExecutiveReportDTO): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Survey Intelligence System";
  workbook.created = new Date(report.audit.generatedAt);

  // -------------------------------------------------------------------------
  // 工作表 1: Executive_Summary (高階主管摘要與 KPI)
  // -------------------------------------------------------------------------
  const summarySheet = workbook.addWorksheet("Executive_Summary", {
    views: [{ showGridLines: true }],
  });

  summarySheet.columns = [
    { header: "指標項目 (KPI / Dimension)", key: "metric", width: 32 },
    { header: "統計數值 (Value)", key: "value", width: 24 },
    { header: "狀態與說明 (Notes / Assessment)", key: "notes", width: 45 },
  ];

  summarySheet.addRow({
    metric: "問卷名稱 (Survey Title)",
    value: report.survey.title,
    notes: `版本: v${report.survey.version} | 狀態: ${report.survey.status}`,
  });
  summarySheet.addRow({
    metric: "總填答數 (Total Responses)",
    value: report.kpis.totalResponses,
    notes: "包含已完成與進行中填答",
  });
  summarySheet.addRow({
    metric: "有效完成數 (Completed Responses)",
    value: report.kpis.completedResponses,
    notes: "進入統計分析之有效母體",
  });
  summarySheet.addRow({
    metric: "填答完成率 (Completion Rate)",
    value: `${report.kpis.completionRate}%`,
    notes: report.kpis.completionRate < 50 ? "⚠️ 完成率偏低" : "🟢 完成率良好",
  });
  summarySheet.addRow({
    metric: "平均填答耗時 (Avg Duration)",
    value: report.kpis.averageDurationSeconds !== null ? `${report.kpis.averageDurationSeconds} 秒` : "—",
    notes: "有效填答秒數平均值",
  });
  summarySheet.addRow({
    metric: "樣本充足度 (Sample Adequacy)",
    value: report.kpis.sampleAdequacy,
    notes: report.kpis.sampleAdequacy === "ADEQUATE" ? "充足" : "⚠️ 樣本偏低，請謹慎推論",
  });

  // 加入自動化洞察條目
  summarySheet.addRow({});
  summarySheet.addRow({ metric: "【自動化關鍵洞察 (Automated Insights)】", value: "", notes: "" });
  if (report.insights.length === 0) {
    summarySheet.addRow({ metric: "無異常或特殊顯著洞察", value: "—", notes: "分佈均勻或樣本平穩" });
  } else {
    for (const insight of report.insights) {
      summarySheet.addRow({
        metric: `[${insight.severity}] ${insight.title}`,
        value: insight.metric || "—",
        notes: insight.description,
      });
    }
  }

  // -------------------------------------------------------------------------
  // 工作表 2: Question_Statistics (題目層級統計與選項分佈)
  // -------------------------------------------------------------------------
  const questionSheet = workbook.addWorksheet("Question_Statistics", {
    views: [{ showGridLines: true }],
  });

  questionSheet.columns = [
    { header: "題號 (Code)", key: "code", width: 14 },
    { header: "題目名稱 (Title)", key: "title", width: 35 },
    { header: "題型 (Type)", key: "type", width: 16 },
    { header: "有效回答數", key: "answered", width: 14 },
    { header: "回答率", key: "answerRate", width: 14 },
    { header: "選項 / 指標", key: "optionLabel", width: 28 },
    { header: "次數 / 數值", key: "countOrValue", width: 16 },
    { header: "百分比 / 分佈標籤", key: "percentageOrSignal", width: 20 },
  ];

  for (const q of report.questions) {
    if (q.distribution && q.distribution.length > 0) {
      for (const d of q.distribution) {
        questionSheet.addRow({
          code: q.code,
          title: q.title,
          type: q.type,
          answered: q.answeredCount,
          answerRate: `${q.answerRate}%`,
          optionLabel: d.label,
          countOrValue: d.count,
          percentageOrSignal: `${d.percentage}%`,
        });
      }
    } else if (q.statistics) {
      questionSheet.addRow({
        code: q.code,
        title: q.title,
        type: q.type,
        answered: q.answeredCount,
        answerRate: `${q.answerRate}%`,
        optionLabel: "平均值 (Mean) / 標準差 (SD)",
        countOrValue: `Mean: ${q.statistics.mean}`,
        percentageOrSignal: `SD: ${q.statistics.standardDeviation ?? "—"} [${q.statistics.distributionSignal ?? "NORMAL"}]`,
      });
    } else {
      questionSheet.addRow({
        code: q.code,
        title: q.title,
        type: q.type,
        answered: q.answeredCount,
        answerRate: `${q.answerRate}%`,
        optionLabel: "文字題作答統計",
        countOrValue: `${q.answeredCount} 則回答`,
        percentageOrSignal: "—",
      });
    }
  }

  // -------------------------------------------------------------------------
  // 工作表 3: CrossTab_Matrix (若有交叉分析，確保 100% 抑制一致性)
  // -------------------------------------------------------------------------
  if (report.crossTab) {
    const crossSheet = workbook.addWorksheet("CrossTab_Matrix", {
      views: [{ showGridLines: true }],
    });

    const ct = report.crossTab;
    const colHeaders = ["分組變項 (Row) \\ 目標變項 (Col)", ...ct.colItems.map((c) => c.label), "列總計 (Row Total)"];
    crossSheet.addRow(colHeaders);

    for (let rIdx = 0; rIdx < ct.rowItems.length; rIdx++) {
      const rowItem = ct.rowItems[rIdx];
      const rowCells = ct.matrix[rIdx];
      const rowValues: (string | number)[] = [rowItem.label];

      for (const cell of rowCells) {
        if (cell.isSuppressed || cell.count === null) {
          // 嚴格輸出純字串 "*"，禁止帶入真值
          rowValues.push("*");
        } else {
          rowValues.push(cell.count);
        }
      }

      // 列總計
      rowValues.push(rowItem.isSuppressed || rowItem.count === null ? "*" : rowItem.count);
      crossSheet.addRow(rowValues);
    }

    // 行總計列
    const bottomRow: (string | number)[] = ["行總計 (Col Total)"];
    for (const colItem of ct.colItems) {
      bottomRow.push(colItem.isSuppressed || colItem.count === null ? "*" : colItem.count);
    }
    bottomRow.push(ct.privacy.hasSuppression && ct.grandTotal === null ? "*" : (ct.grandTotal ?? "*"));
    crossSheet.addRow(bottomRow);

    // 卡方統計檢定列
    if (ct.statistics) {
      crossSheet.addRow({});
      crossSheet.addRow(["【卡方獨立性檢定統計資訊 (Chi-Square Test)】"]);
      crossSheet.addRow(["卡方統計量 χ²", ct.statistics.chiSquare ?? "—"]);
      crossSheet.addRow(["自由度 df", ct.statistics.degreesOfFreedom]);
      crossSheet.addRow(["p 值 (p-value)", ct.statistics.pValue !== null ? ct.statistics.pValue.toFixed(4) : "—"]);
      crossSheet.addRow(["Cramer's V 關聯強度", ct.statistics.cramersV !== null ? ct.statistics.cramersV.toFixed(3) : "—"]);
      crossSheet.addRow(["檢定有效性判定", ct.statistics.isTestValid ? "有效" : `無效 (${ct.statistics.warning || "期望值過低"})`]);
    }
  }

  // -------------------------------------------------------------------------
  // 工作表 4: Audit_Metadata (審計與政策，零 PII)
  // -------------------------------------------------------------------------
  const auditSheet = workbook.addWorksheet("Audit_Metadata", {
    views: [{ showGridLines: true }],
  });

  auditSheet.columns = [
    { header: "審計項目 (Audit Key)", key: "key", width: 28 },
    { header: "審計值 (Audit Value)", key: "val", width: 50 },
  ];

  auditSheet.addRow({ key: "報表資料綱要版號 (Schema Version)", val: report.audit.schemaVersion });
  auditSheet.addRow({ key: "隱私政策版號 (Privacy Policy)", val: report.audit.privacyPolicyVersion });
  auditSheet.addRow({ key: "單元格最小揭露門檻 (Min Cell Size)", val: `${report.audit.minCellSize} (小於此值強制遮蔽)` });
  auditSheet.addRow({ key: "產出時間 (Generated At UTC)", val: report.audit.generatedAt });
  auditSheet.addRow({ key: "篩選時間區間 (Time Range)", val: report.filter.timeRange });
  auditSheet.addRow({ key: "分析狀態邊界 (Status Boundary)", val: report.filter.status });
  auditSheet.addRow({ key: "個資防護等級 (PII Protection)", val: "100% De-identified (Zero Individual Identifiers)" });

  return workbook;
}

/**
 * D3: 標準 CSV 摘要匯出產生器 (RFC4180 with Suppression Parity)
 */
export function buildExecutiveCsv(report: ExecutiveReportDTO): string {
  const rows: string[][] = [];

  const escapeCsv = (val: any): string => {
    if (val === null || val === undefined) return '""';
    const str = String(val).replace(/"/g, '""');
    return `"${str}"`;
  };

  // 1. Executive Summary Section
  rows.push(["# EXECUTIVE SUMMARY REPORT", report.survey.title]);
  rows.push(["Schema Version", report.schemaVersion]);
  rows.push(["Generated At", report.audit.generatedAt]);
  rows.push(["Total Responses", String(report.kpis.totalResponses)]);
  rows.push(["Completed Responses", String(report.kpis.completedResponses)]);
  rows.push(["Completion Rate", `${report.kpis.completionRate}%`]);
  rows.push(["Sample Adequacy", report.kpis.sampleAdequacy]);
  rows.push([]);

  // 2. Automated Insights
  rows.push(["# AUTOMATED INSIGHTS"]);
  rows.push(["Type", "Severity", "Title", "Metric", "Description"]);
  for (const i of report.insights) {
    rows.push([i.type, i.severity, i.title, i.metric || "", i.description]);
  }
  rows.push([]);

  // 3. Question Statistics
  rows.push(["# QUESTION LEVEL DISTRIBUTIONS"]);
  rows.push(["Question Code", "Question Title", "Option / Metric", "Count", "Percentage"]);
  for (const q of report.questions) {
    if (q.distribution && q.distribution.length > 0) {
      for (const d of q.distribution) {
        rows.push([q.code, q.title, d.label, String(d.count), `${d.percentage}%`]);
      }
    } else if (q.statistics) {
      rows.push([
        q.code,
        q.title,
        "Mean / SD",
        `Mean=${q.statistics.mean}`,
        `SD=${q.statistics.standardDeviation ?? "—"}`,
      ]);
    }
  }

  return rows.map((r) => r.map(escapeCsv).join(",")).join("\n");
}
