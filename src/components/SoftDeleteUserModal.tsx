/**
 * SoftDeleteUserModal — ลบบัญชี soft (owner only, 2-step confirm)
 *
 * Section E of admin-user-mgmt-wireframes.md
 * Step 1: Warning checklist + checkbox confirm
 * Step 2: Type "DELETE" to confirm
 *
 * Endpoint: POST /api/admin/users/:id/soft-delete
 * Body sent by API wrapper: { confirm_text: "DELETE" }
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
import { adminSoftDeleteUser, type AdminUserRow } from "@/lib/api-admin";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SoftDeleteUserModalProps {
  open: boolean;
  user: AdminUserRow;
  onClose: () => void;
  onSuccess: (updatedUser: AdminUserRow) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SoftDeleteUserModal({
  open,
  user,
  onClose,
  onSuccess,
}: SoftDeleteUserModalProps) {
  const queryClient = useQueryClient();

  const [step, setStep] = useState<1 | 2>(1);
  const [checked, setChecked] = useState(false);
  const [confirmInput, setConfirmInput] = useState("");

  const isDeleteConfirmed = confirmInput === "DELETE";

  const mutation = useMutation({
    mutationFn: () => adminSoftDeleteUser(user.id),
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "user", user.id] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      onSuccess(data.user);
      handleClose();
    },
  });

  function handleClose() {
    if (!mutation.isPending) {
      setStep(1);
      setChecked(false);
      setConfirmInput("");
      onClose();
    }
  }

  useEffect(() => {
    if (open) {
      setStep(1);
      setChecked(false);
      setConfirmInput("");
    }
  }, [open]);

  const displayEmail = user.email ?? `${user.id}`;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="bg-card border-white/8 max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-ui text-foreground">
            {step === 1 ? "🗑 ลบบัญชี (Soft Delete)" : "ยืนยันการลบบัญชี — ขั้นตอนสุดท้าย"}
          </DialogTitle>
        </DialogHeader>

        {step === 1 && (
          <>
            <div className="space-y-4 py-2">
              {/* Warning box */}
              <div className="p-3 rounded-lg bg-red-900/20 border border-red-500/30 text-red-300 text-sm font-content space-y-1">
                <p className="font-ui text-sm font-medium text-red-300">⚠ คำเตือน — อ่านก่อนยืนยัน</p>
                <p className="text-xs mt-1 font-content text-red-200/80">เมื่อลบบัญชี:</p>
                <ul className="text-xs space-y-1 text-red-200/80 pl-2">
                  <li>• email จะถูก anonymize เป็น deleted-{"{"}{"{"}uuid{"}"}{"}"}{"@"}aikrub.local ทันที</li>
                  <li>• display_name จะถูกลบ</li>
                  <li>• ภาพที่สร้างจะซ่อนจาก public</li>
                  <li>• บัญชีถูกลบถาวรหลัง 30 วัน โดย pg_cron</li>
                </ul>
              </div>

              {/* Checkbox confirm */}
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => setChecked(e.target.checked)}
                  className="mt-0.5 accent-[#F25F2D]"
                />
                <span className="font-content text-sm text-foreground">
                  ฉันยืนยันว่าต้องการลบบัญชีของ{" "}
                  <span className="font-mono text-muted-foreground">{displayEmail}</span>
                </span>
              </label>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                className="border-white/20 text-muted-foreground hover:bg-white/5"
                onClick={handleClose}
              >
                ยกเลิก
              </Button>
              <Button
                onClick={() => setStep(2)}
                disabled={!checked}
                className={cn(
                  "font-ui text-sm",
                  !checked
                    ? "opacity-40 cursor-not-allowed bg-red-900/30 text-red-400"
                    : "bg-red-600 hover:bg-red-700 text-white",
                )}
              >
                ถัดไป →
              </Button>
            </DialogFooter>
          </>
        )}

        {step === 2 && (
          <>
            <div className="space-y-4 py-2">
              <p className="font-ui text-sm text-foreground">
                พิมพ์{" "}
                <span className="font-mono font-bold text-red-400">DELETE</span>
                {" "}เพื่อยืนยัน
              </p>

              <input
                type="text"
                value={confirmInput}
                onChange={(e) => setConfirmInput(e.target.value)}
                placeholder="พิมพ์ DELETE"
                autoFocus
                className={cn(
                  "w-full bg-[#0F172A] border rounded-lg px-3 py-2.5 font-mono text-sm text-foreground focus:outline-none transition-colors",
                  isDeleteConfirmed
                    ? "border-green-500/50 bg-green-900/10"
                    : "border-white/10 focus:border-[#F25F2D]",
                )}
              />

              {mutation.isError && (
                <p className="text-xs text-red-400">
                  {mutation.error instanceof Error ? mutation.error.message : "เกิดข้อผิดพลาด — ลองใหม่"}
                </p>
              )}
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                className="border-white/20 text-muted-foreground hover:bg-white/5"
                onClick={() => setStep(1)}
                disabled={mutation.isPending}
              >
                ← ย้อนกลับ
              </Button>
              <Button
                onClick={() => mutation.mutate()}
                disabled={!isDeleteConfirmed || mutation.isPending}
                className={cn(
                  "font-ui text-sm",
                  !isDeleteConfirmed || mutation.isPending
                    ? "bg-red-900/30 text-red-400/50 cursor-not-allowed"
                    : "bg-red-600 hover:bg-red-700 text-white",
                )}
              >
                {mutation.isPending ? "กำลังลบ..." : "ลบบัญชี 🗑"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
