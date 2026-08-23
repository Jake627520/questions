"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import {
  FileSpreadsheet,
  CheckCircle2,
  BarChart3,
  ExternalLink,
  PlusCircle,
  Clock,
  Sparkles,
  Copy,
  Search,
  SlidersHorizontal,
  LayoutGrid,
  List,
  Building2,
  Users,
  Layers,
  ArrowUpRight,
  TrendingUp,
  Download,
  AlertCircle,
  HelpCircle,
  FileText,
  ShieldAlert,
} from "lucide-react";

interface SurveyItem {
  id: string;
  version: number;
  title: string;
  description: string | null;
  status: "DRAFT" | "PUBLISHED" | "CLOSED";
  publicToken: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy?: {
    id: string;
    name: string | null;
    email: string;
  } | null;
  organization?: {
    id: string;
    name: string;
    slug: string;
  } | null;
  _count: {
    questions: number;
    responses: number;
  };
}

export default function HomePage() {
  const [surveys, setSurveys] = useState<SurveyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [cloningId, setCloningId] = useState<string | null>(null);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  // Filters & Controls
  const [statusFilter, setStatusFilter] = useState<"ALL" | "PUBLISHED" | "DRAFT" | "CLOSED">("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"createdAt_desc" | "responses_desc" | "questions_desc">("createdAt_desc");
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");
  const [activeOrgName, setActiveOrgName] = useState<string | null>(null);

  const fetchSurveys = async () => {
    try {
      setLoading(true);
      let orgQuery = "";
      try {
        const resOrg = await fetch("/api/organizations");
        if (resOrg.ok) {
          const dataOrg = await resOrg.json();
          if (dataOrg.activeOrganization) {
            setActiveOrgName(dataOrg.activeOrganization.name);
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

  const copyPublicLink = (publicToken: string) => {
    const url = `${window.location.origin}/s/${publicToken}`;
    navigator.clipboard.writeText(url);
    setCopiedToken(publicToken);
    setTimeout(() => setCopiedToken(null), 2000);
  };

  useEffect(() => {
    fetchSurveys();
  }, []);

  // Filtered & Sorted Surveys
  const filteredSurveys = useMemo(() => {
    return surveys
      .filter((s) => {
        if (statusFilter !== "ALL" && s.status !== statusFilter) return false;
        if (searchQuery.trim()) {
          const query = searchQuery.toLowerCase();
          const matchTitle = s.title.toLowerCase().includes(query);
          const matchDesc = s.description?.toLowerCase().includes(query) ?? false;
          const matchCreator = s.createdBy?.name?.toLowerCase().includes(query) ?? false;
          return matchTitle || matchDesc || matchCreator;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === "responses_desc") {
          return b._count.responses - a._count.responses;
        }
        if (sortBy === "questions_desc") {
          return b._count.questions - a._count.questions;
        }
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
  }, [surveys, statusFilter, searchQuery, sortBy]);

  // Metric counts
  const totalSurveys = surveys.length;
  const publishedCount = surveys.filter((s) => s.status === "PUBLISHED").length;
  const draftCount = surveys.filter((s) => s.status === "DRAFT").length;
  const closedCount = surveys.filter((s) => s.status === "CLOSED").length;
  const totalResponses = surveys.reduce((sum, s) => sum + s._count.responses, 0);

  return (
    <div className="space-y-8 pb-12">
      {/* Header Workspace Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/80 pb-6">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">問卷工作區</h1>
            {activeOrgName && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200/60">
                <Building2 className="w-3.5 h-3.5" />
                {activeOrgName}
              </span>
            )}
          </div>
          <p className="text-sm text-slate-500 mt-1">
            集中管理企業多租戶題庫、問卷發布生命週期、填答分析與報表匯出
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/surveys/import"
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm rounded-xl shadow-sm hover:shadow transition"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>匯入 Excel 題庫</span>
          </Link>
          <Link
            href="/settings/organization"
            className="inline-flex items-center gap-2 px-4 py-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-medium text-sm rounded-xl transition shadow-xs"
          >
            <Users className="w-4 h-4 text-slate-500" />
            <span>組織與成員</span>
          </Link>
        </div>
      </div>

      {/* KPI Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">問卷總數</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{totalSurveys}</p>
          </div>
          <div className="w-11 h-11 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
            <FileText className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">已發布中</p>
            <p className="text-2xl font-bold text-emerald-600 mt-1">{publishedCount}</p>
          </div>
          <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">累計填答數</p>
            <p className="text-2xl font-bold text-indigo-600 mt-1">{totalResponses}</p>
          </div>
          <div className="w-11 h-11 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
            <TrendingUp className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">待處理草稿</p>
            <p className="text-2xl font-bold text-amber-600 mt-1">{draftCount}</p>
          </div>
          <div className="w-11 h-11 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
            <Clock className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Filter & Search Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Status Tabs */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-100/80 rounded-xl border border-slate-200/60 overflow-x-auto">
          {[
            { key: "ALL", label: "全部", count: totalSurveys },
            { key: "PUBLISHED", label: "已發布", count: publishedCount },
            { key: "DRAFT", label: "草稿", count: draftCount },
            { key: "CLOSED", label: "已關閉", count: closedCount },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setStatusFilter(tab.key as any)}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
                statusFilter === tab.key
                  ? "bg-white text-slate-900 shadow-xs font-bold"
                  : "text-slate-600 hover:text-slate-900 hover:bg-white/50"
              }`}
            >
              <span>{tab.label}</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                  statusFilter === tab.key ? "bg-slate-100 text-slate-800" : "bg-slate-200/60 text-slate-600"
                }`}
              >
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {/* Search, Sort, and View Mode */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Search Box */}
          <div className="relative flex-1 sm:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="搜尋問卷名稱或代碼..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white"
            />
          </div>

          {/* Sort Dropdown */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="text-xs font-medium px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          >
            <option value="createdAt_desc">建立時間 (新到舊)</option>
            <option value="responses_desc">填答數 (多到少)</option>
            <option value="questions_desc">題目數 (多到少)</option>
          </select>

          {/* View Toggle */}
          <div className="flex items-center p-1 bg-slate-100 rounded-xl border border-slate-200/60">
            <button
              onClick={() => setViewMode("grid")}
              className={`p-1 rounded-lg text-slate-600 ${
                viewMode === "grid" ? "bg-white text-slate-900 shadow-xs" : "hover:text-slate-900"
              }`}
              title="卡片檢視"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setViewMode("table")}
              className={`p-1 rounded-lg text-slate-600 ${
                viewMode === "table" ? "bg-white text-slate-900 shadow-xs" : "hover:text-slate-900"
              }`}
              title="清單檢視"
            >
              <List className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Survey List / Grid */}
      {loading ? (
        <div className="p-12 text-center text-slate-400 text-sm">
          <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          正在載入工作區問卷列表...
        </div>
      ) : filteredSurveys.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center shadow-xs">
          <div className="w-14 h-14 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <FileSpreadsheet className="w-7 h-7" />
          </div>
          <h3 className="text-lg font-bold text-slate-900">
            {searchQuery || statusFilter !== "ALL" ? "查無符合條件的問卷" : "工作區內尚無問卷"}
          </h3>
          <p className="text-sm text-slate-500 mt-1.5 max-w-md mx-auto">
            {searchQuery || statusFilter !== "ALL"
              ? "請嘗試更換篩選狀態或清除搜尋關鍵字"
              : "立即透過 Excel 範本匯入題庫，或直接建立第一份問卷。"}
          </p>
          <div className="mt-6 flex justify-center gap-3">
            {searchQuery || statusFilter !== "ALL" ? (
              <button
                onClick={() => {
                  setSearchQuery("");
                  setStatusFilter("ALL");
                }}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition"
              >
                清除篩選條件
              </button>
            ) : (
              <Link
                href="/surveys/import"
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm rounded-xl shadow-xs transition"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>立即匯入 Excel 題庫</span>
              </Link>
            )}
          </div>
        </div>
      ) : viewMode === "grid" ? (
        /* Grid Card View */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredSurveys.map((survey) => {
            const isPublished = survey.status === "PUBLISHED";
            const isDraft = survey.status === "DRAFT";
            const isClosed = survey.status === "CLOSED";

            return (
              <div
                key={survey.id}
                className="bg-white rounded-2xl border border-slate-200 hover:border-slate-300 shadow-xs hover:shadow-md transition-all flex flex-col justify-between overflow-hidden group"
              >
                <div className="p-5">
                  {/* Top Badges */}
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                          isPublished
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : isDraft
                            ? "bg-amber-50 text-amber-700 border border-amber-200"
                            : "bg-slate-100 text-slate-600 border border-slate-200"
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            isPublished
                              ? "bg-emerald-500"
                              : isDraft
                              ? "bg-amber-500"
                              : "bg-slate-400"
                          }`}
                        />
                        {isPublished ? "已發布" : isDraft ? "草稿" : "已關閉"}
                      </span>

                      <span className="text-xs font-mono font-medium px-2 py-0.5 bg-slate-100 rounded-full text-slate-600">
                        v{survey.version}
                      </span>
                    </div>

                    {/* Quick Copy Public Token */}
                    {survey.publicToken && (
                      <button
                        onClick={() => copyPublicLink(survey.publicToken!)}
                        title="複製公開填答連結"
                        className="text-xs text-slate-400 hover:text-blue-600 transition p-1 rounded-lg hover:bg-slate-50"
                      >
                        {copiedToken === survey.publicToken ? (
                          <span className="text-[10px] text-emerald-600 font-bold">已複製！</span>
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    )}
                  </div>

                  {/* Title & Description */}
                  <Link
                    href={`/surveys/${survey.id}/fill`}
                    className="block group-hover:text-blue-600 transition"
                  >
                    <h3 className="font-bold text-slate-900 text-base line-clamp-1">
                      {survey.title}
                    </h3>
                  </Link>
                  <p className="text-xs text-slate-500 mt-1.5 line-clamp-2 leading-relaxed min-h-[2rem]">
                    {survey.description || "尚無補充說明"}
                  </p>

                  {/* Metrics Bar */}
                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                    <div className="flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-slate-400" />
                      <span>{survey._count.questions} 題題庫</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <TrendingUp className="w-3.5 h-3.5 text-indigo-500" />
                      <span className="font-medium text-slate-700">{survey._count.responses} 筆填答</span>
                    </div>
                  </div>
                </div>

                {/* Card Action Footer */}
                <div className="bg-slate-50/80 px-4 py-2.5 border-t border-slate-100 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/surveys/${survey.id}/stats`}
                      className="inline-flex items-center gap-1 text-slate-600 hover:text-blue-600 font-medium transition"
                    >
                      <BarChart3 className="w-3.5 h-3.5" />
                      <span>統計報表</span>
                    </Link>
                    <span className="text-slate-300">|</span>
                    <Link
                      href={`/surveys/${survey.id}/responses`}
                      className="inline-flex items-center gap-1 text-slate-600 hover:text-blue-600 font-medium transition"
                    >
                      <span>明細</span>
                    </Link>
                  </div>

                  <div className="flex items-center gap-1">
                    <a
                      href={`/api/surveys/${survey.id}/export`}
                      className="p-1 text-slate-400 hover:text-slate-700 transition rounded"
                      title="匯出 Excel 報表"
                      download
                    >
                      <Download className="w-3.5 h-3.5" />
                    </a>

                    <button
                      onClick={() => handleCloneVersion(survey.id)}
                      disabled={cloningId === survey.id}
                      className="p-1 text-slate-400 hover:text-indigo-600 transition rounded disabled:opacity-50"
                      title="複製版本 (Clone Version)"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>

                    <Link
                      href={survey.publicToken ? `/s/${survey.publicToken}` : `/surveys/${survey.id}/fill`}
                      className="inline-flex items-center gap-0.5 text-blue-600 hover:text-blue-700 font-semibold pl-1.5"
                    >
                      <span>填答</span>
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Compact Table View */
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider">
                  <th className="py-3 px-4">問卷標題</th>
                  <th className="py-3 px-4">狀態</th>
                  <th className="py-3 px-4">版本</th>
                  <th className="py-3 px-4">題數</th>
                  <th className="py-3 px-4">填答數</th>
                  <th className="py-3 px-4">建立時間</th>
                  <th className="py-3 px-4 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredSurveys.map((survey) => (
                  <tr key={survey.id} className="hover:bg-slate-50/70 transition">
                    <td className="py-3 px-4 font-semibold text-slate-900">
                      <Link
                        href={`/surveys/${survey.id}/fill`}
                        className="hover:text-blue-600 transition flex items-center gap-1.5"
                      >
                        <span>{survey.title}</span>
                      </Link>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                          survey.status === "PUBLISHED"
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : survey.status === "DRAFT"
                            ? "bg-amber-50 text-amber-700 border border-amber-200"
                            : "bg-slate-100 text-slate-600 border border-slate-200"
                        }`}
                      >
                        {survey.status === "PUBLISHED"
                          ? "已發布"
                          : survey.status === "DRAFT"
                          ? "草稿"
                          : "已關閉"}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-600">v{survey.version}</td>
                    <td className="py-3 px-4 font-mono text-slate-600">{survey._count.questions}</td>
                    <td className="py-3 px-4 font-mono font-medium text-slate-900">
                      {survey._count.responses}
                    </td>
                    <td className="py-3 px-4 text-slate-500">
                      {new Date(survey.createdAt).toLocaleDateString("zh-TW")}
                    </td>
                    <td className="py-3 px-4 text-right space-x-2">
                      <Link
                        href={`/surveys/${survey.id}/stats`}
                        className="text-slate-600 hover:text-blue-600 font-medium inline-flex items-center gap-0.5"
                      >
                        <BarChart3 className="w-3.5 h-3.5" />
                        報表
                      </Link>
                      <Link
                        href={`/surveys/${survey.id}/responses`}
                        className="text-slate-600 hover:text-blue-600 font-medium"
                      >
                        明細
                      </Link>
                      <Link
                        href={
                          survey.publicToken
                            ? `/s/${survey.publicToken}`
                            : `/surveys/${survey.id}/fill`
                        }
                        className="text-blue-600 hover:text-blue-700 font-bold inline-flex items-center"
                      >
                        填答
                      </Link>
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
