"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  FileSpreadsheet,
  Upload,
  CheckCircle,
  AlertCircle,
  ArrowRight,
  HelpCircle,
  List,
  Sparkles,
  Download,
  Eye,
} from "lucide-react";
import { QuestionInput } from "@/lib/types";

export default function ImportSurveyPage() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("2026 產品體驗與服務滿意度調查");
  const [description, setDescription] = useState(
    "感謝您撥冗填寫，本問卷旨在評估產品功能與體驗回饋。"
  );
  const [status, setStatus] = useState<"PUBLISHED" | "DRAFT">("PUBLISHED");

  const [previewData, setPreviewData] = useState<QuestionInput[] | null>(null);
  const [previewErrors, setPreviewErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setPreviewData(null);
      setPreviewErrors([]);
    }
  };

  const handlePreview = async () => {
    if (!file) return;
    try {
      setLoading(true);
      setPreviewErrors([]);
      const formData = new FormData();
      formData.append("file", file);
      formData.append("mode", "preview");

      const res = await fetch("/api/surveys/import", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        setPreviewErrors(data.errors || [data.error || "解析失敗"]);
        if (data.questions) setPreviewData(data.questions);
      } else {
        setPreviewData(data.questions);
      }
    } catch (e: any) {
      setPreviewErrors([e.message || "網路或伺服器錯誤"]);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveAndPublish = async () => {
    if (!file) return;
    try {
      setSaving(true);
      const formData = new FormData();
      formData.append("file", file);
      formData.append("mode", "save");
      formData.append("title", title);
      formData.append("description", description);
      formData.append("status", status);

      const res = await fetch("/api/surveys/import", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        const errorList = data.errors || [data.details ? `${data.error}: ${data.details}` : data.error || "匯入失敗"];
        setPreviewErrors(errorList);
        alert(data.details ? `${data.error}：${data.details}` : data.error || "匯入失敗");
      } else {
        router.push(`/surveys/${data.surveyId}/fill`);
      }
    } catch (e: any) {
      alert("儲存時發生錯誤：" + e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <FileSpreadsheet className="w-7 h-7 text-blue-600" />
            <span>Excel XLSX 匯入題庫</span>
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            上傳包含 <code className="text-blue-600 font-mono">questions</code> 與{" "}
            <code className="text-emerald-600 font-mono">choices</code> 兩個工作表的 Excel 檔案
          </p>
        </div>

        <a
          href="/api/template"
          className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl border border-slate-200 transition shrink-0"
        >
          <Download className="w-4 h-4 text-slate-500" />
          <span>下載示範範本 (demo-survey.xlsx)</span>
        </a>
      </div>

      {/* Step 1: Upload and Configure */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700">問卷名稱</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="請輸入問卷名稱"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700">發布狀態</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as any)}
              className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="PUBLISHED">直接發布 (PUBLISHED)</option>
              <option value="DRAFT">儲存為草稿 (DRAFT)</option>
            </select>
          </div>

          <div className="md:col-span-2 space-y-1.5">
            <label className="text-xs font-bold text-slate-700">問卷描述</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="請輸入問卷說明或導言..."
            />
          </div>
        </div>

        {/* File Dropzone */}
        <div className="border-2 border-dashed border-slate-300 hover:border-blue-500 rounded-xl p-8 text-center transition cursor-pointer relative bg-slate-50/50">
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFileChange}
            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
          />
          <div className="flex flex-col items-center gap-2">
            <div className="p-3 bg-blue-50 text-blue-600 rounded-full">
              <Upload className="w-6 h-6" />
            </div>
            <div className="text-sm font-semibold text-slate-700">
              {file ? file.name : "點擊此處或拖曳 Excel (.xlsx) 檔案至此"}
            </div>
            <div className="text-xs text-slate-400">
              支援標準雙 Sheet 格式 (questions, choices) 及簡寫跳題語法
            </div>
          </div>
        </div>

        {file && (
          <div className="flex justify-end gap-3 pt-2">
            <button
              onClick={handlePreview}
              disabled={loading}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-lg transition"
            >
              {loading ? "解析中..." : "解析題庫預覽"}
            </button>
            <button
              onClick={handleSaveAndPublish}
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg shadow-sm transition"
            >
              <CheckCircle className="w-4 h-4" />
              <span>{saving ? "儲存中..." : "確認匯入並建立問卷"}</span>
            </button>
          </div>
        )}
      </div>

      {/* Error Messages */}
      {previewErrors.length > 0 && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm space-y-1">
          <div className="font-bold flex items-center gap-1.5">
            <AlertCircle className="w-4 h-4" />
            <span>Excel 檢核錯誤：</span>
          </div>
          <ul className="list-disc pl-5 text-xs space-y-0.5">
            {previewErrors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Step 2: Preview Questions */}
      {previewData && previewData.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-slate-900 text-lg flex items-center gap-2">
              <List className="w-5 h-5 text-blue-600" />
              <span>題庫預覽 (共 {previewData.length} 題)</span>
            </h3>
            <span className="text-xs px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-full font-medium">
              Excel 結構解析正常
            </span>
          </div>

          <div className="space-y-4 divide-y divide-slate-100">
            {previewData.map((q, idx) => (
              <div key={idx} className="pt-4 first:pt-0 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-blue-600 text-xs px-2 py-0.5 bg-blue-50 rounded">
                        {q.code}
                      </span>
                      <h4 className="font-semibold text-slate-800 text-sm">{q.title}</h4>
                    </div>
                    {q.description && (
                      <p className="text-xs text-slate-500 pl-1">{q.description}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0 text-[11px]">
                    <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded">
                      {q.questionType}
                    </span>
                    {q.required && (
                      <span className="px-2 py-0.5 bg-rose-50 text-rose-600 rounded font-medium">
                        必填
                      </span>
                    )}
                    {q.scoringEnabled && (
                      <span className="px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded font-medium">
                        計分題
                      </span>
                    )}
                    {q.reverseScore && (
                      <span className="px-2 py-0.5 bg-amber-50 text-amber-600 rounded font-medium">
                        反向計分
                      </span>
                    )}
                    {q.visibilityRules && (
                      <span className="px-2 py-0.5 bg-amber-50 text-amber-700 rounded font-medium flex items-center gap-1">
                        <Eye className="w-3 h-3" />
                        <span>條件跳題</span>
                      </span>
                    )}
                  </div>
                </div>

                {q.choices.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pl-4 pt-1">
                    {q.choices.map((c, cIdx) => (
                      <div
                        key={cIdx}
                        className="flex items-center justify-between text-xs bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200/60"
                      >
                        <span className="text-slate-700 font-medium">{c.label}</span>
                        <div className="flex items-center gap-1.5">
                          {c.isOther && (
                            <span className="text-[10px] px-1.5 py-0.5 bg-amber-100 text-amber-800 rounded">
                              其他
                            </span>
                          )}
                          {c.isNoneOfAbove && (
                            <span className="text-[10px] px-1.5 py-0.5 bg-purple-100 text-purple-800 rounded">
                              以上皆非
                            </span>
                          )}
                          {c.scoreEnabled && (
                            <span className="text-indigo-600 font-semibold">
                              {c.score !== null ? `${c.score}分` : "不計分"}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
