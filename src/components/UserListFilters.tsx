/**
 * UserListFilters — Filter bar for the user list page.
 *
 * Section A of admin-user-mgmt-wireframes.md
 * - Role tab bar (owner sees admin/owner tabs; admin only sees user tab)
 * - Status filter dropdown: active / suspended / soft_deleted
 * - Search input: email, display_name, or UUID
 * - OQ-04m-04: Tier filter SKIPPED (no tier column yet)
 */

import { type ChangeEvent } from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { UserRole, UserStatus } from "@/lib/api-admin";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UserFilters {
  role: UserRole | "";
  status: UserStatus | "";
  q: string;
  limit: number;
}

interface UserListFiltersProps {
  filters: UserFilters;
  viewerRole: "admin" | "owner";
  onChange: (next: Partial<UserFilters>) => void;
  onReset: () => void;
}

// ---------------------------------------------------------------------------
// Role tab config — admin tab + owner tab hidden when viewer=admin
// ---------------------------------------------------------------------------

interface RoleTab {
  value: UserRole | "";
  label: string;
  ownerOnly: boolean;
}

const ROLE_TABS: RoleTab[] = [
  { value: "",        label: "ทั้งหมด", ownerOnly: false },
  { value: "user",    label: "user",    ownerOnly: false },
  { value: "admin",   label: "admin",   ownerOnly: true  },
  { value: "owner",   label: "owner",   ownerOnly: true  },
];

// ---------------------------------------------------------------------------
// Status filter options
// ---------------------------------------------------------------------------

const STATUS_OPTIONS: { value: UserStatus | ""; label: string }[] = [
  { value: "",             label: "สถานะทั้งหมด" },
  { value: "active",       label: "เปิดใช้งาน"   },
  { value: "suspended",    label: "ระงับ"         },
  { value: "soft_deleted", label: "ลบแล้ว"        },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function UserListFilters({
  filters,
  viewerRole,
  onChange,
  onReset,
}: UserListFiltersProps) {
  const hasActiveFilter =
    filters.role !== "" || filters.status !== "" || filters.q !== "";

  function handleQChange(e: ChangeEvent<HTMLInputElement>) {
    onChange({ q: e.target.value });
  }

  function handleStatusChange(e: ChangeEvent<HTMLSelectElement>) {
    onChange({ status: e.target.value as UserStatus | "" });
  }

  return (
    <div className="space-y-3">
      {/* Role tab bar */}
      <div className="flex border-b border-white/[0.08] overflow-x-auto scrollbar-none">
        {ROLE_TABS.filter((t) => !t.ownerOnly || viewerRole === "owner").map((tab) => (
          <button
            key={tab.value}
            onClick={() => onChange({ role: tab.value as UserRole | "" })}
            className={cn(
              "px-4 py-2.5 font-ui text-sm whitespace-nowrap shrink-0 transition-colors",
              filters.role === tab.value
                ? "text-foreground border-b-2 border-[#F25F2D]"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Filter row (glass) */}
      <div className="flex flex-wrap gap-2 items-center p-3 rounded-lg bg-[var(--color-bg-muted)] border border-white/10">
        {/* Status dropdown */}
        <select
          value={filters.status}
          onChange={handleStatusChange}
          className="h-8 bg-[#0F172A] border border-white/10 rounded-lg px-3 font-ui text-sm text-foreground focus:border-[#F25F2D] focus:outline-none"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-fg-subtle pointer-events-none" />
          <input
            type="text"
            value={filters.q}
            onChange={handleQChange}
            placeholder="ค้นหา email, ชื่อ หรือ UUID..."
            className="w-full h-8 bg-[#0F172A] border border-white/10 rounded-lg pl-8 pr-3 font-ui text-sm text-foreground placeholder:text-fg-subtle focus:border-[#F25F2D] focus:outline-none"
          />
        </div>

        {/* Reset button — only when filters are active */}
        {hasActiveFilter && (
          <button
            onClick={onReset}
            className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-white/10 font-ui text-xs text-muted-foreground hover:bg-white/5 transition-colors"
          >
            <X className="w-3 h-3" />
            ล้างตัวกรอง
          </button>
        )}
      </div>
    </div>
  );
}
