"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Building2, ChevronDown, Check, Plus, Shield, Loader2 } from "lucide-react";

interface OrgItem {
  id: string;
  name: string;
  slug: string;
  role: string;
  isActive: boolean;
}

export function WorkspaceSwitcher() {
  const router = useRouter();
  const [organizations, setOrganizations] = useState<OrgItem[]>([]);
  const [activeOrg, setActiveOrg] = useState<{ id: string; name: string; slug: string; role: string } | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState(false);

  // Create Workspace Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newOrgName, setNewOrgName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const dropdownRef = useRef<HTMLDivElement>(null);

  const fetchOrganizations = async () => {
    try {
      const res = await fetch("/api/organizations");
      if (res.ok) {
        const data = await res.json();
        setOrganizations(data.organizations || []);
        setActiveOrg(data.activeOrganization || null);
      }
    } catch {
      // unauthenticated or offline
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrganizations();
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSwitch = async (orgId: string) => {
    if (activeOrg?.id === orgId) {
      setOpen(false);
      return;
    }
    setSwitching(true);
    try {
      const res = await fetch("/api/organizations/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: orgId }),
      });
      if (res.ok) {
        const data = await res.json();
        setActiveOrg(data.activeOrganization);
        setOrganizations((prev) =>
          prev.map((org) => ({
            ...org,
            isActive: org.id === orgId,
          }))
        );
        setOpen(false);
        router.refresh();
      }
    } finally {
      setSwitching(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    if (!newOrgName.trim()) return;

    setCreating(true);
    try {
      const res = await fetch("/api/organizations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newOrgName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCreateError(data.message || "建立組織失敗");
      } else {
        setShowCreateModal(false);
        setNewOrgName("");
        await fetchOrganizations();
        router.refresh();
      }
    } catch {
      setCreateError("連線異常，請稍後再試");
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <div className="h-9 w-32 bg-slate-100 animate-pulse rounded-lg hidden sm:block" />
    );
  }

  if (!activeOrg && organizations.length === 0) {
    return null;
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 text-xs font-medium shadow-sm transition"
      >
        <Building2 className="w-3.5 h-3.5 text-blue-600" />
        <span className="max-w-[120px] truncate font-semibold">
          {activeOrg ? activeOrg.name : "選擇工作區"}
        </span>
        {activeOrg && (
          <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 text-[10px] font-bold">
            {activeOrg.role}
          </span>
        )}
        <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
      </button>

      {open && (
        <div className="absolute left-0 mt-2 w-64 rounded-2xl bg-white border border-slate-200 shadow-xl py-2 z-50 animate-in fade-in zoom-in-95 duration-150">
          <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100">
            我的工作區清單
          </div>

          <div className="max-h-60 overflow-y-auto py-1">
            {organizations.map((org) => (
              <button
                key={org.id}
                type="button"
                onClick={() => handleSwitch(org.id)}
                disabled={switching}
                className="w-full px-3 py-2 text-left flex items-center justify-between hover:bg-slate-50 transition text-xs group"
              >
                <div className="flex items-center gap-2 truncate pr-2">
                  <Building2 className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-600" />
                  <span className={`truncate ${org.isActive ? "font-bold text-blue-600" : "text-slate-700"}`}>
                    {org.name}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-semibold">
                    {org.role}
                  </span>
                  {org.isActive && <Check className="w-3.5 h-3.5 text-blue-600" />}
                </div>
              </button>
            ))}
          </div>

          <div className="border-t border-slate-100 pt-1.5 px-2">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setShowCreateModal(true);
              }}
              className="w-full px-2 py-1.5 text-left flex items-center gap-2 text-xs text-blue-600 hover:bg-blue-50 font-medium rounded-lg transition"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>建立新工作區</span>
            </button>
          </div>
        </div>
      )}

      {/* 建立新工作區 Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-sm w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                <Building2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-base">建立新工作區</h3>
                <p className="text-xs text-slate-500">您將自動成為該工作區的擁有者 (OWNER)</p>
              </div>
            </div>

            {createError && (
              <div className="mb-4 p-3 rounded-xl bg-red-50 text-red-700 text-xs border border-red-200">
                {createError}
              </div>
            )}

            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">工作區名稱</label>
                <input
                  type="text"
                  required
                  placeholder="例如：行銷團隊、研發部門"
                  value={newOrgName}
                  onChange={(e) => setNewOrgName(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-sm"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-3.5 py-2 text-xs text-slate-600 hover:bg-slate-100 rounded-xl transition"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl transition disabled:opacity-50 flex items-center gap-1.5"
                >
                  {creating && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>確認建立</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
