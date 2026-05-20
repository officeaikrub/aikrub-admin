/**
 * StatChip — compact page-level KPI label shown in PageHeader right side.
 *
 * Spec: admin-page-template-mockup-b.md §2.1
 * Non-interactive. Dot + value + label stacked internally.
 *
 * Dot colors map to design-system-v2.md §5 status tokens.
 * When value is null, renders "—" (backend aggregate not yet available).
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

/**
 * Formats a number with locale separator (e.g. 1234 → "1,234").
 * Returns "—" when value is null.
 */
function formatValue(value: number | null): string {
  if (value === null) return "—";
  return value.toLocaleString();
}

export function StatChip({ label, value, dot, className }: StatChipProps) {
  const displayValue = formatValue(value);

  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 px-3 py-2 rounded-lg",
        "bg-[var(--color-bg-muted)] border border-white/[0.08]",
        className,
      )}
      aria-label={`${displayValue} ${label}`}
    >
      {/* Dot — vertically centered to value line */}
      <span
        className={cn("w-2 h-2 rounded-full shrink-0 mt-0.5", DOT_CLASS[dot])}
        aria-hidden="true"
      />

      {/* Value + label stacked */}
      <div className="flex flex-col leading-tight">
        <span className="font-display tabular-nums text-xl text-[var(--color-fg)]">
          {displayValue}
        </span>
        <span className="font-ui text-[10px] uppercase tracking-wide text-[var(--color-fg-muted)]">
          {label}
        </span>
      </div>
    </div>
  );
}
