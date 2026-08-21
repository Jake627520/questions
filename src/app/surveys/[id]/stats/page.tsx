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
} from "lucide-react";

interface ChoiceStat {
  id: string;
  label: string;
  value: string;
  count: number;
  percentage: number;
  score: number | null;
  scoreEnabled: boolean;
  isOther: boolean;
  requiresText: boolean;
  isNoneOfAbove: boolean;
}

interface QuestionStat {
  id: string;
  code: string;
  title: string;
  description: string | null;
  questionType: string;
  required: boolean;
  scoringEnabled: boolean;
  reverseScore: boolean;
  totalAnswered: number;
  avgQuestionScore: number | null;
  choiceStats: ChoiceStat[];
  otherTexts: string[];
  textResponses: any[];
}

interface StatsData {
  survey: {
    id: string;
    title: string;
    description: string | null;
    status: string;
  };
  summary: {
    totalResponses: number;
    avgScore: number | null;
    avgPercentage: number | null;
  };
  questionStats: QuestionStat[];
}

export default function SurveyStatsPage() {
  const params = useParams();
  const id = params.id as string;

  const [data, setData] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      try {
        setLoading(true);
        const res = await fetch(`/api/surveys/${id}/stats`);
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
  }, [id]);

  if (loading) {
    return (
      <div className="p-16 text-center text-slate-500 bg-white rounded-2xl border border-slate-200">
        載入問卷統計資料中...
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-16 text-center text-slate-500 bg-white rounded-2xl border border-slate-200">
        找不到該問卷統計資料。
      </div>
    );
  }

  const { survey, summary, questionStats } = data;

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-blue-600 mb-2 transition"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>返回問卷列表</span>
          </Link>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
            {survey.title} - 結果統計
          </h1>
          {survey.description && (
            <p className="text-sm text-slate-500 mt-1">{survey.description}</p>
          )}
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <Link
            href={`/surveys/${id}/fill`}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-xl transition"
          >
            前往填答
          </Link>
          <a
            href={`/api/surveys/${id}/export`}
            className="inline-flex items-center gap-2 px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-xl shadow-sm transition"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>匯出 Excel 報表</span>
          </a>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs flex items-center gap-4">
          <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-500">總回覆筆數</div>
            <div className="text-2xl font-black text-slate-900 mt-0.5">
              {summary.totalResponses}
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs flex items-center gap-4">
          <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
            <Award className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-500">平均總得分</div>
            <div className="text-2xl font-black text-indigo-600 mt-0.5">
              {summary.avgScore !== null ? summary.avgScore : "不計分問卷"}
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs flex items-center gap-4">
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
            <Percent className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-500">平均得分率</div>
            <div className="text-2xl font-black text-emerald-600 mt-0.5">
              {summary.avgPercentage !== null ? `${summary.avgPercentage}%` : "-"}
            </div>
          </div>
        </div>
      </div>

      {/* Question Analytics Breakdown */}
      <div className="space-y-6">
        <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-blue-600" />
          <span>各題填答分佈與統計</span>
        </h2>

        {questionStats.map((q) => (
          <div
            key={q.id}
            className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm space-y-4"
          >
            {/* Question Header */}
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 border-b border-slate-100 pb-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold px-2 py-0.5 bg-blue-50 text-blue-600 rounded">
                    {q.code}
                  </span>
                  <h3 className="font-bold text-slate-900 text-base">{q.title}</h3>
                </div>
                {q.description && (
                  <p className="text-xs text-slate-500 pl-1">{q.description}</p>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0 text-xs">
                <span className="text-slate-500">作答次數: <strong>{q.totalAnswered}</strong></span>
                {q.scoringEnabled && q.avgQuestionScore !== null && (
                  <span className="px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-lg font-semibold">
                    本題平均分: {q.avgQuestionScore}
                  </span>
                )}
              </div>
            </div>

            {/* Choices Stats (for choice & yes_no questions) */}
            {q.choiceStats.length > 0 && (
              <div className="space-y-3 pt-1">
                {q.choiceStats.map((c) => (
                  <div key={c.id} className="space-y-1">
                    <div className="flex items-center justify-between text-xs font-medium">
                      <div className="flex items-center gap-2">
                        <span className="text-slate-800">{c.label}</span>
                        {c.scoreEnabled && (
                          <span className="text-indigo-600 font-bold text-[11px]">
                            ({c.score !== null ? `${c.score} 分` : "不計分"})
                          </span>
                        )}
                        {c.isNoneOfAbove && (
                          <span className="text-purple-600 text-[10px] bg-purple-50 px-1.5 py-0.5 rounded">
                            以上皆非
                          </span>
                        )}
                        {c.isOther && (
                          <span className="text-amber-600 text-[10px] bg-amber-50 px-1.5 py-0.5 rounded">
                            其他選項
                          </span>
                        )}
                      </div>
                      <div className="text-slate-500 font-mono">
                        {c.count} 次 ({c.percentage}%)
                      </div>
                    </div>
                    {/* Progress Bar */}
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

            {/* Other Text Feedback Collected */}
            {q.otherTexts.length > 0 && (
              <div className="mt-4 pt-4 border-t border-slate-100 space-y-2 bg-slate-50/50 p-4 rounded-xl">
                <div className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <MessageSquare className="w-3.5 h-3.5 text-amber-600" />
                  <span>「其他」選項填寫之補充說明 ({q.otherTexts.length} 則)：</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {q.otherTexts.map((text, tIdx) => (
                    <span
                      key={tIdx}
                      className="text-xs bg-white border border-slate-200 px-3 py-1 rounded-lg text-slate-700 shadow-xs"
                    >
                      {text}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Text and Number Responses Collected */}
            {q.textResponses.length > 0 && (
              <div className="mt-4 pt-4 border-t border-slate-100 space-y-2 bg-slate-50/50 p-4 rounded-xl">
                <div className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <MessageSquare className="w-3.5 h-3.5 text-blue-600" />
                  <span>文字/數值回覆紀錄 ({q.textResponses.length} 則)：</span>
                </div>
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {q.textResponses.map((val, tIdx) => (
                    <div
                      key={tIdx}
                      className="text-xs bg-white border border-slate-200 p-2 rounded-lg text-slate-700"
                    >
                      {String(val)}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
