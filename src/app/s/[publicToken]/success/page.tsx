"use client";

import { CheckCircle2, Home } from "lucide-react";
import Link from "next/link";

export default function PublicSurveySuccessPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-3xl border border-slate-200 p-8 sm:p-10 shadow-lg text-center">
        <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-6">
          <CheckCircle2 className="w-10 h-10" />
        </div>
        <h1 className="text-2xl font-extrabold text-slate-900 mb-2">問卷提交成功</h1>
        <p className="text-slate-600 text-sm leading-relaxed mb-8">
          感謝您的寶貴時間與填答，您的意見已安全儲存。
        </p>
      </div>
    </div>
  );
}
