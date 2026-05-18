/**
 * SuspendUserModal — ระงับบัญชีผู้ใช้ (admin + owner)
 *
 * Section D of admin-user-mgmt-wireframes.md
 *
 * NOTE: Server endpoint only accepts { reason, note }.
 * Duration + notify fields from the wireframe are NOT implemented server-side
 * yet (planned for Wave 4.4.1). This modal ships reason + note only.
 * The duration/notify UI is intentionally omitted to avoid dead UI.
 *
 * Endpoint: POST /api/admin/users/:id/suspend
 * Body: { reason: SuspendReason, note?: string }
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
import { adminSuspendUser, type AdminUserRow, type SuspendReason } from "@/lib/api-admin";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SuspendUserModalProps {
  open: boolean;
  user: AdminUserRow;
  onClose: () => void;
  onSuccess: (updatedUser: AdminUserRow) => void;
}

// ---------------------------------------------------------------------------
// Reason options
// ---------------------------------------------------------------------------

const REASON_OPTIONS: { value: SuspendReason; label: string }[] = [
  { value: "fraud",        label: "fraud"              },
  { value: "abuse",        label: "abuse"              },
  { value: "non_payment",  label: "non_payment"        },
  { value: "user_request", label: "user_request"       },
  { value: "other",        label: "other"              },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SuspendUserModal({
  open,
  user,
  onClose,
  onSuccess,
}: SuspendUserModalProps) {
  const queryClient = useQueryClient();

  const [reason, setReason] = useState<SuspendReason>("fraud");
  const [note, setNote] = useState("");
  const [isDirty, setIsDirty] = useState(false);

  const mutation = useMutation({
    mutationFn: () => adminSuspendUser(user.id, reason, note.trim() || undefined),
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "user", user.id] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      onSuccess(data.user);
      handleClose();
    },
  });

  function handleClose() {
    if (isDirty && !mutation.isPending) {
      if (!window.confirm("มีการเปลี่ยนแปลงที่ยังไม่ได้บันทึก — ปิดหน้าต่างนี้?")) return;
    }
    setReason("fraud");
    setNote("");
    setIsDirty(false);
    onClose();
  }

  useEffect(() => {
    if (open) {
      setReason("fraud");
      setNote("");
      setIsDirty(false);
    }
  }, [open]);

  const displayName = user.display_name ?? user.email ?? user.id.slice(0, 8);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="bg-[#1E293B] border-white/8 max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-ui text-[#F1F5F9]">
            ⊘ ระงับบัญชี — {displayName}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* JWT warning */}
          <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-900/20 border border-amber-500/30 text-amber-300 text-sm font-content">
            <span className="shrink-0">⚠</span>
            <span>
              ผู้ใช้จะยังเข้าระบบได้จนกว่า JWT หมดอายุ (~1 ชม) แต่ไม่สามารถใช้ฟีเจอร์ใหม่ได้ทันที
            </span>
          </div>

          {/* Reason dropdown */}
          <div>
            <label className="font-ui text-xs text-[#475569] uppercase tracking-wide block mb-1.5">
              เหตุผล *
            </label>
            <select
              value={reason}
              onChange={(e) => { setReason(e.target.value as SuspendReason); setIsDirty(true); }}
              className="w-full bg-[#0F172A] border border-white/10 rounded-lg px-3 py-2.5 font-ui text-sm text-[#F1F5F9] focus:border-[#F25F2D] focus:outline-none"
            >
              {REASON_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* Optional note */}
          <div>
            <label className="font-ui text-xs text-[#475569] uppercase tracking-wide block mb-1.5">
              บันทึกเพิ่มเติม (ไม่บังคับ)
            </label>
            <textarea
              value={note}
              onChange={(e) => { setNote(e.target.value); setIsDirty(true); }}
              placeholder="รายละเอียดเพิ่มเติม..."
              rows={2}
              maxLength={500}
              className="w-full bg-[#0F172A] border border-white/10 rounded-lg px-3 py-2.5 font-content text-sm text-[#F1F5F9] min-h-[60px] resize-none focus:border-[#F25F2D] focus:outline-none"
            />
          </div>

          {/* Duration / notify — deferred to Wave 4.4.1 */}
          <p className="text-xs text-[#475569] italic">
            ระยะเวลาระงับและการแจ้งเตือนจะพร้อมใน Wave 4.4.1
          </p>

          {/* Mutation error */}
          {mutation.isError && (
            <p className="text-xs text-red-400">
              {mutation.error instanceof Error ? mutation.error.message : "เกิดข้อผิดพลาด — ลองใหม่"}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            className="border-white/20 text-[#94A3B8] hover:bg-white/5"
            onClick={handleClose}
            disabled={mutation.isPending}
          >
            ยกเลิก
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className={cn(
              "font-ui text-sm",
              mutation.isPending
                ? "bg-amber-900/30 text-amber-300/50 cursor-not-allowed"
                : "bg-amber-600 hover:bg-amber-700 text-white",
            )}
          >
            {mutation.isPending ? "กำลังระงับ..." : "ระงับ ⊘"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
