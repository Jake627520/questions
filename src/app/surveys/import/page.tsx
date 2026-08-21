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
import { validateSurveyExcel } from "@/lib/validateSurveyExcel";
import { ClientValidationResult } from "@/types/surveyImport";

export default function ImportSurveyPage() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("2026 產品體驗與服務滿意度調查");
  const [description, setDescription] = useState(
    "感謝您撥冗填寫，本問卷旨在評估產品功能與體驗回饋。"
  );
  const [status, setStatus] = useState<"PUBLISHED" | "DRAFT">("DRAFT");

  const [previewData, setPreviewData] = useState<QuestionInput[] | null>(null);
  const [previewErrors, setPreviewErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [clientValidation, setClientValidation] = useState<ClientValidationResult | null>(null);
  const [isClientValidating, setIsClientValidating] = useState(false);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
      setPreviewData(null);
      setPreviewErrors([]);
      setClientValidation(null);

      setIsClientValidating(true);
      try {
        const result = await validateSurveyExcel(selectedFile);
        setClientValidation(result);
      } catch (err: any) {
        setClientValidation({
          isValid: false,
          errors: [
            {
              code: "FILE_PARSE_FAILED",
              severity: "error",
              sheet: "system",
              message: err?.message || "前端驗證過程發生錯誤",
            },
          ],
          warnings: [],
        });
      } finally {
        setIsClientValidating(false);
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
        if (Array.isArray(data.errors) && data.errors.length > 0 && typeof data.errors[0] === "object") {
          setPreviewErrors(data.errors.map((e: any) => e.message || String(e)));
        } else if (Array.isArray(data.errors)) {
          setPreviewErrors(data.errors);
        } else {
          setPreviewErrors([data.error || "解析失敗"]);
        }
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

    // ===== 新增：PUBLISHED 二次確認 =====
    if (status === 'PUBLISHED') {
      const questionCount = clientValidation?.summary?.questionCount ?? previewData?.length ?? '?';
      const choiceCount = clientValidation?.summary?.choiceCount ?? '?';

      const confirmed = window.confirm(
        `您即將「直接發布」這份問卷！\n\n` +
        `預計匯入：${questionCount} 題 / ${choiceCount} 個選項\n\n` +
        `發布後填答者即可立即填寫。\n` +
        `確定要繼續嗎？\n\n` +
        `（建議測試時先選擇「儲存為草稿」）`
      );

      if (!confirmed) return;
    }
    // ===== 確認結束 =====

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
        let errorList: string[] = [];
        if (Array.isArray(data.errors) && data.errors.length > 0 && typeof data.errors[0] === "object") {
          errorList = data.errors.map((e: any) => e.message || String(e));
        } else if (Array.isArray(data.errors)) {
          errorList = data.errors;
        } else {
          errorList = [data.details ? `${data.error}: ${data.details}` : data.error || "匯入失敗"];
        }
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

      {/* ===== 題庫製作注意事項（可收合） ===== */}
      <details className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm group">
        <summary className="font-semibold cursor-pointer text-slate-800 list-none flex items-center gap-2 select-none">
          <span className="text-blue-600">📋</span>
          <span>題庫製作注意事項（點擊展開 / 收合）</span>
          <span className="ml-auto text-xs text-slate-400 group-open:hidden">點擊查看完整規則</span>
          <span className="ml-auto text-xs text-slate-400 hidden group-open:inline">點擊收合</span>
        </summary>

        <div className="mt-4 space-y-4 text-slate-600 text-xs leading-relaxed border-t border-slate-200 pt-4">
          {/* 1. 必要工作表 */}
          <div>
            <p className="font-semibold text-slate-800 mb-1">1. 必要工作表</p>
            <ul className="list-disc pl-5 space-y-0.5">
              <li><code className="bg-slate-200 px-1 rounded">questions</code>（題目）— <strong>必須有</strong></li>
              <li><code className="bg-slate-200 px-1 rounded">choices</code>（選項）— 建議有（選擇題需要）</li>
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
            <p className="font-semibold text-slate-800 mb-1">4. 特殊字元與填寫規則</p>
            <ul className="list-disc pl-5 space-y-0.5">
              <li><strong>title、label、description</strong>：可使用特殊字元（$ % ^ & 中文 標點都可以）</li>
              <li><strong>code、value</strong>：建議只用英數字與底線（A-Z a-z 0-9 _），避免特殊字元</li>
              <li>空白列會被自動忽略</li>
              <li>有部分資料但缺少必填欄位 → <span className="text-red-600 font-medium">會報錯</span></li>
              <li>code 重複、題型錯誤、選項指到不存在的題目 → <span className="text-red-600 font-medium">會報錯</span></li>
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
              <option value="DRAFT">儲存為草稿 (DRAFT)</option>
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
              支援標準雙 Sheet 格式 (questions, choices) 及簡寫跳題語法
            </div>
          </div>
        </div>

        {/* ===== 前端快速驗證結果 ===== */}
        {isClientValidating && (
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl text-blue-700 text-sm">
            🔍 正在進行前端快速檢查...
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
                <span>✅ 前端驗證通過</span>
              ) : (
                <span>❌ 前端驗證未通過，請修正後再匯入</span>
              )}
            </div>

            {clientValidation.summary && (
              <p className="text-xs opacity-80">
                預計匯入 {clientValidation.summary.questionCount} 題，
                {clientValidation.summary.choiceCount} 個選項
              </p>
            )}

            {clientValidation.errors.length > 0 && (
              <ul className="list-disc pl-5 text-xs space-y-0.5 mt-1">
                {clientValidation.errors.map((err, i) => (
                  <li key={`client-err-${i}`}>
                    [{err.sheet}]
                    {err.row ? ` 第 ${err.row} 列` : ''}
                    {' '}{err.message}
                  </li>
                ))}
              </ul>
            )}

            {clientValidation.warnings.length > 0 && (
              <ul className="list-disc pl-5 text-xs space-y-0.5 mt-1 text-amber-700">
                {clientValidation.warnings.map((warn, i) => (
                  <li key={`client-warn-${i}`}>
                    [警告] [{warn.sheet}]
                    {warn.row ? ` 第 ${warn.row} 列` : ''}
                    {' '}{warn.message}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

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
              disabled={
                saving ||
                !file ||
                isClientValidating ||
                (clientValidation !== null && !clientValidation.isValid)
              }
              className="inline-flex items-center gap-1.5 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg shadow-sm transition disabled:opacity-50 disabled:cursor-not-allowed"
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
