"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  FileSpreadsheet,
  CheckCircle2,
  BarChart3,
  ExternalLink,
  PlusCircle,
  HelpCircle,
  Clock,
  Sparkles,
  Copy,
} from "lucide-react";

interface SurveyItem {
  id: string;
  version: number;
  title: string;
  description: string | null;
  status: "DRAFT" | "PUBLISHED" | "CLOSED";
  createdAt: string;
  _count: {
    questions: number;
    responses: number;
  };
}

export default function HomePage() {
  const [surveys, setSurveys] = useState<SurveyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [cloningId, setCloningId] = useState<string | null>(null);

  const fetchSurveys = async () => {
    try {
      setLoading(true);
      // 先取得當前工作區
      let orgQuery = "";
      try {
        const resOrg = await fetch("/api/organizations");
        if (resOrg.ok) {
          const dataOrg = await resOrg.json();
          if (dataOrg.activeOrganization?.id) {
            orgQuery = `?organizationId=${dataOrg.activeOrganization.id}`;
          }
        }
      } catch {
        // ignore
      }

      const res = await fetch(`/api/surveys${orgQuery}`);
      const data = await res.json();
      if (data.surveys) {
        setSurveys(data.surveys);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleCloneVersion = async (surveyId: string) => {
    if (!confirm("確定要複製此問卷並建立新版本 (version + 1) 嗎？")) return;
    try {
      setCloningId(surveyId);
      const res = await fetch(`/api/surveys/${surveyId}/clone-version`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "建立新版本失敗");
      } else {
        alert(data.message || "成功建立新版本！");
        fetchSurveys();
      }
    } catch (e: any) {
      alert("複製新版本時發生錯誤：" + e.message);
    } finally {
      setCloningId(null);
    }
  };

  useEffect(() => {
    fetchSurveys();
  }, []);

  return (
    <div className="space-y-8">
      {/* Hero Banner */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-700 rounded-2xl p-8 text-white shadow-lg relative overflow-hidden">
        <div className="relative z-10 max-w-2xl">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-white/20 backdrop-blur rounded-full text-xs font-medium mb-4">
            <Sparkles className="w-3.5 h-3.5" />
            <span>問卷系統 MVP v3.0 (M3 邏輯與草稿增強版)</span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl mb-3">
            靈活計分與題庫匯入問卷系統
          </h1>
          <p className="text-blue-100 text-sm sm:text-base leading-relaxed mb-6">
            支援簡寫語法條件跳題、循環相依檢測、草稿暫存與恢復、版本複製與隔離、反向計分、特殊給分，以及精確排除隱藏題之 Excel 報表匯出。
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/surveys/import"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-white text-blue-700 font-semibold rounded-xl hover:bg-blue-50 transition shadow-sm"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>匯入 Excel 題庫</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Survey List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-800">問卷列表</h2>
            <p className="text-sm text-slate-500">管理現有問卷版本、填答與統計分析</p>
          </div>
          <button
            onClick={fetchSurveys}
            className="text-xs font-medium text-blue-600 hover:text-blue-700"
          >
            重新整理
          </button>
        </div>

        {loading ? (
          <div className="p-12 text-center bg-white rounded-xl border border-slate-200 text-slate-500">
            載入問卷資料中...
          </div>
        ) : surveys.length === 0 ? (
          <div className="p-12 text-center bg-white rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
            <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-800">目前尚無任何問卷</h3>
              <p className="text-sm text-slate-500 mt-1">
                您可以透過上方「Excel 匯入題庫」上傳題目，或執行 seed 建立示範問卷。
              </p>
            </div>
            <Link
              href="/surveys/import"
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition"
            >
              <PlusCircle className="w-4 h-4" />
              <span>立即匯入題庫</span>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {surveys.map((s) => (
              <div
                key={s.id}
                className="bg-white rounded-xl border border-slate-200/80 p-5 shadow-sm hover:shadow-md transition flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-bold text-slate-900 text-lg leading-snug">
                        {s.title}
                      </h3>
                      <span className="text-xs px-2 py-0.5 bg-blue-50 text-blue-700 font-semibold rounded">
                        v{s.version || 1}
                      </span>
                    </div>
                    <span
                      className={`text-xs px-2.5 py-1 rounded-full font-medium shrink-0 ${
                        s.status === "PUBLISHED"
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : s.status === "DRAFT"
                          ? "bg-amber-50 text-amber-700 border border-amber-200"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {s.status === "PUBLISHED" ? "已發布" : s.status === "DRAFT" ? "草稿" : "已關閉"}
                    </span>
                  </div>

                  {s.description && (
                    <p className="text-sm text-slate-600 line-clamp-2 mb-4">
                      {s.description}
                    </p>
                  )}

                  <div className="flex items-center gap-4 text-xs text-slate-500 mb-6">
                    <span className="flex items-center gap-1">
                      <HelpCircle className="w-3.5 h-3.5" />
                      {s._count.questions} 題
                    </span>
                    <span className="flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      {s._count.responses} 份回覆
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      {new Date(s.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-100 flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/surveys/${s.id}/fill`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-600 text-xs font-semibold rounded-lg hover:bg-blue-100 transition"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>填答問卷</span>
                    </Link>
                    <Link
                      href={`/surveys/${s.id}/stats`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 text-slate-700 text-xs font-medium rounded-lg hover:bg-slate-100 border border-slate-200 transition"
                    >
                      <BarChart3 className="w-3.5 h-3.5" />
                      <span>統計</span>
                    </Link>
                    <Link
                      href={`/surveys/${s.id}/responses`}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-50 text-slate-700 text-xs font-medium rounded-lg hover:bg-slate-100 border border-slate-200 transition"
                    >
                      <Clock className="w-3.5 h-3.5" />
                      <span>回覆名單</span>
                    </Link>
                    <button
                      type="button"
                      onClick={() => handleCloneVersion(s.id)}
                      disabled={cloningId === s.id}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 text-xs font-medium rounded-lg transition"
                    >
                      <Copy className="w-3 h-3" />
                      <span>{cloningId === s.id ? "複製中..." : "建立新版本"}</span>
                    </button>
                  </div>

                  <a
                    href={`/api/surveys/${s.id}/export`}
                    className="text-xs text-emerald-600 hover:text-emerald-700 font-medium flex items-center gap-1"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    <span>匯出 Excel</span>
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
