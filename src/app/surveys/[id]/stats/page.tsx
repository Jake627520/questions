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
  mean: number;
  median: number;
  min: number;
  max: number;
  standardDeviation: number | null;
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
  notAnsweredCount: number;
  responseRate: number;
  distribution: ChoiceDistribution[] | null;
  statistics: QuestionStatistics | null;
}

interface AnalyticsData {
  survey: {
    id: string;
    title: string;
    version: number;
    organizationId: string;
  };
  summary: {
    totalResponses: number;
    questionCount: number;
  };
  questions: QuestionAnalyticsItem[];
}

interface CrosstabData {
  surveyId: string;
  surveyTitle: string;
  minCellSize: number;
  validPopulation: number;
  totalSurveyResponses: number;
  dimensionA: {
    questionId: string;
    code: string;
    title: string;
    options: { choiceId: string; label: string; value: string }[];
  };
  dimensionB: {
    questionId: string;
    code: string;
    title: string;
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

export default function SurveyStatsPage() {
  const params = useParams();
  const id = params.id as string;

  const [activeTab, setActiveTab] = useState<"questions" | "crosstab">("questions");
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<"all" | "today" | "7d" | "30d">("all");

  // Crosstab State
  const [qAId, setQAId] = useState<string>("");
  const [qBId, setQBId] = useState<string>("");
  const [pctMode, setPctMode] = useState<"row" | "col" | "total">("row");
  const [crosstabData, setCrosstabData] = useState<CrosstabData | null>(null);
  const [crosstabLoading, setCrosstabLoading] = useState(false);

  useEffect(() => {
    async function fetchStats() {
      try {
        setLoading(true);
        const res = await fetch(`/api/surveys/${id}/analytics/questions?timeRange=${timeRange}`);
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
  }, [id, timeRange]);

  useEffect(() => {
    async function fetchCrosstab() {
      if (!qAId || !qBId || qAId === qBId) return;
      try {
        setCrosstabLoading(true);
        const res = await fetch(
          `/api/surveys/${id}/analytics/crosstab?questionA=${qAId}&questionB=${qBId}&timeRange=${timeRange}`
        );
        const json = await res.json();
        if (res.ok) {
          setCrosstabData(json);
        } else {
          setCrosstabData(null);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setCrosstabLoading(false);
      }
    }
    if (activeTab === "crosstab") {
      fetchCrosstab();
    }
  }, [id, activeTab, qAId, qBId, timeRange]);

  if (loading) {
    return (
      <div className="p-16 text-center text-slate-500 bg-white rounded-2xl border border-slate-200 shadow-xs max-w-5xl mx-auto">
        <div className="animate-spin w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full mx-auto mb-3" />
        載入統計分析資料中...
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-16 text-center text-slate-500 bg-white rounded-2xl border border-slate-200 shadow-xs max-w-5xl mx-auto">
        找不到該問卷統計資料或您無權查看。
      </div>
    );
  }

  const { survey, summary, questions } = data;

  return (
    <div className="space-y-8 max-w-5xl mx-auto py-4">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-blue-600 mb-2 transition"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>返回問卷工作區</span>
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              {survey.title}
            </h1>
            <span className="text-xs font-mono font-bold px-2 py-0.5 bg-slate-100 text-slate-700 rounded-md">
              v{survey.version}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Enterprise Survey Analytics & Intelligence (單題分佈與 2-Way 雙題目交叉分析)
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Link
            href={`/surveys/${id}/fill`}
            className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition"
          >
            前往填答
          </Link>
          <a
            href={`/api/surveys/${id}/export`}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs transition"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>匯出總表</span>
          </a>
        </div>
      </div>

      {/* Tabs & Filter Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
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
            <span>題目統計 (Item Statistics)</span>
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
                  ? "bg-white text-blue-700 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* TAB 1: Item Statistics */}
      {activeTab === "questions" && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Activity className="w-4 h-4 text-blue-600" />
              <span>各題作答率、選項分佈與離散指標</span>
            </h2>
            <span className="text-xs text-slate-500 font-medium">
              選項百分比分母明確為該題「有效作答數」
            </span>
          </div>

          {questions.length === 0 ? (
            <div className="p-12 text-center text-slate-400 bg-white rounded-2xl border border-slate-200 text-xs">
              此問卷尚未建立任何題目
            </div>
          ) : (
            questions.map((q) => (
              <div
                key={q.questionId}
                className="bg-white rounded-2xl border border-slate-200/90 p-6 shadow-xs space-y-5"
              >
                {/* Question Header */}
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 border-b border-slate-100 pb-4">
                  <div className="space-y-1 max-w-2xl">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-mono font-bold px-2 py-0.5 bg-blue-50 text-blue-700 rounded-md border border-blue-200/50">
                        {q.code}
                      </span>
                      <h3 className="font-bold text-slate-900 text-base">{q.title}</h3>
                      {q.required && (
                        <span className="text-[10px] font-semibold text-red-600 bg-red-50 px-1.5 py-0.5 rounded border border-red-200/60">
                          必填
                        </span>
                      )}
                    </div>
                    {q.description && (
                      <p className="text-xs text-slate-500 pl-0.5">{q.description}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-3 shrink-0 text-xs">
                    <div className="bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200/70 space-x-2">
                      <span className="text-slate-500">作答率：</span>
                      <strong className="text-blue-700 font-bold">{q.responseRate}%</strong>
                      <span className="text-slate-300">|</span>
                      <span className="text-slate-500">有效：<strong>{q.answeredCount}</strong> 筆</span>
                      <span className="text-slate-300">|</span>
                      <span className="text-slate-400">未填：{q.notAnsweredCount} 筆</span>
                    </div>
                  </div>
                </div>

                {/* Rating / Number Statistics */}
                {q.statistics && (
                  <div className="bg-purple-50/60 border border-purple-100 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-2 text-xs font-bold text-purple-900">
                      <Sparkles className="w-4 h-4 text-purple-600" />
                      <span>評分統計分析 (N = {q.statistics.n})：</span>
                    </div>

                    <div className="flex flex-wrap items-center gap-4 text-xs">
                      <div className="text-slate-700">
                        平均數：<strong className="text-purple-800 font-bold">{q.statistics.mean}</strong>
                      </div>
                      <div className="text-slate-700">
                        中位數：<strong className="text-blue-800 font-bold">{q.statistics.median}</strong>
                      </div>
                      <div className="text-slate-700">
                        極值：<strong>{q.statistics.min} / {q.statistics.max}</strong>
                      </div>
                      <div className="text-slate-700">
                        樣本標準差 (s)：
                        <strong className="text-indigo-800 font-bold">
                          {q.statistics.standardDeviation !== null
                            ? `${q.statistics.standardDeviation}`
                            : "無 (N < 2)"}
                        </strong>
                      </div>
                    </div>
                  </div>
                )}

                {/* Choice Distribution Bars */}
                {q.distribution && q.distribution.length > 0 && (
                  <div className="space-y-3 pt-1">
                    {q.distribution.map((c) => (
                      <div key={c.choiceId} className="space-y-1">
                        <div className="flex items-center justify-between text-xs font-medium">
                          <div className="flex items-center gap-2">
                            <span className="text-slate-800 font-semibold">{c.label}</span>
                            {c.scoreEnabled && (
                              <span className="text-indigo-600 font-bold text-[11px]">
                                ({c.score !== null ? `${c.score} 分` : "不計分"})
                              </span>
                            )}
                          </div>
                          <div className="text-slate-500 font-mono text-[11px]">
                            {c.count} 次 (<strong className="text-slate-800">{c.percentage}%</strong>)
                          </div>
                        </div>
                        <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                          <div
                            className="bg-blue-600 h-full rounded-full transition-all duration-500"
                            style={{ width: `${Math.min(100, c.percentage)}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* TAB 2: Cross-tabulation */}
      {activeTab === "crosstab" && (
        <div className="space-y-6">
          {/* Dimension Selector Card */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-indigo-600" />
                <h3 className="font-bold text-slate-900 text-sm">2-Way 交叉分析變項設定</h3>
              </div>
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200/60">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                <span>已啟用最小單元遮蔽保護 (Min Cell Size = 5)</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  分組變項 (Row Dimension A)：
                </label>
                <select
                  value={qAId}
                  onChange={(e) => setQAId(e.target.value)}
                  className="w-full text-xs font-semibold p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                >
                  {questions.map((q) => (
                    <option key={q.questionId} value={q.questionId}>
                      [{q.code}] {q.title}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  目標變項 (Column Dimension B)：
                </label>
                <select
                  value={qBId}
                  onChange={(e) => setQBId(e.target.value)}
                  className="w-full text-xs font-semibold p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                >
                  {questions.map((q) => (
                    <option key={q.questionId} value={q.questionId}>
                      [{q.code}] {q.title}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {qAId === qBId && (
              <p className="text-xs text-amber-600 font-semibold bg-amber-50 p-2 rounded-lg border border-amber-200">
                請選擇兩個不同的題目進行交叉分析。
              </p>
            )}
          </div>

          {/* Crosstab Matrix Table */}
          {crosstabLoading ? (
            <div className="p-16 text-center text-slate-500 bg-white rounded-2xl border border-slate-200 shadow-xs">
              <div className="animate-spin w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full mx-auto mb-3" />
              計算交叉矩陣中...
            </div>
          ) : !crosstabData ? (
            <div className="p-12 text-center text-slate-400 bg-white rounded-2xl border border-slate-200 text-xs">
              尚未產生交叉分析資料，請先設定兩組相異題目。
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
              {/* Matrix Control Bar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                <div className="text-xs text-slate-600 font-medium">
                  雙題有效作答樣本 (Valid Population)：
                  <strong className="text-slate-900 font-bold ml-1">{crosstabData.validPopulation} 人</strong>
                </div>

                <div className="flex items-center gap-3">
                  {/* Mode Selector */}
                  <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
                    <button
                      onClick={() => setPctMode("row")}
                      className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition ${
                        pctMode === "row" ? "bg-white text-indigo-700 shadow-xs" : "text-slate-600"
                      }`}
                    >
                      列百分比 (Row %)
                    </button>
                    <button
                      onClick={() => setPctMode("col")}
                      className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition ${
                        pctMode === "col" ? "bg-white text-indigo-700 shadow-xs" : "text-slate-600"
                      }`}
                    >
                      行百分比 (Col %)
                    </button>
                    <button
                      onClick={() => setPctMode("total")}
                      className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition ${
                        pctMode === "total" ? "bg-white text-indigo-700 shadow-xs" : "text-slate-600"
                      }`}
                    >
                      總百分比 (Total %)
                    </button>
                  </div>

                  {/* Export Button */}
                  <a
                    href={`/api/surveys/${id}/analytics/crosstab/export?questionA=${qAId}&questionB=${qBId}`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-xs transition"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    <span>匯出交叉表</span>
                  </a>
                </div>
              </div>

              {/* Responsive Matrix Grid */}
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-slate-700 border-b border-slate-200">
                      <th className="p-3 font-bold border-r border-slate-200">
                        {crosstabData.dimensionA.code} \ {crosstabData.dimensionB.code}
                      </th>
                      {crosstabData.dimensionB.options.map((opt) => (
                        <th key={opt.choiceId} className="p-3 font-bold text-center border-r border-slate-200">
                          {opt.label}
                        </th>
                      ))}
                      <th className="p-3 font-bold text-center bg-slate-100/70 text-slate-900">
                        合計 (Row Total)
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {crosstabData.rows.map((row) => (
                      <tr key={row.rowChoiceId} className="border-b border-slate-100 hover:bg-slate-50/50">
                        <td className="p-3 font-semibold text-slate-800 bg-slate-50/40 border-r border-slate-200">
                          {row.rowLabel}
                        </td>
                        {row.cells.map((cell) => {
                          const pct =
                            pctMode === "row"
                              ? cell.rowPercentage
                              : pctMode === "col"
                              ? cell.columnPercentage
                              : cell.totalPercentage;

                          return (
                            <td key={cell.colChoiceId} className="p-3 text-center border-r border-slate-100">
                              {cell.isSuppressed ? (
                                <span className="inline-block px-2 py-0.5 bg-slate-100 text-slate-400 font-mono text-[11px] rounded border border-slate-200/80">
                                  &lt; 5 (已遮蔽)
                                </span>
                              ) : cell.count !== null ? (
                                <div>
                                  <span className="font-bold text-slate-900 text-sm">{cell.count}</span>
                                  <span className="text-[11px] text-slate-500 font-mono ml-1">
                                    ({pct}%)
                                  </span>
                                </div>
                              ) : (
                                <span className="text-slate-300">-</span>
                              )}
                            </td>
                          );
                        })}
                        <td className="p-3 text-center font-bold bg-slate-50/60 text-slate-900">
                          {row.isRowTotalSuppressed ? (
                            <span className="text-slate-400 font-mono text-[11px]">&lt; 5</span>
                          ) : (
                            row.rowTotalAnswered ?? "-"
                          )}
                        </td>
                      </tr>
                    ))}

                    {/* Column Totals Row */}
                    <tr className="bg-slate-100/70 font-bold border-t-2 border-slate-200 text-slate-900">
                      <td className="p-3 border-r border-slate-200">合計 (Col Total)</td>
                      {crosstabData.columnTotals.map((ct) => (
                        <td key={ct.colChoiceId} className="p-3 text-center border-r border-slate-200">
                          {ct.isColumnTotalSuppressed ? (
                            <span className="text-slate-400 font-mono text-[11px]">&lt; 5</span>
                          ) : (
                            ct.totalAnswered ?? "-"
                          )}
                        </td>
                      ))}
                      <td className="p-3 text-center bg-slate-200/60 text-blue-700 font-black">
                        {crosstabData.validPopulation}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Privacy Footnote */}
              <div className="pt-2 border-t border-slate-100 text-[11px] text-slate-400 flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 text-slate-400" />
                <span>
                  * 依隱私保護政策，樣本數小於 5 之統計單元與差額風險單元皆予以遮蔽（Complementary Suppression）。
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
