"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  BarChart3,
  FileSpreadsheet,
  Users,
  Award,
  Percent,
  ArrowLeft,
  MessageSquare,
  Sparkles,
  HelpCircle,
  TrendingUp,
  Activity,
  CheckCircle2,
  AlertCircle,
  TableProperties,
  Layers,
  ShieldCheck,
  CheckCircle,
  Clock,
  PieChart,
  Hash,
  FileText,
  Filter,
  Printer,
  Loader2,
  ArrowLeftRight,
  Flame,
  Eye,
  Info,
} from "lucide-react";

interface ChoiceDistribution {
  choiceId: string;
  label: string;
  value: string;
  orderNum: number;
  count: number;
  percentage: number;
  score: number | null;
  scoreEnabled: boolean;
}

interface QuestionStatistics {
  n: number;
  count: number;
  mean: number;
  median: number;
  min: number;
  max: number;
  standardDeviation: number | null;
  distributionSignal?: "NORMAL" | "POLARIZED";
}

interface QuestionAnalyticsItem {
  questionId: string;
  code: string;
  orderNum: number;
  title: string;
  description: string | null;
  type: string;
  required: boolean;
  scoringEnabled: boolean;
  totalResponses: number;
  answeredCount: number;
  unansweredCount: number;
  answerRate: number;
  unansweredRate: number;
  distribution: ChoiceDistribution[] | null;
  optionDistribution?: ChoiceDistribution[] | null;
  statistics: QuestionStatistics | null;
}

interface AnalyticsSummary {
  totalResponses: number;
  completedResponses: number;
  inProgressResponses: number;
  questionCount: number;
}

interface AnalyticsData {
  survey: {
    id: string;
    title: string;
    version: number;
    organizationId: string;
  };
  filter: {
    timeRange: string;
    dateFrom: string | null;
    dateTo: string | null;
    status: string;
  };
  summary: AnalyticsSummary;
  questions: QuestionAnalyticsItem[];
}

interface CrosstabData {
  success?: boolean;
  survey?: {
    id: string;
    title: string;
    version: number;
    organizationId: string;
    isAnonymous: boolean;
  };
  filter?: {
    timeRange: string;
    dateFrom: string | null;
    dateTo: string | null;
    status: string;
  };
  result?: {
    rowQuestion: { id: string; code: string; title: string; questionType: string };
    colQuestion: { id: string; code: string; title: string; questionType: string };
    rowItems: { value: string; label: string; count: number | null; displayValue: string; isSuppressed: boolean }[];
    colItems: { value: string; label: string; count: number | null; displayValue: string; isSuppressed: boolean }[];
    matrix: {
      rowValue: string;
      colValue: string;
      count: number | null;
      displayValue: string;
      isSuppressed: boolean;
      suppressionReason?: "PRIMARY" | "COMPLEMENTARY";
      rowPercentage: number | null;
      colPercentage: number | null;
      totalPercentage: number | null;
    }[][];
    grandTotal: number | null;
    grandTotalDisplay: string;
    totalResponses: number;
    unpairedCount: number;
    statistics: {
      sampleSize: number;
      degreesOfFreedom: number;
      chiSquare: number | null;
      pValue: number | null;
      cramersV: number | null;
      expectedCountWarning: boolean;
      isSignificant: boolean | null;
      warning: string | null;
    } | null;
    privacy: {
      minCellSize: number;
      totalSuppressedCells: number;
      primarySuppressedCount: number;
      complementarySuppressedCount: number;
      hasSuppression: boolean;
      isGrandTotalSuppressed: boolean;
    };
    hasSuppression: boolean;
    privacyNotice: string;
    statisticsDisplayable: boolean;
  };
  surveyId: string;
  surveyTitle: string;
  minCellSize: number;
  validPopulation: number;
  bothAnsweredCount?: number;
  totalSurveyResponses: number;
  dimensionA: {
    questionId: string;
    code: string;
    title: string;
    type?: string;
    totalAnswered?: number;
    notAnsweredCount?: number;
    options: { choiceId: string; label: string; value: string }[];
  };
  dimensionB: {
    questionId: string;
    code: string;
    title: string;
    type?: string;
    totalAnswered?: number;
    notAnsweredCount?: number;
    options: { choiceId: string; label: string; value: string }[];
  };
  rows: {
    rowChoiceId: string;
    rowLabel: string;
    rowTotalAnswered: number | null;
    isRowTotalSuppressed: boolean;
    cells: {
      colChoiceId: string;
      colLabel: string;
      count: number | null;
      displayValue?: string;
      rowPercentage: number | null;
      columnPercentage: number | null;
      totalPercentage: number | null;
      isSuppressed: boolean;
    }[];
  }[];
  columnTotals: {
    colChoiceId: string;
    colLabel: string;
    totalAnswered: number | null;
    isColumnTotalSuppressed: boolean;
  }[];
}

const QUESTION_TYPE_LABELS: Record<string, { label: string; bg: string; text: string }> = {
  single_choice: { label: "單選題", bg: "bg-blue-50 border-blue-200/60", text: "text-blue-700" },
  multiple_choice: { label: "多選題", bg: "bg-indigo-50 border-indigo-200/60", text: "text-indigo-700" },
  yes_no: { label: "是非題", bg: "bg-emerald-50 border-emerald-200/60", text: "text-emerald-700" },
  number: { label: "數值題", bg: "bg-amber-50 border-amber-200/60", text: "text-amber-700" },
  text: { label: "問答題", bg: "bg-slate-100 border-slate-200/60", text: "text-slate-700" },
  info: { label: "引導頁", bg: "bg-purple-50 border-purple-200/60", text: "text-purple-700" },
};

export default function SurveyStatsPage() {
  const params = useParams();
  const id = params.id as string;

  const [activeTab, setActiveTab] = useState<"questions" | "crosstab">("questions");
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<"all" | "today" | "7d" | "30d">("all");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "COMPLETED" | "IN_PROGRESS">("ALL");

  // Crosstab State
  const [qAId, setQAId] = useState<string>("");
  const [qBId, setQBId] = useState<string>("");
  const [pctMode, setPctMode] = useState<"row" | "col" | "total">("row");
  const [displayFormat, setDisplayFormat] = useState<"both" | "count" | "percent">("both");
  const [heatmapEnabled, setHeatmapEnabled] = useState<boolean>(true);
  const [crosstabData, setCrosstabData] = useState<CrosstabData | null>(null);
  const [crosstabLoading, setCrosstabLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  const handleExportExcel = async () => {
    try {
      setExporting(true);
      const res = await fetch(
        `/api/surveys/${id}/export?timeRange=${timeRange}&status=${statusFilter}`
      );
      if (!res.ok) {
        throw new Error("匯出失敗");
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const sanitizedTitle = data?.survey.title.replace(/[\s/\\?%*:|"<>]/g, "_") || "survey";
      a.download = `survey_${sanitizedTitle}_v${data?.survey.version || 1}_${statusFilter}_${timeRange}_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error("Export error:", err);
      alert("匯出 Excel 報表失敗，請確認權限或稍後再試。");
    } finally {
      setExporting(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  useEffect(() => {
    async function fetchStats() {
      try {
        setLoading(true);
        const res = await fetch(
          `/api/surveys/${id}/analytics/questions?timeRange=${timeRange}&status=${statusFilter}`
        );
        const json = await res.json();
        if (json.survey) {
          setData(json);
          // 預設選取前兩題作為交叉分析
          if (json.questions && json.questions.length >= 2) {
            setQAId((prev) => prev || json.questions[0].questionId);
            setQBId((prev) => prev || json.questions[1].questionId);
          }
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    if (id) fetchStats();
  }, [id, timeRange, statusFilter]);

  useEffect(() => {
    async function fetchCrosstab() {
      if (!qAId || !qBId || qAId === qBId) return;
      try {
        setCrosstabLoading(true);
        const res = await fetch(
          `/api/surveys/${id}/analytics/crosstab?rowQuestionId=${qAId}&colQuestionId=${qBId}&timeRange=${timeRange}&status=${statusFilter}`
        );
        const json = await res.json();
        if (res.ok) {
          setCrosstabData(json);
        } else {
          setCrosstabData(null);
        }
      } catch (e) {
        console.error(e);
        setCrosstabData(null);
      } finally {
        setCrosstabLoading(false);
      }
    }
    if (activeTab === "crosstab") {
      fetchCrosstab();
    }
  }, [id, activeTab, qAId, qBId, timeRange, statusFilter]);

  if (loading && !data) {
    return (
      <div className="p-16 text-center text-slate-500 bg-white rounded-2xl border border-slate-200 shadow-xs max-w-5xl mx-auto my-8">
        <div className="animate-spin w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full mx-auto mb-3" />
        <p className="text-sm font-medium text-slate-600">載入問卷統計分析資料中...</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-16 text-center text-slate-500 bg-white rounded-2xl border border-slate-200 shadow-xs max-w-5xl mx-auto my-8">
        找不到該問卷統計資料或您無權查看。
      </div>
    );
  }

  const { survey, summary, questions } = data;
  const total = summary.totalResponses || 0;
  const completed = summary.completedResponses || 0;
  const inProgress = summary.inProgressResponses || 0;
  const completionRate = total > 0 ? Math.round((completed / total) * 1000) / 10 : 0;

  const statusLabel =
    statusFilter === "COMPLETED" ? "已完成" : statusFilter === "IN_PROGRESS" ? "填寫中" : "全部作答";
  const timeRangeLabel =
    timeRange === "today" ? "今日" : timeRange === "7d" ? "近 7 日" : timeRange === "30d" ? "近 30 日" : "全時段";

  return (
    <div className="space-y-8 max-w-5xl mx-auto py-6 px-4">
      {/* Print-Only Executive Header */}
      <div className="print-only mb-6 p-4 border-b-2 border-slate-900 bg-white">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-black text-slate-900">{survey.title}</h1>
            <p className="text-xs text-slate-600 mt-1">
              問卷版本: v{survey.version} | 企業級統計分析與指標報表
            </p>
          </div>
          <div className="text-right text-xs text-slate-600 space-y-0.5">
            <div>列印時間：{new Date().toLocaleString("zh-TW")}</div>
            <div>篩選狀態：{statusLabel}</div>
            <div>時間維度：{timeRangeLabel}</div>
          </div>
        </div>
      </div>

      {/* Top Header (Web View) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 no-print">
        <div>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-blue-600 mb-2 transition font-medium"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>返回問卷工作區</span>
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              {survey.title}
            </h1>
            <span className="text-xs font-mono font-bold px-2.5 py-0.5 bg-slate-100 text-slate-700 rounded-md border border-slate-200">
              v{survey.version}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Enterprise Survey Analytics & Intelligence（單題作答指標與雙題交叉分析）
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            onClick={handlePrint}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition shadow-2xs"
            title="列印或另存為 PDF 報表"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>列印報表</span>
          </button>
          <button
            onClick={handleExportExcel}
            disabled={exporting}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white text-xs font-bold rounded-xl shadow-xs transition"
            title="匯出包含當前篩選條件之多工作表 Excel 報表"
          >
            {exporting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <FileSpreadsheet className="w-3.5 h-3.5" />
            )}
            <span>{exporting ? "匯出中..." : "匯出 Excel (套用目前篩選)"}</span>
          </button>
          <Link
            href={`/surveys/${id}/fill`}
            className="px-3.5 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold rounded-xl transition"
          >
            前往填答
          </Link>
        </div>
      </div>

      {/* Survey Overview KPI Cards (Layer 1) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 page-break-inside-avoid">
        {/* Total Responses */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-xs space-y-1">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>總填答數 (Total)</span>
            <Users className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-2xl font-black text-slate-900">{total.toLocaleString()}</div>
          <div className="text-[11px] text-slate-400">符合篩選條件之母體</div>
        </div>

        {/* Completed Responses */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-xs space-y-1">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>已完成 (Completed)</span>
            <CheckCircle className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-black text-emerald-600">{completed.toLocaleString()}</div>
          <div className="text-[11px] text-slate-400">已完整提交問卷</div>
        </div>

        {/* In Progress */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-xs space-y-1">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>填寫中 (In Progress)</span>
            <Clock className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-black text-amber-600">{inProgress.toLocaleString()}</div>
          <div className="text-[11px] text-slate-400">草稿暫存階段</div>
        </div>

        {/* Completion Rate */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-xs space-y-1">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>完成率 (Rate)</span>
            <Percent className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="text-2xl font-black text-indigo-600">{completionRate}%</div>
          <div className="text-[11px] text-slate-400">已完成佔比</div>
        </div>
      </div>

      {/* Tabs & Multi-Dimensional Filter Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs no-print">
        {/* Navigation Tabs */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab("questions")}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl transition ${
              activeTab === "questions"
                ? "bg-blue-50 text-blue-700 border border-blue-200/60 shadow-xs"
                : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            <span>單題作答分析 (Item Analytics)</span>
          </button>
          <button
            onClick={() => setActiveTab("crosstab")}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl transition ${
              activeTab === "crosstab"
                ? "bg-indigo-50 text-indigo-700 border border-indigo-200/60 shadow-xs"
                : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            <TableProperties className="w-4 h-4" />
            <span>交叉分析 (2-Way Cross-tab)</span>
          </button>
        </div>

        {/* Filters: Status & Time Range */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Status Filter */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
            {(
              [
                { key: "ALL", label: "全部作答" },
                { key: "COMPLETED", label: "已完成" },
                { key: "IN_PROGRESS", label: "填寫中" },
              ] as const
            ).map((s) => (
              <button
                key={s.key}
                onClick={() => setStatusFilter(s.key)}
                className={`px-3 py-1 text-xs font-semibold rounded-lg transition ${
                  statusFilter === s.key
                    ? "bg-white text-slate-900 shadow-xs font-bold"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>

          {/* Time Range Selector */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
            {(
              [
                { key: "all", label: "全時段" },
                { key: "30d", label: "近 30 日" },
                { key: "7d", label: "近 7 日" },
                { key: "today", label: "今日" },
              ] as const
            ).map((t) => (
              <button
                key={t.key}
                onClick={() => setTimeRange(t.key)}
                className={`px-3 py-1 text-xs font-semibold rounded-lg transition ${
                  timeRange === t.key
                    ? "bg-white text-blue-700 shadow-xs font-bold"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* TAB 1: Question-level Item Analytics */}
      {activeTab === "questions" && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Activity className="w-4 h-4 text-blue-600" />
              <span>題目作答率、選項分佈與離散指標 (共 {questions.length} 題)</span>
            </h2>
            <span className="text-xs text-slate-500 font-medium">
              * 選項百分比分母為該題「有效作答數」
            </span>
          </div>

          {questions.length === 0 ? (
            <div className="p-12 text-center text-slate-400 bg-white rounded-2xl border border-slate-200 text-xs">
              此問卷尚未建立任何題目
            </div>
          ) : (
            questions.map((q) => {
              const typeMeta = QUESTION_TYPE_LABELS[q.type] || {
                label: q.type,
                bg: "bg-slate-100 border-slate-200",
                text: "text-slate-700",
              };
              const isPolarized = q.statistics?.distributionSignal === "POLARIZED";

              return (
                <div
                  key={q.questionId}
                  className="bg-white rounded-2xl border border-slate-200/90 p-6 shadow-xs space-y-5 page-break-inside-avoid"
                >
                  {/* Question Header */}
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 border-b border-slate-100 pb-4">
                    <div className="space-y-1.5 max-w-2xl">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-mono font-bold px-2 py-0.5 bg-slate-900 text-white rounded-md">
                          {q.code}
                        </span>
                        <span
                          className={`text-[11px] font-semibold px-2 py-0.5 rounded-md border ${typeMeta.bg} ${typeMeta.text}`}
                        >
                          {typeMeta.label}
                        </span>
                        {q.required && (
                          <span className="text-[10px] font-semibold text-red-600 bg-red-50 px-1.5 py-0.5 rounded border border-red-200/60">
                            必填
                          </span>
                        )}
                        {isPolarized && (
                          <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200 flex items-center gap-1">
                            <Sparkles className="w-3 h-3 text-amber-600" />
                            分佈兩極化 (Heuristic Signal)
                          </span>
                        )}
                        <h3 className="font-bold text-slate-900 text-base">{q.title}</h3>
                      </div>
                      {q.description && (
                        <p className="text-xs text-slate-500 pl-0.5">{q.description}</p>
                      )}
                    </div>

                    {/* Answered / Unanswered Rate Indicator */}
                    <div className="flex items-center gap-3 shrink-0 text-xs">
                      <div className="bg-slate-50 px-3.5 py-2 rounded-xl border border-slate-200/70 flex items-center gap-3">
                        <div>
                          <span className="text-slate-500 mr-1">有效作答:</span>
                          <strong className="text-blue-700 font-black">{q.answeredCount}</strong>
                          <span className="text-slate-400 font-mono ml-1">({q.answerRate}%)</span>
                        </div>
                        <span className="text-slate-200">|</span>
                        <div>
                          <span className="text-slate-500 mr-1">未作答:</span>
                          <strong className="text-slate-700 font-bold">{q.unansweredCount}</strong>
                          <span className="text-slate-400 font-mono ml-1">({q.unansweredRate}%)</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Multiple Choice Disclaimer */}
                  {q.type === "multiple_choice" && (
                    <div className="bg-indigo-50/70 border border-indigo-100 rounded-xl px-3.5 py-2 text-[11px] text-indigo-700 flex items-center gap-1.5 font-medium">
                      <HelpCircle className="w-3.5 h-3.5 shrink-0 text-indigo-600" />
                      <span>
                        多選題各選項百分比以有效填答人數為分母計算，各項佔比總和可能大於 100% (Percentages may total more than 100%)。
                      </span>
                    </div>
                  )}

                  {/* Rating / Numeric Descriptive Statistics Card */}
                  {q.statistics && (
                    <div className="bg-gradient-to-r from-purple-50/70 to-indigo-50/60 border border-purple-100 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
                      <div className="flex items-center gap-2 text-xs font-bold text-purple-900">
                        <Sparkles className="w-4 h-4 text-purple-600" />
                        <span>數值與評分統計 (有效樣本 N = {q.statistics.n})</span>
                      </div>

                      <div className="flex flex-wrap items-center gap-5 text-xs">
                        <div className="text-slate-700">
                          平均數 (Mean)：
                          <strong className="text-purple-900 font-black text-sm ml-1">
                            {q.statistics.mean}
                          </strong>
                        </div>
                        <div className="text-slate-700">
                          中位數 (Median)：
                          <strong className="text-blue-900 font-bold ml-1">
                            {q.statistics.median}
                          </strong>
                        </div>
                        <div className="text-slate-700">
                          極值區間：
                          <strong className="text-slate-900 font-mono ml-1">
                            [{q.statistics.min}, {q.statistics.max}]
                          </strong>
                        </div>
                        <div className="text-slate-700">
                          樣本標準差 (s)：
                          <strong className="text-indigo-900 font-bold ml-1">
                            {q.statistics.standardDeviation !== null
                              ? q.statistics.standardDeviation
                              : "無 (N < 2)"}
                          </strong>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Option Distribution Bars */}
                  {q.distribution && q.distribution.length > 0 && (
                    <div className="space-y-3 pt-1">
                      {q.distribution.map((c) => (
                        <div key={c.choiceId} className="space-y-1.5">
                          <div className="flex items-center justify-between text-xs font-medium">
                            <div className="flex items-center gap-2">
                              <span className="text-slate-800 font-semibold">{c.label}</span>
                              {c.scoreEnabled && (
                                <span className="text-indigo-600 font-bold text-[11px] bg-indigo-50 px-1.5 py-0.2 rounded border border-indigo-100">
                                  {c.score !== null ? `${c.score} 分` : "不計分"}
                                </span>
                              )}
                            </div>
                            <div className="text-slate-500 font-mono text-xs">
                              {c.count} 次 (<strong className="text-slate-900 font-bold">{c.percentage}%</strong>)
                            </div>
                          </div>
                          <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                            <div
                              className="bg-gradient-to-r from-blue-500 to-indigo-600 h-full rounded-full transition-all duration-500"
                              style={{ width: `${Math.min(100, c.percentage)}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Text Question Hint */}
                  {q.type === "text" && (
                    <div className="bg-slate-50 border border-slate-200/70 rounded-xl p-4 text-xs text-slate-500 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-slate-400" />
                        <span>問答題提供作答率與未填率統計，零假造 NLP / AI 數據。</span>
                      </div>
                      <span className="font-semibold text-slate-700">
                        有效回覆共 {q.answeredCount} 筆
                      </span>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* TAB 2: Cross-tabulation */}
      {activeTab === "crosstab" && (
        <div className="space-y-6">
          {/* Dimension Selector Card */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-indigo-600" />
                <h3 className="font-bold text-slate-900 text-sm">2-Way 雙題目交叉分析變項設定</h3>
              </div>
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200/60">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                <span>已啟用最小單元遮蔽保護 (Min Cell Size = 5)</span>
              </div>
            </div>

            <div className="flex flex-col md:flex-row items-center gap-3">
              <div className="flex-1 w-full">
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  分組變項 (Row Dimension A)：
                </label>
                <select
                  value={qAId}
                  onChange={(e) => setQAId(e.target.value)}
                  className="w-full text-xs font-semibold p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                >
                  {questions.map((q) => (
                    <option key={q.questionId} value={q.questionId}>
                      [{q.code}] {q.title} ({QUESTION_TYPE_LABELS[q.type]?.label || q.type})
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                onClick={() => {
                  const temp = qAId;
                  setQAId(qBId);
                  setQBId(temp);
                }}
                className="mt-5 md:mt-5 p-2.5 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 border border-slate-200 rounded-xl transition flex items-center justify-center text-slate-700 shadow-2xs"
                title="對調分組變項與目標變項"
              >
                <ArrowLeftRight className="w-4 h-4" />
              </button>

              <div className="flex-1 w-full">
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  目標變項 (Column Dimension B)：
                </label>
                <select
                  value={qBId}
                  onChange={(e) => setQBId(e.target.value)}
                  className="w-full text-xs font-semibold p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                >
                  {questions.map((q) => (
                    <option key={q.questionId} value={q.questionId}>
                      [{q.code}] {q.title} ({QUESTION_TYPE_LABELS[q.type]?.label || q.type})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {qAId === qBId && (
              <p className="text-xs text-amber-600 font-semibold bg-amber-50 p-2.5 rounded-xl border border-amber-200 flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 text-amber-500" />
                <span>請選擇兩個不同的題目進行交叉分析。</span>
              </p>
            )}
          </div>

          {/* Crosstab Matrix Table & Statistical Box */}
          {crosstabLoading ? (
            <div className="p-16 text-center text-slate-500 bg-white rounded-2xl border border-slate-200 shadow-xs">
              <div className="animate-spin w-7 h-7 border-3 border-indigo-600 border-t-transparent rounded-full mx-auto mb-3" />
              <p className="text-sm font-semibold text-slate-700">正在運算交叉分群矩陣與推論統計檢定...</p>
            </div>
          ) : !crosstabData ? (
            <div className="p-12 text-center text-slate-400 bg-white rounded-2xl border border-slate-200 text-xs">
              尚未產生交叉分析資料，請先設定兩組相異題目。
            </div>
          ) : (
            <div className="space-y-6">
              {/* Statistical Significance Panel (Phase M9-F.2 Integration) */}
              {(() => {
                const stats = crosstabData.result?.statistics;
                const privacy = crosstabData.result?.privacy;
                const isMultiple =
                  crosstabData.result?.rowQuestion.questionType === "multiple_choice" ||
                  crosstabData.result?.colQuestion.questionType === "multiple_choice";

                if (isMultiple) {
                  return (
                    <div className="bg-linear-to-r from-slate-900 to-indigo-950 text-white p-5 rounded-2xl shadow-xs border border-slate-800 space-y-2">
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-indigo-400" />
                        <h4 className="font-bold text-sm text-slate-100">推論統計與關聯性檢定說明</h4>
                      </div>
                      <p className="text-xs text-slate-300 leading-relaxed">
                        💡 複選題提示：選取的題目包含複選選項，受訪者可能同時落入多個單元格（非互斥觀測值）。系統已依統計學界標準維持描述性交叉矩陣分析，未套用一般皮爾森卡方獨立性檢定。
                      </p>
                    </div>
                  );
                }

                if (!stats || crosstabData.result?.statisticsDisplayable === false) {
                  return (
                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 text-xs text-slate-600 flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-slate-400" />
                      <span>
                        🔒 隱私與樣本保護：有效作答母體樣本數小於 5，依去識別化安全政策不顯示推論統計指標。
                      </span>
                    </div>
                  );
                }

                return (
                  <div className="bg-linear-to-br from-slate-900 to-indigo-950 text-white p-5 rounded-2xl shadow-xs border border-slate-800 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-indigo-400" />
                        <h4 className="font-bold text-sm text-slate-100">
                          推論統計與獨立性檢定 (Inference & Significance)
                        </h4>
                      </div>
                      {stats.isSignificant !== null && (
                        <span
                          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${
                            stats.isSignificant
                              ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                              : "bg-slate-800 text-slate-400 border border-slate-700"
                          }`}
                        >
                          {stats.isSignificant ? (
                            <>
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                              <span>達到統計顯著性 (p &lt; 0.05)</span>
                            </>
                          ) : (
                            <>
                              <AlertCircle className="w-3.5 h-3.5 text-slate-400" />
                              <span>未達統計顯著 (p ≥ 0.05)</span>
                            </>
                          )}
                        </span>
                      )}
                    </div>

                    {stats.warning && (
                      <div className="text-xs bg-amber-500/15 border border-amber-500/30 text-amber-200 p-2.5 rounded-xl flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                        <span>{stats.warning}</span>
                      </div>
                    )}

                    {stats.chiSquare !== null ? (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="bg-slate-800/60 border border-slate-700/60 p-3 rounded-xl">
                          <div className="text-[11px] text-slate-400 font-medium">卡方統計值 (χ²)</div>
                          <div className="text-lg font-black text-white font-mono mt-0.5">
                            {stats.chiSquare.toFixed(2)}
                          </div>
                        </div>
                        <div className="bg-slate-800/60 border border-slate-700/60 p-3 rounded-xl">
                          <div className="text-[11px] text-slate-400 font-medium">自由度 (df)</div>
                          <div className="text-lg font-black text-white font-mono mt-0.5">
                            {stats.degreesOfFreedom}
                          </div>
                        </div>
                        <div className="bg-slate-800/60 border border-slate-700/60 p-3 rounded-xl">
                          <div className="text-[11px] text-slate-400 font-medium">顯著性 (p-value)</div>
                          <div className="text-lg font-black text-indigo-300 font-mono mt-0.5">
                            {stats.pValue !== null
                              ? stats.pValue < 0.001
                                ? "< 0.001"
                                : stats.pValue.toFixed(3)
                              : "—"}
                          </div>
                        </div>
                        <div className="bg-slate-800/60 border border-slate-700/60 p-3 rounded-xl">
                          <div className="text-[11px] text-slate-400 font-medium">Cramér&apos;s V 關聯強度</div>
                          <div className="text-lg font-black text-emerald-300 font-mono mt-0.5">
                            {stats.cramersV !== null ? (
                              <span>
                                {stats.cramersV.toFixed(2)}{" "}
                                <span className="text-xs text-slate-300 font-normal">
                                  (
                                  {stats.cramersV < 0.1
                                    ? "極微"
                                    : stats.cramersV < 0.3
                                    ? "弱相關"
                                    : stats.cramersV < 0.5
                                    ? "中等相關"
                                    : "強相關"}
                                  )
                                </span>
                              </span>
                            ) : (
                              "—"
                            )}
                          </div>
                        </div>
                      </div>
                    ) : null}

                    {stats.expectedCountWarning && (
                      <div className="text-[11px] text-amber-300/90 flex items-center gap-1.5 bg-amber-950/40 p-2 rounded-lg border border-amber-800/40">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0 text-amber-400" />
                        <span>
                          Cochran 檢定條件警示：部分儲存格之期望次數小於 5，卡方檢定近似值可能偏誤，建議謹慎解讀。
                        </span>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Matrix Control Bar & Heatmap Table */}
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100">
                  {/* Sample Counts Summary */}
                  <div className="text-xs text-slate-600 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-800">雙題有效作答樣本 (Valid N)：</span>
                      <strong className="text-indigo-700 font-bold text-sm">
                        {crosstabData.result?.grandTotalDisplay || crosstabData.validPopulation} 人
                      </strong>
                    </div>
                    <div className="text-slate-400 text-[11px] flex items-center gap-3">
                      <span>總回應：{crosstabData.totalSurveyResponses} 筆</span>
                      {crosstabData.result?.unpairedCount !== undefined && (
                        <span>單題未作答：{crosstabData.result.unpairedCount} 筆 (已排除)</span>
                      )}
                    </div>
                  </div>

                  {/* Controls: Percentage Mode, Display Format, Heatmap Toggle, Export */}
                  <div className="flex flex-wrap items-center gap-2.5">
                    {/* Percentage Denominator Mode */}
                    <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
                      <button
                        onClick={() => setPctMode("row")}
                        className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition ${
                          pctMode === "row"
                            ? "bg-white text-indigo-700 shadow-2xs"
                            : "text-slate-600 hover:text-slate-900"
                        }`}
                      >
                        列百分比 (Row %)
                      </button>
                      <button
                        onClick={() => setPctMode("col")}
                        className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition ${
                          pctMode === "col"
                            ? "bg-white text-indigo-700 shadow-2xs"
                            : "text-slate-600 hover:text-slate-900"
                        }`}
                      >
                        行百分比 (Col %)
                      </button>
                      <button
                        onClick={() => setPctMode("total")}
                        className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition ${
                          pctMode === "total"
                            ? "bg-white text-indigo-700 shadow-2xs"
                            : "text-slate-600 hover:text-slate-900"
                        }`}
                      >
                        總百分比 (Total %)
                      </button>
                    </div>

                    {/* Display Format: Both / Count / Percent */}
                    <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
                      <button
                        onClick={() => setDisplayFormat("both")}
                        className={`px-2 py-1 text-xs font-semibold rounded-lg transition ${
                          displayFormat === "both"
                            ? "bg-white text-slate-900 shadow-2xs"
                            : "text-slate-500 hover:text-slate-900"
                        }`}
                        title="顯示次數與百分比"
                      >
                        次數 + %
                      </button>
                      <button
                        onClick={() => setDisplayFormat("count")}
                        className={`px-2 py-1 text-xs font-semibold rounded-lg transition ${
                          displayFormat === "count"
                            ? "bg-white text-slate-900 shadow-2xs"
                            : "text-slate-500 hover:text-slate-900"
                        }`}
                        title="僅顯示次數"
                      >
                        純次數
                      </button>
                      <button
                        onClick={() => setDisplayFormat("percent")}
                        className={`px-2 py-1 text-xs font-semibold rounded-lg transition ${
                          displayFormat === "percent"
                            ? "bg-white text-slate-900 shadow-2xs"
                            : "text-slate-500 hover:text-slate-900"
                        }`}
                        title="僅顯示百分比"
                      >
                        純 %
                      </button>
                    </div>

                    {/* Heatmap Toggle */}
                    <button
                      onClick={() => setHeatmapEnabled(!heatmapEnabled)}
                      className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-xl border transition ${
                        heatmapEnabled
                          ? "bg-indigo-50 border-indigo-200 text-indigo-700"
                          : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                      }`}
                      title="切換熱力圖色彩深度"
                    >
                      <Flame className="w-3.5 h-3.5" />
                      <span>熱力圖</span>
                    </button>

                    {/* Export Button */}
                    <a
                      href={`/api/surveys/${id}/analytics/crosstab/export?questionA=${qAId}&questionB=${qBId}`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-2xs transition"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5" />
                      <span>匯出交叉表</span>
                    </a>
                  </div>
                </div>

                {/* Responsive Matrix Grid with Safe Heatmap Shading */}
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-100/80 text-slate-700 border-b border-slate-200">
                        <th className="p-3.5 font-bold border-r border-slate-200 bg-slate-100">
                          {crosstabData.result?.rowQuestion.code || crosstabData.dimensionA.code} \
                          {crosstabData.result?.colQuestion.code || crosstabData.dimensionB.code}
                        </th>
                        {(crosstabData.result?.colItems || crosstabData.dimensionB.options).map((opt: any) => (
                          <th
                            key={opt.value || opt.choiceId}
                            className="p-3.5 font-bold text-center border-r border-slate-200 min-w-[90px]"
                          >
                            <div className="text-slate-900">{opt.label}</div>
                            {opt.displayValue !== undefined && (
                              <div className="text-[10px] text-slate-400 font-normal font-mono">
                                (n = {opt.displayValue})
                              </div>
                            )}
                          </th>
                        ))}
                        <th className="p-3.5 font-bold text-center bg-slate-200/60 text-slate-900 min-w-[90px]">
                          合計 (Row Total)
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {crosstabData.rows.map((row, rIdx) => (
                        <tr key={row.rowChoiceId} className="border-b border-slate-200/70 hover:bg-slate-50/40">
                          <td className="p-3.5 font-semibold text-slate-800 bg-slate-50/70 border-r border-slate-200">
                            <div>{row.rowLabel}</div>
                            {crosstabData.result?.rowItems[rIdx]?.displayValue !== undefined && (
                              <div className="text-[10px] text-slate-400 font-normal font-mono">
                                (n = {crosstabData.result.rowItems[rIdx].displayValue})
                              </div>
                            )}
                          </td>
                          {row.cells.map((cell, cIdx) => {
                            const resultCell = crosstabData.result?.matrix[rIdx]?.[cIdx];
                            const isSuppressed = cell.isSuppressed || resultCell?.isSuppressed || false;
                            const pct =
                              pctMode === "row"
                                ? cell.rowPercentage
                                : pctMode === "col"
                                ? cell.columnPercentage
                                : cell.totalPercentage;

                            // Heatmap styling calculation: suppressed cells are strictly neutral!
                            let bgClass = "bg-white text-slate-900";
                            if (isSuppressed) {
                              bgClass = "bg-slate-100/90 text-slate-500 font-mono";
                            } else if (heatmapEnabled && pct !== null && pct !== undefined) {
                              if (pct === 0) bgClass = "bg-slate-50 text-slate-400";
                              else if (pct < 15) bgClass = "bg-indigo-50/40 text-indigo-950 font-medium";
                              else if (pct < 30) bgClass = "bg-indigo-100/60 text-indigo-950 font-semibold";
                              else if (pct < 50) bgClass = "bg-indigo-200/70 text-indigo-950 font-bold";
                              else if (pct < 75) bgClass = "bg-indigo-300/80 text-indigo-950 font-bold";
                              else bgClass = "bg-indigo-600 text-white font-black";
                            }

                            return (
                              <td
                                key={cell.colChoiceId}
                                className={`p-3 text-center border-r border-slate-200/60 transition-colors ${bgClass}`}
                              >
                                {isSuppressed ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-200/80 text-slate-700 font-mono text-[11px] font-bold rounded">
                                    <ShieldCheck className="w-3 h-3 text-slate-500" />
                                    {cell.displayValue === "<5" ? "< 5" : cell.displayValue || "< 5"}
                                  </span>
                                ) : cell.count !== null ? (
                                  displayFormat === "count" ? (
                                    <span className="font-bold text-sm">{cell.count}</span>
                                  ) : displayFormat === "percent" ? (
                                    <span className="font-bold text-sm">{pct ?? 0}%</span>
                                  ) : (
                                    <div>
                                      <span className="font-bold text-sm">{cell.count}</span>
                                      <span className="text-[11px] opacity-80 font-mono ml-1">
                                        ({pct ?? 0}%)
                                      </span>
                                    </div>
                                  )
                                ) : (
                                  <span className="text-slate-300">—</span>
                                )}
                              </td>
                            );
                          })}
                          <td className="p-3 text-center font-bold bg-slate-50/80 text-slate-900 border-l border-slate-200">
                            {row.isRowTotalSuppressed ? (
                              <span className="text-slate-400 font-mono text-[11px]">&lt; 5</span>
                            ) : (
                              row.rowTotalAnswered ?? "—"
                            )}
                          </td>
                        </tr>
                      ))}

                      {/* Column Totals Row */}
                      <tr className="bg-slate-100/80 font-bold border-t-2 border-slate-300 text-slate-900">
                        <td className="p-3.5 border-r border-slate-200 bg-slate-100">合計 (Col Total)</td>
                        {crosstabData.columnTotals.map((ct) => (
                          <td key={ct.colChoiceId} className="p-3 text-center border-r border-slate-200">
                            {ct.isColumnTotalSuppressed ? (
                              <span className="text-slate-400 font-mono text-[11px]">&lt; 5</span>
                            ) : (
                              ct.totalAnswered ?? "—"
                            )}
                          </td>
                        ))}
                        <td className="p-3.5 text-center bg-slate-200 text-indigo-700 font-black">
                          {crosstabData.result?.grandTotalDisplay || crosstabData.validPopulation}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Privacy Footnote & Notice */}
                <div className="pt-2 border-t border-slate-100 text-[11px] text-slate-500 space-y-1">
                  <div className="flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span className="font-medium text-slate-700">
                      去識別化隱私防護宣告 (Privacy & Small-Cell Suppression)
                    </span>
                  </div>
                  <p className="text-slate-400 pl-5">
                    * 依隱私保護政策，樣本數小於 5 之統計單元（&lt; 5）與差額可反推單元（—）皆已套用 Primary /
                    Complementary 遮蔽防護；熱力圖色彩深度僅依據已公開之安全數值渲染。
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
