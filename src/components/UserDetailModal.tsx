/**
 * UserDetailModal — premium glass modal shell for user detail (C2).
 *
 * Layout (spec §6: header + hero card remain fixed, scrollable body below):
 *   sticky header (shrink-0) — eyebrow label + close X
 *   hero card (shrink-0, FIXED — not inside the scroller)
 *   scrollable body (flex-1 overflow-y-auto) — PII banner / actions / tabs / audit
 *
 * The query lives here (single subscription). Data is passed down to
 * UserDetailHero (rendered above scroller) and UserDetailBody (inside scroller).
 * This avoids double-fetch and gives one loading/error source of truth.
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
 * Accessibility: Title + sr-only Description — C1.
 */

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
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

        {/* Modal shell — centered at all screen sizes (H2), no full-screen mobile */}
        <DialogPrimitive.Content
          className={cn(
            // Centered at all breakpoints — mobile-safe width
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
          {/* C1: Accessibility title (sr-only) + Description (sr-only) */}
          <DialogPrimitive.Title className="sr-only">
            รายละเอียดผู้ใช้
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            รายละเอียดข้อมูลผู้ใช้และการดำเนินการของแอดมิน
          </DialogPrimitive.Description>

          {/* Sticky header — shrink-0, always fixed */}
          <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-white/[0.08] bg-[var(--color-bg-muted)]">
            <p className="font-ui font-medium text-[10px] text-[var(--color-fg-subtle)] uppercase tracking-widest">
              รายละเอียดผู้ใช้
            </p>
            <DialogPrimitive.Close asChild>
              <button
                className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] hover:bg-white/[0.08] motion-safe:transition-colors duration-150"
                aria-label="ปิด"
              >
                <X className="w-4 h-4" />
              </button>
            </DialogPrimitive.Close>
          </div>

          {/* Hero card — shrink-0, FIXED (H1: outside the scroller) */}
          {data && (
            <div className="shrink-0 px-6 pt-5 pb-0">
              <UserDetailHero user={data.user} balance={data.credits.balance} />
            </div>
          )}

          {/* Skeleton hero placeholder while loading */}
          {isLoading && (
            <div className="shrink-0 px-6 pt-5 pb-0">
              <div className="bg-[var(--color-bg)] rounded-xl border border-white/[0.08] p-5 motion-safe:animate-pulse">
                <div className="flex gap-4">
                  <div className="w-16 h-16 rounded-full bg-white/[0.05]" />
                  <div className="space-y-2 flex-1">
                    <div className="h-5 w-36 bg-white/[0.05] rounded" />
                    <div className="h-4 w-52 bg-white/[0.05] rounded" />
                  </div>
                </div>
                <div className="mt-4 h-7 w-32 bg-white/[0.05] rounded" />
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
