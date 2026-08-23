"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Building2,
  Mail,
  Shield,
  Calendar,
  CheckCircle2,
  AlertCircle,
  Loader2,
  LogIn,
  UserPlus,
  ArrowRight,
} from "lucide-react";

interface InvitationPreview {
  organizationName: string;
  organizationSlug: string;
  invitedEmail: string;
  role: string;
  expiresAt: string;
}

interface CurrentUser {
  id: string;
  email: string;
  name: string | null;
}

export default function AcceptInvitationPage() {
  const params = useParams();
  const router = useRouter();
  const token = params?.token as string;

  const [invitation, setInvitation] = useState<InvitationPreview | null>(null);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [accepting, setAccepting] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;

    const loadData = async () => {
      try {
        setLoading(true);
        setErrorMsg(null);

        // 1. 取得公開邀請資訊
        const resInv = await fetch(`/api/invitations/${token}`);
        const dataInv = await resInv.json();

        if (!resInv.ok) {
          setErrorMsg(dataInv.message || "邀請連結無效或已過期");
          setLoading(false);
          return;
        }

        setInvitation(dataInv.invitation);

        // 2. 檢查當前登入身分
        const resMe = await fetch("/api/auth/me");
        if (resMe.ok) {
          const dataMe = await resMe.json();
          setCurrentUser(dataMe.user);
        }
      } catch (err: any) {
        setErrorMsg("載入邀請資料失敗，請檢查網路連線");
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [token]);

  const handleAccept = async () => {
    if (!token) return;
    setAccepting(true);
    setErrorMsg(null);

    try {
      const res = await fetch(`/api/invitations/${token}/accept`, {
        method: "POST",
      });
      const data = await res.json();

      if (!res.ok) {
        setErrorMsg(data.message || "接受邀請失敗");
      } else {
        setSuccessMsg(data.message || "成功加入工作區！");
        setTimeout(() => {
          router.push("/");
          router.refresh();
        }, 1200);
      }
    } catch {
      setErrorMsg("伺服器連線異常，請稍後再試");
    } finally {
      setAccepting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-10rem)] flex items-center justify-center text-slate-400 text-sm">
        <Loader2 className="w-5 h-5 animate-spin mr-2 text-blue-600" />
        正在載入邀請資訊...
      </div>
    );
  }

  if (errorMsg && !invitation) {
    return (
      <div className="max-w-md mx-auto my-16 p-8 bg-white rounded-2xl border border-slate-200 text-center shadow-sm">
        <div className="w-12 h-12 rounded-full bg-red-50 text-red-600 flex items-center justify-center mx-auto mb-4">
          <AlertCircle className="w-6 h-6" />
        </div>
        <h2 className="text-xl font-bold text-slate-900 mb-2">無效的邀請</h2>
        <p className="text-sm text-slate-500 mb-6">{errorMsg}</p>
        <Link
          href="/"
          className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium rounded-xl bg-slate-900 text-white hover:bg-slate-800 transition-colors"
        >
          返回首頁
        </Link>
      </div>
    );
  }

  if (!invitation) return null;

  const isEmailMatch =
    currentUser &&
    currentUser.email.trim().toLowerCase() ===
      invitation.invitedEmail.trim().toLowerCase();

  return (
    <div className="max-w-md mx-auto my-12 px-4">
      <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-sm">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-3 shadow-inner">
            <Building2 className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">
            工作區成員邀請
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            您受邀加入以下組織工作區
          </p>
        </div>

        {/* Info Card */}
        <div className="rounded-xl bg-slate-50 border border-slate-100 p-4 space-y-3 mb-6">
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-500 flex items-center gap-1.5">
              <Building2 className="w-4 h-4 text-slate-400" />
              組織名稱
            </span>
            <span className="font-semibold text-slate-900">
              {invitation.organizationName}
            </span>
          </div>

          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-500 flex items-center gap-1.5">
              <Shield className="w-4 h-4 text-slate-400" />
              受邀角色
            </span>
            <span className="px-2 py-0.5 rounded-md bg-blue-100/70 text-blue-700 text-xs font-bold">
              {invitation.role}
            </span>
          </div>

          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-500 flex items-center gap-1.5">
              <Mail className="w-4 h-4 text-slate-400" />
              受邀信箱
            </span>
            <span className="font-mono text-xs text-slate-700 font-medium">
              {invitation.invitedEmail}
            </span>
          </div>

          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-500 flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-slate-400" />
              有效期限
            </span>
            <span className="text-xs text-slate-600">
              {new Date(invitation.expiresAt).toLocaleDateString()}
            </span>
          </div>
        </div>

        {/* Status & Messages */}
        {errorMsg && (
          <div className="p-3 mb-4 rounded-xl bg-red-50 border border-red-200/60 text-red-700 text-sm flex items-start gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="p-3 mb-4 rounded-xl bg-emerald-50 border border-emerald-200/60 text-emerald-700 text-sm flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            <span>{successMsg}，正在引導進入工作區...</span>
          </div>
        )}

        {/* Actions */}
        {!currentUser ? (
          <div className="space-y-3">
            <p className="text-xs text-slate-500 text-center mb-2">
              請先登入或註冊受邀電子郵件帳號以完成加入
            </p>
            <Link
              href={`/login?returnTo=/invite/${token}`}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 transition-colors shadow-sm"
            >
              <LogIn className="w-4 h-4" />
              登入既有帳號
            </Link>
            <Link
              href={`/register?returnTo=/invite/${token}`}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-700 text-sm font-semibold hover:bg-slate-50 transition-colors"
            >
              <UserPlus className="w-4 h-4" />
              註冊新帳號
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-500 mb-1 px-1">
              <span>目前登入帳號：</span>
              <span className="font-mono font-medium text-slate-800">{currentUser.email}</span>
            </div>
            <button
              onClick={handleAccept}
              disabled={accepting || !!successMsg}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-sm"
            >
              {accepting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  正在處理...
                </>
              ) : (
                <>
                  接受邀請並進入工作區
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
            <div className="text-center pt-2">
              <Link
                href={`/login?returnTo=/invite/${token}`}
                className="text-xs text-slate-400 hover:text-slate-600 transition"
              >
                非受邀帳號？切換其他帳號登入
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
