/**
 * StatChip — compact page-level KPI label shown in PageHeader right side.
 *
 * Spec: admin-page-template-mockup-b.md §2.1
 * Non-interactive. Dot + value + label stacked internally.
 *
 * Dot colors map to design-system-v2.md §5 status tokens.
 * When value is null the chip is NOT rendered (hidden until backend provides data).
 * Keep chip definitions in parent code — they auto-reappear once backend wires counts.
 */

import { cn } from "@/lib/utils";

export type StatChipDot =
  | "neutral"
  | "success"
  | "warning"
  | "error"
  | "accent"
  | "info";

interface StatChipProps {
  label: string;
  value: number | null;
  dot: StatChipDot;
  className?: string;
}

const DOT_CLASS: Record<StatChipDot, string> = {
  neutral: "bg-[var(--color-fg-muted)]",
  success: "bg-[var(--color-success)]",
  warning: "bg-[var(--color-warning)]",
  error:   "bg-[var(--color-error)]",
  accent:  "bg-[var(--color-accent)]",
  info:    "bg-[var(--color-info)]",
};

export function StatChip({ label, value, dot, className }: StatChipProps) {
  // Hide chip entirely when value is null — a "—" chip is worse than no chip.
  // Chip definition stays in parent; it re-appears automatically once backend provides counts.
  if (value === null) return null;

  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 px-3 py-2 rounded-lg",
        "bg-[var(--color-bg-muted)] border border-white/[0.08]",
        className,
      )}
      aria-label={`${value.toLocaleString()} ${label}`}
    >
      {/* Dot — vertically centered to value line */}
      <span
        className={cn("w-2 h-2 rounded-full shrink-0 mt-0.5", DOT_CLASS[dot])}
        aria-hidden="true"
      />

      {/* Value + label stacked */}
      <div className="flex flex-col leading-tight">
        <span className="font-display tabular-nums text-xl md:text-2xl text-[var(--color-fg)]">
          {value.toLocaleString()}
        </span>
        <span className="font-ui font-medium text-[10px] uppercase tracking-wider text-[var(--color-fg-muted)]">
          {label}
        </span>
      </div>
    </div>
  );
}
