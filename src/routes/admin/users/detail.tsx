/**
 * UserDetail — รายละเอียดผู้ใช้ + ประวัติ + actions
 *
 * Section B of admin-user-mgmt-wireframes.md
 * - Panel A: Hero card (identity + balance + status banners)
 * - Panel B: Tabs (ประวัติการสร้าง / ประวัติ krub / ประวัติคูปอง / PII log)
 * - Panel C: Admin actions sidebar (right on desktop, bottom on mobile)
 * - Panel D: Audit trail card
 *
 * Single GET /:id call fetches: user, credits, recent_generations,
 * recent_redemptions, audit_trail — all at once.
 */

import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Copy, ChevronLeft } from "lucide-react";
import {
  adminGetUser,
  adminUnsuspendUser,
  formatDateTime,
  type AdminUserRow,
  type AdminUserDetail,
} from "@/lib/api-admin";
import { useAdmin } from "@/components/AdminLayout";
import { AdjustKrubModal } from "@/components/AdjustKrubModal";
import { SuspendUserModal } from "@/components/SuspendUserModal";
import { SoftDeleteUserModal } from "@/components/SoftDeleteUserModal";
import { RestoreUserModal } from "@/components/RestoreUserModal";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function daysUntilPurge(deletedAt: string | null): number {
  if (!deletedAt) return 0;
  const ms = 30 * 24 * 60 * 60 * 1000;
  const remaining = new Date(deletedAt).getTime() + ms - Date.now();
  return Math.max(0, Math.ceil(remaining / (24 * 60 * 60 * 1000)));
}

function isInGracePeriod(deletedAt: string | null): boolean {
  if (!deletedAt) return false;
  return daysUntilPurge(deletedAt) > 0;
}

function truncateId(id: string): string {
  return `${id.slice(0, 8)}…${id.slice(-4)}`;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function UserStatusBadge({ status }: { status: AdminUserRow["status"] }) {
  const map: Record<AdminUserRow["status"], { dot: string; bg: string; text: string; label: string }> = {
    active:       { dot: "bg-green-400",  bg: "bg-green-900/30",  text: "text-green-400",  label: "เปิดใช้งาน" },
    suspended:    { dot: "bg-amber-400",  bg: "bg-amber-900/30",  text: "text-amber-400",  label: "ระงับ"       },
    soft_deleted: { dot: "bg-red-400",    bg: "bg-red-900/30",    text: "text-red-400",    label: "ลบแล้ว"      },
  };
  const s = map[status];
  return (
    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-ui", s.bg, s.text)}>
      <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", s.dot)} />
      {s.label}
    </span>
  );
}

function UserRoleBadge({ role }: { role: AdminUserRow["role"] }) {
  const map: Record<AdminUserRow["role"], string> = {
    user:  "px-2 py-0.5 rounded bg-slate-700/50 text-slate-300 text-xs font-ui",
    admin: "px-2 py-0.5 rounded bg-blue-900/40 text-blue-300 text-xs font-ui",
    owner: "px-2 py-0.5 rounded bg-amber-900/40 text-amber-300 text-xs font-ui",
  };
  return <span className={map[role]}>{role}</span>;
}

type KrubTxKind = "reserve" | "refund" | "coupon" | "signup_bonus" | "admin_adjust" | "purchase";

function KrubKindBadge({ kind }: { kind: string }) {
  const map: Partial<Record<KrubTxKind, { bg: string; text: string }>> = {
    reserve:      { bg: "bg-red-900/20",    text: "text-red-300"    },
    refund:       { bg: "bg-green-900/20",  text: "text-green-300"  },
    coupon:       { bg: "bg-blue-900/20",   text: "text-blue-300"   },
    signup_bonus: { bg: "bg-purple-900/20", text: "text-purple-300" },
    admin_adjust: { bg: "bg-amber-900/20",  text: "text-amber-300"  },
    purchase:     { bg: "bg-teal-900/20",   text: "text-teal-300"   },
  };
  const s = map[kind as KrubTxKind] ?? { bg: "bg-slate-700/30", text: "text-slate-400" };
  return (
    <span className={cn("px-2 py-0.5 rounded text-xs font-ui", s.bg, s.text)}>
      {kind}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Panel A — Hero card
// ---------------------------------------------------------------------------

function HeroCard({ user, balance }: { user: AdminUserRow; balance: number }) {
  function copyId() {
    void navigator.clipboard.writeText(user.id);
  }

  const days = daysUntilPurge(user.deleted_at);
  const purgeDate = user.deleted_at
    ? new Date(new Date(user.deleted_at).getTime() + 30 * 24 * 60 * 60 * 1000)
    : null;

  return (
    <div className="bg-[#1E293B] rounded-xl border border-white/8 p-6 mb-4">
      {/* Identity */}
      <div className="flex items-start gap-4">
        <div className="w-[4.5rem] h-[4.5rem] rounded-full bg-slate-700 flex items-center justify-center text-2xl font-display text-[#94A3B8] flex-shrink-0">
          {user.display_name ? user.display_name[0]?.toUpperCase() : "?"}
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="font-display text-xl text-[#F1F5F9] truncate">
            {user.display_name ?? "—"}
          </h2>
          <p className="font-content text-sm text-[#94A3B8] mt-0.5 truncate">
            {user.email ?? "—"}
          </p>
          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
            <UserRoleBadge role={user.role} />
            <UserStatusBadge status={user.status} />
          </div>
        </div>
      </div>

      {/* Balance */}
      <div className="mt-4">
        <p className="font-ui text-xs text-[#475569] uppercase tracking-wide mb-1">ยอดปัจจุบัน</p>
        <p className="font-display text-3xl text-[#F1F5F9]">{balance} krub</p>
      </div>

      {/* Info grid */}
      <div className="grid grid-cols-3 gap-3 mt-4 text-xs">
        <div>
          <p className="font-ui text-[#475569] uppercase tracking-wide text-[10px] mb-1">UUID</p>
          <div className="flex items-center gap-1">
            <span className="font-mono text-[#94A3B8] tabular-nums">{truncateId(user.id)}</span>
            <button onClick={copyId} className="text-[#475569] hover:text-[#F25F2D] transition-colors">
              <Copy className="w-3 h-3" />
            </button>
          </div>
        </div>
        <div>
          <p className="font-ui text-[#475569] uppercase tracking-wide text-[10px] mb-1">สมัคร</p>
          <p className="font-mono text-[#94A3B8] tabular-nums">
            {user.created_at ? formatDateTime(user.created_at).slice(0, 10) : "—"}
          </p>
        </div>
        <div>
          <p className="font-ui text-[#475569] uppercase tracking-wide text-[10px] mb-1">อัปเดต</p>
          <p className="font-mono text-[#94A3B8] tabular-nums">
            {user.suspended_at ? formatDateTime(user.suspended_at).slice(0, 10) : "—"}
          </p>
        </div>
      </div>

      {/* Suspend banner */}
      {user.status === "suspended" && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-900/20 border border-amber-500/30 text-amber-300 text-sm font-content mt-4">
          <span className="shrink-0">⚠</span>
          <span>
            บัญชีถูกระงับ
            {user.suspended_reason ? ` — เหตุผล: ${user.suspended_reason}` : ""}
          </span>
        </div>
      )}

      {/* Soft-deleted banner */}
      {user.status === "soft_deleted" && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-red-900/20 border border-red-500/30 text-red-300 text-sm font-content mt-4">
          <span className="shrink-0">🗑</span>
          <span>
            บัญชีถูกลบ — hard purge ใน {days} วัน
            {purgeDate ? ` (${purgeDate.toLocaleDateString("th-TH")})` : ""}
          </span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Panel B — Tabs
// ---------------------------------------------------------------------------

type TabId = "generations" | "krub" | "coupons" | "pii";

const TAB_LABELS: { id: TabId; label: string }[] = [
  { id: "generations", label: "ประวัติการสร้าง" },
  { id: "krub",        label: "ประวัติ krub"    },
  { id: "coupons",     label: "ประวัติคูปอง"    },
  { id: "pii",         label: "PII log"         },
];

function GenerationStatusBadge({ status }: { status: string }) {
  const isOk = status === "completed" || status === "success";
  return (
    <span className={cn(
      "text-xs font-ui",
      isOk ? "text-green-400" : "text-red-400",
    )}>
      {isOk ? "● สำเร็จ" : "✕ ล้มเหลว"}
    </span>
  );
}

function TabsPanel({ data }: { data: AdminUserDetail }) {
  const [activeTab, setActiveTab] = useState<TabId>("generations");

  return (
    <div className="bg-[#1E293B] rounded-xl border border-white/8 mb-4">
      {/* Tab bar */}
      <div className="flex border-b border-white/8 overflow-x-auto scrollbar-none">
        {TAB_LABELS.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={cn(
              "px-4 py-2.5 font-ui text-sm whitespace-nowrap transition-colors",
              activeTab === t.id
                ? "text-[#F1F5F9] border-b-2 border-[#F25F2D]"
                : "text-[#94A3B8] hover:text-[#F1F5F9]",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="p-4">
        {activeTab === "generations" && (
          <div className="space-y-3">
            {data.recent_generations.length === 0 && (
              <p className="font-content text-sm text-[#475569] text-center py-4">ยังไม่มีประวัติการสร้าง</p>
            )}
            {data.recent_generations.map((g) => (
              <div key={g.id} className="border border-white/5 rounded-lg p-3 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs text-[#94A3B8]">#{g.id.slice(0, 10)}</span>
                  <GenerationStatusBadge status={g.status} />
                </div>
                <p className="font-ui text-xs text-[#475569]">
                  {g.model} · {g.provider}
                </p>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs text-[#475569] tabular-nums">
                    {formatDateTime(g.created_at)}
                  </span>
                  <span className="font-mono text-xs text-[#94A3B8] tabular-nums">
                    {g.cost} krub
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === "krub" && (
          <div className="overflow-x-auto">
            {data.recent_redemptions.length === 0 ? (
              <p className="font-content text-sm text-[#475569] text-center py-4">ยังไม่มีประวัติ krub</p>
            ) : (
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="px-2 py-2 font-ui text-xs text-[#94A3B8] text-left uppercase tracking-wide">วันที่</th>
                    <th className="px-2 py-2 font-ui text-xs text-[#94A3B8] text-left uppercase tracking-wide">ประเภท</th>
                    <th className="px-2 py-2 font-ui text-xs text-[#94A3B8] text-right uppercase tracking-wide">krub</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recent_redemptions.map((r) => (
                    <tr key={r.coupon_id + r.redeemed_at} className="border-t border-white/5">
                      <td className="px-2 py-2 font-mono text-xs text-[#475569] tabular-nums">
                        {formatDateTime(r.redeemed_at)}
                      </td>
                      <td className="px-2 py-2">
                        <KrubKindBadge kind="coupon" />
                      </td>
                      <td className="px-2 py-2 font-mono text-sm text-right text-green-400 tabular-nums">
                        +{r.krub_added}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {activeTab === "coupons" && (
          <div className="overflow-x-auto">
            {data.recent_redemptions.length === 0 ? (
              <p className="font-content text-sm text-[#475569] text-center py-4">ยังไม่มีประวัติคูปอง</p>
            ) : (
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="px-2 py-2 font-ui text-xs text-[#94A3B8] text-left uppercase tracking-wide">วันที่ Redeem</th>
                    <th className="px-2 py-2 font-ui text-xs text-[#94A3B8] text-left uppercase tracking-wide">Coupon ID</th>
                    <th className="px-2 py-2 font-ui text-xs text-[#94A3B8] text-right uppercase tracking-wide">krub ที่ได้</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recent_redemptions.map((r) => (
                    <tr key={r.coupon_id + r.redeemed_at} className="border-t border-white/5">
                      <td className="px-2 py-2 font-mono text-xs text-[#475569] tabular-nums">
                        {formatDateTime(r.redeemed_at)}
                      </td>
                      <td className="px-2 py-2 font-mono text-xs text-[#94A3B8]">
                        {r.coupon_id.slice(0, 12)}…
                      </td>
                      <td className="px-2 py-2 font-mono text-sm text-right text-green-400 tabular-nums">
                        +{r.krub_added}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {activeTab === "pii" && (
          <div className="py-8 text-center space-y-2">
            <p className="font-content text-sm text-[#475569]">
              PII access log endpoint pending
            </p>
            <p className="font-ui text-xs text-[#475569]">
              Cheese to add <span className="font-mono">pii_access_log</span> field to{" "}
              <span className="font-mono">GET /admin/users/:id</span> response (Wave 4.4.1)
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Panel C — Admin actions
// ---------------------------------------------------------------------------

interface ActionsPanelProps {
  user: AdminUserRow;
  balance: number;
  viewerRole: "admin" | "owner";
  viewerId: string;
  onAdjust: () => void;
  onSuspend: () => void;
  onUnsuspend: () => void;
  onDelete: () => void;
  onRestore: () => void;
  isUnsuspending: boolean;
}

function ActionsPanel({
  user,
  viewerRole,
  viewerId,
  onAdjust,
  onSuspend,
  onUnsuspend,
  onDelete,
  onRestore,
  isUnsuspending,
}: ActionsPanelProps) {
  const isSelf = viewerId === user.id;

  // Self-target rule: replace entire panel
  if (isSelf) {
    return (
      <div className="text-xs text-[#475569] p-4">
        ไม่สามารถดำเนินการกับบัญชีตัวเองได้
      </div>
    );
  }

  // Hard-purged: all actions hidden
  if (user.status === ("hard_purged" as AdminUserRow["status"])) {
    return (
      <div className="text-xs text-[#475569] p-4">read-only — บัญชีนี้ถูกลบถาวรแล้ว</div>
    );
  }

  const isPeerAdminBlock = viewerRole === "admin" && (user.role === "admin" || user.role === "owner");
  const isSoftDeleted = user.status === "soft_deleted";
  const canRestore = viewerRole === "owner" && isSoftDeleted && isInGracePeriod(user.deleted_at);
  const gracePeriodExpired = isSoftDeleted && !isInGracePeriod(user.deleted_at);

  return (
    <div className="bg-[#1E293B] rounded-xl border border-white/8 p-4 space-y-2">
      <p className="font-ui text-xs text-[#94A3B8] uppercase tracking-wide mb-3">การดำเนินการ</p>

      {/* ปรับยอด krub */}
      <button
        onClick={!isPeerAdminBlock && !isSoftDeleted ? onAdjust : undefined}
        disabled={isPeerAdminBlock || isSoftDeleted}
        title={isPeerAdminBlock ? "เฉพาะ owner" : undefined}
        className={cn(
          "w-full h-10 px-4 rounded-lg font-ui text-sm transition-colors text-white",
          isPeerAdminBlock || isSoftDeleted
            ? "opacity-40 cursor-not-allowed bg-[#F25F2D]/50"
            : "bg-[#F25F2D] hover:bg-[#C7461A]",
        )}
      >
        ⚡ ปรับยอด krub
      </button>

      {/* ระงับ / ยกเลิกระงับ */}
      {!isSoftDeleted && (
        <>
          {user.status === "active" && (
            <button
              onClick={!isPeerAdminBlock ? onSuspend : undefined}
              disabled={isPeerAdminBlock}
              title={isPeerAdminBlock ? "เฉพาะ owner" : undefined}
              className={cn(
                "w-full h-10 px-4 rounded-lg border font-ui text-sm transition-colors",
                isPeerAdminBlock
                  ? "opacity-40 cursor-not-allowed bg-amber-900/30 border-amber-500/30 text-amber-300"
                  : "bg-amber-900/30 border-amber-500/30 text-amber-300 hover:bg-amber-900/50",
              )}
            >
              ⊘ ระงับบัญชี
            </button>
          )}

          {user.status === "suspended" && (
            <button
              onClick={!isPeerAdminBlock ? onUnsuspend : undefined}
              disabled={isPeerAdminBlock || isUnsuspending}
              title={isPeerAdminBlock ? "เฉพาะ owner" : undefined}
              className={cn(
                "w-full h-10 px-4 rounded-lg border font-ui text-sm transition-colors",
                isPeerAdminBlock
                  ? "opacity-40 cursor-not-allowed border-white/20 text-[#94A3B8]"
                  : "border-white/20 text-[#94A3B8] hover:bg-white/5",
              )}
            >
              {isUnsuspending ? "กำลังยกเลิก..." : "◎ ยกเลิกการระงับ"}
            </button>
          )}
        </>
      )}

      {/* กู้คืน */}
      {canRestore && (
        <button
          onClick={onRestore}
          className="w-full h-10 px-4 rounded-lg bg-green-900/30 border border-green-500/30 text-green-300 font-ui text-sm hover:bg-green-900/50 transition-colors"
        >
          ↩ กู้คืนบัญชี
        </button>
      )}

      {gracePeriodExpired && (
        <p className="text-xs text-[#475569] font-content">
          grace period หมดแล้ว — บัญชีนี้จะถูกลบโดย pg_cron
        </p>
      )}

      {/* ลบบัญชี (owner only, active users only, not self) */}
      {viewerRole === "owner" && user.status === "active" && user.role === "user" && (
        <>
          <hr className="border-white/10 my-3" />
          <button
            onClick={onDelete}
            className="w-full h-10 px-4 rounded-lg bg-red-900/20 border border-red-500/30 text-red-400 font-ui text-sm hover:bg-red-900/40 transition-colors"
          >
            🗑 ลบบัญชี (Soft)
          </button>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Panel D — Audit trail
// ---------------------------------------------------------------------------

function AuditTrailCard({ trail }: { trail: AdminUserDetail["audit_trail"] }) {
  if (trail.length === 0) {
    return (
      <div className="bg-[#1E293B] rounded-xl border border-white/8 p-4 mt-4">
        <p className="font-ui text-sm text-[#94A3B8] uppercase tracking-wide mb-3">
          ประวัติการดำเนินการของแอดมิน
        </p>
        <p className="font-content text-sm text-[#475569] text-center py-2">ยังไม่มีประวัติ</p>
      </div>
    );
  }

  return (
    <div className="bg-[#1E293B] rounded-xl border border-white/8 p-4 mt-4">
      <p className="font-ui text-sm text-[#94A3B8] uppercase tracking-wide mb-3">
        ประวัติการดำเนินการของแอดมิน (10 รายการล่าสุด)
      </p>
      <div className="space-y-0">
        {trail.slice(0, 10).map((row) => {
          const detail = JSON.stringify(row.payload).slice(1, -1).replace(/"/g, "").slice(0, 50);
          return (
            <div key={row.id} className="flex gap-3 py-2 border-t border-white/5 text-xs">
              <span className="font-mono text-[#475569] tabular-nums shrink-0 w-[140px]">
                {formatDateTime(row.created_at)}
              </span>
              <span className="font-ui text-[#94A3B8] shrink-0 w-[60px] truncate">
                {row.actor_role}
              </span>
              <span className="font-mono text-[#F1F5F9] shrink-0 w-[140px] truncate">
                {row.action}
              </span>
              <span className="font-content text-[#475569] truncate">{detail}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// UserDetail page
// ---------------------------------------------------------------------------

type ModalType = "adjust" | "suspend" | "soft_delete" | "restore" | null;

export default function UserDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user: viewer } = useAdmin();
  const queryClient = useQueryClient();

  const [openModal, setOpenModal] = useState<ModalType>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["admin", "user", id],
    queryFn: () => adminGetUser(id!),
    enabled: !!id,
  });

  const unsuspendMutation = useMutation({
    mutationFn: () => adminUnsuspendUser(id!),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "user", id] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
    },
  });

  if (isLoading) {
    return (
      <div className="p-4 md:p-6 space-y-4 animate-pulse">
        <div className="h-6 w-32 bg-white/5 rounded" />
        <div className="bg-[#1E293B] rounded-xl border border-white/8 p-6">
          <div className="flex gap-4">
            <div className="w-[4.5rem] h-[4.5rem] rounded-full bg-white/5" />
            <div className="space-y-2 flex-1">
              <div className="h-5 w-40 bg-white/5 rounded" />
              <div className="h-4 w-56 bg-white/5 rounded" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="p-4 md:p-6">
        <div className="flex items-center justify-between p-4 rounded-lg bg-red-900/20 border border-red-500/30 text-red-300 text-sm font-ui">
          <span>โหลดข้อมูลผู้ใช้ไม่สำเร็จ</span>
          <Button
            variant="outline"
            size="sm"
            className="border-red-500/30 text-red-300 hover:bg-red-900/30"
            onClick={() => refetch()}
          >
            ลองใหม่
          </Button>
        </div>
      </div>
    );
  }

  const { user, credits, recent_generations, recent_redemptions, audit_trail } = data;
  const detailData: AdminUserDetail = {
    user,
    credits,
    recent_generations,
    recent_redemptions,
    audit_trail,
  };

  return (
    <div className="p-4 md:p-6">
      {/* Back nav */}
      <button
        onClick={() => navigate("/users")}
        className="flex items-center gap-1.5 text-[#94A3B8] hover:text-[#F1F5F9] font-ui text-sm mb-4 transition-colors"
      >
        <ChevronLeft className="w-4 h-4" />
        กลับ
      </button>

      {/* PII access banner */}
      <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-900/20 border border-blue-500/30 text-blue-300 text-sm font-ui mb-4">
        <span>🔒</span>
        <span>การเข้าถึงข้อมูลนี้ถูกบันทึกแล้ว · อ่านข้อมูล PDPA</span>
      </div>

      {/* Desktop: 2-column layout */}
      <div className="flex flex-col md:flex-row gap-4">
        {/* Left column */}
        <div className="flex-1 min-w-0">
          <HeroCard user={user} balance={credits.balance} />
          <TabsPanel data={detailData} />
          <AuditTrailCard trail={audit_trail} />
        </div>

        {/* Right sidebar (desktop) / bottom section (mobile) */}
        <div className="w-full md:w-[260px] md:sticky md:top-[72px] md:self-start">
          <ActionsPanel
            user={user}
            balance={credits.balance}
            viewerRole={viewer.role}
            viewerId={viewer.id}
            onAdjust={() => setOpenModal("adjust")}
            onSuspend={() => setOpenModal("suspend")}
            onUnsuspend={() => void unsuspendMutation.mutateAsync()}
            onDelete={() => setOpenModal("soft_delete")}
            onRestore={() => setOpenModal("restore")}
            isUnsuspending={unsuspendMutation.isPending}
          />
        </div>
      </div>

      {/* Modals */}
      {openModal === "adjust" && (
        <AdjustKrubModal
          open
          user={user}
          balance={credits.balance}
          onClose={() => setOpenModal(null)}
          onSuccess={() => {
            setOpenModal(null);
            void queryClient.invalidateQueries({ queryKey: ["admin", "user", id] });
          }}
        />
      )}

      {openModal === "suspend" && (
        <SuspendUserModal
          open
          user={user}
          onClose={() => setOpenModal(null)}
          onSuccess={() => {
            setOpenModal(null);
            void queryClient.invalidateQueries({ queryKey: ["admin", "user", id] });
          }}
        />
      )}

      {openModal === "soft_delete" && (
        <SoftDeleteUserModal
          open
          user={user}
          onClose={() => setOpenModal(null)}
          onSuccess={() => {
            setOpenModal(null);
            void queryClient.invalidateQueries({ queryKey: ["admin", "user", id] });
          }}
        />
      )}

      {openModal === "restore" && (
        <RestoreUserModal
          open
          user={user}
          daysRemaining={daysUntilPurge(user.deleted_at)}
          onClose={() => setOpenModal(null)}
          onSuccess={() => {
            setOpenModal(null);
            void queryClient.invalidateQueries({ queryKey: ["admin", "user", id] });
          }}
        />
      )}
    </div>
  );
}
