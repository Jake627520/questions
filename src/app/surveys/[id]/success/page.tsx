"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  CheckCircle,
  BarChart3,
  Home,
  Award,
  ArrowRight,
  ListCheck,
} from "lucide-react";
import { SurveyScoreResult } from "@/lib/types";

export default function SubmissionSuccessPage() {
  const params = useParams();
  const id = params.id as string;
  const [evalResult, setEvalResult] = useState<SurveyScoreResult | null>(null);

  useEffect(() => {
    const cached = sessionStorage.getItem("last_submission_eval");
    if (cached) {
      try {
        setEvalResult(JSON.parse(cached));
      } catch (e) {}
    }
  }, []);

  return (
    <div className="max-w-2xl mx-auto space-y-8 py-4">
      <div className="bg-white rounded-3xl border border-slate-200/80 p-8 shadow-sm text-center space-y-6">
        <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-inner">
          <CheckCircle className="w-10 h-10" />
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-black text-slate-900">問卷提交成功！</h1>
          <p className="text-sm text-slate-600">
            感謝您的參與，我們已完整記錄您的寶貴作答內容。
          </p>
        </div>

        {/* 計分卡片（若問卷含計分題） */}
        {evalResult && evalResult.totalScore !== null && (
          <div className="bg-gradient-to-br from-indigo-50 to-blue-50 border border-indigo-100 rounded-2xl p-6 text-left space-y-4">
            <div className="flex items-center justify-between border-b border-indigo-100 pb-3">
              <div className="flex items-center gap-2 text-indigo-900 font-bold text-sm">
                <Award className="w-5 h-5 text-indigo-600" />
                <span>得分摘要</span>
              </div>
              <span className="text-xs font-semibold px-2.5 py-0.5 bg-indigo-600 text-white rounded-full">
                計分模式
              </span>
            </div>

            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="bg-white/80 p-3 rounded-xl shadow-xs">
                <div className="text-xs text-slate-500 font-medium">總得分</div>
                <div className="text-2xl font-black text-indigo-600 mt-0.5">
                  {evalResult.totalScore}
                </div>
              </div>

              <div className="bg-white/80 p-3 rounded-xl shadow-xs">
                <div className="text-xs text-slate-500 font-medium">問卷滿分</div>
                <div className="text-2xl font-black text-slate-700 mt-0.5">
                  {evalResult.maxScore ?? "-"}
                </div>
              </div>

              <div className="bg-white/80 p-3 rounded-xl shadow-xs">
                <div className="text-xs text-slate-500 font-medium">得分率</div>
                <div className="text-2xl font-black text-emerald-600 mt-0.5">
                  {evalResult.percentage !== null ? `${evalResult.percentage}%` : "-"}
                </div>
              </div>
            </div>

            {/* 每題得分明細 */}
            <div className="pt-2">
              <div className="text-xs font-bold text-slate-700 mb-2 flex items-center gap-1.5">
                <ListCheck className="w-4 h-4 text-slate-500" />
                <span>題目計分明細：</span>
              </div>
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1 text-xs">
                {evalResult.questionResults.map((qr) => (
                  <div
                    key={qr.questionCode}
                    className="flex items-center justify-between py-1.5 px-3 bg-white/70 rounded-lg border border-indigo-50"
                  >
                    <div className="flex items-center gap-2 truncate pr-2">
                      <span className="font-bold text-indigo-600 shrink-0">
                        {qr.questionCode}
                      </span>
                      <span className="text-slate-700 truncate">{qr.questionTitle}</span>
                    </div>
                    <span className="shrink-0 font-medium">
                      {qr.scoringEnabled ? (
                        qr.score !== null ? (
                          <span className="text-indigo-700 font-bold">{qr.score} 分</span>
                        ) : (
                          <span className="text-slate-400">不計分選項</span>
                        )
                      ) : (
                        <span className="text-slate-400">非計分題</span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 操作按鈕 */}
        <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href={`/surveys/${id}/stats`}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl shadow-sm transition"
          >
            <BarChart3 className="w-4 h-4" />
            <span>查看問卷結果統計</span>
          </Link>
          <Link
            href="/"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold rounded-xl transition"
          >
            <Home className="w-4 h-4" />
            <span>返回問卷列表</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
