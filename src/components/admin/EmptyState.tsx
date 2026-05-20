/**
 * EmptyState — shown inside TableCard body when zero rows exist.
 *
 * Spec: admin-page-template-mockup-b.md §8
 *
 * Always a Lucide icon + title + body copy. Optional CTA button.
 * No illustration images (admin keeps it lightweight).
 */

import { type ReactNode } from "react";
import { type LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  body?: string;
  /** Optional CTA — e.g. "ล้างตัวกรอง" button */
  action?: ReactNode;
  /** Number of table columns for the <td> colspan */
  colSpan: number;
}

export function EmptyState({ icon: Icon, title, body, action, colSpan }: EmptyStateProps) {
  return (
    <tr>
      <td colSpan={colSpan}>
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <Icon
            size={40}
            className="text-[var(--color-fg-subtle)]"
            aria-hidden="true"
          />
          <p className="font-display text-base text-[var(--color-fg-muted)]">
            {title}
          </p>
          {body && (
            <p className="font-ui text-sm text-[var(--color-fg-subtle)] text-center max-w-xs">
              {body}
            </p>
          )}
          {action && <div>{action}</div>}
        </div>
      </td>
    </tr>
  );
}
