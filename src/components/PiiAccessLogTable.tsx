/**
 * PiiAccessLogTable — แสดง PII access log สำหรับ user detail page
 *
 * - super-owner rows (admin_email ends with the current viewer's email):
 *   redact email to "admin@…" for non-owner viewers
 * - empty state: show friendly message
 * - max 50 rows returned from API (ORDER BY viewed_at DESC)
 */

import { formatDateTime, type PiiAccessLogRow } from "@/lib/api-admin";
import { cn } from "@/lib/utils";

interface PiiAccessLogTableProps {
  rows: PiiAccessLogRow[];
  /** Role of the admin viewing this page — owner sees full emails */
  viewerRole: "admin" | "owner";
}

const FIELD_LABELS: Record<string, string> = {
  email:        "Email",
  phone:        "Phone",
  display_name: "Display Name",
  ip_address:   "IP Address",
  payment_info: "Payment Info",
};

function fieldLabel(field: string): string {
  return FIELD_LABELS[field] ?? field;
}

export function PiiAccessLogTable({ rows, viewerRole }: PiiAccessLogTableProps) {
  if (rows.length === 0) {
    return (
      <div className="py-8 text-center space-y-1">
        <p className="font-content text-sm text-[#475569]">ยังไม่มีการเข้าถึง PII</p>
        <p className="font-ui text-xs text-[#475569]">
          การเข้าถึงข้อมูลส่วนตัวของผู้ใช้จะถูกบันทึกที่นี่
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr>
            <th className="px-2 py-2 font-ui text-xs text-[#94A3B8] text-left uppercase tracking-wide">
              Admin
            </th>
            <th className="px-2 py-2 font-ui text-xs text-[#94A3B8] text-left uppercase tracking-wide">
              Field
            </th>
            <th className="px-2 py-2 font-ui text-xs text-[#94A3B8] text-left uppercase tracking-wide">
              เวลา
            </th>
            <th className="px-2 py-2 font-ui text-xs text-[#94A3B8] text-left uppercase tracking-wide">
              IP
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            // Redact admin email for non-owner viewers — show only domain hint
            const displayEmail =
              viewerRole === "owner"
                ? row.admin_email
                : row.admin_email.replace(/^[^@]+/, "admin");

            return (
              <tr
                key={`${row.admin_id}-${row.viewed_at}-${row.viewed_field}`}
                className="border-t border-white/5"
              >
                <td className={cn(
                  "px-2 py-2 text-xs font-mono max-w-[180px] truncate",
                  viewerRole === "owner" ? "text-[#94A3B8]" : "text-[#475569] italic",
                )}>
                  <span title={viewerRole === "owner" ? row.admin_email : undefined}>
                    {displayEmail}
                  </span>
                </td>
                <td className="px-2 py-2">
                  <span className="px-1.5 py-0.5 rounded bg-blue-900/20 text-blue-300 text-xs font-ui">
                    {fieldLabel(row.viewed_field)}
                  </span>
                </td>
                <td className="px-2 py-2 font-mono text-xs text-[#475569] tabular-nums whitespace-nowrap">
                  {formatDateTime(row.viewed_at)}
                </td>
                <td className="px-2 py-2 font-mono text-xs text-[#475569] tabular-nums">
                  {row.ip_address ?? "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="px-2 py-2 font-ui text-xs text-[#475569] text-right">
        แสดง {rows.length} รายการล่าสุด
      </p>
    </div>
  );
}
