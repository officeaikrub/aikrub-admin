/**
 * UserDetailModal — premium glass modal shell for user detail (C2).
 *
 * Layout (Group B reading-pattern revision):
 *   sticky header (shrink-0) — user NAME (bold font-display) + close X
 *   PII pill (shrink-0)      — thin single-line ~30px: ShieldAlert + notice text
 *   hero card (shrink-0)     — FIXED compact band: avatar | name/email + balance(right)
 *                               row 2: role + status badges
 *                              [status banners if suspended/soft_deleted]
 *   scrollable body (flex-1 overflow-y-auto)
 *     → actions (above fold — before tabs)
 *     → tabs (ประวัติการสร้าง / PII log / ประวัติ krub / ประวัติคูปอง)
 *     → ข้อมูลบัญชี (UUID + สมัคร + conditional 3rd)
 *     → audit trail
 *
 * Positioning (H2): centered modal at ALL screen sizes — no bottom sheet on mobile.
 * Width: calc(100% - 2rem) for mobile-safe clearance; max-w-[640px] on desktop.
 *
 * Shell spec (§6/§7):
 * - border-radius: rounded-2xl (16px) — M1
 * - border: 1px solid rgba(255,255,255,0.10) — M2
 * - glass-modal: blur(12px) + surface-1 at 95%
 * - max-h-[85dvh] + overflow-hidden for corner clip
 *
 * Animations: motion-safe guarded slide + fade — H3.
 * Accessibility: DialogPrimitive.Title asChild → visible h2 (user name or sr-only fallback
 *   while loading). sr-only Description silences Radix a11y warning — C1.
 */

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X, ShieldAlert } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { adminGetUser } from "@/lib/api-admin";
import {
  UserDetailHero,
  UserDetailBody,
  UserDetailLoadingSkeleton,
} from "@/components/UserDetailContent";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface UserDetailModalProps {
  open: boolean;
  userId: string;
  onClose: () => void;
}

export function UserDetailModal({ open, userId, onClose }: UserDetailModalProps) {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["admin", "user", userId],
    queryFn: () => adminGetUser(userId),
    enabled: open && !!userId,
  });

  // Derive visible header label from data once loaded
  const headerName = data?.user.display_name ?? data?.user.email ?? "รายละเอียดผู้ใช้";

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogPrimitive.Portal>
        {/* Scrim */}
        <DialogPrimitive.Overlay
          className={cn(
            "fixed inset-0 z-[50] bg-black/50 backdrop-blur-sm",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
          )}
        />

        {/* Modal shell — centered at all breakpoints (H2) */}
        <DialogPrimitive.Content
          className={cn(
            "fixed z-[50] flex flex-col overflow-hidden",
            "left-1/2 top-[7.5vh] -translate-x-1/2",
            "w-[calc(100%-2rem)] max-w-[640px] max-h-[85dvh]",
            // Shell: glass-modal + M1 rounded-2xl + M2 border-white/[0.10]
            "rounded-2xl border border-white/[0.10]",
            "glass-modal bg-[var(--color-bg-muted)]",
            // Enter / exit animation — H3: motion-safe guard on slide classes
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            "motion-safe:data-[state=open]:slide-in-from-bottom-2 motion-safe:data-[state=closed]:slide-out-to-bottom-1",
          )}
        >
          {/* C1: Description sr-only — silences Radix a11y warning.
              Title is wired to the visible h2 below via asChild so screen readers
              announce the actual user name (or a fallback sr-only label while loading). */}
          <DialogPrimitive.Description className="sr-only">
            รายละเอียดข้อมูลผู้ใช้และการดำเนินการของแอดมิน
          </DialogPrimitive.Description>

          {/* Sticky header — Title is the visible h2 (asChild) so AT announces real user name */}
          <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-white/[0.08] bg-[var(--color-bg-muted)]">
            <DialogPrimitive.Title asChild>
              <h2 className="font-display text-base text-[var(--color-fg)] truncate max-w-[calc(100%-3rem)]">
                {data ? (
                  headerName
                ) : (
                  <>
                    <span className="sr-only">รายละเอียดผู้ใช้</span>
                    <span
                      aria-hidden="true"
                      className="inline-block h-5 w-40 bg-white/[0.06] rounded motion-safe:animate-pulse align-middle"
                    />
                  </>
                )}
              </h2>
            </DialogPrimitive.Title>
            <DialogPrimitive.Close asChild>
              <button
                className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] hover:bg-white/[0.08] motion-safe:transition-colors duration-150 shrink-0"
                aria-label="ปิด"
              >
                <X className="w-4 h-4" />
              </button>
            </DialogPrimitive.Close>
          </div>

          {/* PII pill — thin single-line ~30px: info-text on both icon + text (contrast-safe) */}
          <div className="shrink-0 mx-6 mt-3 flex items-center gap-1.5 px-3 py-1 rounded-full bg-[var(--color-info)]/12 border border-[var(--color-info)]/20">
            <ShieldAlert className="w-3.5 h-3.5 shrink-0 text-[var(--color-info-text)]" aria-hidden="true" />
            <span className="font-ui text-xs text-[var(--color-info-text)] leading-none whitespace-nowrap">
              การเข้าถึงข้อมูลนี้ถูกบันทึกแล้ว · อ่านข้อมูล PDPA
            </span>
          </div>

          {/* Hero card — shrink-0, FIXED (H1: outside the scroller) */}
          {data && (
            <div className="shrink-0 px-6 pt-3 pb-0">
              <UserDetailHero user={data.user} balance={data.credits.balance} />
            </div>
          )}

          {/* Skeleton hero placeholder while loading */}
          {isLoading && (
            <div className="shrink-0 px-6 pt-3 pb-0">
              <div className="bg-[var(--color-bg)] rounded-xl border border-white/[0.08] p-4 motion-safe:animate-pulse">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-white/[0.05] shrink-0" />
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="h-4 w-32 bg-white/[0.05] rounded" />
                    <div className="h-3 w-48 bg-white/[0.05] rounded" />
                    <div className="h-3 w-20 bg-white/[0.05] rounded" />
                  </div>
                  <div className="shrink-0 text-right space-y-1">
                    <div className="h-3 w-16 bg-white/[0.05] rounded" />
                    <div className="h-6 w-20 bg-white/[0.05] rounded" />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Scrollable body — flex-1 overflow-y-auto (H1: everything else scrolls) */}
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
            {isLoading && <UserDetailLoadingSkeleton />}

            {isError && (
              <div className="flex items-center justify-between p-4 rounded-lg bg-[var(--color-error)]/12 border border-[var(--color-error)]/30 text-[var(--color-error-text)] text-sm font-ui">
                <span>โหลดข้อมูลผู้ใช้ไม่สำเร็จ</span>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-[var(--color-error)]/30 text-[var(--color-error-text)] hover:bg-[var(--color-error)]/12"
                  onClick={() => void refetch()}
                >
                  ลองใหม่
                </Button>
              </div>
            )}

            {data && (
              <UserDetailBody data={data} userId={userId} />
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
