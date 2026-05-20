/**
 * TableCard — main data surface for all admin list pages.
 *
 * Spec: admin-page-template-mockup-b.md §3
 *
 * Shell: surface-1 card with rounded-xl border.
 * Header: glass sticky (glass-table-header from index.css), h-10.
 * Body: solid — NEVER backdrop-filter on <tr>/<td>/<tbody>.
 *
 * Column-agnostic: accepts <thead> + <tbody> as children.
 * Pagination slot rendered below tbody inside the card.
 */

import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface TableCardProps {
  /** <thead> element — rendered inside the sticky glass header */
  head: ReactNode;
  /** <tbody> element — data rows or skeleton/empty/error state */
  body: ReactNode;
  /** Optional pagination controls rendered below table body */
  pagination?: ReactNode;
  className?: string;
}

export function TableCard({ head, body, pagination, className }: TableCardProps) {
  return (
    <div
      className={cn(
        "bg-[var(--color-bg-muted)] rounded-xl border border-white/[0.08] overflow-hidden",
        className,
      )}
    >
      {/*
        Scroll container: overflow-x-auto (horizontal) + overflow-y-auto with explicit
        max-height (vertical). Both are required so that `sticky top-0` on <thead>
        anchors to THIS container's scroll root — not the page — making the header
        actually stick when the list grows long.

        max-h calc breakdown (approximate):
          top bar 64 + PageHeader 120 + PII banner 52 + filters 80
          + page padding 32 + pagination bar 52 ≈ 400px (22rem)
        Adjust if the surrounding layout changes significantly.

        dvh (dynamic viewport height) keeps the table from hiding rows behind iOS
        Safari's collapsible browser chrome.
      */}
      <div className="overflow-x-auto overflow-y-auto max-h-[calc(100dvh-22rem)]">
        <table className="w-full">
          {/* Sticky glass header — sticks within the scroll container above */}
          <thead className="glass-table-header sticky top-0 z-[10] border-b border-white/[0.08]">
            {head}
          </thead>

          {/* Solid body — NO backdrop-filter here ever */}
          <tbody>
            {body}
          </tbody>
        </table>
      </div>

      {/* Pagination slot */}
      {pagination && (
        <div className="border-t border-white/[0.08]">
          {pagination}
        </div>
      )}
    </div>
  );
}
