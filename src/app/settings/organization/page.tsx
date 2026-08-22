"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  Users,
  Shield,
  Calendar,
  Edit3,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Hash,
} from "lucide-react";

interface MemberItem {
  membershipId: string;
  userId: string;
  name: string | null;
  email: string;
  avatarUrl: string | null;
  role: string;
  joinedAt: string;
}

interface OrganizationDetail {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  updatedAt: string;
}

export default function OrganizationSettingsPage() {
  const router = useRouter();
  const [org, setOrg] = useState<OrganizationDetail | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);
  const [members, setMembers] = useState<MemberItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Edit Org Name
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    const fetchOrgDetails = async () => {
      try {
        // 1. 取得目前 active organization
        const resActive = await fetch("/api/organizations");
        if (resActive.status === 401) {
          router.push("/login?returnTo=/settings/organization");
          return;
        }
        const dataActive = await resActive.json();
        if (!dataActive.activeOrganization) {
          setLoading(false);
          return;
        }

        const activeId = dataActive.activeOrganization.id;

        // 2. 取得組織明細與成員清單
        const resDetail = await fetch(`/api/organizations/${activeId}`);
        if (!resDetail.ok) {
          setLoading(false);
          return;
        }

        const dataDetail = await resDetail.json();
        setOrg(dataDetail.organization);
        setCurrentUserRole(dataDetail.currentUserRole);
        setMembers(dataDetail.members || []);
        setName(dataDetail.organization.name);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    };

    fetchOrgDetails();
  }, [router]);

  const isManager = currentUserRole === "OWNER" || currentUserRole === "ADMIN";

  const handleUpdateName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!org || !isManager) return;
    setMsg(null);
    setSaving(true);

    try {
      const res = await fetch(`/api/organizations/${org.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg({ type: "error", text: data.message || "更新失敗" });
      } else {
        setMsg({ type: "success", text: "組織名稱更新成功！" });
        setOrg((prev) => (prev ? { ...prev, name } : null));
        router.refresh();
      }
    } catch {
      setMsg({ type: "error", text: "網路連線異常，請稍後再試" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-8rem)] flex items-center justify-center text-slate-400 text-sm">
        正在載入組織設定與成員資料...
      </div>
    );
  }

  if (!org) {
    return (
      <div className="max-w-xl mx-auto my-12 p-8 bg-white rounded-2xl border border-slate-200 text-center shadow-sm">
        <Building2 className="w-12 h-12 text-slate-400 mx-auto mb-3" />
        <h2 className="text-lg font-bold text-slate-800">尚未選擇或加入任何工作區</h2>
        <p className="text-sm text-slate-500 mt-1 mb-6">請使用頂部工作區切換器建立新工作區或加入團隊</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto py-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 pb-6 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{org.name}</h1>
            {currentUserRole && (
              <span className="px-2.5 py-0.5 rounded-lg bg-blue-50 text-blue-700 text-xs font-bold border border-blue-200/60">
                {currentUserRole}
              </span>
            )}
          </div>
          <p className="text-sm text-slate-500 mt-1">工作區基礎設定與組織成員名冊</p>
        </div>
      </div>

      <div className="space-y-8">
        {/* 組織基本資訊與編輯卡片 */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <h2 className="text-base font-bold text-slate-900 mb-4 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-blue-600" />
            <span>工作區基本設定</span>
          </h2>

          {msg && (
            <div
              className={`mb-4 p-3 rounded-xl flex items-center gap-2 text-sm ${
                msg.type === "success"
                  ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                  : "bg-red-50 text-red-800 border border-red-200"
              }`}
            >
              {msg.type === "success" ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              ) : (
                <AlertCircle className="w-4 h-4 text-red-600" />
              )}
              <span>{msg.text}</span>
            </div>
          )}

          <form onSubmit={handleUpdateName} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  工作區名稱
                </label>
                <input
                  type="text"
                  required
                  disabled={!isManager}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={`w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm transition ${
                    isManager
                      ? "focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                      : "bg-slate-100 text-slate-500 cursor-not-allowed"
                  }`}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  工作區識別碼 (Slug)
                </label>
                <div className="flex items-center px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-100 text-slate-500 text-sm font-mono cursor-not-allowed">
                  <Hash className="w-3.5 h-3.5 mr-1 text-slate-400" />
                  <span>{org.slug}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <div className="text-xs text-slate-400 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5" />
                <span>建立於 {new Date(org.createdAt).toLocaleDateString("zh-TW")}</span>
              </div>

              {isManager ? (
                <button
                  type="submit"
                  disabled={saving || name.trim() === org.name}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
                >
                  {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>儲存名稱變更</span>
                </button>
              ) : (
                <span className="text-xs text-slate-400">（您目前的角色為唯讀，無法修改組織名稱）</span>
              )}
            </div>
          </form>
        </div>

        {/* 組織成員名冊 */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Users className="w-4 h-4 text-blue-600" />
              <span>組織成員清單 ({members.length} 人)</span>
            </h2>
            <span className="text-xs text-slate-400">目前為唯讀名冊</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-slate-400 text-[11px] font-bold uppercase tracking-wider">
                  <th className="pb-3 px-3">成員姓名</th>
                  <th className="pb-3 px-3">電子郵件</th>
                  <th className="pb-3 px-3">組織角色</th>
                  <th className="pb-3 px-3 text-right">加入日期</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {members.map((member) => (
                  <tr key={member.membershipId} className="hover:bg-slate-50/70 transition">
                    <td className="py-3 px-3 font-medium text-slate-900">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-slate-100 text-slate-700 font-bold text-xs flex items-center justify-center">
                          {member.name ? member.name.slice(0, 1).toUpperCase() : member.email.slice(0, 1).toUpperCase()}
                        </div>
                        <span>{member.name || "未命名"}</span>
                      </div>
                    </td>
                    <td className="py-3 px-3 text-slate-500 font-mono text-xs">{member.email}</td>
                    <td className="py-3 px-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-md text-[11px] font-bold ${
                          member.role === "OWNER"
                            ? "bg-purple-50 text-purple-700 border border-purple-200/60"
                            : member.role === "ADMIN"
                            ? "bg-blue-50 text-blue-700 border border-blue-200/60"
                            : member.role === "EDITOR"
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200/60"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {member.role}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right text-xs text-slate-400">
                      {new Date(member.joinedAt).toLocaleDateString("zh-TW")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
