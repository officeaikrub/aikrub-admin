/**
 * PageHeader — single-row page header with title + right-side chip/CTA slot.
 *
 * Spec: admin-page-template-mockup-b.md §2
 *
 * Desktop: title left, chips + CTA right on one row.
 * Mobile: stacked — title / chips horizontal scroll / CTA full-width.
 *
 * Slot-based (not data-driven) so every admin page can compose
 * its own chips and CTA without duplicating layout logic.
 */

import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: string;
  /** StatChip components rendered right of title on desktop */
  chips?: ReactNode;
  /** Primary CTA button, rightmost on desktop */
  cta?: ReactNode;
  className?: string;
}

export function PageHeader({ title, chips, cta, className }: PageHeaderProps) {
  return (
    <div className={cn("mb-4", className)}>
      {/* Desktop: single row */}
      <div className="hidden md:flex items-center gap-3 min-h-[40px]">
        <h1 className="font-display text-2xl md:text-3xl text-[var(--color-fg)] shrink-0">
          {title}
        </h1>
        {chips && (
          <div className="flex items-center gap-2 ml-auto">
            {chips}
          </div>
        )}
        {cta && (
          <div className={cn(chips ? "" : "ml-auto")}>
            {cta}
          </div>
        )}
      </div>

      {/* Mobile: stacked layout */}
      <div className="flex flex-col gap-2 md:hidden">
        <h1 className="font-display text-2xl text-[var(--color-fg)]">
          {title}
        </h1>
        {chips && (
          <div className="flex items-center gap-2 overflow-x-auto pb-0.5 -mx-1 px-1">
            {chips}
          </div>
        )}
        {cta && (
          <div className="w-full">
            {cta}
          </div>
        )}
      </div>
    </div>
  );
}
