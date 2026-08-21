"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Trash2,
  ExternalLink,
  CheckCircle2,
  Clock,
  HelpCircle,
  FileSpreadsheet,
  AlertCircle,
  BarChart3,
  Bookmark,
} from "lucide-react";

interface ResponseItem {
  id: string;
  status: "IN_PROGRESS" | "COMPLETED";
  version: number;
  submittedAt: string | null;
  createdAt: string;
  totalScore: number | null;
  maxScore: number | null;
  percentage: number | null;
  answersCount: number;
}

export default function SurveyResponsesPage() {
  const params = useParams();
  const id = params.id as string;

  const [surveyTitle, setSurveyTitle] = useState("");
  const [surveyVersion, setSurveyVersion] = useState(1);
  const [responses, setResponses] = useState<ResponseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"ALL" | "COMPLETED" | "IN_PROGRESS">("ALL");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchResponses = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/surveys/${id}/responses`);
      const data = await res.json();
      if (data.survey) {
        setSurveyTitle(data.survey.title);
        setSurveyVersion(data.survey.version);
      }
      if (data.responses) {
        setResponses(data.responses);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteDraft = async (responseId: string) => {
    if (!confirm("確定要刪除這筆未完成的草稿嗎？刪除後無法恢復。")) return;
    try {
      setDeletingId(responseId);
      const res = await fetch(`/api/surveys/${id}/responses/${responseId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "刪除草稿失敗");
      } else {
        fetchResponses();
      }
    } catch (e: any) {
      alert("刪除草稿時發生錯誤：" + e.message);
    } finally {
      setDeletingId(null);
    }
  };

  useEffect(() => {
    if (id) fetchResponses();
  }, [id]);

  const filteredResponses = responses.filter((r) => {
    if (filter === "ALL") return true;
    return r.status === filter;
  });

  const completedCount = responses.filter((r) => r.status === "COMPLETED").length;
  const draftCount = responses.filter((r) => r.status === "IN_PROGRESS").length;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-blue-600 transition mb-1"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>返回問卷列表</span>
          </Link>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold text-slate-900">回覆與草稿管理</h1>
            <span className="text-xs px-2.5 py-0.5 bg-blue-50 text-blue-700 font-semibold rounded-full">
              v{surveyVersion}
            </span>
          </div>
          <p className="text-sm text-slate-500">{surveyTitle}</p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href={`/surveys/${id}/stats`}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition"
          >
            <BarChart3 className="w-4 h-4 text-slate-500" />
            <span>查看統計</span>
          </Link>
          <a
            href={`/api/surveys/${id}/export`}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl shadow-sm transition"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>匯出 Excel</span>
          </a>
        </div>
      </div>

      {/* Summary Chips & Filter Tabs */}
      <div className="flex items-center justify-between gap-4 flex-wrap bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setFilter("ALL")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
              filter === "ALL"
                ? "bg-slate-900 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            全部 ({responses.length})
          </button>
          <button
            onClick={() => setFilter("COMPLETED")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
              filter === "COMPLETED"
                ? "bg-emerald-600 text-white"
                : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
            }`}
          >
            已完成 ({completedCount})
          </button>
          <button
            onClick={() => setFilter("IN_PROGRESS")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
              filter === "IN_PROGRESS"
                ? "bg-amber-600 text-white"
                : "bg-amber-50 text-amber-700 hover:bg-amber-100"
            }`}
          >
            草稿中 ({draftCount})
          </button>
        </div>

        <span className="text-xs text-slate-400">
          共 {filteredResponses.length} 筆資料
        </span>
      </div>

      {/* Responses Table */}
      {loading ? (
        <div className="p-16 text-center bg-white rounded-2xl border border-slate-200 text-slate-500">
          載入回覆資料中...
        </div>
      ) : filteredResponses.length === 0 ? (
        <div className="p-16 text-center bg-white rounded-2xl border border-slate-200/80 shadow-sm space-y-2">
          <div className="w-12 h-12 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mx-auto mb-2">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <h3 className="font-semibold text-slate-800 text-base">目前尚無符合的回覆紀錄</h3>
          <p className="text-xs text-slate-500">
            {filter === "IN_PROGRESS" ? "目前沒有任何暫存的草稿。" : "問卷尚未收到任何填答資料。"}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-600 text-xs font-bold uppercase tracking-wider border-b border-slate-200">
                <tr>
                  <th className="px-5 py-3.5">Response ID</th>
                  <th className="px-5 py-3.5">狀態</th>
                  <th className="px-5 py-3.5">版本</th>
                  <th className="px-5 py-3.5">建立時間 / 提交時間</th>
                  <th className="px-5 py-3.5">得分 / 滿分</th>
                  <th className="px-5 py-3.5">作答題數</th>
                  <th className="px-5 py-3.5 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredResponses.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/60 transition">
                    <td className="px-5 py-4 font-mono text-xs text-slate-800">
                      {r.id.slice(-8)}
                    </td>
                    <td className="px-5 py-4">
                      {r.status === "COMPLETED" ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <CheckCircle2 className="w-3 h-3" />
                          已完成
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                          <Clock className="w-3 h-3" />
                          草稿中
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-xs font-medium text-slate-600">
                      v{r.version}
                    </td>
                    <td className="px-5 py-4 text-xs text-slate-500">
                      <div>建立: {new Date(r.createdAt).toLocaleString("zh-TW")}</div>
                      {r.submittedAt && (
                        <div className="text-slate-400 text-[11px]">
                          提交: {new Date(r.submittedAt).toLocaleString("zh-TW")}
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-4 text-xs">
                      {r.status === "COMPLETED" ? (
                        r.totalScore !== null ? (
                          <div className="font-semibold text-slate-900">
                            {r.totalScore} / {r.maxScore} 分
                            <span className="text-slate-400 font-normal ml-1">
                              ({r.percentage}%)
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-400">不計分</span>
                        )
                      ) : (
                        <span className="text-slate-400 italic">暫存未計分</span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-xs text-slate-600 font-medium">
                      {r.answersCount} 題
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {r.status === "IN_PROGRESS" && (
                          <>
                            <Link
                              href={`/surveys/${id}/fill?responseId=${r.id}`}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg transition"
                            >
                              <ExternalLink className="w-3 h-3" />
                              <span>繼續填答</span>
                            </Link>
                            <button
                              onClick={() => handleDeleteDraft(r.id)}
                              disabled={deletingId === r.id}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                              title="刪除草稿"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                        {r.status === "COMPLETED" && (
                          <span className="text-xs text-slate-400">正式回覆 (已保護)</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
