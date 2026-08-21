"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Sparkles,
  Send,
  ArrowLeft,
  Eye,
  Save,
  BookmarkCheck,
  Lightbulb,
} from "lucide-react";
import Link from "next/link";
import { isQuestionVisible } from "@/lib/survey-engine";

interface Choice {
  id: string;
  orderNum: number;
  label: string;
  value: string;
  scoreEnabled: boolean;
  score: number | null;
  isOther: boolean;
  requiresText: boolean;
  isNoneOfAbove: boolean;
}

interface Question {
  id: string;
  orderNum: number;
  code: string;
  title: string;
  description: string | null;
  questionType: "single_choice" | "multiple_choice" | "text" | "number" | "yes_no" | "info";
  required: boolean;
  scoringEnabled: boolean;
  reverseScore: boolean;
  visibilityRules?: any;
  visibilityHint?: string | null;
  minSelections?: number | null;
  maxSelections?: number | null;
  minValue?: number | null;
  maxValue?: number | null;
  choices: Choice[];
}

interface Survey {
  id: string;
  version: number;
  title: string;
  description: string | null;
  status: string;
  questions: Question[];
}

export default function FillSurveyPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = params.id as string;
  const initialResponseId = searchParams.get("responseId") || undefined;

  const [survey, setSurvey] = useState<Survey | null>(null);
  const [loading, setLoading] = useState(true);
  const [responseId, setResponseId] = useState<string | undefined>(initialResponseId);
  const [draftSavedNotice, setDraftSavedNotice] = useState<string | null>(null);

  const [answers, setAnswers] = useState<{
    [questionCode: string]: {
      rawValue: any;
      otherText?: string;
    };
  }>({});
  const [submitting, setSubmitting] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [errors, setErrors] = useState<{ [questionCode: string]: string }>({});

  useEffect(() => {
    async function init() {
      try {
        setLoading(true);
        const res = await fetch(`/api/surveys/${id}`);
        const data = await res.json();
        if (data.survey) {
          setSurvey(data.survey);
        }

        if (initialResponseId) {
          const respRes = await fetch(`/api/surveys/${id}/responses/${initialResponseId}`);
          if (respRes.ok) {
            const respData = await respRes.json();
            if (respData.answers) {
              const loadedMap: any = {};
              respData.answers.forEach((ans: any) => {
                loadedMap[ans.questionCode] = {
                  rawValue: ans.rawValue,
                  otherText: ans.otherText || "",
                };
              });
              setAnswers(loadedMap);
              setDraftSavedNotice("已成功載入先前暫存的作答進度！");
            }
          }
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    if (id) init();
  }, [id, initialResponseId]);

  // 動態計算各題目的可見性（支援 Choice Label 比對）
  const visibilityMap = useMemo(() => {
    if (!survey) return new Map<string, boolean>();
    const answerMap = new Map<string, any>();
    Object.entries(answers).forEach(([code, val]) => {
      answerMap.set(code, { questionCode: code, rawValue: val.rawValue, otherText: val.otherText });
    });

    const questionsMap = new Map<string, any>();
    survey.questions.forEach((q) => questionsMap.set(q.code, q));

    const map = new Map<string, boolean>();
    survey.questions.forEach((q) => {
      map.set(q.code, isQuestionVisible(q as any, answerMap, questionsMap));
    });
    return map;
  }, [survey, answers]);

  const handleSingleChoiceChange = (qCode: string, value: string) => {
    setAnswers((prev) => ({
      ...prev,
      [qCode]: {
        ...prev[qCode],
        rawValue: value,
      },
    }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[qCode];
      return next;
    });
  };

  const handleMultipleChoiceChange = (q: Question, choice: Choice) => {
    const prevRaw = answers[q.code]?.rawValue || [];
    let currentList: string[] = Array.isArray(prevRaw) ? [...prevRaw] : [];

    if (choice.isNoneOfAbove) {
      if (currentList.includes(choice.value)) {
        currentList = [];
      } else {
        currentList = [choice.value];
      }
    } else {
      const noneChoiceValues = q.choices
        .filter((c) => c.isNoneOfAbove)
        .map((c) => c.value);
      currentList = currentList.filter((v) => !noneChoiceValues.includes(v));

      if (currentList.includes(choice.value)) {
        currentList = currentList.filter((v) => v !== choice.value);
      } else {
        currentList.push(choice.value);
      }
    }

    setAnswers((prev) => ({
      ...prev,
      [q.code]: {
        ...prev[q.code],
        rawValue: currentList,
      },
    }));

    setErrors((prev) => {
      const next = { ...prev };
      delete next[q.code];
      return next;
    });
  };

  const handleOtherTextChange = (qCode: string, text: string) => {
    setAnswers((prev) => ({
      ...prev,
      [qCode]: {
        ...prev[qCode],
        otherText: text,
      },
    }));
  };

  const handleTextOrNumberChange = (qCode: string, value: string) => {
    setAnswers((prev) => ({
      ...prev,
      [qCode]: {
        ...prev[qCode],
        rawValue: value,
      },
    }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[qCode];
      return next;
    });
  };

  const handleSaveDraft = async () => {
    if (!survey) return;
    try {
      setSavingDraft(true);
      const payloadAnswers = Object.entries(answers).map(([code, val]) => ({
        questionCode: code,
        rawValue: val.rawValue ?? null,
        otherText: val.otherText || null,
      }));

      const res = await fetch(`/api/surveys/${survey.id}/draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          responseId,
          answers: payloadAnswers,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "暫存草稿失敗");
      } else {
        setResponseId(data.responseId);
        setDraftSavedNotice(`進度已成功暫存！(草稿編號: ${data.responseId.slice(-6)})`);
        window.history.replaceState(null, "", `/surveys/${survey.id}/fill?responseId=${data.responseId}`);
      }
    } catch (e: any) {
      alert("暫存發生錯誤：" + e.message);
    } finally {
      setSavingDraft(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!survey) return;

    const newErrors: { [qCode: string]: string } = {};

    for (const q of survey.questions) {
      const isVis = visibilityMap.get(q.code) ?? true;
      if (!isVis || q.questionType === "info") continue;

      const ans = answers[q.code];
      const hasValue =
        ans?.rawValue !== undefined &&
        ans?.rawValue !== null &&
        (Array.isArray(ans.rawValue) ? ans.rawValue.length > 0 : String(ans.rawValue).trim() !== "");

      if (q.required && !hasValue) {
        newErrors[q.code] = `此題為必填項目`;
        continue;
      }

      if (hasValue) {
        if (q.questionType === "single_choice" || q.questionType === "yes_no") {
          const selectedChoice = q.choices.find((c) => c.value === String(ans.rawValue));
          if (selectedChoice?.isOther && selectedChoice?.requiresText && !ans.otherText?.trim()) {
            newErrors[q.code] = `請填寫「${selectedChoice.label}」的補充說明`;
          }
        } else if (q.questionType === "multiple_choice") {
          const selectedList = (ans.rawValue as string[]) || [];
          if (q.minSelections && selectedList.length < q.minSelections) {
            newErrors[q.code] = `至少需選取 ${q.minSelections} 項 (目前選取 ${selectedList.length} 項)`;
          } else if (q.maxSelections && selectedList.length > q.maxSelections) {
            newErrors[q.code] = `最多只可選取 ${q.maxSelections} 項 (目前選取 ${selectedList.length} 項)`;
          }

          const selectedChoices = q.choices.filter((c) => selectedList.includes(c.value));
          for (const c of selectedChoices) {
            if (c.isOther && c.requiresText && !ans.otherText?.trim()) {
              newErrors[q.code] = `請填寫「${c.label}」的補充說明`;
              break;
            }
          }
        } else if (q.questionType === "number") {
          const num = Number(ans.rawValue);
          if (isNaN(num)) {
            newErrors[q.code] = "請輸入有效數字";
          } else if (q.minValue !== null && q.minValue !== undefined && num < q.minValue) {
            newErrors[q.code] = `數值不得小於 ${q.minValue}`;
          } else if (q.maxValue !== null && q.maxValue !== undefined && num > q.maxValue) {
            newErrors[q.code] = `數值不得大於 ${q.maxValue}`;
          }
        }
      }
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      alert("部分題目尚未完成或格式不正確，請依提示檢查。");
      return;
    }

    try {
      setSubmitting(true);
      const payloadAnswers = Object.entries(answers)
        .filter(([code]) => visibilityMap.get(code) ?? true)
        .map(([code, val]) => ({
          questionCode: code,
          rawValue: val.rawValue ?? null,
          otherText: val.otherText || null,
        }));

      const res = await fetch(`/api/surveys/${survey.id}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          responseId,
          answers: payloadAnswers,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        if (data.errors) {
          const errMap: { [code: string]: string } = {};
          data.errors.forEach((err: any) => {
            errMap[err.questionCode] = err.message;
          });
          setErrors(errMap);
        }
        alert(data.error || "提交失敗");
      } else {
        sessionStorage.setItem("last_submission_eval", JSON.stringify(data.evaluation));
        router.push(`/surveys/${survey.id}/success?responseId=${data.responseId}`);
      }
    } catch (e: any) {
      alert("提交問卷時發生錯誤：" + e.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="p-16 text-center text-slate-500 bg-white rounded-2xl border border-slate-200">
        載入問卷中...
      </div>
    );
  }

  if (!survey) {
    return (
      <div className="p-16 text-center text-slate-500 bg-white rounded-2xl border border-slate-200">
        找不到該問卷或問卷已被移除。
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-blue-600 transition"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>返回問卷列表</span>
        </Link>

        {responseId && (
          <span className="text-xs text-slate-400 font-mono">
            草稿模式: {responseId.slice(-8)}
          </span>
        )}
      </div>

      {draftSavedNotice && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BookmarkCheck className="w-4 h-4 text-emerald-600" />
            <span>{draftSavedNotice}</span>
          </div>
          <button
            onClick={() => setDraftSavedNotice(null)}
            className="text-emerald-600 hover:text-emerald-700 font-bold ml-2"
          >
            ✕
          </button>
        </div>
      )}

      {/* Survey Title Card */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-8 shadow-sm space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-xs px-2.5 py-1 bg-blue-50 text-blue-700 rounded-full font-semibold">
            線上問卷填答
          </span>
          <span className="text-xs px-2.5 py-0.5 bg-slate-100 text-slate-600 rounded-full font-medium">
            v{survey.version || 1}
          </span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 leading-tight">
          {survey.title}
        </h1>
        {survey.description && (
          <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-line">
            {survey.description}
          </p>
        )}
      </div>

      {/* Questions Form */}
      <form onSubmit={handleSubmit} className="space-y-5">
        {survey.questions.map((q) => {
          const isVisible = visibilityMap.get(q.code) ?? true;
          if (!isVisible) return null;

          const ans = answers[q.code];
          const hasError = Boolean(errors[q.code]);

          if (q.questionType === "info") {
            return (
              <div
                key={q.id}
                className="bg-blue-50/70 border border-blue-200/80 rounded-2xl p-6 text-slate-800 space-y-2"
              >
                <div className="flex items-center gap-2 font-bold text-blue-900 text-sm">
                  <Sparkles className="w-4 h-4 text-blue-600" />
                  <span>{q.title}</span>
                </div>
                {q.description && (
                  <p className="text-xs text-blue-800/90 leading-relaxed">{q.description}</p>
                )}
              </div>
            );
          }

          return (
            <div
              key={q.id}
              className={`bg-white rounded-2xl border transition p-6 shadow-sm space-y-4 ${
                hasError ? "border-rose-400 ring-2 ring-rose-100" : "border-slate-200/80"
              }`}
            >
              {/* M4: 條件題目出現時的提示文字 */}
              {q.visibilityRules && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50/80 border border-amber-200/60 rounded-xl text-xs text-amber-800 font-medium">
                  <Lightbulb className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  <span>{q.visibilityHint || "依據您前面的回答，請補充以下問題"}</span>
                </div>
              )}

              {/* Question Header */}
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold px-2 py-0.5 bg-slate-100 text-slate-700 rounded">
                      {q.code}
                    </span>
                    <h3 className="font-bold text-slate-900 text-base">
                      {q.title}
                      {q.required && <span className="text-rose-500 ml-1">*</span>}
                    </h3>
                  </div>
                  {q.description && (
                    <p className="text-xs text-slate-500 pl-1">{q.description}</p>
                  )}
                </div>

                <div className="flex items-center gap-1.5 shrink-0 text-[11px]">
                  {q.visibilityRules && (
                    <span className="px-2 py-0.5 bg-amber-50 text-amber-700 rounded font-medium flex items-center gap-1">
                      <Eye className="w-3 h-3" />
                      <span>條件跳題</span>
                    </span>
                  )}
                  {q.scoringEnabled && (
                    <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded font-semibold">
                      計分
                    </span>
                  )}
                </div>
              </div>

              {/* 複選題 min/max 提示 */}
              {q.questionType === "multiple_choice" && (q.minSelections || q.maxSelections) && (
                <div className="text-xs text-blue-600 font-medium bg-blue-50/60 px-3 py-1.5 rounded-lg">
                  選取規則：
                  {q.minSelections && `最少 ${q.minSelections} 項`}
                  {q.minSelections && q.maxSelections && "，"}
                  {q.maxSelections && `最多 ${q.maxSelections} 項`}
                  {` (目前已選 ${(ans?.rawValue as string[])?.length || 0} 項)`}
                </div>
              )}

              {/* 數值題範圍提示 */}
              {q.questionType === "number" && (q.minValue !== null || q.maxValue !== null) && (
                <div className="text-xs text-slate-500 font-medium bg-slate-50 px-3 py-1.5 rounded-lg">
                  數值有效範圍：
                  {q.minValue !== null && q.minValue !== undefined && `最小值 ${q.minValue}`}
                  {q.minValue !== null && q.maxValue !== null && " ~ "}
                  {q.maxValue !== null && q.maxValue !== undefined && `最大值 ${q.maxValue}`}
                </div>
              )}

              {/* 1. 單選 (single_choice) */}
              {q.questionType === "single_choice" && (
                <div className="space-y-2.5 pt-1">
                  {q.choices.map((c) => {
                    const isSelected = ans?.rawValue === c.value;
                    return (
                      <div key={c.id} className="space-y-2">
                        <label
                          className={`flex items-center justify-between p-3 rounded-xl border text-sm cursor-pointer transition ${
                            isSelected
                              ? "bg-blue-50/80 border-blue-500 text-blue-900 font-medium"
                              : "bg-slate-50/50 hover:bg-slate-100/70 border-slate-200/80 text-slate-700"
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <input
                              type="radio"
                              name={q.code}
                              value={c.value}
                              checked={isSelected}
                              onChange={() => handleSingleChoiceChange(q.code, c.value)}
                              className="w-4 h-4 text-blue-600 focus:ring-blue-500"
                            />
                            <span>{c.label}</span>
                          </div>
                          {c.scoreEnabled && (
                            <span className="text-xs text-indigo-500 font-medium">
                              ({c.score !== null ? `${c.score} 分` : "不計分"})
                            </span>
                          )}
                        </label>

                        {isSelected && c.isOther && (
                          <div className="pl-6 pt-1">
                            <input
                              type="text"
                              value={ans?.otherText || ""}
                              onChange={(e) => handleOtherTextChange(q.code, e.target.value)}
                              placeholder={
                                c.requiresText
                                  ? "請務必填寫此選項之補充說明 (必填)..."
                                  : "請填寫補充說明 (選填)..."
                              }
                              className="w-full px-3.5 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* 2. 複選 (multiple_choice) */}
              {q.questionType === "multiple_choice" && (
                <div className="space-y-2.5 pt-1">
                  {q.choices.map((c) => {
                    const selectedList = (ans?.rawValue as string[]) || [];
                    const isChecked = selectedList.includes(c.value);

                    return (
                      <div key={c.id} className="space-y-2">
                        <label
                          className={`flex items-center justify-between p-3 rounded-xl border text-sm cursor-pointer transition ${
                            isChecked
                              ? "bg-blue-50/80 border-blue-500 text-blue-900 font-medium"
                              : "bg-slate-50/50 hover:bg-slate-100/70 border-slate-200/80 text-slate-700"
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <input
                              type="checkbox"
                              name={q.code}
                              value={c.value}
                              checked={isChecked}
                              onChange={() => handleMultipleChoiceChange(q, c)}
                              className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                            />
                            <span>{c.label}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            {c.isNoneOfAbove && (
                              <span className="text-[11px] px-2 py-0.5 bg-purple-100 text-purple-700 rounded font-medium">
                                互斥選項
                              </span>
                            )}
                            {c.scoreEnabled && (
                              <span className="text-xs text-indigo-500 font-medium">
                                (+{c.score} 分)
                              </span>
                            )}
                          </div>
                        </label>

                        {isChecked && c.isOther && (
                          <div className="pl-6 pt-1">
                            <input
                              type="text"
                              value={ans?.otherText || ""}
                              onChange={(e) => handleOtherTextChange(q.code, e.target.value)}
                              placeholder={
                                c.requiresText
                                  ? "請務必填寫此選項之補充說明 (必填)..."
                                  : "請填寫補充說明 (選填)..."
                              }
                              className="w-full px-3.5 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* 3. 是/否 (yes_no) */}
              {q.questionType === "yes_no" && (
                <div className="grid grid-cols-2 gap-3 pt-1">
                  {["是 (Yes)", "否 (No)"].map((label, i) => {
                    const val = i === 0 ? "yes" : "no";
                    const isSelected = ans?.rawValue === val;
                    return (
                      <button
                        key={val}
                        type="button"
                        onClick={() => handleSingleChoiceChange(q.code, val)}
                        className={`py-3 px-4 rounded-xl border text-sm font-semibold transition ${
                          isSelected
                            ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                            : "bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200"
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* 4. 問答 (text) */}
              {q.questionType === "text" && (
                <textarea
                  rows={3}
                  value={ans?.rawValue || ""}
                  onChange={(e) => handleTextOrNumberChange(q.code, e.target.value)}
                  placeholder="請在此處輸入您的回答..."
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                />
              )}

              {/* 5. 數值 (number) */}
              {q.questionType === "number" && (
                <input
                  type="number"
                  value={ans?.rawValue ?? ""}
                  onChange={(e) => handleTextOrNumberChange(q.code, e.target.value)}
                  placeholder="請輸入數值..."
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                />
              )}

              {/* 錯誤提示 */}
              {hasError && (
                <div className="flex items-center gap-1.5 text-xs text-rose-600 font-medium pt-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>{errors[q.code]}</span>
                </div>
              )}
            </div>
          );
        })}

        {/* 底部按鈕 */}
        <div className="pt-4 flex items-center gap-3">
          <button
            type="button"
            onClick={handleSaveDraft}
            disabled={savingDraft || submitting}
            className="flex-1 py-3.5 px-5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-sm rounded-2xl transition flex items-center justify-center gap-2 border border-slate-200"
          >
            <Save className="w-4 h-4 text-slate-500" />
            <span>{savingDraft ? "暫存中..." : "暫存作答進度 (草稿)"}</span>
          </button>

          <button
            type="submit"
            disabled={submitting || savingDraft}
            className="flex-1 py-3.5 px-6 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold text-base rounded-2xl shadow-lg transition flex items-center justify-center gap-2"
          >
            <Send className="w-5 h-5" />
            <span>{submitting ? "提交與計分中..." : "正式提交問卷"}</span>
          </button>
        </div>
      </form>
    </div>
  );
}
