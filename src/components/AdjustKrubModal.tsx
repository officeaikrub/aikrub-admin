/**
 * AdjustKrubModal — ปรับยอด krub ของผู้ใช้ (admin + owner)
 *
 * Section C of admin-user-mgmt-wireframes.md
 * - +/- radio toggle
 * - Amount input (integer > 0; ลด cannot exceed balance)
 * - Reactive new-balance preview (green for เพิ่ม, red for ลด)
 * - Required note field (min 10 chars client-side; server enforces ≥5)
 * - Unsaved-change guard on backdrop/Esc/X
 *
 * Endpoint: POST /api/admin/users/:id/credits/adjust
 * Body: { delta: number (positive = add, negative = deduct), note: string }
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
import { adminAdjustKrub, type AdminUserRow } from "@/lib/api-admin";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AdjustKrubModalProps {
  open: boolean;
  user: AdminUserRow;
  balance: number;
  onClose: () => void;
  onSuccess: (newBalance: number) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AdjustKrubModal({
  open,
  user,
  balance,
  onClose,
  onSuccess,
}: AdjustKrubModalProps) {
  const queryClient = useQueryClient();

  const [direction, setDirection] = useState<"add" | "deduct">("add");
  const [amountStr, setAmountStr] = useState("");
  const [note, setNote] = useState("");
  const [isDirty, setIsDirty] = useState(false);

  const amount = parseInt(amountStr, 10);
  const validAmount = !isNaN(amount) && amount > 0;
  const validNote = note.trim().length >= 10;

  const newBalance =
    validAmount
      ? direction === "add"
        ? balance + amount
        : balance - amount
      : null;

  const balanceError =
    direction === "deduct" && validAmount && amount > balance
      ? `ยอดไม่พอ (ปัจจุบัน ${balance} krub)`
      : null;

  const noteError =
    note.trim().length > 0 && note.trim().length < 10
      ? "กรุณาระบุเหตุผล (อย่างน้อย 10 ตัวอักษร)"
      : null;

  const canSubmit = validAmount && validNote && !balanceError;

  const mutation = useMutation({
    mutationFn: () => {
      const delta = direction === "add" ? amount : -amount;
      return adminAdjustKrub(user.id, delta, note.trim());
    },
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "user", user.id] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      onSuccess(data.new_balance);
      handleClose();
    },
  });

  function handleClose() {
    if (isDirty && !mutation.isPending) {
      if (!window.confirm("มีการเปลี่ยนแปลงที่ยังไม่ได้บันทึก — ปิดหน้าต่างนี้?")) return;
    }
    setDirection("add");
    setAmountStr("");
    setNote("");
    setIsDirty(false);
    onClose();
  }

  // Track dirty state
  useEffect(() => {
    if (amountStr || note) setIsDirty(true);
  }, [amountStr, note]);

  // Reset when opened
  useEffect(() => {
    if (open) {
      setDirection("add");
      setAmountStr("");
      setNote("");
      setIsDirty(false);
    }
  }, [open]);

  const displayName = user.display_name ?? user.email ?? user.id.slice(0, 8);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="border-white/8 max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-ui text-foreground">
            ปรับยอด krub — {displayName}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Current balance */}
          <div>
            <p className="font-ui font-medium text-xs text-fg-subtle uppercase tracking-wide mb-1.5">
              ยอดปัจจุบัน
            </p>
            <div className="font-display text-2xl text-foreground bg-[var(--color-bg)] rounded-lg px-4 py-3 cursor-not-allowed select-none">
              {balance} krub
            </div>
          </div>

          {/* Direction radio */}
          <div>
            <p className="font-ui font-medium text-xs text-fg-subtle uppercase tracking-wide mb-2">
              ประเภท
            </p>
            <div className="flex gap-4">
              {(["add", "deduct"] as const).map((d) => (
                <label key={d} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="direction"
                    value={d}
                    checked={direction === d}
                    onChange={() => { setDirection(d); setIsDirty(true); }}
                    className="accent-accent"
                  />
                  <span className="font-ui text-sm text-foreground">
                    {d === "add" ? "เพิ่ม krub" : "ลด krub"}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Amount input */}
          <div>
            <p className="font-ui font-medium text-xs text-fg-subtle uppercase tracking-wide mb-1.5">
              จำนวน (krub) *
            </p>
            <input
              type="number"
              min={1}
              value={amountStr}
              onChange={(e) => { setAmountStr(e.target.value); setIsDirty(true); }}
              placeholder="0"
              className={cn(
                "w-full bg-[var(--color-bg)] border rounded-lg px-3 py-2.5 font-mono text-lg text-foreground tabular-nums focus:outline-none transition-colors",
                balanceError ? "border-[var(--color-error)]/50" : "border-white/10 focus:border-[var(--color-accent)]",
              )}
            />
            {balanceError && (
              <p className="text-xs text-[var(--color-error-text)] mt-1">{balanceError}</p>
            )}
          </div>

          {/* New balance preview */}
          {newBalance !== null && !balanceError && (
            <div>
              <p className="font-ui font-medium text-xs text-fg-subtle uppercase tracking-wide mb-1.5">
                ยอดใหม่จะเป็น
              </p>
              <div
                className={cn(
                  "font-display text-xl bg-[var(--color-bg)] rounded-lg px-4 py-2.5",
                  direction === "add" ? "text-[var(--color-success-text)]" : "text-[var(--color-error-text)]",
                )}
              >
                {newBalance} krub
              </div>
              <p
                className={cn(
                  "font-ui text-sm mt-2",
                  direction === "add" ? "text-[var(--color-success-text)]" : "text-[var(--color-error-text)]",
                )}
              >
                ปรับ {direction === "add" ? "+" : "-"}{amount} krub สำหรับ {displayName} —
                ยอดจาก {balance} → {newBalance} krub
              </p>
            </div>
          )}

          {/* Note / reason */}
          <div>
            <p className="font-ui font-medium text-xs text-fg-subtle uppercase tracking-wide mb-1.5">
              เหตุผล *
            </p>
            <textarea
              value={note}
              onChange={(e) => { setNote(e.target.value); setIsDirty(true); }}
              placeholder="ระบุเหตุผลการปรับ krub..."
              rows={3}
              className={cn(
                "w-full bg-[var(--color-bg)] border rounded-lg px-3 py-2.5 font-content text-sm text-foreground min-h-[80px] resize-none focus:outline-none transition-colors",
                noteError ? "border-[var(--color-error)]/50" : "border-white/10 focus:border-[var(--color-accent)]",
              )}
            />
            {noteError && (
              <p className="text-xs text-[var(--color-error-text)] mt-1">{noteError}</p>
            )}
            <p className="text-xs text-[var(--color-warning-text)] mt-1 flex items-center gap-1">
              ⚠ ผู้ใช้จะเห็น note นี้ใน credit history
            </p>
          </div>

          {/* Mutation error */}
          {mutation.isError && (
            <p className="text-xs text-[var(--color-error-text)]">
              {mutation.error instanceof Error ? mutation.error.message : "เกิดข้อผิดพลาด — ลองใหม่"}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            className="border-white/20 text-muted-foreground hover:bg-white/5"
            onClick={handleClose}
            disabled={mutation.isPending}
          >
            ยกเลิก
          </Button>
          <Button
            variant="cta"
            onClick={() => mutation.mutate()}
            disabled={!canSubmit || mutation.isPending}
            className="bg-accent hover:bg-accent/80 text-white font-ui"
          >
            {mutation.isPending ? "กำลังบันทึก..." : "ยืนยัน →"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
