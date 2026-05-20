/**
 * ErrorState — shown inside TableCard body on API error.
 *
 * Spec: admin-page-template-mockup-b.md §10
 *
 * Never shows raw stack traces — user-friendly message only.
 * Console.error is the caller's responsibility.
 */

import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ErrorStateProps {
  /** Short description of what failed, e.g. "โหลดรายการผู้ใช้ไม่สำเร็จ" */
  title: string;
  /** Optional sanitized excerpt of error message */
  detail?: string;
  onRetry: () => void;
  /** Number of table columns for <td> colspan */
  colSpan: number;
}

export function ErrorState({ title, detail, onRetry, colSpan }: ErrorStateProps) {
  return (
    <tr>
      <td colSpan={colSpan}>
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <AlertCircle
            size={40}
            className="text-[var(--color-error)]"
            aria-hidden="true"
          />
          <p className="font-display text-base text-[var(--color-fg)]">
            {title}
          </p>
          {detail && (
            <p className="font-ui text-sm text-[var(--color-fg-muted)] text-center max-w-xs">
              {detail}
            </p>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={onRetry}
            className="mt-1 font-ui border-white/10 text-[var(--color-fg-muted)] hover:bg-white/[0.05]"
          >
            <RefreshCw className="w-4 h-4 mr-1.5" />
            ลองใหม่
          </Button>
        </div>
      </td>
    </tr>
  );
}
