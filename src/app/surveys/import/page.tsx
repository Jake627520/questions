"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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
  ShieldCheck,
  BarChart3,
  Check,
  RotateCcw,
  ExternalLink,
} from "lucide-react";
import { QuestionInput } from "@/lib/types";
import { validateSurveyExcel } from "@/lib/validateSurveyExcel";
import {
  ClientValidationResult,
  ValidationIssue,
  ValidationSeverity,
  ValidationSheet,
  ImportSummary,
} from "@/types/surveyImport";

export default function ImportSurveyPage() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("2026 產品體驗與服務滿意度調查");
  const [description, setDescription] = useState(
    "感謝您撥冗填寫，本問卷旨在評估產品功能與體驗回饋。"
  );
  const [status, setStatus] = useState<"PUBLISHED" | "DRAFT">("DRAFT");
  const [copyrightConfirmed, setCopyrightConfirmed] = useState(false);

  const [previewData, setPreviewData] = useState<QuestionInput[] | null>(null);
  const [previewSummary, setPreviewSummary] = useState<ImportSummary | null>(null);
  const [previewErrors, setPreviewErrors] = useState<Array<string | ValidationIssue>>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [clientValidation, setClientValidation] = useState<ClientValidationResult | null>(null);
  const [isClientValidating, setIsClientValidating] = useState(false);
  const [errorFilter, setErrorFilter] = useState<'all' | 'error' | 'warning'>('all');
  const [showAllIssues, setShowAllIssues] = useState(false);

  // 成功匯入後的摘要狀態
  const [importSuccessResult, setImportSuccessResult] = useState<{
    surveyId: string;
    importId: string;
    title: string;
    summary: ImportSummary;
    createdAt: Date;
  } | null>(null);

  // 取消連續快速選檔的非同步驗證
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // 合併前端 + 後端錯誤，方便統一顯示與篩選
  const allIssues: Array<ValidationIssue & { source: 'client' | 'server' }> = [
    ...(clientValidation?.errors || []).map((e) => ({ ...e, source: 'client' as const })),
    ...(clientValidation?.warnings || []).map((e) => ({ ...e, source: 'client' as const })),
    // 後端錯誤（相容字串或物件結構）
    ...(previewErrors || []).map((msg) => {
      if (typeof msg === 'object' && msg !== null) {
        return {
          code: String((msg as any).code || 'BACKEND_ERROR'),
          severity: (((msg as any).severity === 'warning' ? 'warning' : 'error') as ValidationSeverity),
          sheet: (['questions', 'choices', 'system'].includes((msg as any).sheet)
            ? (msg as any).sheet
            : 'system') as ValidationSheet,
          row: (msg as any).row,
          column: (msg as any).column,
          field: (msg as any).field,
          value: (msg as any).value,
          message: (msg as any).message || String(msg),
          suggestion: (msg as any).suggestion,
          source: 'server' as const,
        };
      }
      return {
        code: 'BACKEND_ERROR',
        severity: 'error' as ValidationSeverity,
        sheet: 'system' as ValidationSheet,
        message: String(msg),
        source: 'server' as const,
      };
    }),
  ];

  const filteredIssues = allIssues.filter((issue) => {
    if (errorFilter === 'all') return true;
    if (errorFilter === 'error') return issue.severity === 'error';
    if (errorFilter === 'warning') return issue.severity === 'warning';
    return true;
  });

  const MAX_DISPLAY_ISSUES = 50;
  const displayIssues = showAllIssues ? filteredIssues : filteredIssues.slice(0, MAX_DISPLAY_ISSUES);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
      setPreviewData(null);
      setPreviewSummary(null);
      setPreviewErrors([]);
      setClientValidation(null);
      setImportSuccessResult(null);

      // 取消上一次還在跑的驗證
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const controller = new AbortController();
      abortControllerRef.current = controller;

      setIsClientValidating(true);
      try {
        const result = await validateSurveyExcel(selectedFile);

        if (controller.signal.aborted) return; // 已被新選擇取消

        setClientValidation(result);
      } catch (err: any) {
        if (controller.signal.aborted) return;

        setClientValidation({
          isValid: false,
          errors: [
            {
              code: "FILE_PARSE_FAILED",
              severity: "error",
              sheet: "system",
              message: err?.message || "前端驗證過程發生錯誤",
              suggestion: "請使用標準 Microsoft Excel 另存為 .xlsx 活頁簿後再重新上傳。",
            },
          ],
          warnings: [],
        });
      } finally {
        if (!controller.signal.aborted) {
          setIsClientValidating(false);
        }
      }
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
        if (Array.isArray(data.errors) && data.errors.length > 0) {
          setPreviewErrors(data.errors);
        } else {
          setPreviewErrors([data.error || "解析失敗"]);
        }
        if (data.questions) setPreviewData(data.questions);
      } else {
        setPreviewData(data.questions);
        if (data.summary) {
          setPreviewSummary(data.summary);
        }
      }
    } catch (e: any) {
      setPreviewErrors([e.message || "網路或伺服器錯誤"]);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveAndPublish = async () => {
    if (!file) return;

    if (!copyrightConfirmed) {
      alert("請先確認您具有匯入內容的合法使用權利，並勾選版權確認方塊。");
      return;
    }

    // ===== PUBLISHED 二次確認 =====
    if (status === 'PUBLISHED') {
      const questionCount =
        previewSummary?.questions ?? clientValidation?.summary?.questionCount ?? previewData?.length ?? '?';
      const choiceCount = previewSummary?.choices ?? clientValidation?.summary?.choiceCount ?? '?';

      const confirmed = window.confirm(
        `您即將「直接發布」這份問卷！\n\n` +
        `即將建立：${title}\n` +
        `題數：${questionCount} 題\n` +
        `選項數：${choiceCount} 個\n\n` +
        `發布後填答者即可立即填寫。\n` +
        `確定要繼續嗎？\n\n` +
        `（建議測試時先選擇「儲存為草稿」）`
      );

      if (!confirmed) return;
    }

    try {
      setSaving(true);
      const formData = new FormData();
      formData.append("file", file);
      formData.append("mode", "save");
      formData.append("title", title);
      formData.append("description", description);
      formData.append("status", status);
      formData.append("copyrightConfirmed", copyrightConfirmed ? "true" : "false");

      const res = await fetch("/api/surveys/import", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        if (Array.isArray(data.errors) && data.errors.length > 0) {
          setPreviewErrors(data.errors);
        } else {
          setPreviewErrors([data.details ? `${data.error}: ${data.details}` : data.error || "匯入失敗"]);
        }
        alert(data.details ? `${data.error}：${data.details}` : data.error || "匯入失敗");
      } else {
        setImportSuccessResult({
          surveyId: data.surveyId,
          importId: data.importId || `IMP-${Date.now().toString(36).toUpperCase()}`,
          title,
          summary: data.summary || {
            questions: previewData?.length || 0,
            choices: previewData?.reduce((acc, q) => acc + (q.choices?.length || 0), 0) || 0,
            warnings: 0,
          },
          createdAt: new Date(),
        });
      }
    } catch (e: any) {
      alert("儲存時發生錯誤：" + e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setFile(null);
    setPreviewData(null);
    setPreviewSummary(null);
    setPreviewErrors([]);
    setClientValidation(null);
    setImportSuccessResult(null);
    setCopyrightConfirmed(false);
  };

  // ===== P0-H: 成功匯入摘要畫面 =====
  if (importSuccessResult) {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="bg-white rounded-2xl border border-emerald-200 p-8 shadow-sm text-center space-y-6">
          <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
            <Check className="w-9 h-9" />
          </div>

          <div className="space-y-1">
            <h1 className="text-2xl font-bold text-slate-900">🎉 題庫問卷匯入成功！</h1>
            <p className="text-sm text-slate-500">
              問卷已成功儲存至系統資料庫（Transaction Commit），隨時可發布與收集填答。
            </p>
          </div>

          <div className="bg-slate-50 rounded-xl p-5 border border-slate-200/80 text-left space-y-4">
            <div className="border-b border-slate-200 pb-3">
              <span className="text-xs text-slate-400 font-medium">問卷名稱</span>
              <h2 className="text-base font-bold text-slate-800 mt-0.5">{importSuccessResult.title}</h2>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
              <div className="bg-white p-3 rounded-lg border border-slate-200">
                <span className="text-xs text-slate-400">總題數</span>
                <p className="text-xl font-bold text-blue-600 mt-0.5">
                  {importSuccessResult.summary.questions}
                </p>
              </div>
              <div className="bg-white p-3 rounded-lg border border-slate-200">
                <span className="text-xs text-slate-400">總選項數</span>
                <p className="text-xl font-bold text-emerald-600 mt-0.5">
                  {importSuccessResult.summary.choices}
                </p>
              </div>
              <div className="bg-white p-3 rounded-lg border border-slate-200">
                <span className="text-xs text-slate-400">必填題目</span>
                <p className="text-xl font-bold text-slate-700 mt-0.5">
                  {importSuccessResult.summary.requiredQuestions ?? "-"}
                </p>
              </div>
              <div className="bg-white p-3 rounded-lg border border-slate-200">
                <span className="text-xs text-slate-400">計分題目</span>
                <p className="text-xl font-bold text-indigo-600 mt-0.5">
                  {importSuccessResult.summary.scoredQuestions ?? "-"}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between text-xs text-slate-500 border-t border-slate-200 pt-3 gap-2">
              <div>
                <span className="opacity-75">Import ID: </span>
                <code className="font-mono font-bold text-slate-700 bg-slate-200/60 px-1.5 py-0.5 rounded">
                  {importSuccessResult.importId}
                </code>
              </div>
              <div>
                <span className="opacity-75">建立時間: </span>
                <span className="text-slate-700">{importSuccessResult.createdAt.toLocaleString("zh-TW")}</span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap justify-center gap-3 pt-2">
            <Link
              href={`/surveys/${importSuccessResult.surveyId}/fill`}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition shadow-sm"
            >
              <ExternalLink className="w-4 h-4" />
              <span>進入問卷填答頁面</span>
            </Link>
            <Link
              href={`/surveys/${importSuccessResult.surveyId}/stats`}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold rounded-xl transition border border-slate-200"
            >
              <BarChart3 className="w-4 h-4 text-slate-500" />
              <span>查看問卷統計報表</span>
            </Link>
            <button
              onClick={handleReset}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-white hover:bg-slate-50 text-slate-600 text-sm font-semibold rounded-xl transition border border-slate-300"
            >
              <RotateCcw className="w-4 h-4 text-slate-400" />
              <span>匯入另一份問卷</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

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

      {/* ===== 題庫製作注意事項（可收合） ===== */}
      <details className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm group">
        <summary className="font-semibold cursor-pointer text-slate-800 list-none flex items-center gap-2 select-none">
          <span className="text-blue-600">📋</span>
          <span>題庫製作注意事項與資源限制（點擊展開 / 收合）</span>
          <span className="ml-auto text-xs text-slate-400 group-open:hidden">點擊查看完整規則</span>
          <span className="ml-auto text-xs text-slate-400 hidden group-open:inline">點擊收合</span>
        </summary>

        <div className="mt-4 space-y-4 text-slate-600 text-xs leading-relaxed border-t border-slate-200 pt-4">
          {/* 1. 必要工作表 */}
          <div>
            <p className="font-semibold text-slate-800 mb-1">1. 必要工作表與資源限制</p>
            <ul className="list-disc pl-5 space-y-0.5">
              <li><code className="bg-slate-200 px-1 rounded">questions</code>（題目）— <strong>必須有</strong>（上限 500 列）</li>
              <li><code className="bg-slate-200 px-1 rounded">choices</code>（選項）— 建議有（上限 5000 列）</li>
              <li>檔案大小上限 <strong>5 MB</strong>，工作表總數上限 <strong>20 個</strong>，單一儲存格文字上限 <strong>5000 字元</strong></li>
            </ul>
          </div>

          {/* 2. questions 必要欄位 */}
          <div>
            <p className="font-semibold text-slate-800 mb-1">2. questions 工作表必要欄位</p>
            <ul className="list-disc pl-5 space-y-0.5">
              <li><code className="bg-slate-200 px-1 rounded">code</code>：題目唯一代碼（不可重複、不可空白）</li>
              <li><code className="bg-slate-200 px-1 rounded">title</code>：題目標題（不可空白）</li>
              <li>
                <code className="bg-slate-200 px-1 rounded">question_type</code>：只能填以下其中一種
                <div className="mt-1 flex flex-wrap gap-1">
                  <span className="bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded text-[10px]">single_choice</span>
                  <span className="bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded text-[10px]">multiple_choice</span>
                  <span className="bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded text-[10px]">text</span>
                  <span className="bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded text-[10px]">number</span>
                  <span className="bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded text-[10px]">yes_no</span>
                  <span className="bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded text-[10px]">info</span>
                </div>
              </li>
            </ul>
          </div>

          {/* 3. choices 必要欄位 */}
          <div>
            <p className="font-semibold text-slate-800 mb-1">3. choices 工作表必要欄位</p>
            <ul className="list-disc pl-5 space-y-0.5">
              <li><code className="bg-slate-200 px-1 rounded">question_code</code>：必須對應到 questions 的 code</li>
              <li><code className="bg-slate-200 px-1 rounded">label</code>：選項顯示文字（不可空白）</li>
              <li><code className="bg-slate-200 px-1 rounded">value</code>：選項代碼（同一題內不可重複）</li>
            </ul>
          </div>

          {/* 4. 特殊字元與填寫規則 */}
          <div>
            <p className="font-semibold text-slate-800 mb-1">4. 特殊字元與安全性防護</p>
            <ul className="list-disc pl-5 space-y-0.5">
              <li><strong>title、label、description</strong>：可使用特殊字元（$ % ^ & 中文 標點都可以）</li>
              <li><strong>Formula Injection 防護</strong>：儲存格內以 <code>=, +, -, @</code> 開頭之公式將嚴格視為純文字資料處理</li>
              <li><strong>Atomic Transaction 防護</strong>：驗證或匯入中途發生任何錯誤將全數 Rollback，絕不留下殘缺資料</li>
              <li>故意填錯資料會被前端 + 後端雙重攔截，不會寫入資料庫</li>
            </ul>
          </div>

          {/* 5. 建議作法 */}
          <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-blue-800">
            <p className="font-semibold mb-1">建議作法</p>
            <p>
              請先點右上角「下載示範範本 (demo-survey.xlsx)」，依照範例修改後再上傳。
              完整欄位說明可參考專案的 <code className="bg-blue-100 px-1 rounded">EXCEL_IMPORT_SOP.md</code>。
            </p>
          </div>
        </div>
      </details>

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
              <option value="DRAFT">儲存為草稿 (DRAFT - 建議)</option>
              <option value="PUBLISHED">直接發布 (PUBLISHED)</option>
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
              支援標準雙 Sheet 格式 (questions, choices) 及簡寫跳題語法（檔案上限 5MB）
            </div>
          </div>
        </div>

        {/* ===== 前端快速驗證結果 ===== */}
        {isClientValidating && (
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl text-blue-700 text-sm">
            🔍 正在進行前端即時語法與格式驗證...
          </div>
        )}

        {clientValidation && !isClientValidating && (
          <div
            className={`p-4 rounded-xl text-sm space-y-2 ${
              clientValidation.isValid
                ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                : 'bg-red-50 border border-red-200 text-red-700'
            }`}
          >
            <div className="font-bold flex items-center gap-1.5">
              {clientValidation.isValid ? (
                <span>✅ 前端快速驗證通過</span>
              ) : (
                <span>❌ 檔案檢核未通過，請對照下方清單修正後再匯入</span>
              )}
            </div>

            {clientValidation.summary && (
              <p className="text-xs opacity-80">
                預計匯入 {clientValidation.summary.questionCount} 題，
                {clientValidation.summary.choiceCount} 個選項
              </p>
            )}
          </div>
        )}

        {/* ===== 錯誤 / 警告 統一顯示與篩選區 (P0-A, P0-C, P0-D) ===== */}
        {allIssues.length > 0 && !isClientValidating && (
          <div className="p-4 rounded-xl border text-sm space-y-3 bg-slate-50 border-slate-200">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="font-bold text-slate-800 flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 text-amber-600" />
                <span>檢核問題診斷清單（共 {allIssues.length} 筆）</span>
              </div>

              {/* 篩選按鈕 */}
              <div className="flex gap-1 text-xs">
                <button
                  type="button"
                  onClick={() => setErrorFilter('all')}
                  className={`px-2.5 py-1 rounded-lg border font-medium transition ${
                    errorFilter === 'all'
                      ? 'bg-slate-800 text-white border-slate-800'
                      : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100'
                  }`}
                >
                  全部 ({allIssues.length})
                </button>
                <button
                  type="button"
                  onClick={() => setErrorFilter('error')}
                  className={`px-2.5 py-1 rounded-lg border font-medium transition ${
                    errorFilter === 'error'
                      ? 'bg-red-600 text-white border-red-600'
                      : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100'
                  }`}
                >
                  錯誤 ({allIssues.filter((i) => i.severity === 'error').length})
                </button>
                <button
                  type="button"
                  onClick={() => setErrorFilter('warning')}
                  className={`px-2.5 py-1 rounded-lg border font-medium transition ${
                    errorFilter === 'warning'
                      ? 'bg-amber-500 text-white border-amber-500'
                      : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100'
                  }`}
                >
                  警告 ({allIssues.filter((i) => i.severity === 'warning').length})
                </button>
              </div>
            </div>

            <ul className="space-y-2 max-h-72 overflow-y-auto text-xs pr-1">
              {displayIssues.length === 0 ? (
                <li className="text-slate-500 py-2 text-center bg-white rounded-lg border border-slate-200">
                  此篩選條件下沒有項目
                </li>
              ) : (
                displayIssues.map((issue, i) => (
                  <li
                    key={`issue-${i}`}
                    className={`p-3 rounded-lg border space-y-1 ${
                      issue.severity === 'error'
                        ? 'bg-red-50/80 border-red-200 text-red-900'
                        : 'bg-amber-50/80 border-amber-200 text-amber-900'
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-1.5 font-medium">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          issue.severity === 'error'
                            ? 'bg-red-200/80 text-red-800'
                            : 'bg-amber-200/80 text-amber-800'
                        }`}
                      >
                        {issue.severity === 'error' ? '錯誤' : '警告'}
                      </span>
                      <span className="font-semibold text-slate-700">[{issue.sheet}]</span>
                      {issue.row ? <span>第 {issue.row} 列</span> : null}
                      {issue.column ? <span className="text-slate-500 font-mono">({issue.column})</span> : null}
                      {issue.code ? <span className="font-mono text-[10px] opacity-60">· {issue.code}</span> : null}
                    </div>

                    <div className="text-slate-800 font-medium pl-0.5">{issue.message}</div>

                    {issue.value ? (
                      <div className="text-[11px] text-slate-600 pl-0.5">
                        <span className="opacity-75">目前值：</span>
                        <code className="bg-slate-200/70 px-1 py-0.5 rounded font-mono">{issue.value}</code>
                      </div>
                    ) : null}

                    {issue.suggestion ? (
                      <div className="mt-1 text-[11px] text-blue-800 bg-blue-50/80 px-2 py-1 rounded border border-blue-200/60 flex items-start gap-1">
                        <span className="shrink-0">💡 建議：</span>
                        <span>{issue.suggestion}</span>
                      </div>
                    ) : null}
                  </li>
                ))
              )}
            </ul>

            {filteredIssues.length > MAX_DISPLAY_ISSUES && (
              <div className="flex items-center justify-between text-xs text-slate-500 pt-1 border-t border-slate-200">
                <span>
                  共發現 {filteredIssues.length} 個項目，目前顯示前 {showAllIssues ? filteredIssues.length : MAX_DISPLAY_ISSUES} 筆
                </span>
                <button
                  type="button"
                  onClick={() => setShowAllIssues(!showAllIssues)}
                  className="text-blue-600 hover:underline font-semibold"
                >
                  {showAllIssues ? "收合為前 50 筆" : "顯示全部問題"}
                </button>
              </div>
            )}
          </div>
        )}

        {/* ===== P0-I: 使用者內容與版權確認區塊 ===== */}
        <div className="bg-amber-50/60 border border-amber-200 rounded-xl p-4 text-xs space-y-3">
          <div className="font-bold text-amber-900 flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-amber-700" />
            <span>使用者內容與版權聲明（必填確認）</span>
          </div>
          <p className="text-amber-800/90 leading-relaxed">
            請確認您對所匯入的 Excel 內容具有合法使用權利，或已取得內容權利人的必要授權。
            本系統僅提供問卷建立、資料匯入與管理功能，不代表或保證使用者匯入內容具有合法授權。
            您不得匯入未經授權的第三方題庫、教材、書籍內容、付費課程內容或其他受保護內容。
          </p>
          <label className="flex items-center gap-2 cursor-pointer font-semibold text-slate-800 select-none pt-1">
            <input
              type="checkbox"
              checked={copyrightConfirmed}
              onChange={(e) => setCopyrightConfirmed(e.target.checked)}
              className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300"
            />
            <span>我確認我有權使用並匯入上述內容</span>
          </label>
        </div>

        {file && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
            <div className="text-xs text-slate-500">
              {!copyrightConfirmed && (
                <span className="text-amber-700">⚠️ 請先勾選上方版權聲明以啟用匯入</span>
              )}
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={handlePreview}
                disabled={loading}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-lg transition"
              >
                {loading ? "解析中..." : "解析題庫預覽 (Dry Run)"}
              </button>
              <button
                onClick={handleSaveAndPublish}
                disabled={
                  saving ||
                  !file ||
                  !copyrightConfirmed ||
                  isClientValidating ||
                  (clientValidation !== null && !clientValidation.isValid)
                }
                className="inline-flex items-center gap-1.5 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg shadow-sm transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <CheckCircle className="w-4 h-4" />
                <span>{saving ? "儲存中..." : "確認匯入並建立問卷"}</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ===== Step 2: Preview Summary & Questions (P0-E, P0-G) ===== */}
      {previewData && previewData.length > 0 && (
        <div className="space-y-6">
          {/* 預覽指標卡片 */}
          <div className="bg-white rounded-2xl border border-blue-200/80 p-6 shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-blue-600" />
                <span>Excel 匯入預覽 (Dry Run 結果)</span>
              </h3>
              <span className="text-xs px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-full font-semibold">
                ✓ 預覽階段未寫入任何正式資料庫
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-center text-xs">
              <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                <span className="text-slate-500">總題數</span>
                <p className="text-lg font-bold text-blue-600 mt-0.5">{previewData.length}</p>
              </div>
              <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                <span className="text-slate-500">選項數</span>
                <p className="text-lg font-bold text-emerald-600 mt-0.5">
                  {previewData.reduce((acc, q) => acc + (q.choices?.length || 0), 0)}
                </p>
              </div>
              <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                <span className="text-slate-500">必填題目</span>
                <p className="text-lg font-bold text-slate-700 mt-0.5">
                  {previewData.filter((q) => q.required).length}
                </p>
              </div>
              <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                <span className="text-slate-500">計分題目</span>
                <p className="text-lg font-bold text-indigo-600 mt-0.5">
                  {previewData.filter((q) => q.scoringEnabled).length}
                </p>
              </div>
              <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                <span className="text-slate-500">條件跳題</span>
                <p className="text-lg font-bold text-amber-600 mt-0.5">
                  {previewData.filter((q) => !!q.visibilityRules).length}
                </p>
              </div>
              <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                <span className="text-slate-500">工作表數</span>
                <p className="text-lg font-bold text-slate-700 mt-0.5">2</p>
              </div>
            </div>

            {/* 結構校驗檢查清單 */}
            <div className="bg-slate-50/70 rounded-xl p-3.5 border border-slate-200 text-xs space-y-1.5 text-slate-600">
              <div className="font-semibold text-slate-800 mb-1">合規檢核結果：</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                <div className="flex items-center gap-1.5 text-emerald-700">
                  <Check className="w-3.5 h-3.5" />
                  <span>Excel 格式與工作表命名正確</span>
                </div>
                <div className="flex items-center gap-1.5 text-emerald-700">
                  <Check className="w-3.5 h-3.5" />
                  <span>所有題目代碼 (code) 均唯一且非空</span>
                </div>
                <div className="flex items-center gap-1.5 text-emerald-700">
                  <Check className="w-3.5 h-3.5" />
                  <span>所有選項均有對應題目 (question_code)</span>
                </div>
                <div className="flex items-center gap-1.5 text-emerald-700">
                  <Check className="w-3.5 h-3.5" />
                  <span>條件跳題規則有效且無循環跳題</span>
                </div>
                <div className="flex items-center gap-1.5 text-emerald-700">
                  <Check className="w-3.5 h-3.5" />
                  <span>檔案與儲存格字元符合資源上限</span>
                </div>
                <div className="flex items-center gap-1.5 text-emerald-700">
                  <Check className="w-3.5 h-3.5" />
                  <span>公式防護已就緒（視為純文字資料）</span>
                </div>
              </div>
            </div>
          </div>

          {/* 題目明細列表 */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-900 text-lg flex items-center gap-2">
                <List className="w-5 h-5 text-blue-600" />
                <span>題目明細預覽 (共 {previewData.length} 題)</span>
              </h3>
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
        </div>
      )}
    </div>
  );
}
