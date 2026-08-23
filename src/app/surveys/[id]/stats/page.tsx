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

export default function SurveyStatsPage() {
  const params = useParams();
  const id = params.id as string;

  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<"all" | "today" | "7d" | "30d">("all");

  useEffect(() => {
    async function fetchStats() {
      try {
        setLoading(true);
        const res = await fetch(`/api/surveys/${id}/analytics/questions?timeRange=${timeRange}`);
        const json = await res.json();
        if (json.survey) {
          setData(json);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    if (id) fetchStats();
  }, [id, timeRange]);

  if (loading) {
    return (
      <div className="p-16 text-center text-slate-500 bg-white rounded-2xl border border-slate-200 shadow-xs max-w-5xl mx-auto">
        <div className="animate-spin w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full mx-auto mb-3" />
        載入問卷題目統計資料中...
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-16 text-center text-slate-500 bg-white rounded-2xl border border-slate-200 shadow-xs max-w-5xl mx-auto">
        找不到該問卷題目統計資料或您無權查看。
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
            Question-level Analytics & Item Statistics (題目層級深度統計與離散度指標)
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
            <span>匯出 Excel</span>
          </a>
        </div>
      </div>

      {/* Summary Metrics & Filter Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-6 text-xs font-semibold">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-blue-600" />
            <span className="text-slate-500">總回覆人次：</span>
            <strong className="text-slate-900 text-sm">{summary.totalResponses}</strong>
          </div>
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-indigo-600" />
            <span className="text-slate-500">總題目數：</span>
            <strong className="text-slate-900 text-sm">{summary.questionCount} 題</strong>
          </div>
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

      {/* Question Analytics Cards */}
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

                {/* Question Metrics Pill */}
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

              {/* Numerical / Rating Question Statistics */}
              {q.statistics && (
                <div className="bg-purple-50/60 border border-purple-100 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-2 text-xs font-bold text-purple-900">
                    <Sparkles className="w-4 h-4 text-purple-600" />
                    <span>評分統計分析 (N = {q.statistics.n})：</span>
                  </div>

                  <div className="flex flex-wrap items-center gap-4 text-xs">
                    <div className="text-slate-700">
                      平均數 (Mean)：<strong className="text-purple-800 font-bold">{q.statistics.mean}</strong>
                    </div>
                    <div className="text-slate-700">
                      中位數 (Median)：<strong className="text-blue-800 font-bold">{q.statistics.median}</strong>
                    </div>
                    <div className="text-slate-700">
                      極值 (Min / Max)：<strong>{q.statistics.min} / {q.statistics.max}</strong>
                    </div>
                    <div className="text-slate-700">
                      樣本標準差 (s)：
                      <strong className="text-indigo-800 font-bold">
                        {q.statistics.standardDeviation !== null
                          ? `${q.statistics.standardDeviation}`
                          : "無 (N < 2)"}
                      </strong>
                    </div>
                    {q.statistics.standardDeviation !== null && q.statistics.standardDeviation >= 1.5 && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                        High Variability
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Choices Distribution Bar Chart */}
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
                      {/* Bar */}
                      <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                        <div
                          className="bg-blue-600 hover:bg-blue-700 h-full rounded-full transition-all duration-500"
                          style={{ width: `${Math.min(100, c.percentage)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Text Question Summary */}
              {q.type === "text" && (
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 text-xs text-slate-600 flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-slate-400" />
                  <span>文字開放式問答題：共收到 <strong>{q.answeredCount}</strong> 筆有效文字填寫（未填 {q.notAnsweredCount} 筆）。</span>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
