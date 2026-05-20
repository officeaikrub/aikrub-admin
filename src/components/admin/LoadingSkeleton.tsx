/**
 * LoadingSkeleton — dense skeleton rows shown while data is fetching.
 *
 * Spec: admin-page-template-mockup-b.md §9
 *
 * Row height matches dense data rows: h-12 (48px).
 * Skeleton cells pulse at bg-white/5.
 * Default: 6 rows. Each row spans `colCount` cells.
 *
 * Cell shape is controlled by the optional `cellShapes` prop (H1).
 * When provided, each entry maps to a cell stub. When omitted, all cells
 * render as uniform neutral stubs — no positional shape inference.
 * This makes LoadingSkeleton reusable for tables without avatars (e.g. Coupons).
 *
 * Renders as <tr> elements — must be placed inside a <tbody>.
 */

import { cn } from "@/lib/utils";

type CellShape =
  | "checkbox"
  | "avatar"
  | "text-sm"
  | "text-md"
  | "text-lg"
  | "number"
  | "action";

interface LoadingSkeletonProps {
  /** Number of table columns to render skeleton cells for */
  colCount: number;
  /** Number of skeleton rows to render (default: 6) */
  rowCount?: number;
  /**
   * Optional per-column shape descriptors (length must equal colCount).
   * When omitted, all cells render as uniform neutral text stubs.
   *
   * "checkbox"  → 16×16 square stub (checkbox column)
   * "avatar"    → 28×28 circle stub (avatar column)
   * "text-sm"   → narrow text stub  (w-20)
   * "text-md"   → medium text stub  (w-32)
   * "text-lg"   → wide text stub    (w-44)
   * "number"    → short right-aligned stub (w-12 ml-auto)
   * "action"    → very short right-aligned stub (w-8 ml-auto)
   */
  cellShapes?: CellShape[];
}

function cellClass(shape: CellShape): string {
  switch (shape) {
    case "checkbox": return "w-4 h-4 rounded";
    case "avatar":   return "w-7 h-7 rounded-full";
    case "text-sm":  return "h-4 w-20 rounded";
    case "text-md":  return "h-4 w-32 rounded";
    case "text-lg":  return "h-4 w-44 rounded";
    case "number":   return "h-4 w-12 rounded ml-auto";
    case "action":   return "h-4 w-8 rounded ml-auto";
  }
}

export function LoadingSkeleton({ colCount, rowCount = 6, cellShapes }: LoadingSkeletonProps) {
  return (
    <>
      {[...Array(rowCount)].map((_, rowIdx) => (
        <tr key={rowIdx} className="h-12 border-t border-white/[0.05]">
          {[...Array(colCount)].map((__, colIdx) => {
            const shape = cellShapes?.[colIdx];
            const stubClass = shape
              ? cellClass(shape)
              : "h-4 w-20 rounded"; /* uniform neutral stub when no shapes provided */

            return (
              <td key={colIdx} className="px-4 py-0">
                <div
                  className={cn(
                    "bg-white/[0.05] motion-safe:animate-pulse",
                    stubClass,
                  )}
                />
              </td>
            );
          })}
        </tr>
      ))}
    </>
  );
}
