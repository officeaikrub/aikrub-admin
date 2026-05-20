/**
 * SuspendUserModal v2 — ระงับบัญชี (single + bulk mode)
 *
 * Wave 4.x.1 — extends the original modal with:
 *  - Duration radio (4 options, default 7d)
 *  - Suspend-until preview text
 *  - Notify user checkbox (default checked)
 *  - Bulk mode: when users?.length > 1 — shows preview stack + wider dialog
 *
 * Single mode: prop `user` only (existing callers unchanged)
 * Bulk mode: prop `users` array with length > 1
 *   - users.length === 1 via checkbox → treated as single mode (no preview stack)
 *
 * Endpoint (single): POST /api/admin/users/:id/suspend
 * Body: { reason_category, duration_option, notify_user, note? }
 *
 * Endpoint (bulk): POST /api/admin/users/bulk-suspend
 * Body: { user_ids, reason_category, duration_option, notify_user, note? }
 */

import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  adminSuspendUser,
  adminBulkSuspend,
  type AdminUserRow,
  type SuspendReason,
  type BulkSuspendReason,
  type DurationOption,
  type BulkSuspendResult,
} from "@/lib/api-admin";
import { ApiError } from "@/lib/api-admin";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SuspendUserModalProps {
  open: boolean;
  user: AdminUserRow;
  onClose: () => void;
  onSuccess: (updatedUser: AdminUserRow) => void;
  /** When provided with length > 1, activates bulk mode */
  users?: AdminUserRow[];
  /** Bulk mode: called with bulk result instead of single user */
  onBulkSuccess?: (result: BulkSuspendResult) => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SINGLE_REASON_OPTIONS: { value: SuspendReason; label: string }[] = [
  { value: "fraud",        label: "fraud"        },
  { value: "abuse",        label: "abuse"        },
  { value: "non_payment",  label: "non_payment"  },
  { value: "user_request", label: "user_request" },
  { value: "other",        label: "other"        },
];

const BULK_REASON_OPTIONS: { value: BulkSuspendReason; label: string }[] = [
  { value: "spam",          label: "spam"          },
  { value: "abuse",         label: "abuse"         },
  { value: "fraud",         label: "fraud"         },
  { value: "tos_violation", label: "tos_violation" },
  { value: "other",         label: "other"         },
];

const DURATION_OPTIONS: { value: DurationOption; label: string }[] = [
  { value: "1d",        label: "1 วัน"  },
  { value: "7d",        label: "7 วัน"  },
  { value: "30d",       label: "30 วัน" },
  { value: "permanent", label: "ถาวร"   },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function daysForOption(opt: DurationOption): number | null {
  if (opt === "permanent") return null;
  if (opt === "1d") return 1;
  if (opt === "7d") return 7;
  if (opt === "30d") return 30;
  return null;
}

function formatSuspendUntil(date: Date): string {
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function userInitial(u: AdminUserRow): string {
  if (u.display_name) return u.display_name[0]?.toUpperCase() ?? "?";
  if (u.email) return u.email[0]?.toUpperCase() ?? "?";
  return "?";
}

// ---------------------------------------------------------------------------
// Preview stack for bulk mode
// ---------------------------------------------------------------------------

function BulkPreviewStack({ users }: { users: AdminUserRow[] }) {
  const MAX_SHOWN = 5;
  const shown = users.slice(0, MAX_SHOWN);
  const overflow = users.length - MAX_SHOWN;

  return (
    <div className="bg-[var(--color-bg)] rounded-lg border border-white/8 divide-y divide-white/5 max-h-[180px] overflow-y-auto">
      {shown.map((u) => (
        <div key={u.id} className="flex items-center gap-3 px-3 py-2">
          <div className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center text-xs font-display text-muted-foreground shrink-0">
            {userInitial(u)}
          </div>
          <span className="font-content text-xs text-muted-foreground flex-1 truncate min-w-0">
            {u.email ?? u.id.slice(0, 8)}
          </span>
          <span className={cn(
            "px-1.5 py-0.5 rounded text-xs font-ui shrink-0",
            u.role === "admin" ? "bg-[var(--color-info)]/12 text-[var(--color-info-text)]"
            : u.role === "owner" ? "bg-[var(--color-warning)]/12 text-[var(--color-warning-text)]"
            : "bg-secondary text-muted-foreground",
          )}>
            {u.role}
          </span>
        </div>
      ))}
      {overflow > 0 && (
        <div className="px-3 py-2">
          <span className="font-content text-xs text-fg-subtle">
            และอีก {overflow} คน
          </span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function SuspendUserModal({
  open,
  user,
  onClose,
  onSuccess,
  users,
  onBulkSuccess,
}: SuspendUserModalProps) {
  const queryClient = useQueryClient();

  // Derive bulk mode: only when users array has MORE than 1 entry
  const isBulk = (users?.length ?? 0) > 1;
  const targetUsers = isBulk ? users! : [user];

  const [singleReason, setSingleReason] = useState<SuspendReason>("fraud");
  const [bulkReason, setBulkReason] = useState<BulkSuspendReason>("fraud");
  const [note, setNote] = useState("");
  const [duration, setDuration] = useState<DurationOption>("7d");
  const [notifyUser, setNotifyUser] = useState(true);

  // Derived: suspend-until date
  const days = daysForOption(duration);
  const suspendUntil = days !== null ? addDays(new Date(), days) : null;

  const singleMutation = useMutation({
    mutationFn: () =>
      adminSuspendUser(
        user.id,
        singleReason,
        duration,
        notifyUser,
        note.trim() || undefined,
      ),
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "user", user.id] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      onSuccess(data.user);
      handleClose();
    },
  });

  const bulkMutation = useMutation({
    mutationFn: () =>
      adminBulkSuspend({
        user_ids: targetUsers.map((u) => u.id),
        reason_category: bulkReason,
        duration_option: duration,
        notify_user: notifyUser,
        note: note.trim() || undefined,
      }),
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      onBulkSuccess?.(data);
      handleClose();
    },
  });

  const isPending = singleMutation.isPending || bulkMutation.isPending;
  const mutationError = singleMutation.error ?? bulkMutation.error;

  function handleClose() {
    if (isPending) return;
    setSingleReason("fraud");
    setBulkReason("fraud");
    setNote("");
    setDuration("7d");
    setNotifyUser(true);
    singleMutation.reset();
    bulkMutation.reset();
    onClose();
  }

  function handleSubmit() {
    if (isBulk) {
      bulkMutation.mutate();
    } else {
      singleMutation.mutate();
    }
  }

  useEffect(() => {
    if (open) {
      setSingleReason("fraud");
      setBulkReason("fraud");
      setNote("");
      setDuration("7d");
      setNotifyUser(true);
    }
  }, [open]);

  const displayName = user.display_name ?? user.email ?? user.id.slice(0, 8);
  const title = isBulk
    ? `⊘ Suspend ${targetUsers.length} users`
    : `⊘ ระงับบัญชี — ${displayName}`;
  const ctaLabel = isPending
    ? (isBulk ? `กำลังระงับ ${targetUsers.length} คน...` : "กำลังระงับ...")
    : (isBulk ? `Suspend ${targetUsers.length} คน ⊘` : "ระงับ ⊘");

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className={cn(
        "bg-card border-white/8",
        isBulk ? "max-w-md" : "max-w-sm",
      )}>
        <DialogHeader>
          <DialogTitle className="font-ui text-foreground">
            {title}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Bulk preview stack */}
          {isBulk && (
            <BulkPreviewStack users={targetUsers} />
          )}

          {/* JWT warning */}
          <div className="flex items-start gap-2 p-3 rounded-lg bg-[var(--color-warning)]/12 border border-[var(--color-warning)]/30 text-[var(--color-warning-text)] text-sm font-content">
            <span className="shrink-0">⚠</span>
            <span>
              ผู้ใช้จะยังเข้าระบบได้จนกว่า JWT หมดอายุ (~1 ชม) แต่ไม่สามารถใช้ฟีเจอร์ใหม่ได้ทันที
            </span>
          </div>

          {/* Reason dropdown */}
          <div>
            <label className="font-ui font-medium text-xs text-fg-subtle uppercase tracking-wide block mb-1.5">
              เหตุผล *
            </label>
            {isBulk ? (
              <select
                value={bulkReason}
                onChange={(e) => setBulkReason(e.target.value as BulkSuspendReason)}
                disabled={isPending}
                className="w-full bg-[var(--color-bg)] border border-white/10 rounded-lg px-3 py-2.5 font-ui text-sm text-foreground focus:border-[var(--color-accent)] focus:outline-none disabled:opacity-50"
              >
                {BULK_REASON_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            ) : (
              <select
                value={singleReason}
                onChange={(e) => setSingleReason(e.target.value as SuspendReason)}
                disabled={isPending}
                className="w-full bg-[var(--color-bg)] border border-white/10 rounded-lg px-3 py-2.5 font-ui text-sm text-foreground focus:border-[var(--color-accent)] focus:outline-none disabled:opacity-50"
              >
                {SINGLE_REASON_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            )}
          </div>

          {/* Optional note */}
          <div>
            <label className="font-ui font-medium text-xs text-fg-subtle uppercase tracking-wide block mb-1.5">
              บันทึกเพิ่มเติม (ไม่บังคับ)
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              disabled={isPending}
              placeholder="รายละเอียดเพิ่มเติม..."
              rows={2}
              maxLength={500}
              className="w-full bg-[var(--color-bg)] border border-white/10 rounded-lg px-3 py-2.5 font-content text-sm text-foreground placeholder:text-fg-subtle min-h-[60px] resize-none focus:border-[var(--color-accent)] focus:outline-none disabled:opacity-50"
            />
          </div>

          {/* Duration radio */}
          <div>
            <p className="font-ui font-medium text-xs text-fg-subtle uppercase tracking-wide mb-2">
              ระยะเวลา
            </p>
            <div className="flex flex-wrap gap-2">
              {DURATION_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setDuration(opt.value)}
                  disabled={isPending}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-sm font-ui border transition-colors",
                    duration === opt.value
                      ? "border-[var(--color-warning)] bg-[var(--color-warning)]/12 text-[var(--color-warning-text)]"
                      : "border-white/10 text-muted-foreground hover:border-white/30",
                    "disabled:opacity-50 disabled:cursor-not-allowed",
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Suspend-until preview */}
          <div className="rounded-lg border border-white/10 bg-[var(--color-bg)]/60 px-3 py-2.5">
            {suspendUntil !== null ? (
              <p className="font-content text-xs text-muted-foreground">
                user จะถูกปลด suspend อัตโนมัติเมื่อ{" "}
                <span className="font-mono text-foreground">{formatSuspendUntil(suspendUntil)}</span>
              </p>
            ) : (
              <p className="font-content text-xs text-[var(--color-warning-text)]">
                user จะถูก suspend ถาวร — ต้องปลดด้วยมือเท่านั้น
              </p>
            )}
          </div>

          {/* Notify checkbox */}
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={notifyUser}
              onChange={(e) => setNotifyUser(e.target.checked)}
              disabled={isPending}
              style={{ accentColor: "var(--color-accent)" }}
              className="mt-0.5 w-4 h-4 shrink-0 disabled:opacity-50"
            />
            <span className="space-y-0.5">
              <span className="font-ui text-sm text-foreground block">
                แจ้ง user ทาง in-app notification
              </span>
              <span className="font-content text-xs text-fg-subtle block">
                user จะเห็น notification ในแอปทันที
              </span>
            </span>
          </label>

          {/* Mutation error */}
          {mutationError && (
            <p className="text-xs text-[var(--color-error-text)]">
              {mutationError instanceof ApiError
                ? mutationError.message
                : "เกิดข้อผิดพลาด — ลองใหม่"}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            className="border-white/20 text-muted-foreground hover:bg-white/5"
            onClick={handleClose}
            disabled={isPending}
          >
            ยกเลิก
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isPending}
            className={cn(
              "font-ui text-sm",
              isPending
                ? "bg-[var(--color-warning)]/12 text-[var(--color-warning-text)]/50 cursor-not-allowed"
                : "bg-[var(--color-warning)] hover:bg-[var(--color-warning)]/80 text-white",
            )}
          >
            {ctaLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
