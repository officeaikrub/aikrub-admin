/**
 * ClawbackRowModal — ยืนยันการดึงคืน Krub รายแถว
 *
 * Triggered by "↩ ดึงคืน" button on each redemption row in coupon detail.
 * On confirm: calls POST /api/admin/coupons/:id/clawback-row
 * On success: calls onSuccess(clawedBackAt) so parent can do optimistic update
 */

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { adminClawbackRow, type ClawbackReason } from "@/lib/api-admin";
import { ApiError } from "@/lib/api-admin";
import { cn } from "@/lib/utils";

interface ClawbackRowModalProps {
  open: boolean;
  couponId: string;
  redemptionId: string;
  userEmail: string;
  krubAmount: number;
  onClose: () => void;
  /** Called with the clawback timestamp on success — parent should update row state */
  onSuccess: (clawedBackAt: string) => void;
}

const REASON_OPTIONS: { value: ClawbackReason; label: string }[] = [
  { value: "fraud",     label: "Fraud" },
  { value: "duplicate", label: "Duplicate" },
  { value: "error",     label: "Error" },
  { value: "other",     label: "อื่นๆ" },
];

export function ClawbackRowModal({
  open,
  couponId,
  redemptionId,
  userEmail,
  krubAmount,
  onClose,
  onSuccess,
}: ClawbackRowModalProps) {
  const [reasonCategory, setReasonCategory] = useState<ClawbackReason>("fraud");
  const [note, setNote] = useState("");

  const mutation = useMutation({
    mutationFn: () =>
      adminClawbackRow(couponId, {
        redemption_id: redemptionId,
        reason_category: reasonCategory,
        note: note.trim() || undefined,
      }),
    onSuccess: (data) => {
      onSuccess(data.transaction.created_at);
      onClose();
    },
  });

  function handleClose() {
    if (mutation.isPending) return;
    setReasonCategory("fraud");
    setNote("");
    mutation.reset();
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="bg-[#1E293B] border-white/8 max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-display text-base text-[#F1F5F9]">
            ↩ ดึงคืน Krub
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Question */}
          <p className="font-content text-sm text-[#F1F5F9]">
            ดึงคืน{" "}
            <span className="font-mono text-amber-300">{krubAmount} Krub</span>{" "}
            จาก{" "}
            <span className="font-mono text-[#94A3B8]">{userEmail}</span>?
          </p>

          {/* Warning banner */}
          <div className="bg-amber-900/20 border border-amber-500/30 rounded-lg px-3 py-3 space-y-1.5">
            <p className="font-ui text-xs text-amber-300 font-semibold">⚠ การกระทำนี้จะ:</p>
            <ul className="space-y-0.5 ml-2">
              <li className="font-content text-xs text-amber-200">
                • หัก {krubAmount} Krub จาก user ทันที
              </li>
              <li className="font-content text-xs text-amber-200">
                • ส่ง notification แจ้ง user ทันที
              </li>
              <li className="font-content text-xs text-amber-200">
                • บันทึกใน audit log
              </li>
            </ul>
          </div>

          {/* Reason dropdown */}
          <div className="space-y-1.5">
            <label className="font-ui text-xs text-[#94A3B8] uppercase tracking-wide">
              เหตุผล *
            </label>
            <select
              value={reasonCategory}
              onChange={(e) => setReasonCategory(e.target.value as ClawbackReason)}
              disabled={mutation.isPending}
              className={cn(
                "w-full bg-[#0F172A] border border-white/10 rounded-lg px-3 py-2",
                "font-ui text-sm text-[#F1F5F9]",
                "focus:outline-none focus:border-[#F25F2D]/60",
                "disabled:opacity-50",
              )}
            >
              {REASON_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Note textarea */}
          <div className="space-y-1.5">
            <label className="font-ui text-xs text-[#94A3B8] uppercase tracking-wide">
              บันทึก (ไม่บังคับ)
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              disabled={mutation.isPending}
              placeholder="รายละเอียดเพิ่มเติม..."
              rows={2}
              className={cn(
                "w-full bg-[#0F172A] border border-white/10 rounded-lg px-3 py-2",
                "font-content text-sm text-[#F1F5F9] placeholder:text-[#475569]",
                "focus:outline-none focus:border-[#F25F2D]/60 resize-none",
                "disabled:opacity-50",
              )}
            />
          </div>

          {/* Mutation error */}
          {mutation.isError && (
            <p className="font-content text-xs text-red-400">
              {mutation.error instanceof ApiError
                ? mutation.error.message
                : "เกิดข้อผิดพลาด — ลองใหม่"}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleClose}
            disabled={mutation.isPending}
            className="border-white/20 text-[#94A3B8] hover:bg-white/5"
          >
            ยกเลิก
          </Button>
          <Button
            size="sm"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className="bg-red-600 hover:bg-red-700 text-white font-ui"
          >
            {mutation.isPending ? "กำลังดึงคืน..." : "ดึงคืน ↩"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
