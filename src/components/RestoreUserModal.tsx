/**
 * RestoreUserModal — กู้คืนบัญชีจาก soft_deleted (owner only)
 *
 * Section F of admin-user-mgmt-wireframes.md
 * - Visible only when target.deleted_at is within 30 days
 * - Single confirm (no 2-step — lower risk than delete)
 * - Warns that anonymized email is NOT automatically restored
 *
 * Endpoint: POST /api/admin/users/:id/restore
 */

import { useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { adminRestoreUser, type AdminUserRow } from "@/lib/api-admin";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RestoreUserModalProps {
  open: boolean;
  user: AdminUserRow;
  daysRemaining: number;
  onClose: () => void;
  onSuccess: (updatedUser: AdminUserRow) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RestoreUserModal({
  open,
  user,
  daysRemaining,
  onClose,
  onSuccess,
}: RestoreUserModalProps) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => adminRestoreUser(user.id),
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "user", user.id] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      onSuccess(data.user);
      handleClose();
    },
  });

  function handleClose() {
    if (!mutation.isPending) {
      onClose();
    }
  }

  useEffect(() => {
    // Reset on open (no fields to clear — single confirm modal)
  }, [open]);

  const anonEmail = user.email ?? `deleted-${user.id.slice(0, 8)}@aikrub.local`;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="bg-card border-white/8 max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-ui text-foreground">
            ↩ กู้คืนบัญชี
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <p className="font-content text-sm text-foreground">
            คุณต้องการกู้คืนบัญชีของ{" "}
            <span className="font-mono text-muted-foreground text-xs">{anonEmail}</span>
            {" "}กลับมาสู่สถานะ active?
          </p>

          {/* Days remaining */}
          <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-900/20 border border-blue-500/30 text-blue-300 text-sm font-content">
            <span className="shrink-0">ℹ</span>
            <span>เหลือเวลา <strong>{daysRemaining} วัน</strong> ก่อน grace period หมด</span>
          </div>

          {/* Warning about email */}
          <div className="space-y-1 text-xs text-muted-foreground font-content">
            <p className="font-ui text-muted-foreground text-xs font-medium">⚠ หมายเหตุ:</p>
            <ul className="space-y-1 pl-2">
              <li>
                • email ที่ anonymize แล้วจะยังคงเป็น{" "}
                <span className="font-mono text-fg-subtle">{anonEmail}</span>
              </li>
              <li>• Pete ต้องแก้ email จริงให้ผู้ใช้ผ่าน Supabase Auth admin update</li>
            </ul>
          </div>

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
            className="border-white/20 text-muted-foreground hover:bg-white/5"
            onClick={handleClose}
            disabled={mutation.isPending}
          >
            ยกเลิก
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className={
              mutation.isPending
                ? "bg-green-900/30 text-green-300/50 cursor-not-allowed font-ui text-sm"
                : "bg-green-700 hover:bg-green-600 text-white font-ui text-sm"
            }
          >
            {mutation.isPending ? "กำลังกู้คืน..." : "กู้คืน ↩"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

