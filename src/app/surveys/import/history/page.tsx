"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  FileSpreadsheet,
  ArrowLeft,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  Download,
  ExternalLink,
  Info,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
} from "lucide-react";
import { SurveyImportRecord } from "@/types/surveyImport";

export default function ImportHistoryPage() {
  const [items, setItems] = useState<SurveyImportRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [pageSize] = useState(15);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedRecord, setSelectedRecord] = useState<SurveyImportRecord | null>(null);

  const fetchHistory = useCallback(async () => {
    try {
      setLoading(true);
      const url = new URL("/api/surveys/import/history", window.location.origin);
      if (statusFilter !== "all") {
        url.searchParams.set("status", statusFilter);
      }
      url.searchParams.set("page", page.toString());
      url.searchParams.set("pageSize", pageSize.toString());

      const res = await fetch(url.toString());
      const data = await res.json();
      if (data.success) {
        setItems(data.items || []);
        setTotal(data.total || 0);
        setTotalPages(data.totalPages || 1);
      }
    } catch (err) {
      console.error("Fetch history error:", err);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, page, pageSize]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const formatFileSize = (bytes?: number | null) => {
    if (!bytes) return "-";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "SUCCESS":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>匯入成功</span>
          </span>
        );
      case "FAILED":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
            <XCircle className="w-3.5 h-3.5" />
            <span>匯入失敗</span>
          </span>
        );
      case "IMPORTING":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 animate-pulse">
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            <span>處理中</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
            <Clock className="w-3.5 h-3.5" />
            <span>{status}</span>
          </span>
        );
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Link
              href="/surveys/import"
              className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-blue-600 font-medium transition"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>返回 Excel 題庫匯入</span>
            </Link>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2 mt-1">
            <FileSpreadsheet className="w-7 h-7 text-indigo-600" />
            <span>Excel 題庫匯入歷史與稽核紀錄</span>
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            完整追蹤每一次題庫匯入生命週期、版權確認狀態、題目結構統計與診斷紀錄
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => fetchHistory()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-xl border border-slate-200 shadow-sm transition disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>重新整理</span>
          </button>
        </div>
      </div>

      {/* Filter Tabs & Stats Bar */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 text-xs">
          <span className="text-slate-400 font-medium pr-1">狀態篩選：</span>
          <button
            onClick={() => { setStatusFilter("all"); setPage(1); }}
            className={`px-3 py-1.5 rounded-lg font-semibold transition ${
              statusFilter === "all"
                ? "bg-slate-900 text-white shadow-sm"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            全部紀錄
          </button>
          <button
            onClick={() => { setStatusFilter("SUCCESS"); setPage(1); }}
            className={`px-3 py-1.5 rounded-lg font-semibold transition ${
              statusFilter === "SUCCESS"
                ? "bg-emerald-600 text-white shadow-sm"
                : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
            }`}
          >
            成功 (SUCCESS)
          </button>
          <button
            onClick={() => { setStatusFilter("FAILED"); setPage(1); }}
            className={`px-3 py-1.5 rounded-lg font-semibold transition ${
              statusFilter === "FAILED"
                ? "bg-rose-600 text-white shadow-sm"
                : "bg-rose-50 text-rose-700 hover:bg-rose-100"
            }`}
          >
            失敗 (FAILED)
          </button>
        </div>

        <div className="text-xs text-slate-500 font-medium">
          共 <strong className="text-slate-800 font-bold">{total}</strong> 筆稽核紀錄
        </div>
      </div>

      {/* History Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50/80 border-b border-slate-200/80 text-slate-700 font-semibold uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-3 px-4">建立時間</th>
                <th className="py-3 px-4">Import ID</th>
                <th className="py-3 px-4">檔案 / 大小</th>
                <th className="py-3 px-4">關聯問卷</th>
                <th className="py-3 px-4 text-center">題數 / 選項</th>
                <th className="py-3 px-4 text-center">版權確認</th>
                <th className="py-3 px-4 text-center">狀態</th>
                <th className="py-3 px-4 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-normal">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-indigo-500" />
                    載入歷史紀錄中...
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    <Info className="w-6 h-6 mx-auto mb-2 text-slate-300" />
                    尚未有任何匯入紀錄
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/60 transition">
                    <td className="py-3 px-4 whitespace-nowrap text-slate-500">
                      {new Date(item.createdAt).toLocaleString("zh-TW")}
                    </td>
                    <td className="py-3 px-4 font-mono font-bold text-slate-800">
                      <button
                        onClick={() => setSelectedRecord(item)}
                        className="hover:underline text-indigo-600 hover:text-indigo-800 text-left"
                      >
                        {item.importId}
                      </button>
                    </td>
                    <td className="py-3 px-4 max-w-[180px] truncate">
                      <div className="font-medium text-slate-800 truncate" title={item.fileName || "unknown"}>
                        {item.fileName || "unknown"}
                      </div>
                      <span className="text-[10px] text-slate-400">{formatFileSize(item.fileSize)}</span>
                    </td>
                    <td className="py-3 px-4 max-w-[200px] truncate">
                      {item.survey ? (
                        <div className="truncate">
                          <span className="font-semibold text-slate-800">{item.survey.title}</span>
                          <span className="ml-1 text-[10px] text-slate-400">(v{item.survey.version})</span>
                        </div>
                      ) : (
                        <span className="text-slate-400 italic">-</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center whitespace-nowrap">
                      {item.status === "SUCCESS" ? (
                        <span>
                          <strong className="text-blue-600 font-semibold">{item.questionCount}</strong> 題 /{" "}
                          <span className="text-emerald-600">{item.choiceCount}</span> 選項
                        </span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {item.copyrightConfirmed ? (
                        <span className="inline-flex items-center gap-0.5 text-emerald-700 font-medium text-[11px]">
                          <ShieldCheck className="w-3.5 h-3.5" />
                          <span>已確認</span>
                        </span>
                      ) : (
                        <span className="text-slate-400 text-[11px]">-</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center whitespace-nowrap">{getStatusBadge(item.status)}</td>
                    <td className="py-3 px-4 text-right whitespace-nowrap space-x-1.5">
                      <button
                        onClick={() => setSelectedRecord(item)}
                        className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg transition text-[11px]"
                      >
                        稽核詳情
                      </button>

                      {item.status === "SUCCESS" && item.surveyId && (
                        <Link
                          href={`/surveys/${item.surveyId}/fill`}
                          className="inline-flex items-center gap-0.5 px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold rounded-lg transition text-[11px]"
                        >
                          <ExternalLink className="w-3 h-3" />
                          <span>填答</span>
                        </Link>
                      )}

                      {item.status === "FAILED" && (
                        <a
                          href={`/api/surveys/import/${item.importId}/errors`}
                          className="inline-flex items-center gap-0.5 px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 font-semibold rounded-lg transition text-[11px]"
                        >
                          <Download className="w-3 h-3" />
                          <span>錯誤報告</span>
                        </a>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        {totalPages > 1 && (
          <div className="p-3.5 bg-slate-50/80 border-t border-slate-200/80 flex items-center justify-between text-xs text-slate-500">
            <span>
              第 {page} 頁，共 {totalPages} 頁
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Audit Detail Modal */}
      {selectedRecord && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full border border-slate-200 shadow-2xl p-6 space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <span className="text-[11px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">
                  {selectedRecord.importId}
                </span>
                <h3 className="font-bold text-slate-900 text-lg mt-1">匯入紀錄稽核詳情</h3>
              </div>
              <button
                onClick={() => setSelectedRecord(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/80">
                <span className="text-slate-400 font-medium">執行狀態</span>
                <div className="mt-1">{getStatusBadge(selectedRecord.status)}</div>
              </div>
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/80">
                <span className="text-slate-400 font-medium">檔案名稱與大小</span>
                <p className="font-semibold text-slate-800 mt-1 truncate" title={selectedRecord.fileName || ""}>
                  {selectedRecord.fileName || "-"} ({formatFileSize(selectedRecord.fileSize)})
                </p>
              </div>
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/80">
                <span className="text-slate-400 font-medium">建立時間</span>
                <p className="font-semibold text-slate-800 mt-1">
                  {new Date(selectedRecord.createdAt).toLocaleString("zh-TW")}
                </p>
              </div>
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/80">
                <span className="text-slate-400 font-medium">版權宣告確認</span>
                <p className="font-semibold text-slate-800 mt-1">
                  {selectedRecord.copyrightConfirmed ? "✓ 已勾選確認授權" : "未確認"}
                </p>
              </div>
            </div>

            {selectedRecord.status === "SUCCESS" && (
              <div className="bg-emerald-50/50 border border-emerald-200 rounded-xl p-4 space-y-2 text-xs">
                <div className="font-bold text-emerald-900">問卷建立統計與結構指標</div>
                <div className="grid grid-cols-3 gap-2 text-center pt-1">
                  <div className="bg-white p-2 rounded-lg border border-emerald-100">
                    <span className="text-slate-400">總題數</span>
                    <p className="text-base font-bold text-blue-600">{selectedRecord.questionCount}</p>
                  </div>
                  <div className="bg-white p-2 rounded-lg border border-emerald-100">
                    <span className="text-slate-400">總選項數</span>
                    <p className="text-base font-bold text-emerald-600">{selectedRecord.choiceCount}</p>
                  </div>
                  <div className="bg-white p-2 rounded-lg border border-emerald-100">
                    <span className="text-slate-400">必填題目</span>
                    <p className="text-base font-bold text-slate-700">{selectedRecord.requiredCount}</p>
                  </div>
                  <div className="bg-white p-2 rounded-lg border border-emerald-100">
                    <span className="text-slate-400">計分題目</span>
                    <p className="text-base font-bold text-indigo-600">{selectedRecord.scoredCount}</p>
                  </div>
                  <div className="bg-white p-2 rounded-lg border border-emerald-100">
                    <span className="text-slate-400">條件跳題</span>
                    <p className="text-base font-bold text-amber-600">{selectedRecord.conditionalCount}</p>
                  </div>
                  <div className="bg-white p-2 rounded-lg border border-emerald-100">
                    <span className="text-slate-400">版本號碼</span>
                    <p className="text-base font-bold text-slate-700">v{selectedRecord.survey?.version || 1}</p>
                  </div>
                </div>
              </div>
            )}

            {selectedRecord.status === "FAILED" && (
              <div className="bg-rose-50/80 border border-rose-200 rounded-xl p-4 space-y-2 text-xs">
                <div className="font-bold text-rose-900 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-rose-600" />
                  <span>錯誤代碼：{selectedRecord.errorCode || "VALIDATION_FAILED"}</span>
                </div>
                <p className="text-rose-800">{selectedRecord.errorMessage || "未記錄詳細錯誤訊息"}</p>
                <div className="pt-2">
                  <a
                    href={`/api/surveys/import/${selectedRecord.importId}/errors`}
                    className="inline-flex items-center gap-1 px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-semibold rounded-lg transition"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>下載完整錯誤診斷報告 (CSV)</span>
                  </a>
                </div>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setSelectedRecord(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-xs transition"
              >
                關閉
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
