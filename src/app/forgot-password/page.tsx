import Link from "next/link";
import { ArrowLeft, Shield } from "lucide-react";

/**
 * 系統目前沒有寄信服務，無法寄出重設密碼信件。
 * 自助重設入口改為提示：請聯絡管理者重設密碼。
 */
export default function ForgotPasswordPage() {
  return (
    <div className="min-h-[calc(100vh-10rem)] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-sm text-center">
        <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-3 shadow-inner">
          <Shield className="w-6 h-6" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight font-serif">忘記密碼</h1>
        <p className="text-sm text-slate-500 mt-3 leading-relaxed">
          請聯絡管理者重設密碼。本系統目前不提供以電子郵件自助重設密碼。
        </p>
        <Link
          href="/login"
          className="w-full flex items-center justify-center gap-2 mt-6 px-4 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 transition-colors shadow-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          返回登入頁面
        </Link>
      </div>
    </div>
  );
}
