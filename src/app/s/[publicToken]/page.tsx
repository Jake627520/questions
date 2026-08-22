"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Sparkles,
  Send,
  Save,
  BookmarkCheck,
  Lightbulb,
} from "lucide-react";
import { isQuestionVisible } from "@/lib/survey-engine";

interface Choice {
  id: string;
  orderNum: number;
  label: string;
  value: string;
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
  visibilityRules?: any;
  visibilityHint?: string | null;
  minSelections?: number | null;
  maxSelections?: number | null;
  minValue?: number | null;
  maxValue?: number | null;
  choices: Choice[];
}

interface PublicSurvey {
  publicToken: string;
  version: number;
  title: string;
  description: string | null;
  isAnonymous: boolean;
  collectIdentity: boolean;
  questions: Question[];
}

export default function PublicSurveyPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const publicToken = params.publicToken as string;
  const initialResponseId = searchParams.get("responseId");

  const [survey, setSurvey] = useState<PublicSurvey | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 作答狀態
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [otherTexts, setOtherTexts] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [draftSavedMessage, setDraftSavedMessage] = useState<string | null>(null);
  const [currentResponseId, setCurrentResponseId] = useState<string | undefined>(
    initialResponseId || undefined
  );
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    async function loadPublicSurvey() {
      try {
        setLoading(true);
        const res = await fetch(`/api/public/surveys/${publicToken}`);
        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.error || "找不到該問卷");
        }
        const data = await res.json();
        setSurvey(data.survey);

        if (initialResponseId) {
          try {
            const draftRes = await fetch(`/api/public/surveys/${publicToken}/draft/${initialResponseId}`);
            if (draftRes.ok) {
              const draftData = await draftRes.json();
              const initialAnswers: Record<string, any> = {};
              const initialOtherTexts: Record<string, string> = {};

              draftData.answers.forEach((ans: any) => {
                initialAnswers[ans.questionCode] = ans.rawValue;
                if (ans.otherText) {
                  initialOtherTexts[ans.questionCode] = ans.otherText;
                }
              });

              setAnswers(initialAnswers);
              setOtherTexts(initialOtherTexts);
            }
          } catch (e) {
            console.error("載入草稿失敗:", e);
          }
        }
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    if (publicToken) {
      loadPublicSurvey();
    }
  }, [publicToken, initialResponseId]);

  const visibleQuestions = useMemo(() => {
    if (!survey) return [];
    const answersMap = new Map(
      Object.entries(answers).map(([code, rawValue]) => [
        code,
        { questionCode: code, rawValue, otherText: otherTexts[code] },
      ])
    );
    const questionsMap = new Map(survey.questions.map((q) => [q.code, q as any]));
    return survey.questions.filter((q) => isQuestionVisible(q as any, answersMap, questionsMap));
  }, [survey, answers, otherTexts]);

  const totalQuestions = visibleQuestions.length;
  const answeredCount = visibleQuestions.filter((q) => {
    if (q.questionType === "info") return true;
    const val = answers[q.code];
    if (val === undefined || val === null || val === "") return false;
    if (Array.isArray(val) && val.length === 0) return false;
    return true;
  }).length;

  const progressPercent = totalQuestions > 0 ? Math.round((answeredCount / totalQuestions) * 100) : 0;

  const handleSingleChoice = (questionCode: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [questionCode]: value }));
    setValidationErrors((prev) => {
      const next = { ...prev };
      delete next[questionCode];
      return next;
    });
  };

  const handleMultipleChoice = (questionCode: string, value: string, isNoneOfAbove: boolean) => {
    setAnswers((prev) => {
      const current = (prev[questionCode] as string[]) || [];
      let updated: string[];

      if (isNoneOfAbove) {
        updated = current.includes(value) ? [] : [value];
      } else {
        const withoutNone = current.filter((v) => {
          const opt = survey?.questions
            .find((q) => q.code === questionCode)
            ?.choices.find((c) => c.value === v);
          return !opt?.isNoneOfAbove;
        });

        if (withoutNone.includes(value)) {
          updated = withoutNone.filter((v) => v !== value);
        } else {
          updated = [...withoutNone, value];
        }
      }

      return { ...prev, [questionCode]: updated };
    });

    setValidationErrors((prev) => {
      const next = { ...prev };
      delete next[questionCode];
      return next;
    });
  };

  const handleTextChange = (questionCode: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [questionCode]: value }));
    setValidationErrors((prev) => {
      const next = { ...prev };
      delete next[questionCode];
      return next;
    });
  };

  const handleSaveDraft = async () => {
    if (!survey) return;
    setSavingDraft(true);
    setDraftSavedMessage(null);

    const formattedAnswers = Object.entries(answers).map(([code, rawValue]) => ({
      questionCode: code,
      rawValue,
      otherText: otherTexts[code] || undefined,
    }));

    try {
      const res = await fetch(`/api/public/surveys/${publicToken}/draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          responseId: currentResponseId,
          answers: formattedAnswers,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "儲存草稿失敗");

      setCurrentResponseId(data.responseId);
      setDraftSavedMessage("草稿已成功儲存！");
      setTimeout(() => setDraftSavedMessage(null), 3000);
    } catch (err: any) {
      alert(`儲存草稿失敗：${err.message}`);
    } finally {
      setSavingDraft(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!survey) return;

    // 前端防呆檢查
    const errors: Record<string, string> = {};
    for (const q of visibleQuestions) {
      if (q.questionType === "info") continue;
      const val = answers[q.code];
      if (q.required) {
        if (val === undefined || val === null || val === "" || (Array.isArray(val) && val.length === 0)) {
          errors[q.code] = "此題為必填題";
        }
      }
    }

    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    setSubmitting(true);

    const formattedAnswers = Object.entries(answers).map(([code, rawValue]) => ({
      questionCode: code,
      rawValue,
      otherText: otherTexts[code] || undefined,
    }));

    try {
      const res = await fetch(`/api/public/surveys/${publicToken}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          responseId: currentResponseId,
          answers: formattedAnswers,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        if (data.errors && Array.isArray(data.errors)) {
          const serverErrMap: Record<string, string> = {};
          data.errors.forEach((err: any) => {
            if (err.questionCode) serverErrMap[err.questionCode] = err.message;
          });
          setValidationErrors(serverErrMap);
        }
        throw new Error(data.error || "問卷提交失敗");
      }

      alert("問卷填答完成，感謝您的參與！");
      router.push(`/s/${publicToken}/success`);
    } catch (err: any) {
      alert(`提交失敗：${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-slate-600 font-medium">載入問卷中...</p>
        </div>
      </div>
    );
  }

  if (error || !survey) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-slate-200 p-8 text-center">
          <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">無法載入問卷</h2>
          <p className="text-slate-600 text-sm mb-6">{error || "問卷可能不存在或已結束"}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-50 text-slate-900 pb-24">
      {/* 頂部進度條 */}
      <div className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-slate-200 shadow-sm">
        <div className="max-w-3xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between gap-4 text-xs font-semibold text-slate-600 mb-1.5">
            <span>填答進度</span>
            <span>{progressPercent}%</span>
          </div>
          <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-600 transition-all duration-300 rounded-full"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      </div>

      <main className="max-w-3xl mx-auto px-4 pt-8">
        {/* 問卷標題區塊 */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 mb-8 shadow-sm">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 mb-3">{survey.title}</h1>
          {survey.description && (
            <p className="text-slate-600 text-sm sm:text-base whitespace-pre-line leading-relaxed">
              {survey.description}
            </p>
          )}
        </div>

        {/* 題目列表 */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {visibleQuestions.map((q, index) => {
            const hasError = !!validationErrors[q.code];

            return (
              <div
                key={q.id}
                className={`bg-white rounded-2xl border p-6 sm:p-7 shadow-sm transition-all duration-200 ${
                  hasError ? "border-rose-300 ring-2 ring-rose-100" : "border-slate-200 hover:border-slate-300"
                }`}
              >
                <div className="flex items-start gap-3 mb-4">
                  <span className="flex-shrink-0 flex items-center justify-center w-7 h-7 rounded-lg bg-indigo-50 text-indigo-700 font-bold text-xs">
                    {index + 1}
                  </span>
                  <div className="flex-1">
                    <h3 className="text-base sm:text-lg font-bold text-slate-900 leading-snug">
                      {q.title}
                      {q.required && <span className="text-rose-500 ml-1.5">*</span>}
                    </h3>
                    {q.description && (
                      <p className="text-slate-500 text-xs sm:text-sm mt-1">{q.description}</p>
                    )}
                    {q.visibilityHint && (
                      <div className="flex items-center gap-1.5 mt-2 text-xs text-amber-600 bg-amber-50 px-2.5 py-1 rounded-md w-fit">
                        <Lightbulb className="w-3.5 h-3.5" />
                        <span>{q.visibilityHint}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* 單選題 */}
                {q.questionType === "single_choice" && (
                  <div className="space-y-2.5 pt-2">
                    {q.choices.map((choice) => {
                      const isSelected = answers[q.code] === choice.value;
                      return (
                        <label
                          key={choice.id}
                          className={`flex items-center gap-3 p-3.5 rounded-xl border text-sm font-medium cursor-pointer transition-all ${
                            isSelected
                              ? "bg-indigo-50/70 border-indigo-500 text-indigo-950 shadow-sm"
                              : "border-slate-200 hover:bg-slate-50 text-slate-700"
                          }`}
                        >
                          <input
                            type="radio"
                            name={q.code}
                            value={choice.value}
                            checked={isSelected}
                            onChange={() => handleSingleChoice(q.code, choice.value)}
                            className="w-4 h-4 text-indigo-600 border-slate-300 focus:ring-indigo-500"
                          />
                          <span className="flex-1">{choice.label}</span>
                        </label>
                      );
                    })}
                  </div>
                )}

                {/* 多選題 */}
                {q.questionType === "multiple_choice" && (
                  <div className="space-y-2.5 pt-2">
                    {q.choices.map((choice) => {
                      const currentVals = (answers[q.code] as string[]) || [];
                      const isSelected = currentVals.includes(choice.value);
                      return (
                        <label
                          key={choice.id}
                          className={`flex items-center gap-3 p-3.5 rounded-xl border text-sm font-medium cursor-pointer transition-all ${
                            isSelected
                              ? "bg-indigo-50/70 border-indigo-500 text-indigo-950 shadow-sm"
                              : "border-slate-200 hover:bg-slate-50 text-slate-700"
                          }`}
                        >
                          <input
                            type="checkbox"
                            value={choice.value}
                            checked={isSelected}
                            onChange={() => handleMultipleChoice(q.code, choice.value, choice.isNoneOfAbove)}
                            className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                          />
                          <span className="flex-1">{choice.label}</span>
                        </label>
                      );
                    })}
                  </div>
                )}

                {/* 文字簡答題 */}
                {q.questionType === "text" && (
                  <div className="pt-2">
                    <textarea
                      rows={3}
                      value={answers[q.code] || ""}
                      onChange={(e) => handleTextChange(q.code, e.target.value)}
                      placeholder="請輸入您的回答..."
                      className="w-full rounded-xl border border-slate-200 p-3.5 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition"
                    />
                  </div>
                )}

                {/* 數字題 */}
                {q.questionType === "number" && (
                  <div className="pt-2">
                    <input
                      type="number"
                      value={answers[q.code] || ""}
                      onChange={(e) => handleTextChange(q.code, e.target.value)}
                      placeholder="請輸入數字..."
                      className="w-full sm:w-64 rounded-xl border border-slate-200 p-3.5 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition"
                    />
                  </div>
                )}

                {/* 是非題 */}
                {q.questionType === "yes_no" && (
                  <div className="grid grid-cols-2 gap-3 pt-2">
                    {["yes", "no"].map((val) => {
                      const isSelected = answers[q.code] === val;
                      return (
                        <button
                          key={val}
                          type="button"
                          onClick={() => handleSingleChoice(q.code, val)}
                          className={`p-3.5 rounded-xl border text-sm font-bold transition-all ${
                            isSelected
                              ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                              : "border-slate-200 hover:bg-slate-50 text-slate-700"
                          }`}
                        >
                          {val === "yes" ? "是 (Yes)" : "否 (No)"}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* 錯誤提示 */}
                {hasError && (
                  <p className="text-rose-500 text-xs font-semibold mt-3 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5" />
                    {validationErrors[q.code]}
                  </p>
                )}
              </div>
            );
          })}

          {/* 底部操作列 */}
          <div className="pt-6 flex flex-col sm:flex-row items-center gap-3 justify-end">
            <button
              type="button"
              onClick={handleSaveDraft}
              disabled={savingDraft || submitting}
              className="w-full sm:w-auto px-5 py-3 rounded-xl border border-slate-300 bg-white text-slate-700 text-sm font-semibold hover:bg-slate-50 transition shadow-sm flex items-center justify-center gap-2"
            >
              <Save className="w-4 h-4" />
              <span>{savingDraft ? "儲存中..." : "暫存草稿"}</span>
            </button>
            <button
              type="submit"
              disabled={submitting || savingDraft}
              className="w-full sm:w-auto px-8 py-3 rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 transition shadow-md hover:shadow-lg flex items-center justify-center gap-2"
            >
              <Send className="w-4 h-4" />
              <span>{submitting ? "提交中..." : "提交問卷"}</span>
            </button>
          </div>

          {draftSavedMessage && (
            <div className="p-3 bg-emerald-50 text-emerald-700 text-sm rounded-xl border border-emerald-200 text-center font-medium">
              {draftSavedMessage}
            </div>
          )}
        </form>
      </main>
    </div>
  );
}
