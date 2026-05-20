/**
 * UserDetailContent — shared detail implementation used by UserDetailModal.
 *
 * Split into two exported pieces that UserDetailModal composes:
 *   - UserDetailHero: hero card rendered FIXED above the scroll region
 *   - UserDetailBody: PII banner, actions, tabs, audit trail rendered
 *     inside the scrollable region
 *
 * The query lives in UserDetailModal (single subscription, no double-fetch).
 * Data + viewer context are passed in as props.
 *
 * Sub-modals (AdjustKrub / Suspend / SoftDelete / Restore) open via Radix
 * portal dialogs stacked above the outer glass modal.
 *
 * FORBID-LIST compliant:
 * - No hardcoded hex colors (all via var(--color-*))
 * - No emoji icons (Lucide only)
 * - No blur on data rows / table / tbody
 * - Muted status token colors, tabular-nums on numbers
 * - motion-safe for any transition
 */

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Copy,
  AlertTriangle,
  ShieldAlert,
  Zap,
  Ban,
  ShieldOff,
  Trash2,
  RotateCcw,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import {
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
import { PiiAccessLogTable } from "@/components/PiiAccessLogTable";
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
// Shared status / role badges (token-bound colors, no hardcoded hex)
// ---------------------------------------------------------------------------

function UserStatusBadge({ status }: { status: AdminUserRow["status"] }) {
  const map: Record<AdminUserRow["status"], { dot: string; badge: string; label: string }> = {
    active: {
      dot:   "bg-[var(--color-success)]",
      badge: "bg-[var(--color-success)]/12 text-[var(--color-success-text)] border-[var(--color-success)]/20",
      label: "เปิดใช้งาน",
    },
    suspended: {
      dot:   "bg-[var(--color-warning)]",
      badge: "bg-[var(--color-warning)]/12 text-[var(--color-warning-text)] border-[var(--color-warning)]/20",
      label: "ระงับ",
    },
    soft_deleted: {
      dot:   "bg-[var(--color-error)]",
      badge: "bg-[var(--color-error)]/12 text-[var(--color-error-text)] border-[var(--color-error)]/20",
      label: "ลบแล้ว",
    },
  };
  const s = map[status];
  return (
    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-ui border", s.badge)}>
      <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", s.dot)} aria-hidden="true" />
      {s.label}
    </span>
  );
}

function UserRoleBadge({ role }: { role: AdminUserRow["role"] }) {
  const map: Record<AdminUserRow["role"], string> = {
    user:  "px-2 py-0.5 rounded bg-[var(--color-bg-raised)] text-[var(--color-fg-muted)] text-xs font-ui",
    admin: "px-2 py-0.5 rounded bg-[var(--color-info)]/12 text-[var(--color-info-text)] text-xs font-ui",
    owner: "px-2 py-0.5 rounded bg-[var(--color-warning)]/12 text-[var(--color-warning-text)] text-xs font-ui",
  };
  return <span className={map[role]}>{role}</span>;
}

// ---------------------------------------------------------------------------
// KrubKindBadge — token-bound only (no blue-900 / green-900 / saturated colors)
// ---------------------------------------------------------------------------

type KrubTxKind = "reserve" | "refund" | "coupon" | "signup_bonus" | "admin_adjust" | "purchase";

function KrubKindBadge({ kind }: { kind: string }) {
  const map: Partial<Record<KrubTxKind, { bg: string; text: string }>> = {
    reserve:      { bg: "bg-[var(--color-error)]/12",   text: "text-[var(--color-error-text)]"   },
    refund:       { bg: "bg-[var(--color-success)]/12", text: "text-[var(--color-success-text)]" },
    coupon:       { bg: "bg-[var(--color-info)]/12",    text: "text-[var(--color-info-text)]"    },
    signup_bonus: { bg: "bg-[var(--color-bg-raised)]",  text: "text-[var(--color-fg-muted)]" },
    admin_adjust: { bg: "bg-[var(--color-warning)]/12", text: "text-[var(--color-warning-text)]" },
    purchase:     { bg: "bg-[var(--color-bg-raised)]",  text: "text-[var(--color-fg-muted)]" },
  };
  const s = map[kind as KrubTxKind] ?? { bg: "bg-[var(--color-bg-raised)]", text: "text-[var(--color-fg-subtle)]" };
  return (
    <span className={cn("px-2 py-0.5 rounded text-xs font-ui", s.bg, s.text)}>
      {kind}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Hero card (Variant A nested card) — exported so UserDetailModal can render
// it FIXED above the scroll region (spec §6: "header + hero card remain
// fixed, not scrolled").
// ---------------------------------------------------------------------------

interface UserDetailHeroProps {
  user: AdminUserRow;
  balance: number;
}

export function UserDetailHero({ user, balance }: UserDetailHeroProps) {
  function copyId() {
    void navigator.clipboard.writeText(user.id);
  }

  const days = daysUntilPurge(user.deleted_at);
  const purgeDate = user.deleted_at
    ? new Date(new Date(user.deleted_at).getTime() + 30 * 24 * 60 * 60 * 1000)
    : null;

  // H4: conditional third info-cell label+value based on status
  const thirdCell = (() => {
    if (user.status === "suspended") {
      return {
        label: "ระงับเมื่อ",
        value: user.suspended_at ? formatDateTime(user.suspended_at).slice(0, 10) : "—",
      };
    }
    if (user.status === "soft_deleted") {
      return {
        label: "ลบเมื่อ",
        value: user.deleted_at ? formatDateTime(user.deleted_at).slice(0, 10) : "—",
      };
    }
    // active — updated_at not in AdminUserRow API response; show graceful fallback
    return {
      label: "แก้ไขล่าสุด",
      value: "—",
    };
  })();

  return (
    <div className="bg-[var(--color-bg)] rounded-xl border border-white/[0.08] p-5">
      {/* Identity row */}
      <div className="flex items-start gap-4">
        <div className="w-[4rem] h-[4rem] rounded-full bg-[var(--color-bg-raised)] flex items-center justify-center text-xl font-display text-[var(--color-fg-muted)] flex-shrink-0">
          {user.display_name ? user.display_name[0]?.toUpperCase() : "?"}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-display text-lg text-[var(--color-fg)] truncate">
            {user.display_name ?? "—"}
          </h3>
          <p className="font-content text-sm text-[var(--color-fg-muted)] mt-0.5 truncate">
            {user.email ?? "—"}
          </p>
          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
            <UserRoleBadge role={user.role} />
            <UserStatusBadge status={user.status} />
          </div>
        </div>
      </div>

      {/* Balance block */}
      <div className="mt-4 pt-4 border-t border-white/[0.06]">
        <p className="font-ui font-medium text-[10px] text-[var(--color-fg-subtle)] uppercase tracking-widest mb-1">
          ยอดปัจจุบัน
        </p>
        <p className="font-display text-3xl md:text-4xl text-[var(--color-fg)] tabular-nums">
          {balance.toLocaleString()} <span className="text-base text-[var(--color-fg-muted)]">krub</span>
        </p>
      </div>

      {/* Info row: UUID / สมัคร / conditional third cell */}
      <div className="grid grid-cols-3 gap-3 mt-4 text-xs">
        <div>
          <p className="font-ui font-medium text-[var(--color-fg-subtle)] uppercase tracking-wide text-[10px] mb-1">UUID</p>
          <div className="flex items-center gap-1">
            <span className="font-mono text-[var(--color-fg-muted)] tabular-nums">{truncateId(user.id)}</span>
            <button
              onClick={copyId}
              className="text-[var(--color-fg-subtle)] hover:text-[var(--color-accent)] motion-safe:transition-colors duration-150"
              aria-label="คัดลอก UUID"
            >
              <Copy className="w-3 h-3" />
            </button>
          </div>
        </div>
        <div>
          <p className="font-ui font-medium text-[var(--color-fg-subtle)] uppercase tracking-wide text-[10px] mb-1">สมัคร</p>
          <p className="font-mono text-[var(--color-fg-muted)] tabular-nums">
            {user.created_at ? formatDateTime(user.created_at).slice(0, 10) : "—"}
          </p>
        </div>
        <div>
          <p className="font-ui font-medium text-[var(--color-fg-subtle)] uppercase tracking-wide text-[10px] mb-1">
            {thirdCell.label}
          </p>
          <p className="font-mono text-[var(--color-fg-muted)] tabular-nums">
            {thirdCell.value}
          </p>
        </div>
      </div>

      {/* Suspend banner */}
      {user.status === "suspended" && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-[var(--color-warning)]/12 border border-[var(--color-warning)]/30 text-[var(--color-warning-text)] text-sm font-content mt-4">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
          <span>
            บัญชีถูกระงับ
            {user.suspended_reason ? ` — เหตุผล: ${user.suspended_reason}` : ""}
          </span>
        </div>
      )}

      {/* Soft-deleted banner */}
      {user.status === "soft_deleted" && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-[var(--color-error)]/12 border border-[var(--color-error)]/30 text-[var(--color-error-text)] text-sm font-content mt-4">
          <Trash2 className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
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
// Actions panel (inline pill buttons per Variant A)
// ---------------------------------------------------------------------------

interface ActionsPanelProps {
  user: AdminUserRow;
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

  if (isSelf) {
    return (
      <p className="text-xs text-[var(--color-fg-subtle)] font-ui italic">
        ไม่สามารถดำเนินการกับบัญชีตัวเองได้
      </p>
    );
  }

  // L1: removed unreachable hard_purged branch — UserStatus union has no hard_purged value

  const isPeerAdminBlock = viewerRole === "admin" && (user.role === "admin" || user.role === "owner");
  const isSoftDeleted = user.status === "soft_deleted";
  const canRestore = viewerRole === "owner" && isSoftDeleted && isInGracePeriod(user.deleted_at);
  const gracePeriodExpired = isSoftDeleted && !isInGracePeriod(user.deleted_at);

  return (
    <div className="flex flex-wrap gap-2">
      {/* ปรับยอด krub — primary */}
      <button
        onClick={!isPeerAdminBlock && !isSoftDeleted ? onAdjust : undefined}
        disabled={isPeerAdminBlock || isSoftDeleted}
        title={isPeerAdminBlock ? "เฉพาะ owner" : undefined}
        className={cn(
          "inline-flex items-center gap-1.5 h-8 px-4 rounded-full font-ui text-xs motion-safe:transition-colors duration-150 text-[var(--color-accent-fg)]",
          isPeerAdminBlock || isSoftDeleted
            ? "opacity-40 cursor-not-allowed bg-[var(--color-accent)]/50"
            : "bg-[var(--color-accent)] hover:bg-[var(--color-accent-deep)]",
        )}
      >
        <Zap className="w-3 h-3" aria-hidden="true" />
        ปรับยอด krub
      </button>

      {/* ระงับ */}
      {!isSoftDeleted && user.status === "active" && (
        <button
          onClick={!isPeerAdminBlock ? onSuspend : undefined}
          disabled={isPeerAdminBlock}
          title={isPeerAdminBlock ? "เฉพาะ owner" : undefined}
          className={cn(
            "inline-flex items-center gap-1.5 h-8 px-3 rounded-full font-ui text-xs border motion-safe:transition-colors duration-150",
            isPeerAdminBlock
              ? "opacity-40 cursor-not-allowed bg-[var(--color-warning)]/12 border-[var(--color-warning)]/30 text-[var(--color-warning-text)]"
              : "bg-[var(--color-warning)]/12 border-[var(--color-warning)]/30 text-[var(--color-warning-text)] hover:bg-[var(--color-warning)]/20",
          )}
        >
          <Ban className="w-3 h-3" aria-hidden="true" />
          ระงับบัญชี
        </button>
      )}

      {/* ยกเลิกระงับ */}
      {!isSoftDeleted && user.status === "suspended" && (
        <button
          onClick={!isPeerAdminBlock ? onUnsuspend : undefined}
          disabled={isPeerAdminBlock || isUnsuspending}
          title={isPeerAdminBlock ? "เฉพาะ owner" : undefined}
          className={cn(
            "inline-flex items-center gap-1.5 h-8 px-3 rounded-full font-ui text-xs border motion-safe:transition-colors duration-150",
            isPeerAdminBlock
              ? "opacity-40 cursor-not-allowed border-white/[0.12] text-[var(--color-fg-muted)]"
              : "border-white/[0.12] text-[var(--color-fg-muted)] hover:bg-white/[0.05]",
          )}
        >
          <ShieldOff className="w-3 h-3" aria-hidden="true" />
          {isUnsuspending ? "กำลังยกเลิก..." : "ยกเลิกการระงับ"}
        </button>
      )}

      {/* กู้คืน */}
      {canRestore && (
        <button
          onClick={onRestore}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full font-ui text-xs border bg-[var(--color-success)]/12 border-[var(--color-success)]/30 text-[var(--color-success-text)] hover:bg-[var(--color-success)]/20 motion-safe:transition-colors duration-150"
        >
          <RotateCcw className="w-3 h-3" aria-hidden="true" />
          กู้คืนบัญชี
        </button>
      )}

      {gracePeriodExpired && (
        <p className="w-full text-xs text-[var(--color-fg-subtle)] font-content">
          หมดระยะเวลาคืนค่า — บัญชีนี้จะถูกลบถาวรโดย pg_cron
        </p>
      )}

      {/* ลบบัญชี */}
      {viewerRole === "owner" && user.status === "active" && user.role === "user" && (
        <button
          onClick={onDelete}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full font-ui text-xs border border-[var(--color-error)] text-[var(--color-error-text)] bg-transparent hover:bg-[var(--color-error)]/8 motion-safe:transition-colors duration-150"
        >
          <Trash2 className="w-3 h-3" aria-hidden="true" />
          ลบบัญชี (Soft)
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tabs panel
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
  return isOk ? (
    <span className="inline-flex items-center gap-1 text-xs font-ui text-[var(--color-success-text)]">
      <CheckCircle2 className="w-3 h-3 text-[var(--color-success)]" aria-hidden="true" />
      สำเร็จ
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-xs font-ui text-[var(--color-error-text)]">
      <XCircle className="w-3 h-3 text-[var(--color-error)]" aria-hidden="true" />
      ล้มเหลว
    </span>
  );
}

function TabsPanel({ data, viewerRole }: { data: AdminUserDetail; viewerRole: "admin" | "owner" }) {
  const [activeTab, setActiveTab] = useState<TabId>("generations");

  return (
    <div className="bg-[var(--color-bg)] rounded-xl border border-white/[0.08]">
      {/* Tab bar */}
      <div className="flex border-b border-white/[0.08] overflow-x-auto scrollbar-none">
        {TAB_LABELS.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={cn(
              "px-4 py-2.5 font-ui text-sm whitespace-nowrap motion-safe:transition-colors duration-150",
              activeTab === t.id
                ? "text-[var(--color-fg)] border-b-2 border-[var(--color-accent)]"
                : "text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]",
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
              <p className="font-content text-sm text-[var(--color-fg-subtle)] text-center py-4">
                ยังไม่มีประวัติการสร้าง
              </p>
            )}
            {data.recent_generations.map((g) => (
              <div key={g.id} className="border border-white/[0.05] rounded-lg p-3 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs text-[var(--color-fg-muted)]">#{g.id.slice(0, 10)}</span>
                  <GenerationStatusBadge status={g.status} />
                </div>
                <p className="font-ui text-xs text-[var(--color-fg-subtle)]">
                  {g.model} · {g.provider}
                </p>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs text-[var(--color-fg-subtle)] tabular-nums">
                    {formatDateTime(g.created_at)}
                  </span>
                  <span className="font-mono text-xs text-[var(--color-fg-muted)] tabular-nums">
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
              <p className="font-content text-sm text-[var(--color-fg-subtle)] text-center py-4">
                ยังไม่มีประวัติ krub
              </p>
            ) : (
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="px-2 py-2 font-ui font-medium text-xs text-[var(--color-fg-muted)] text-left uppercase tracking-wide">วันที่</th>
                    <th className="px-2 py-2 font-ui font-medium text-xs text-[var(--color-fg-muted)] text-left uppercase tracking-wide">ประเภท</th>
                    <th className="px-2 py-2 font-ui font-medium text-xs text-[var(--color-fg-muted)] text-right uppercase tracking-wide">krub</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recent_redemptions.map((r) => (
                    <tr key={r.coupon_id + r.redeemed_at} className="border-t border-white/[0.05]">
                      <td className="px-2 py-2 font-mono text-xs text-[var(--color-fg-subtle)] tabular-nums">
                        {formatDateTime(r.redeemed_at)}
                      </td>
                      <td className="px-2 py-2">
                        <KrubKindBadge kind="coupon" />
                      </td>
                      <td className="px-2 py-2 font-mono text-sm text-right text-[var(--color-success-text)] tabular-nums">
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
              <p className="font-content text-sm text-[var(--color-fg-subtle)] text-center py-4">
                ยังไม่มีประวัติคูปอง
              </p>
            ) : (
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="px-2 py-2 font-ui font-medium text-xs text-[var(--color-fg-muted)] text-left uppercase tracking-wide">วันที่ Redeem</th>
                    <th className="px-2 py-2 font-ui font-medium text-xs text-[var(--color-fg-muted)] text-left uppercase tracking-wide">Coupon ID</th>
                    <th className="px-2 py-2 font-ui font-medium text-xs text-[var(--color-fg-muted)] text-right uppercase tracking-wide">krub ที่ได้</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recent_redemptions.map((r) => (
                    <tr key={r.coupon_id + r.redeemed_at} className="border-t border-white/[0.05]">
                      <td className="px-2 py-2 font-mono text-xs text-[var(--color-fg-subtle)] tabular-nums">
                        {formatDateTime(r.redeemed_at)}
                      </td>
                      <td className="px-2 py-2 font-mono text-xs text-[var(--color-fg-muted)]">
                        {r.coupon_id.slice(0, 12)}…
                      </td>
                      <td className="px-2 py-2 font-mono text-sm text-right text-[var(--color-success-text)] tabular-nums">
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
          <PiiAccessLogTable
            rows={data.pii_access_log ?? []}
            viewerRole={viewerRole}
          />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Audit trail card
// ---------------------------------------------------------------------------

function AuditTrailCard({ trail }: { trail: AdminUserDetail["audit_trail"] }) {
  return (
    <div className="bg-[var(--color-bg)] rounded-xl border border-white/[0.08] p-4">
      <p className="font-ui font-medium text-xs text-[var(--color-fg-muted)] uppercase tracking-wide mb-3">
        {trail.length === 0
          ? "ประวัติการดำเนินการของแอดมิน"
          : `ประวัติการดำเนินการของแอดมิน (${Math.min(trail.length, 10)} รายการล่าสุด)`}
      </p>
      {trail.length === 0 ? (
        <p className="font-content text-sm text-[var(--color-fg-subtle)] text-center py-2">
          ยังไม่มีประวัติ
        </p>
      ) : (
        <div>
          {trail.slice(0, 10).map((row) => {
            const detail = JSON.stringify(row.payload).slice(1, -1).replace(/"/g, "").slice(0, 50);
            return (
              <div key={row.id} className="flex gap-3 py-2 border-t border-white/[0.05] text-xs">
                <span className="font-mono text-[var(--color-fg-subtle)] tabular-nums shrink-0 w-[140px]">
                  {formatDateTime(row.created_at)}
                </span>
                <span className="font-ui text-[var(--color-fg-muted)] shrink-0 w-[60px] truncate">
                  {row.actor_role}
                </span>
                <span className="font-mono text-[var(--color-fg)] shrink-0 w-[140px] truncate">
                  {row.action}
                </span>
                <span className="font-content text-[var(--color-fg-subtle)] truncate">{detail}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Loading skeleton (body only — used inside the scrollable region of
// UserDetailModal). The hero skeleton is handled in UserDetailModal's
// fixed region above the scroller to avoid double-skeleton during load.
// ---------------------------------------------------------------------------

export function UserDetailLoadingSkeleton() {
  return (
    <div className="space-y-4 motion-safe:animate-pulse">
      {/* Body placeholder — tabs/audit area */}
      <div className="bg-[var(--color-bg)] rounded-xl border border-white/[0.08] h-32" />
      <div className="bg-[var(--color-bg)] rounded-xl border border-white/[0.08] h-20" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// UserDetailBody — rendered inside the scrollable region of UserDetailModal.
// Receives pre-fetched data + userId for cache invalidation.
// ---------------------------------------------------------------------------

interface UserDetailBodyProps {
  data: AdminUserDetail;
  userId: string;
}

export function UserDetailBody({ data, userId }: UserDetailBodyProps) {
  const { user: viewer } = useAdmin();
  const queryClient = useQueryClient();
  const [openModal, setOpenModal] = useState<"adjust" | "suspend" | "soft_delete" | "restore" | null>(null);

  const unsuspendMutation = useMutation({
    mutationFn: () => adminUnsuspendUser(userId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "user", userId] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
    },
  });

  const { user, credits, recent_generations, recent_redemptions, audit_trail, pii_access_log } = data;
  const viewerRole = viewer.role === "owner" ? "owner" : "admin";

  const detailData: AdminUserDetail = {
    user,
    credits,
    recent_generations,
    recent_redemptions,
    audit_trail,
    pii_access_log: pii_access_log ?? [],
  };

  return (
    <>
      {/* PII access banner */}
      <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[var(--color-info)]/12 border border-[var(--color-info)]/30">
        <ShieldAlert className="w-4 h-4 shrink-0 text-[var(--color-info)]" aria-hidden="true" />
        <span className="font-ui text-sm text-[var(--color-info-text)]">
          การเข้าถึงข้อมูลนี้ถูกบันทึกแล้ว · อ่านข้อมูล PDPA
        </span>
      </div>

      {/* Actions row */}
      <div className="px-1">
        <p className="font-ui font-medium text-[10px] text-[var(--color-fg-subtle)] uppercase tracking-widest mb-2">
          การดำเนินการ
        </p>
        <ActionsPanel
          user={user}
          viewerRole={viewerRole}
          viewerId={viewer.id}
          onAdjust={() => setOpenModal("adjust")}
          onSuspend={() => setOpenModal("suspend")}
          onUnsuspend={() => void unsuspendMutation.mutateAsync()}
          onDelete={() => setOpenModal("soft_delete")}
          onRestore={() => setOpenModal("restore")}
          isUnsuspending={unsuspendMutation.isPending}
        />
      </div>

      {/* Tabs */}
      <TabsPanel data={detailData} viewerRole={viewerRole} />

      {/* Audit trail */}
      <AuditTrailCard trail={audit_trail} />

      {/* Sub-modals — render via Radix Portal above outer modal */}
      {openModal === "adjust" && (
        <AdjustKrubModal
          open
          user={user}
          balance={credits.balance}
          onClose={() => setOpenModal(null)}
          onSuccess={() => {
            setOpenModal(null);
            void queryClient.invalidateQueries({ queryKey: ["admin", "user", userId] });
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
            void queryClient.invalidateQueries({ queryKey: ["admin", "user", userId] });
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
            void queryClient.invalidateQueries({ queryKey: ["admin", "user", userId] });
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
            void queryClient.invalidateQueries({ queryKey: ["admin", "user", userId] });
          }}
        />
      )}
    </>
  );
}
