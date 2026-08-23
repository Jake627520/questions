"use client";

import { useState } from "react";
import Link from "next/link";
import { Mail, ArrowLeft, Loader2, CheckCircle2, Shield } from "lucide-react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setLoading(true);

    try {
      await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      // 無論帳號是否存在，一律顯示統一提示訊息以防止 Email 枚舉
      setSubmitted(true);
    } catch {
      setSubmitted(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-10rem)] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-sm">
        <div className="text-center mb-6">
          <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-3 shadow-inner">
            <Shield className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">忘記密碼</h1>
          <p className="text-sm text-slate-500 mt-1">
            請輸入您註冊時使用的電子郵件地址以申請重設密碼
          </p>
        </div>

        {submitted ? (
          <div className="space-y-6 text-center">
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200/80 text-emerald-800 text-sm leading-relaxed">
              <CheckCircle2 className="w-6 h-6 text-emerald-600 mx-auto mb-2" />
              <p className="font-semibold text-emerald-900 mb-1">申請已送出</p>
              如果該電子郵件已註冊，重設密碼連結已寄送至您的信箱。請依信件指示於 60 分鐘內完成密碼重設。
            </div>

            <Link
              href="/login"
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 transition-colors shadow-sm"
            >
              <ArrowLeft className="w-4 h-4" />
              返回登入頁面
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                電子郵件 (Email)
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@company.com"
                  required
                  className="w-full pl-10 pr-3.5 py-2.5 border border-slate-300 rounded-xl text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !email.trim()}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-sm mt-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  發送重設信件中...
                </>
              ) : (
                "發送重設密碼連結"
              )}
            </button>

            <div className="pt-2 text-center">
              <Link
                href="/login"
                className="text-xs text-slate-500 hover:text-slate-800 transition font-medium inline-flex items-center gap-1"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                記起密碼了？返回登入
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
