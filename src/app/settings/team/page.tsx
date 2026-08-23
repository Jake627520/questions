"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Users,
  Shield,
  UserPlus,
  Mail,
  Copy,
  Check,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Clock,
  Trash2,
  ArrowRightLeft,
  Crown,
  UserCheck,
  Building2,
  Sliders,
  Sparkles,
} from "lucide-react";

interface MemberItem {
  membershipId: string;
  userId: string;
  name: string | null;
  email: string;
  avatarUrl: string | null;
  role: "OWNER" | "ADMIN" | "EDITOR" | "VIEWER";
  joinedAt: string;
}

interface InvitationItem {
  id: string;
  organizationId: string;
  invitedEmail: string;
  role: "ADMIN" | "EDITOR" | "VIEWER";
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

const ROLE_DEFINITIONS = {
  OWNER: {
    label: "Workspace Owner",
    zhLabel: "組織擁有者",
    description: "具備組織最高管理權限，包含轉移所有權、指派管理員與刪除組織。",
    badgeColor: "bg-purple-50 text-purple-700 border-purple-200/80",
    icon: Crown,
  },
  ADMIN: {
    label: "Administrator",
    zhLabel: "管理員",
    description: "可管理一般成員、邀請協作者、管理所有問卷與生命週期。",
    badgeColor: "bg-blue-50 text-blue-700 border-blue-200/80",
    icon: Shield,
  },
  EDITOR: {
    label: "Editor",
    zhLabel: "問卷編輯者",
    description: "可建立、編輯問卷、複製版本與匯出報表，無成員管理權限。",
    badgeColor: "bg-emerald-50 text-emerald-700 border-emerald-200/80",
    icon: UserCheck,
  },
  VIEWER: {
    label: "Viewer",
    zhLabel: "唯讀檢視者",
    description: "僅能檢視問卷內容、版本歷程與統計概況，無法變更任何資料。",
    badgeColor: "bg-slate-100 text-slate-600 border-slate-200/80",
    icon: Users,
  },
} as const;

export default function TeamSettingsPage() {
  const router = useRouter();
  const [org, setOrg] = useState<OrganizationDetail | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<"OWNER" | "ADMIN" | "EDITOR" | "VIEWER" | null>(null);
  const [members, setMembers] = useState<MemberItem[]>([]);
  const [invitations, setInvitations] = useState<InvitationItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Notifications
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

  // Role Change Modal State
  const [roleModalMember, setRoleModalMember] = useState<MemberItem | null>(null);
  const [selectedNewRole, setSelectedNewRole] = useState<"OWNER" | "ADMIN" | "EDITOR" | "VIEWER">("EDITOR");
  const [updatingRole, setUpdatingRole] = useState(false);

  // Remove Member Modal State
  const [removeModalMember, setRemoveModalMember] = useState<MemberItem | null>(null);
  const [removingMember, setRemovingMember] = useState(false);

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

  const fetchTeamData = useCallback(async () => {
    try {
      // 1. 取得當前使用者與 active org
      const resMe = await fetch("/api/auth/me");
      if (resMe.status === 401) {
        router.push("/login?returnTo=/settings/team");
        return;
      }
      const dataMe = await resMe.json();
      if (dataMe.user) {
        setCurrentUserId(dataMe.user.id);
      }

      const resActive = await fetch("/api/organizations");
      if (!resActive.ok) {
        setLoading(false);
        return;
      }
      const dataActive = await resActive.json();
      if (!dataActive.activeOrganization) {
        setLoading(false);
        return;
      }

      const activeId = dataActive.activeOrganization.id;

      // 2. 取得組織詳細成員清單
      const resDetail = await fetch(`/api/organizations/${activeId}`);
      if (!resDetail.ok) {
        setLoading(false);
        return;
      }

      const dataDetail = await resDetail.json();
      setOrg(dataDetail.organization);
      setCurrentUserRole(dataDetail.currentUserRole);
      setMembers(dataDetail.members || []);

      // 3. 若為管理者，取得待處理與歷史邀請清單
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
    fetchTeamData();
  }, [fetchTeamData]);

  const isManager = currentUserRole === "OWNER" || currentUserRole === "ADMIN";
  const isOwner = currentUserRole === "OWNER";

  // 邀請成員送出
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
        setInviteMsg({ type: "success", text: `已成功為 ${inviteEmail} 建立安全邀請連結！` });
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

  // 撤銷邀請
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
        setMsg({ type: "success", text: "已成功撤銷成員邀請" });
      } else {
        const data = await res.json();
        setMsg({ type: "error", text: data.message || "撤銷失敗" });
      }
    } catch {
      setMsg({ type: "error", text: "網路連線異常，請稍後再試" });
    } finally {
      setRevokingId(null);
    }
  };

  // 變更成員角色
  const handleConfirmRoleChange = async () => {
    if (!org || !roleModalMember || !isManager) return;
    setUpdatingRole(true);
    setMsg(null);

    try {
      const res = await fetch(`/api/organizations/${org.id}/members/${roleModalMember.membershipId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: selectedNewRole }),
      });
      const data = await res.json();

      if (!res.ok) {
        setMsg({ type: "error", text: data.message || "變更角色失敗" });
      } else {
        setMsg({ type: "success", text: data.message || "成員角色更新成功！" });
        setRoleModalMember(null);
        fetchTeamData();
      }
    } catch {
      setMsg({ type: "error", text: "網路連線異常，請稍後再試" });
    } finally {
      setUpdatingRole(false);
    }
  };

  // 移除成員
  const handleConfirmRemoveMember = async () => {
    if (!org || !removeModalMember || !isManager) return;
    setRemovingMember(true);
    setMsg(null);

    try {
      const res = await fetch(`/api/organizations/${org.id}/members/${removeModalMember.membershipId}`, {
        method: "DELETE",
      });
      const data = await res.json();

      if (!res.ok) {
        setMsg({ type: "error", text: data.message || "移除成員失敗" });
      } else {
        setMsg({ type: "success", text: data.message || "成員已成功從組織中移除" });
        setRemoveModalMember(null);
        fetchTeamData();
      }
    } catch {
      setMsg({ type: "error", text: "網路連線異常，請稍後再試" });
    } finally {
      setRemovingMember(false);
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
        <Loader2 className="w-5 h-5 animate-spin mr-2 text-blue-600" />
        <span>正在載入團隊協作成員與權限資料...</span>
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
    <div className="max-w-5xl mx-auto py-6">
      {/* 頁面標題與導航 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-6 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">團隊協作與成員權限</h1>
            {currentUserRole && (
              <span
                className={`px-2.5 py-0.5 rounded-lg text-xs font-bold border ${
                  ROLE_DEFINITIONS[currentUserRole]?.badgeColor || "bg-slate-100 text-slate-700"
                }`}
              >
                {ROLE_DEFINITIONS[currentUserRole]?.zhLabel || currentUserRole}
              </span>
            )}
          </div>
          <p className="text-sm text-slate-500 mt-1">
            工作區：<strong className="text-slate-800">{org.name}</strong> ({org.slug}) — 團隊成員名冊、角色授權矩陣與邀請管理
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/settings/organization"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 transition shadow-xs"
          >
            <Sliders className="w-3.5 h-3.5 text-slate-500" />
            <span>組織基本設定</span>
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 transition"
          >
            <span>返回問卷工作區</span>
          </Link>
        </div>
      </div>

      {/* 全域通知 Alert */}
      {msg && (
        <div
          className={`mb-6 p-4 rounded-2xl flex items-center justify-between gap-2 text-sm shadow-xs ${
            msg.type === "success"
              ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
              : "bg-red-50 text-red-800 border border-red-200"
          }`}
        >
          <div className="flex items-center gap-2.5">
            {msg.type === "success" ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
            )}
            <span className="font-medium">{msg.text}</span>
          </div>
          <button onClick={() => setMsg(null)} className="text-xs opacity-60 hover:opacity-100">
            關閉
          </button>
        </div>
      )}

      {/* 團隊概況 KPI 卡片 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">團隊正式成員</div>
            <div className="text-2xl font-black text-slate-900 mt-0.5">{members.length} 人</div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-purple-50 border border-purple-100 flex items-center justify-center text-purple-600">
            <Crown className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">管理決策核心</div>
            <div className="text-2xl font-black text-slate-900 mt-0.5">
              {members.filter((m) => m.role === "OWNER" || m.role === "ADMIN").length} 人
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">待生效安全邀請</div>
            <div className="text-2xl font-black text-slate-900 mt-0.5">
              {invitations.filter((i) => i.status === "PENDING").length} 筆
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-8">
        {/* 邀請新成員表單 (僅管理者 OWNER / ADMIN 顯示) */}
        {isManager && (
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-blue-600" />
                <span>邀請團隊新成員加入協作</span>
              </h2>
              <span className="text-xs font-semibold px-2 py-0.5 bg-blue-50 text-blue-700 rounded-md border border-blue-200/60">
                256-bit CSPRNG 安全連結
              </span>
            </div>
            <p className="text-xs text-slate-500 mb-4">
              系統將生成具備密碼學高熵之單次邀請連結，受邀者點擊後登入即可無縫加入當前工作區。
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
                    <Sparkles className="w-4 h-4 text-blue-600" />
                    邀請連結已生成（請複製並傳送給受邀成員）：
                  </span>
                  <button
                    onClick={() => copyToClipboard(createdInviteUrl)}
                    className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition shadow-xs"
                  >
                    {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copied ? "已複製！" : "複製連結"}</span>
                  </button>
                </div>
                <div className="p-2.5 bg-white rounded-lg border border-blue-100 font-mono text-xs text-slate-700 break-all select-all">
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
                    placeholder="partner@company.com"
                    required
                    className="w-full pl-10 pr-3.5 py-2 border border-slate-300 rounded-xl text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                  />
                </div>
              </div>

              <div className="w-full sm:w-56">
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  指派初始協作角色
                </label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as any)}
                  className="w-full px-3.5 py-2 border border-slate-300 rounded-xl text-sm font-medium text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                >
                  <option value="VIEWER">Viewer (唯讀檢視者)</option>
                  <option value="EDITOR">Editor (問卷編輯者)</option>
                  <option value="ADMIN">Administrator (管理員)</option>
                </select>
              </div>

              <button
                type="submit"
                disabled={inviting || !inviteEmail.trim()}
                className="w-full sm:w-auto px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 h-[38px] shadow-xs"
              >
                {inviting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />}
                <span>發送邀請</span>
              </button>
            </form>
          </div>
        )}

        {/* 現有團隊成員名冊 */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Users className="w-4 h-4 text-blue-600" />
                <span>團隊成員名冊 ({members.length} 人)</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                團隊內所有成員之權限皆由 RBAC 授權矩陣控管
              </p>
            </div>
            {!isManager && (
              <span className="text-xs text-slate-400 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200">
                唯讀模式（僅 OWNER / ADMIN 可調整角色）
              </span>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-slate-400 text-[11px] font-bold uppercase tracking-wider">
                  <th className="pb-3 px-3">成員資訊</th>
                  <th className="pb-3 px-3">電子郵件</th>
                  <th className="pb-3 px-3">組織權限角色</th>
                  <th className="pb-3 px-3">加入日期</th>
                  {isManager && <th className="pb-3 px-3 text-right">權限與成員管理</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {members.map((member) => {
                  const isCurrent = member.userId === currentUserId;
                  const roleDef = ROLE_DEFINITIONS[member.role];
                  const RoleIcon = roleDef?.icon || Users;

                  // ADMIN 不得修改 OWNER
                  const isOwnerTarget = member.role === "OWNER";
                  const cannotModifyDueToAdminRestriction = !isOwner && isOwnerTarget;

                  return (
                    <tr
                      key={member.membershipId}
                      className={`hover:bg-slate-50/70 transition ${isCurrent ? "bg-blue-50/30" : ""}`}
                    >
                      {/* 成員姓名與頭像 */}
                      <td className="py-3.5 px-3 font-medium text-slate-900">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-slate-100 border border-slate-200 text-slate-700 font-bold text-xs flex items-center justify-center shrink-0">
                            {member.name
                              ? member.name.slice(0, 1).toUpperCase()
                              : member.email.slice(0, 1).toUpperCase()}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-800">{member.name || "未設定姓名"}</span>
                              {isCurrent && (
                                <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-blue-100 text-blue-800">
                                  您
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-400 sm:hidden">{member.email}</div>
                          </div>
                        </div>
                      </td>

                      {/* 電子郵件 */}
                      <td className="py-3.5 px-3 text-slate-600 font-mono text-xs hidden sm:table-cell">
                        {member.email}
                      </td>

                      {/* 角色徽章與描述 */}
                      <td className="py-3.5 px-3">
                        <div className="flex flex-col gap-0.5">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-xs font-bold border w-fit ${
                              roleDef?.badgeColor || "bg-slate-100 text-slate-600"
                            }`}
                          >
                            <RoleIcon className="w-3 h-3" />
                            <span>{roleDef?.label || member.role}</span>
                            <span className="text-[10px] font-normal opacity-80">({roleDef?.zhLabel})</span>
                          </span>
                        </div>
                      </td>

                      {/* 加入時間 */}
                      <td className="py-3.5 px-3 text-xs text-slate-400">
                        {new Date(member.joinedAt).toLocaleDateString("zh-TW")}
                      </td>

                      {/* 管理操作按鈕 (僅限 OWNER / ADMIN) */}
                      {isManager && (
                        <td className="py-3.5 px-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {cannotModifyDueToAdminRestriction ? (
                              <span className="text-[11px] text-slate-400 italic">
                                擁有者 (受保護)
                              </span>
                            ) : (
                              <>
                                <button
                                  onClick={() => {
                                    setRoleModalMember(member);
                                    setSelectedNewRole(member.role);
                                  }}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:text-blue-700 hover:bg-blue-50 border border-slate-200 rounded-lg transition"
                                >
                                  <ArrowRightLeft className="w-3 h-3 text-slate-400" />
                                  <span>變更角色</span>
                                </button>

                                <button
                                  onClick={() => setRemoveModalMember(member)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-slate-500 hover:text-red-600 hover:bg-red-50 border border-slate-200 rounded-lg transition"
                                  title="從組織中移除成員"
                                >
                                  <Trash2 className="w-3 h-3" />
                                  <span>移除</span>
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* 邀請狀態名冊 (僅管理者 OWNER / ADMIN 顯示) */}
        {isManager && invitations.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <h2 className="text-base font-bold text-slate-900 mb-2 flex items-center gap-2">
              <Clock className="w-4 h-4 text-blue-600" />
              <span>成員邀請狀態清單 ({invitations.length} 筆)</span>
            </h2>
            <p className="text-xs text-slate-500 mb-4">
              追蹤所有發出之安全邀請狀態，可隨時撤銷未生效之邀請連結。
            </p>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-slate-400 text-[11px] font-bold uppercase tracking-wider">
                    <th className="pb-3 px-3">受邀電子郵件</th>
                    <th className="pb-3 px-3">預計指派角色</th>
                    <th className="pb-3 px-3">邀請狀態</th>
                    <th className="pb-3 px-3">有效期限</th>
                    <th className="pb-3 px-3">發起人</th>
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
                          {ROLE_DEFINITIONS[inv.role]?.label || inv.role}
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
                      <td className="py-3 px-3 text-xs text-slate-400">
                        {inv.createdBy?.name || inv.createdBy?.email || "-"}
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
      </div>

      {/* 變更角色確認 Modal */}
      {roleModalMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-md w-full p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                <ArrowRightLeft className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">變更成員協作角色</h3>
                <p className="text-xs text-slate-500">
                  調整成員在工作區內的權限級別
                </p>
              </div>
            </div>

            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200/80 space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">成員名稱：</span>
                <span className="font-bold text-slate-800">{roleModalMember.name || "未命名"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">電子郵件：</span>
                <span className="font-mono text-slate-700">{roleModalMember.email}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">目前角色：</span>
                <span className="font-bold text-blue-700">{ROLE_DEFINITIONS[roleModalMember.role]?.label}</span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                選擇新角色
              </label>
              <div className="space-y-2">
                {(["ADMIN", "EDITOR", "VIEWER"] as const).map((r) => (
                  <label
                    key={r}
                    className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition ${
                      selectedNewRole === r
                        ? "bg-blue-50/50 border-blue-500 ring-1 ring-blue-500"
                        : "bg-white border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    <input
                      type="radio"
                      name="role"
                      value={r}
                      checked={selectedNewRole === r}
                      onChange={() => setSelectedNewRole(r)}
                      className="mt-0.5 text-blue-600 focus:ring-blue-500"
                    />
                    <div>
                      <div className="text-xs font-bold text-slate-900">
                        {ROLE_DEFINITIONS[r].label} ({ROLE_DEFINITIONS[r].zhLabel})
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        {ROLE_DEFINITIONS[r].description}
                      </div>
                    </div>
                  </label>
                ))}

                {/* 僅 OWNER 可轉移或指派 OWNER 角色 */}
                {isOwner && (
                  <label
                    className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition ${
                      selectedNewRole === "OWNER"
                        ? "bg-purple-50/50 border-purple-500 ring-1 ring-purple-500"
                        : "bg-white border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    <input
                      type="radio"
                      name="role"
                      value="OWNER"
                      checked={selectedNewRole === "OWNER"}
                      onChange={() => setSelectedNewRole("OWNER")}
                      className="mt-0.5 text-purple-600 focus:ring-purple-500"
                    />
                    <div>
                      <div className="text-xs font-bold text-purple-900 flex items-center gap-1.5">
                        <Crown className="w-3.5 h-3.5 text-purple-600" />
                        <span>Workspace Owner (組織擁有者)</span>
                      </div>
                      <div className="text-[11px] text-purple-700/80 mt-0.5">
                        {ROLE_DEFINITIONS.OWNER.description}
                      </div>
                    </div>
                  </label>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setRoleModalMember(null)}
                disabled={updatingRole}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleConfirmRoleChange}
                disabled={updatingRole || selectedNewRole === roleModalMember.role}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl transition disabled:opacity-40 flex items-center gap-1.5 shadow-xs"
              >
                {updatingRole && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>確認更新角色</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 移除成員確認 Modal */}
      {removeModalMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-md w-full p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-50 text-red-600 flex items-center justify-center">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">確認移除成員</h3>
                <p className="text-xs text-slate-500">
                  此成員將失去對此工作區所有問卷與資料之存取權
                </p>
              </div>
            </div>

            <div className="p-4 bg-red-50/50 rounded-xl border border-red-100 text-xs text-red-900 space-y-1">
              <p className="font-bold">您確定要將以下成員從工作區移除嗎？</p>
              <p className="text-slate-700">
                姓名：<strong>{removeModalMember.name || "未命名"}</strong>
              </p>
              <p className="font-mono text-slate-700">
                帳號：{removeModalMember.email}
              </p>
              <p className="text-slate-700">
                角色：{ROLE_DEFINITIONS[removeModalMember.role]?.label}
              </p>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setRemoveModalMember(null)}
                disabled={removingMember}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleConfirmRemoveMember}
                disabled={removingMember}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-xl transition disabled:opacity-40 flex items-center gap-1.5 shadow-xs"
              >
                {removingMember && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>確認移除成員</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
