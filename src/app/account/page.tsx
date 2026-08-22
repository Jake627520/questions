"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  User,
  Mail,
  Shield,
  KeyRound,
  LogOut,
  Building2,
  AlertCircle,
  CheckCircle2,
  Calendar,
  Lock,
} from "lucide-react";

interface UserProfile {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  memberships: {
    id: string;
    role: string;
    organization: {
      id: string;
      name: string;
      slug: string;
    };
  }[];
}

export default function AccountPage() {
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // Profile Update State
  const [name, setName] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Password Change State
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [pwdSaving, setPwdSaving] = useState(false);
  const [pwdMsg, setPwdMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const res = await fetch("/api/auth/me");
        if (res.status === 401) {
          router.push("/login?returnTo=/account");
          return;
        }
        const data = await res.json();
        if (data.user) {
          setUser(data.user);
          setName(data.user.name || "");
        }
      } catch {
        router.push("/login?returnTo=/account");
      } finally {
        setLoading(false);
      }
    };

    fetchUser();
  }, [router]);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileMsg(null);
    setProfileSaving(true);

    try {
      const res = await fetch("/api/auth/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) {
        setProfileMsg({ type: "error", text: data.message || "更新失敗" });
      } else {
        setProfileMsg({ type: "success", text: "個人資料更新成功！" });
        setUser((prev) => (prev ? { ...prev, name } : null));
      }
    } catch {
      setProfileMsg({ type: "error", text: "網路連線異常，請稍後再試" });
    } finally {
      setProfileSaving(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwdMsg(null);

    if (newPassword.length < 8) {
      setPwdMsg({ type: "error", text: "新密碼長度至少需 8 個字元" });
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setPwdMsg({ type: "error", text: "兩次輸入的新密碼不相符" });
      return;
    }

    setPwdSaving(true);

    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword, confirmNewPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPwdMsg({ type: "error", text: data.message || "密碼修改失敗" });
      } else {
        setPwdMsg({ type: "success", text: data.message || "密碼修改成功！" });
        setCurrentPassword("");
        setNewPassword("");
        setConfirmNewPassword("");
      }
    } catch {
      setPwdMsg({ type: "error", text: "網路連線異常，請稍後再試" });
    } finally {
      setPwdSaving(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/login");
      router.refresh();
    } catch {
      router.push("/login");
    }
  };

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center text-slate-400 text-sm">
        正在載入個人帳號資料...
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 pb-6 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">個人帳號管理 (Account Center)</h1>
          <p className="text-sm text-slate-500 mt-1">檢視個人身份資訊、組織成員權限與密碼安全設定</p>
        </div>
        <button
          onClick={handleLogout}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 font-medium text-sm transition self-start"
        >
          <LogOut className="w-4 h-4" />
          <span>登出系統</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* 左側：身份與組織概要 */}
        <div className="md:col-span-1 space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <div className="w-16 h-16 rounded-2xl bg-blue-600 text-white font-bold text-2xl flex items-center justify-center mb-4 shadow-md shadow-blue-500/20">
              {user.name ? user.name.slice(0, 1).toUpperCase() : user.email.slice(0, 1).toUpperCase()}
            </div>
            <h2 className="text-lg font-bold text-slate-900">{user.name || "未設定稱呼"}</h2>
            <p className="text-sm text-slate-500 font-mono break-all">{user.email}</p>
          </div>

          {/* 所屬組織與權限 */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 mb-4">
              <Building2 className="w-4 h-4 text-blue-600" />
              <span>所屬組織與角色</span>
            </h3>
            {user.memberships.length === 0 ? (
              <p className="text-xs text-slate-400">目前未加入任何組織</p>
            ) : (
              <div className="space-y-3">
                {user.memberships.map((m) => (
                  <div key={m.id} className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <div className="text-xs font-semibold text-slate-800">{m.organization.name}</div>
                    <div className="mt-1.5 flex items-center justify-between">
                      <span className="text-[10px] font-mono text-slate-400">slug: {m.organization.slug}</span>
                      <span className="px-2 py-0.5 rounded-md bg-blue-100 text-blue-700 text-[11px] font-semibold">
                        {m.role}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 右側：編輯資料與修改密碼 */}
        <div className="md:col-span-2 space-y-6">
          {/* 基本資料修改 */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <h2 className="text-base font-bold text-slate-900 mb-4 flex items-center gap-2">
              <User className="w-4 h-4 text-blue-600" />
              <span>基本資料</span>
            </h2>

            {profileMsg && (
              <div
                className={`mb-4 p-3 rounded-xl flex items-center gap-2 text-sm ${
                  profileMsg.type === "success"
                    ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                    : "bg-red-50 text-red-800 border border-red-200"
                }`}
              >
                {profileMsg.type === "success" ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-red-600" />
                )}
                <span>{profileMsg.text}</span>
              </div>
            )}

            <form onSubmit={handleUpdateProfile} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  電子郵件 (登入帳號)
                </label>
                <input
                  type="email"
                  disabled
                  value={user.email}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-100 text-slate-500 text-sm cursor-not-allowed font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  姓名 / 稱呼
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="請輸入姓名"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-sm transition"
                />
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={profileSaving}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-xl transition disabled:opacity-50"
                >
                  {profileSaving ? "儲存中..." : "儲存姓名變更"}
                </button>
              </div>
            </form>
          </div>

          {/* 變更密碼 */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <h2 className="text-base font-bold text-slate-900 mb-1 flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-amber-600" />
              <span>變更密碼 (Change Password)</span>
            </h2>
            <p className="text-xs text-slate-500 mb-4">
              成功變更密碼後，系統將自動終止此帳號在其他裝置上的工作階段，以確保帳號安全。
            </p>

            {pwdMsg && (
              <div
                className={`mb-4 p-3 rounded-xl flex items-center gap-2 text-sm ${
                  pwdMsg.type === "success"
                    ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                    : "bg-red-50 text-red-800 border border-red-200"
                }`}
              >
                {pwdMsg.type === "success" ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-red-600" />
                )}
                <span>{pwdMsg.text}</span>
              </div>
            )}

            <form onSubmit={handleChangePassword} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  目前密碼
                </label>
                <input
                  type="password"
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="輸入目前的密碼"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-sm transition"
                  autoComplete="current-password"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                    設定新密碼 (至少 8 碼)
                  </label>
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="至少 8 個字元"
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-sm transition"
                    autoComplete="new-password"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                    確認新密碼
                  </label>
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={confirmNewPassword}
                    onChange={(e) => setConfirmNewPassword(e.target.value)}
                    placeholder="再次輸入新密碼"
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-sm transition"
                    autoComplete="new-password"
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={pwdSaving}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-xl transition disabled:opacity-50"
                >
                  {pwdSaving ? "修改中..." : "確認修改密碼"}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
