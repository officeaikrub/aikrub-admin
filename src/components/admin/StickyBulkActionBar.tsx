/**
 * StickyBulkActionBar — fixed pill at bottom-center when ≥1 row is selected.
 *
 * Spec: admin-page-template-mockup-b.md §4
 *
 * Positioning: fixed, centered, z-[20] (design-system-v2 §9 sticky tier).
 *   Desktop (≥768px): bottom-6
 *   Mobile (<768px):  bottom-20 (above bottom nav h-16 + gap)
 *
 * Visual: glass-shell rounded-full per design-system-v2.md §2A.
 *   bg overridden to hsl(var(--background)/0.92) (bulk bar spec, §2A row 3).
 *   shadow: 0 4px 24px rgba(0,0,0,0.35) (bulk bar spec, §2A row 3).
 *
 * Animation:
 *   Enter: translateY(100%) → 0 + opacity, 200ms ease-out.
 *   Exit:  translateY(0) → 100% + opacity, 200ms ease-in (H2 — delayed unmount).
 *   Both respect prefers-reduced-motion (motion-safe: guard).
 *
 * Unmount: delayed by 200ms so the exit animation plays before removal.
 */

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface StickyBulkActionBarProps {
  /** Number of selected rows. Bar hides (with exit animation) when 0. */
  count: number;
  /** Label for the primary destructive action, e.g. "ระงับ" */
  primaryLabel: string;
  onPrimary: () => void;
  primaryDisabled?: boolean;
  primaryDisabledTitle?: string;
  onClear: () => void;
  className?: string;
}

export function StickyBulkActionBar({
  count,
  primaryLabel,
  onPrimary,
  primaryDisabled = false,
  primaryDisabledTitle,
  onClear,
  className,
}: StickyBulkActionBarProps) {
  // `mounted` controls DOM presence; `visible` drives the CSS class.
  // When count drops to 0: set visible=false → exit animation plays → unmount after 200ms.
  const [mounted, setMounted] = useState(count > 0);
  const [visible, setVisible] = useState(count > 0);
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (count > 0) {
      // Clear any pending exit timer and make visible immediately.
      if (exitTimerRef.current !== null) {
        clearTimeout(exitTimerRef.current);
        exitTimerRef.current = null;
      }
      setMounted(true);
      // Defer visible=true one frame so the enter animation triggers after mount.
      requestAnimationFrame(() => setVisible(true));
    } else {
      // Start exit: hide (triggers exit animation), then unmount after animation.
      setVisible(false);
      exitTimerRef.current = setTimeout(() => {
        setMounted(false);
        exitTimerRef.current = null;
      }, 200);
    }

    return () => {
      if (exitTimerRef.current !== null) {
        clearTimeout(exitTimerRef.current);
      }
    };
  }, [count]);

  if (!mounted) return null;

  return (
    <div
      className={cn(
        /* Positioning — z-[20] = sticky tier per design-system-v2 §9 */
        "fixed left-1/2 z-[20]",
        "bottom-20 md:bottom-6",
        "-translate-x-1/2",
        /* Glass pill shell — design-system §2A (bulk bar override) */
        "glass-shell rounded-full",
        /* bg opacity 0.92 overrides glass-shell's 0.80 per §2A bulk bar row */
        "bg-[hsl(var(--background)/0.92)]",
        "border border-white/10",
        /* Shadow per §2A bulk bar row: 0 4px 24px rgba(0,0,0,0.35) */
        "shadow-[0_4px_24px_rgba(0,0,0,0.35)]",
        /* Layout */
        "flex items-center gap-3 py-2 px-4",
        /* Motion — enter vs exit based on `visible` */
        visible
          ? "motion-safe:animate-[slideUpIn_200ms_ease-out_both]"
          : "motion-safe:animate-[slideDownOut_200ms_ease-in_both]",
        className,
      )}
      role="toolbar"
      aria-label={`${count} รายการถูกเลือก`}
    >
      {/* Selection count */}
      <span className="font-ui text-sm text-[var(--color-fg-muted)] whitespace-nowrap">
        {count} รายการ
      </span>

      {/* Separator */}
      <span className="text-[var(--color-fg-subtle)]" aria-hidden="true">·</span>

      {/* Primary destructive action */}
      <Button
        variant="destructive"
        size="sm"
        onClick={onPrimary}
        disabled={primaryDisabled}
        title={primaryDisabled ? primaryDisabledTitle : undefined}
        className="font-ui"
      >
        {primaryLabel}
      </Button>

      {/* Separator */}
      <span className="text-[var(--color-fg-subtle)]" aria-hidden="true">·</span>

      {/* Clear */}
      <button
        onClick={onClear}
        className="font-ui text-sm text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] motion-safe:transition-colors duration-150"
      >
        ล้าง
      </button>
    </div>
  );
}
