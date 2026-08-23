"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Building2,
  Users,
  Shield,
  Calendar,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Hash,
  UserPlus,
  Mail,
  Copy,
  Check,
  XCircle,
  Clock,
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

interface InvitationItem {
  id: string;
  organizationId: string;
  invitedEmail: string;
  role: string;
  status: "PENDING" | "ACCEPTED" | "REVOKED" | "EXPIRED";
  expiresAt: string;
  usedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  createdBy: {
    id: string;
    name: string | null;
    email: string;
  };
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
  const [invitations, setInvitations] = useState<InvitationItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Edit Org Name
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Invite Member State
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"ADMIN" | "EDITOR" | "VIEWER">("VIEWER");
  const [inviting, setInviting] = useState(false);
  const [inviteMsg, setInviteMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [createdInviteUrl, setCreatedInviteUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Revoke State
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const fetchInvitations = useCallback(async (orgId: string) => {
    try {
      const res = await fetch(`/api/organizations/${orgId}/invitations`);
      if (res.ok) {
        const data = await res.json();
        setInvitations(data.invitations || []);
      }
    } catch {
      // ignore
    }
  }, []);

  const fetchOrgDetails = useCallback(async () => {
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

      // 3. 若為管理者，取得成員邀請清單
      if (dataDetail.currentUserRole === "OWNER" || dataDetail.currentUserRole === "ADMIN") {
        fetchInvitations(activeId);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [router, fetchInvitations]);

  useEffect(() => {
    fetchOrgDetails();
  }, [fetchOrgDetails]);

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

  const handleCreateInvitation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!org || !isManager || !inviteEmail.trim()) return;

    setInviteMsg(null);
    setCreatedInviteUrl(null);
    setInviting(true);

    try {
      const res = await fetch(`/api/organizations/${org.id}/invitations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
      });
      const data = await res.json();

      if (!res.ok) {
        setInviteMsg({ type: "error", text: data.message || "建立邀請失敗" });
      } else {
        setInviteMsg({ type: "success", text: `已成功為 ${inviteEmail} 建立邀請連結！` });
        setCreatedInviteUrl(data.inviteUrl);
        setInviteEmail("");
        fetchInvitations(org.id);
      }
    } catch {
      setInviteMsg({ type: "error", text: "連線異常，請稍後再試" });
    } finally {
      setInviting(false);
    }
  };

  const handleRevokeInvitation = async (invitationId: string) => {
    if (!org || !isManager) return;
    if (!confirm("確定要撤銷此成員邀請嗎？撤銷後該連結將立即失效。")) return;

    setRevokingId(invitationId);
    try {
      const res = await fetch(`/api/organizations/${org.id}/invitations/${invitationId}/revoke`, {
        method: "POST",
      });
      if (res.ok) {
        fetchInvitations(org.id);
      } else {
        const data = await res.json();
        alert(data.message || "撤銷失敗");
      }
    } catch {
      alert("網路連線異常，請稍後再試");
    } finally {
      setRevokingId(null);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
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
          <p className="text-sm text-slate-500 mt-1">工作區基礎設定、成員名冊與邀請管理</p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/settings/team"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 transition shadow-xs"
          >
            <Users className="w-3.5 h-3.5" />
            <span>團隊協作與權限設定</span>
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition"
          >
            <span>返回問卷</span>
          </Link>
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
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={!isManager || saving}
                  className="w-full px-3.5 py-2 border border-slate-300 rounded-xl text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-slate-100 disabled:text-slate-500 transition"
                  placeholder="輸入工作區名稱"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  唯一識別碼 (Slug)
                </label>
                <div className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-500 font-mono flex items-center gap-2">
                  <Hash className="w-4 h-4 text-slate-400" />
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

        {/* 邀請新成員表單 (僅管理者顯示) */}
        {isManager && (
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <h2 className="text-base font-bold text-slate-900 mb-1 flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-blue-600" />
              <span>邀請新成員加入工作區</span>
            </h2>
            <p className="text-xs text-slate-500 mb-4">
              系統將產生具備 256-bit 高熵安全之專屬邀請連結，有效期限為 7 天。
            </p>

            {inviteMsg && (
              <div
                className={`mb-4 p-3 rounded-xl flex items-center gap-2 text-sm ${
                  inviteMsg.type === "success"
                    ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                    : "bg-red-50 text-red-800 border border-red-200"
                }`}
              >
                {inviteMsg.type === "success" ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-red-600" />
                )}
                <span>{inviteMsg.text}</span>
              </div>
            )}

            {createdInviteUrl && (
              <div className="mb-4 p-4 rounded-xl bg-blue-50/70 border border-blue-200/80 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-blue-900 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-blue-600" />
                    邀請連結已生成（請複製並發送給受邀者）：
                  </span>
                  <button
                    onClick={() => copyToClipboard(createdInviteUrl)}
                    className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition"
                  >
                    {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copied ? "已複製！" : "複製連結"}</span>
                  </button>
                </div>
                <div className="p-2 bg-white rounded-lg border border-blue-100 font-mono text-xs text-slate-700 break-all select-all">
                  {createdInviteUrl}
                </div>
              </div>
            )}

            <form onSubmit={handleCreateInvitation} className="flex flex-col sm:flex-row gap-3 items-end">
              <div className="flex-1 w-full">
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  受邀成員電子郵件
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="colleague@example.com"
                    required
                    className="w-full pl-10 pr-3.5 py-2 border border-slate-300 rounded-xl text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                  />
                </div>
              </div>

              <div className="w-full sm:w-44">
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  指派角色
                </label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as any)}
                  className="w-full px-3.5 py-2 border border-slate-300 rounded-xl text-sm font-medium text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                >
                  <option value="VIEWER">VIEWER (唯讀)</option>
                  <option value="EDITOR">EDITOR (編輯)</option>
                  <option value="ADMIN">ADMIN (管理員)</option>
                </select>
              </div>

              <button
                type="submit"
                disabled={inviting || !inviteEmail.trim()}
                className="w-full sm:w-auto px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 h-[38px]"
              >
                {inviting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />}
                <span>發送邀請</span>
              </button>
            </form>
          </div>
        )}

        {/* 待處理與過往邀請名冊 (僅管理者顯示) */}
        {isManager && invitations.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <h2 className="text-base font-bold text-slate-900 mb-4 flex items-center gap-2">
              <Clock className="w-4 h-4 text-blue-600" />
              <span>成員邀請狀態清單 ({invitations.length} 筆)</span>
            </h2>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-slate-400 text-[11px] font-bold uppercase tracking-wider">
                    <th className="pb-3 px-3">受邀電子郵件</th>
                    <th className="pb-3 px-3">角色</th>
                    <th className="pb-3 px-3">狀態</th>
                    <th className="pb-3 px-3">有效期限</th>
                    <th className="pb-3 px-3 text-right">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {invitations.map((inv) => (
                    <tr key={inv.id} className="hover:bg-slate-50/70 transition">
                      <td className="py-3 px-3 font-mono text-xs text-slate-900 font-medium">
                        {inv.invitedEmail}
                      </td>
                      <td className="py-3 px-3">
                        <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[11px] font-bold">
                          {inv.role}
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-md text-[11px] font-bold ${
                            inv.status === "PENDING"
                              ? "bg-amber-50 text-amber-700 border border-amber-200/60"
                              : inv.status === "ACCEPTED"
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200/60"
                              : inv.status === "REVOKED"
                              ? "bg-red-50 text-red-700 border border-red-200/60"
                              : "bg-slate-100 text-slate-500"
                          }`}
                        >
                          {inv.status}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-xs text-slate-500">
                        {new Date(inv.expiresAt).toLocaleDateString("zh-TW")}
                      </td>
                      <td className="py-3 px-3 text-right">
                        {inv.status === "PENDING" && (
                          <button
                            onClick={() => handleRevokeInvitation(inv.id)}
                            disabled={revokingId === inv.id}
                            className="px-2.5 py-1 text-xs text-red-600 hover:bg-red-50 rounded-lg font-medium transition disabled:opacity-40"
                          >
                            {revokingId === inv.id ? "撤銷中..." : "撤銷"}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 組織成員名冊 */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Users className="w-4 h-4 text-blue-600" />
              <span>現有組織成員清單 ({members.length} 人)</span>
            </h2>
            <span className="text-xs text-slate-400">目前為名冊一覽</span>
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
