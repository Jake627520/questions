"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  TrendingUp,
  BarChart3,
  CheckCircle2,
  Clock,
  Download,
  Filter,
  Calendar,
  Layers,
  FileText,
  AlertCircle,
  Loader2,
  ChevronRight,
  ArrowUpRight,
  Sparkles,
  PieChart,
  Percent,
} from "lucide-react";

interface KPIState {
  totalResponses: number;
  completedResponses: number;
  incompleteResponses: number;
  completionRate: number;
  responsesToday: number;
  responsesLast7Days: number;
  responsesLast30Days: number;
}

interface ScoreAnalytics {
  scoredCount: number;
  avgScore: number | null;
  avgPercentage: number | null;
  minScore: number | null;
  maxScore: number | null;
  medianScore: number | null;
  distribution: Record<string, number>;
}

interface TimelineItem {
  date: string;
  total: number;
  completed: number;
}

interface RecentResponseItem {
  id: string;
  surveyId: string;
  surveyTitle: string;
  version: number;
  status: "COMPLETED" | "IN_PROGRESS";
  totalScore: number | null;
  maxScore: number | null;
  percentage: number | null;
  submittedAt: string | null;
  createdAt: string;
}

interface SurveyOption {
  id: string;
  title: string;
  version: number;
  status: string;
}

export default function AnalyticsPage() {
  const router = useRouter();

  // Filter States
  const [timeRange, setTimeRange] = useState<"today" | "7d" | "30d" | "all">("30d");
  const [selectedSurveyId, setSelectedSurveyId] = useState<string>("ALL");
  const [selectedStatus, setSelectedStatus] = useState<"ALL" | "COMPLETED" | "IN_PROGRESS">("ALL");

  // Data States
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);
  const [kpis, setKpis] = useState<KPIState | null>(null);
  const [scores, setScores] = useState<ScoreAnalytics | null>(null);
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [recentResponses, setRecentResponses] = useState<RecentResponseItem[]>([]);
  const [surveys, setSurveys] = useState<SurveyOption[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchAnalytics = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);

    try {
      const params = new URLSearchParams();
      params.set("timeRange", timeRange);
      if (selectedSurveyId !== "ALL") {
        params.set("surveyId", selectedSurveyId);
      }
      if (selectedStatus !== "ALL") {
        params.set("status", selectedStatus);
      }

      const res = await fetch(`/api/analytics?${params.toString()}`);
      if (res.status === 401) {
        router.push("/login?returnTo=/analytics");
        return;
      }

      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.message || "取得分析數據失敗");
        setLoading(false);
        return;
      }

      setCurrentUserRole(data.currentUserRole);
      setKpis(data.kpis);
      setScores(data.scores);
      setTimeline(data.timeline || []);
      setRecentResponses(data.recentResponses || []);
      setSurveys(data.surveys || []);
    } catch {
      setErrorMsg("網路連線異常，無法載入分析中心資料");
    } finally {
      setLoading(false);
    }
  }, [timeRange, selectedSurveyId, selectedStatus, router]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  // 匯出 Excel
  const handleExportExcel = async () => {
    setExporting(true);
    try {
      const params = new URLSearchParams();
      params.set("timeRange", timeRange);
      if (selectedSurveyId !== "ALL") {
        params.set("surveyId", selectedSurveyId);
      }
      if (selectedStatus !== "ALL") {
        params.set("status", selectedStatus);
      }

      const res = await fetch(`/api/analytics/export?${params.toString()}`);
      if (!res.ok) {
        const err = await res.json();
        alert(err.message || "匯出失敗");
        return;
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `analytics_export_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      alert("匯出報表連線失敗");
    } finally {
      setExporting(false);
    }
  };

  const isViewer = currentUserRole === "VIEWER";
  const maxTimelineTotal = Math.max(...timeline.map((t) => t.total), 1);
  const maxDistributionCount = Math.max(
    ...Object.values(scores?.distribution || {}),
    1
  );

  return (
    <div className="max-w-6xl mx-auto py-6 space-y-6">
      {/* 頁面標題與工作區導航 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-sm">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
                問卷作答分析中心
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Response Intelligence & Real-time Analytics (全量資料庫級別統計)
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* 匯出 Excel 按鈕 */}
          <button
            onClick={handleExportExcel}
            disabled={isViewer || exporting || loading}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition disabled:opacity-40 disabled:cursor-not-allowed"
            title={isViewer ? "唯讀檢視者無法匯出報表" : "依據目前篩選條件匯出 Excel 報表"}
          >
            {exporting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Download className="w-3.5 h-3.5" />
            )}
            <span>{exporting ? "匯出中..." : "匯出篩選結果 Excel"}</span>
          </button>

          <Link
            href="/"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 transition shadow-xs"
          >
            <span>返回問卷工作區</span>
          </Link>
        </div>
      </div>

      {/* 統一篩選器 Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-4">
        {/* 左側：問卷選擇與狀態 */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
            <Filter className="w-4 h-4 text-blue-600" />
            <span>問卷範圍：</span>
          </div>

          <select
            value={selectedSurveyId}
            onChange={(e) => setSelectedSurveyId(e.target.value)}
            className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 max-w-[240px]"
          >
            <option value="ALL">全組織問卷 (All Surveys)</option>
            {surveys.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title} (v{s.version})
              </option>
            ))}
          </select>

          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value as any)}
            className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="ALL">全部填答狀態</option>
            <option value="COMPLETED">僅已完成 (Completed)</option>
            <option value="IN_PROGRESS">僅草稿/填答中 (In Progress)</option>
          </select>
        </div>

        {/* 右側：時間範圍快速標籤 */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
          {(
            [
              { key: "today", label: "今日" },
              { key: "7d", label: "近 7 日" },
              { key: "30d", label: "近 30 日" },
              { key: "all", label: "全時段" },
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

      {errorMsg && (
        <div className="p-4 bg-red-50 text-red-800 border border-red-200 rounded-2xl flex items-center gap-3 text-sm">
          <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {loading ? (
        <div className="min-h-[20rem] flex flex-col items-center justify-center text-slate-400 text-sm gap-2">
          <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
          <span>正在進行資料庫伺服端統計計算...</span>
        </div>
      ) : (
        <>
          {/* KPI 指標卡片群 */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  總填答人次
                </span>
                <span className="p-2 bg-blue-50 text-blue-600 rounded-xl">
                  <FileText className="w-4 h-4" />
                </span>
              </div>
              <div className="text-3xl font-black text-slate-900 mt-2">
                {kpis?.totalResponses || 0}
              </div>
              <div className="text-[11px] text-slate-500 mt-1">
                今日 +{kpis?.responsesToday || 0} | 7日 +{kpis?.responsesLast7Days || 0}
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  完成作答數
                </span>
                <span className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
                  <CheckCircle2 className="w-4 h-4" />
                </span>
              </div>
              <div className="text-3xl font-black text-emerald-600 mt-2">
                {kpis?.completedResponses || 0}
              </div>
              <div className="text-[11px] text-slate-500 mt-1">
                有效正式提交之完整問卷
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  未完成 / 草稿
                </span>
                <span className="p-2 bg-amber-50 text-amber-600 rounded-xl">
                  <Clock className="w-4 h-4" />
                </span>
              </div>
              <div className="text-3xl font-black text-amber-600 mt-2">
                {kpis?.incompleteResponses || 0}
              </div>
              <div className="text-[11px] text-slate-500 mt-1">
                填答中或尚未正式提交
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  填答完成率
                </span>
                <span className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                  <Percent className="w-4 h-4" />
                </span>
              </div>
              <div className="text-3xl font-black text-indigo-600 mt-2">
                {kpis?.completionRate || 0}%
              </div>
              <div className="w-full bg-slate-100 rounded-full h-1.5 mt-2 overflow-hidden">
                <div
                  className="bg-indigo-600 h-1.5 rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(kpis?.completionRate || 0, 100)}%` }}
                />
              </div>
            </div>
          </div>

          {/* 漏斗與每日活躍趨勢 */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Completion Funnel 漏斗圖卡片 */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <PieChart className="w-4 h-4 text-blue-600" />
                  <span>填答完成漏斗 (Funnel)</span>
                </h3>
              </div>

              <div className="space-y-3 pt-2">
                <div>
                  <div className="flex justify-between text-xs font-semibold mb-1">
                    <span className="text-slate-600">1. 開始填答 (Started)</span>
                    <span className="text-slate-900 font-bold">{kpis?.totalResponses || 0} 筆 (100%)</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-lg h-3 overflow-hidden">
                    <div className="bg-blue-500 h-3 rounded-lg w-full" />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-xs font-semibold mb-1">
                    <span className="text-emerald-700">2. 正式完成 (Completed)</span>
                    <span className="text-emerald-700 font-bold">
                      {kpis?.completedResponses || 0} 筆 ({kpis?.completionRate || 0}%)
                    </span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-lg h-3 overflow-hidden">
                    <div
                      className="bg-emerald-500 h-3 rounded-lg transition-all duration-500"
                      style={{ width: `${Math.min(kpis?.completionRate || 0, 100)}%` }}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-xs font-semibold mb-1">
                    <span className="text-amber-700">3. 中途未結 (Incomplete)</span>
                    <span className="text-amber-700 font-bold">
                      {kpis?.incompleteResponses || 0} 筆 (
                      {kpis?.totalResponses
                        ? Math.round(
                            ((kpis.incompleteResponses) / kpis.totalResponses) * 100
                          )
                        : 0}
                      %)
                    </span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-lg h-3 overflow-hidden">
                    <div
                      className="bg-amber-400 h-3 rounded-lg transition-all duration-500"
                      style={{
                        width: `${
                          kpis?.totalResponses
                            ? Math.min(
                                (kpis.incompleteResponses / kpis.totalResponses) * 100,
                                100
                              )
                            : 0
                        }%`,
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* 每日填答活躍趨勢 */}
            <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-blue-600" />
                  <span>每日作答趨勢 (Response Timeline)</span>
                </h3>
                <span className="text-xs text-slate-400">時段內每日活躍量</span>
              </div>

              {timeline.length === 0 ? (
                <div className="h-44 flex items-center justify-center text-xs text-slate-400">
                  此時段尚無任何作答活動記錄
                </div>
              ) : (
                <div className="h-44 flex items-end gap-2 pt-6 overflow-x-auto">
                  {timeline.map((item) => {
                    const heightPercent = (item.total / maxTimelineTotal) * 100;
                    return (
                      <div
                        key={item.date}
                        className="flex-1 min-w-[28px] flex flex-col items-center gap-1.5 group"
                      >
                        <span className="text-[10px] font-bold text-slate-700 opacity-0 group-hover:opacity-100 transition">
                          {item.total}
                        </span>
                        <div className="w-full bg-slate-100 rounded-t-md h-28 flex items-end">
                          <div
                            className="w-full bg-blue-600 hover:bg-blue-700 rounded-t-md transition-all"
                            style={{ height: `${Math.max(heightPercent, 8)}%` }}
                            title={`${item.date}：總作答 ${item.total} 筆，完成 ${item.completed} 筆`}
                          />
                        </div>
                        <span className="text-[9px] text-slate-400 font-mono rotate-45 sm:rotate-0 mt-1">
                          {item.date.slice(5)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* 計分問卷得分分佈與統計 */}
          {scores && scores.scoredCount > 0 && (
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-purple-600" />
                    <span>計分問卷得分分佈 (Score Distribution)</span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    共採樣 {scores.scoredCount} 筆具備計分之填答紀錄
                  </p>
                </div>

                <div className="flex items-center gap-4 text-xs font-semibold">
                  <span className="text-slate-600">
                    平均分：<strong className="text-purple-700">{scores.avgScore ?? "-"} 分</strong>
                    {scores.avgPercentage !== null && ` (${scores.avgPercentage}%)`}
                  </span>
                  <span className="text-slate-600">
                    中位數：<strong className="text-blue-700">{scores.medianScore ?? "-"} 分</strong>
                  </span>
                  <span className="text-slate-600">
                    最高/最低：<strong>{scores.maxScore ?? "-"} / {scores.minScore ?? "-"} 分</strong>
                  </span>
                </div>
              </div>

              {/* 分數分桶直方圖 */}
              <div className="grid grid-cols-5 gap-3 pt-2">
                {Object.entries(scores.distribution).map(([bucket, count]) => {
                  const percent = (count / maxDistributionCount) * 100;
                  return (
                    <div key={bucket} className="flex flex-col items-center gap-2 bg-slate-50/70 p-3 rounded-xl border border-slate-100">
                      <div className="h-20 w-full flex items-end justify-center">
                        <div
                          className="w-10 bg-purple-500 hover:bg-purple-600 rounded-t-lg transition-all"
                          style={{ height: `${Math.max(percent, 6)}%` }}
                          title={`${bucket}: ${count} 筆`}
                        />
                      </div>
                      <span className="text-xs font-black text-slate-800">{count} 筆</span>
                      <span className="text-[11px] font-semibold text-slate-500">{bucket}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 最近作答名冊表格 */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-blue-600" />
                  <span>最近填答紀錄明細 (最新 15 筆)</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  所有資料皆符合租戶嚴格邊界保護，零內部敏感 ID 洩漏
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider">
                    <th className="py-3 px-4">問卷標題</th>
                    <th className="py-3 px-4">作答識別碼</th>
                    <th className="py-3 px-4">狀態</th>
                    <th className="py-3 px-4">得分 / 百分比</th>
                    <th className="py-3 px-4">提交時間</th>
                    <th className="py-3 px-4 text-right">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {recentResponses.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-400">
                        符合目前條件的填答紀錄為空
                      </td>
                    </tr>
                  ) : (
                    recentResponses.map((r) => (
                      <tr key={r.id} className="hover:bg-slate-50/70 transition">
                        <td className="py-3 px-4 font-semibold text-slate-900">
                          <span className="line-clamp-1">{r.surveyTitle}</span>
                        </td>
                        <td className="py-3 px-4 font-mono text-slate-500 text-[11px]">
                          {r.id.slice(-8)}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`inline-block px-2 py-0.5 rounded-md font-bold text-[10px] ${
                              r.status === "COMPLETED"
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200/60"
                                : "bg-amber-50 text-amber-700 border border-amber-200/60"
                            }`}
                          >
                            {r.status === "COMPLETED" ? "已完成" : "草稿中"}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-700 font-medium">
                          {r.totalScore !== null
                            ? `${r.totalScore} 分 (${r.percentage}%)`
                            : "無計分"}
                        </td>
                        <td className="py-3 px-4 text-slate-500 font-mono">
                          {new Date(r.createdAt).toLocaleString("zh-TW")}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <Link
                            href={`/surveys/${r.surveyId}/responses/${r.id}`}
                            className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 font-semibold"
                          >
                            <span>檢視</span>
                            <ChevronRight className="w-3 h-3" />
                          </Link>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
