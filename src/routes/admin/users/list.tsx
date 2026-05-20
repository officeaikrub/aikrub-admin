/**
 * UserList — รายการผู้ใช้ทั้งหมด (Wave 3a refactor — uses PageHeader/TableCard/etc. primitives)
 *
 * Section A of admin-user-mgmt-wireframes.md + admin-wireframe-deltas-v2.md §3
 *
 * C2 update: "ดูรายละเอียด" now opens UserDetailModal in-place instead of
 * navigating to /users/:id. Deep-link /users/:id still works — this route
 * is mounted at both /users and /users/:id; when :id param is present the
 * modal opens automatically on mount.
 *
 * Changes from pre-Wave-3a:
 *  - PageHeader with 4 StatChips (รวมผู้ใช้/เปิดใช้งาน/ระงับ/ถูกลบ)
 *  - TableCard (glass sticky header + solid body) — dense h-12 rows
 *  - StickyBulkActionBar (fixed bottom-6/bottom-20, glass-shell rounded-full)
 *  - EmptyState, LoadingSkeleton, ErrorState primitives
 *  - Removed: "สมัคร" + "Login ล่าสุด" columns (move to Wave 3b drawer)
 *  - Fixed all forbid-list violations (hard-coded hex, saturated status colors,
 *    non-token hover bg, amber bulk bar, blue-300 PII banner)
 *
 * Stat-chip data situation:
 *  - `total` chip: wired to data.total
 *  - `active`, `suspended`, `soft_deleted` chips: render "—" (null)
 *    because GET /api/admin/users currently returns only { total } at the
 *    aggregate level. A backend endpoint is needed — see summary note.
 *
 * Preserved intact: all permission helpers, role tabs, modal logic,
 * bulk-suspend, pagination, self-target rule, JWT freshness check.
 *
 * OQ-04m-05 resolved: Worker filters admin/owner rows server-side for admin viewers.
 * Pom RED-1: bulk suspend response has no skipped_elevated[] — silent skip client-side.
 */

import { useState, useEffect, useRef } from "react";
import type { RefObject } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, MoreHorizontal, ShieldAlert, Users } from "lucide-react";
import {
  adminListUsers,
  adminUnsuspendUser,
  type AdminUserRow,
  type UserRole,
  type UserStatus,
  type BulkSuspendResult,
} from "@/lib/api-admin";
import { useAdmin } from "@/components/AdminLayout";
import { UserListFilters, type UserFilters } from "@/components/UserListFilters";
import { AdjustKrubModal } from "@/components/AdjustKrubModal";
import { SuspendUserModal } from "@/components/SuspendUserModal";
import { RestoreUserModal } from "@/components/RestoreUserModal";
import { UserDetailModal } from "@/components/UserDetailModal";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/admin/PageHeader";
import { StatChip } from "@/components/admin/StatChip";
import { TableCard } from "@/components/admin/TableCard";
import { StickyBulkActionBar } from "@/components/admin/StickyBulkActionBar";
import { EmptyState } from "@/components/admin/EmptyState";
import { LoadingSkeleton } from "@/components/admin/LoadingSkeleton";
import { ErrorState } from "@/components/admin/ErrorState";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Column count constant — update here if columns change
// ---------------------------------------------------------------------------

/** Desktop table column count: checkbox + avatar + email + ชื่อ + role + krub + สถานะ + actions = 8 */
const COL_COUNT = 8;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function daysUntilPurge(deletedAt: string): number {
  const ms = 30 * 24 * 60 * 60 * 1000;
  const remaining = new Date(deletedAt).getTime() + ms - Date.now();
  return Math.max(0, Math.ceil(remaining / (24 * 60 * 60 * 1000)));
}

function isInGracePeriod(deletedAt: string | null): boolean {
  if (!deletedAt) return false;
  return daysUntilPurge(deletedAt) > 0;
}

// ---------------------------------------------------------------------------
// Status badge (design-system-v2.md §5 — dot + label, token-bound colors)
// ---------------------------------------------------------------------------

function UserStatusBadge({ status }: { status: UserStatus }) {
  const map: Record<UserStatus, { dot: string; badge: string; label: string }> = {
    active: {
      dot:   "bg-[var(--color-success)]",
      badge: "bg-[var(--color-success)]/12 text-[var(--color-success-text)] border-[var(--color-success)]/20",
      label: "เปิดใช้งาน",
    },
    suspended: {
      dot:   "bg-[var(--color-warning)]",
      badge: "bg-[var(--color-warning)]/12 text-[var(--color-warning-text)] border-[var(--color-warning)]/20",
      label: "ระงับ",
    },
    soft_deleted: {
      dot:   "bg-[var(--color-error)]",
      badge: "bg-[var(--color-error)]/12 text-[var(--color-error-text)] border-[var(--color-error)]/20",
      label: "ลบแล้ว",
    },
  };
  const s = map[status];
  return (
    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-ui border", s.badge)}>
      <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", s.dot)} aria-hidden="true" />
      {s.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Role badge (token-bound only — no slate-700/blue-900/amber-900 hard-codes)
// ---------------------------------------------------------------------------

function UserRoleBadge({ role }: { role: UserRole }) {
  const map: Record<UserRole, string> = {
    user:  "px-2 py-0.5 rounded bg-[var(--color-bg-raised)] text-[var(--color-fg-muted)] text-xs font-ui",
    admin: "px-2 py-0.5 rounded bg-[var(--color-info)]/12 text-[var(--color-info-text)] text-xs font-ui",
    owner: "px-2 py-0.5 rounded bg-[var(--color-warning)]/12 text-[var(--color-warning-text)] text-xs font-ui",
  };
  return <span className={map[role]}>{role}</span>;
}

// ---------------------------------------------------------------------------
// Bulk result banner (token-bound colors — no green-400 / red-400)
// ---------------------------------------------------------------------------

interface BulkResultBannerProps {
  result: BulkSuspendResult;
  onDismiss: () => void;
}

function BulkResultBanner({ result, onDismiss }: BulkResultBannerProps) {
  const suspendedCount = result.suspended.length;
  const failedCount = result.failed.length;

  useEffect(() => {
    const timer = setTimeout(onDismiss, 8000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div className="bg-[var(--color-bg-muted)] border border-white/[0.08] rounded-xl px-4 py-3 flex items-center gap-4 flex-wrap">
      {suspendedCount > 0 && (
        <span className="font-ui text-sm text-[var(--color-success-text)]">
          ✓ ระงับแล้ว {suspendedCount} คน
        </span>
      )}
      {failedCount > 0 && (
        <span className="font-ui text-sm text-[var(--color-error-text)]">
          ✗ ล้มเหลว {failedCount} คน
        </span>
      )}
      {suspendedCount === 0 && failedCount === 0 && (
        <span className="font-ui text-sm text-[var(--color-fg-muted)]">ไม่มีการดำเนินการ</span>
      )}
      <button
        onClick={onDismiss}
        className="ml-auto font-ui text-xs text-[var(--color-fg-subtle)] hover:text-[var(--color-fg-muted)] motion-safe:transition-colors duration-150"
      >
        ✕
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Desktop table head row
// ---------------------------------------------------------------------------

interface TableHeadProps {
  allEligibleSelected: boolean;
  someSelected: boolean;
  eligibleCount: number;
  onToggleAll: () => void;
  headerCheckboxRef: RefObject<HTMLInputElement>;
}

function TableHead({
  allEligibleSelected,
  someSelected,
  eligibleCount,
  onToggleAll,
  headerCheckboxRef,
}: TableHeadProps) {
  // Keep indeterminate state in sync
  useEffect(() => {
    if (headerCheckboxRef.current) {
      headerCheckboxRef.current.indeterminate = someSelected;
    }
  }, [someSelected, headerCheckboxRef]);

  return (
    <tr className="h-10">
      {/* Checkbox */}
      <th className="w-10 pl-4 pr-2">
        <input
          ref={headerCheckboxRef}
          type="checkbox"
          checked={allEligibleSelected}
          onChange={onToggleAll}
          disabled={eligibleCount === 0}
          style={{ accentColor: "var(--color-accent)" }}
          className="w-4 h-4 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
          aria-label="เลือกทั้งหมด"
        />
      </th>
      {/* Avatar */}
      <th className="w-10 px-2">
        <span className="sr-only">avatar</span>
      </th>
      {/* Email */}
      <th className="px-4 text-left">
        <span className="font-ui font-medium text-xs text-[var(--color-fg-muted)] uppercase tracking-wide">
          Email
        </span>
      </th>
      {/* ชื่อ */}
      <th className="w-32 px-4 text-left">
        <span className="font-ui font-medium text-xs text-[var(--color-fg-muted)] uppercase tracking-wide">
          ชื่อ
        </span>
      </th>
      {/* Role */}
      <th className="w-24 px-4 text-left">
        <span className="font-ui font-medium text-xs text-[var(--color-fg-muted)] uppercase tracking-wide">
          Role
        </span>
      </th>
      {/* krub */}
      <th className="w-24 px-4 text-right">
        <span className="font-ui font-medium text-xs text-[var(--color-fg-muted)] uppercase tracking-wide">
          krub
        </span>
      </th>
      {/* สถานะ */}
      <th className="w-28 px-4 text-left">
        <span className="font-ui font-medium text-xs text-[var(--color-fg-muted)] uppercase tracking-wide">
          สถานะ
        </span>
      </th>
      {/* Actions */}
      <th className="w-20 px-4 text-right">
        <span className="sr-only">Actions</span>
      </th>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

const DEFAULT_FILTERS: UserFilters = {
  role: "",
  status: "",
  q: "",
  limit: 20,
};

interface ModalState {
  type: "adjust" | "suspend" | "restore" | null;
  user: AdminUserRow | null;
  balance: number;
}

export default function UserList() {
  const { user: viewer } = useAdmin();
  const navigate = useNavigate();
  const { id: routeUserId } = useParams<{ id?: string }>();
  const queryClient = useQueryClient();

  // L2: derive detailUserId directly from URL param — URL is the source of truth.
  // Browser back/forward naturally open/close the modal without extra state.
  const detailUserId = routeUserId ?? null;

  function openDetailModal(userId: string) {
    navigate(`/users/${userId}`);
  }

  function closeDetailModal() {
    navigate("/users");
  }

  const [filters, setFilters] = useState<UserFilters>(DEFAULT_FILTERS);
  const [cursors, setCursors] = useState<string[]>([]);
  const [modalState, setModalState] = useState<ModalState>({ type: null, user: null, balance: 0 });

  // Bulk selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkResult, setBulkResult] = useState<BulkSuspendResult | null>(null);

  // Header checkbox ref for indeterminate state (managed in TableHead)
  const headerCheckboxRef = useRef<HTMLInputElement>(null);

  const currentCursor = cursors[cursors.length - 1] as string | undefined;

  const queryParams = {
    cursor: currentCursor,
    limit: filters.limit,
    q: filters.q || undefined,
    role: filters.role || undefined,
    status: filters.status || undefined,
  };

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["admin", "users", queryParams],
    queryFn: () => adminListUsers(queryParams),
  });

  const unsuspendMutation = useMutation({
    mutationFn: (userId: string) => adminUnsuspendUser(userId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
    },
  });

  function handleFilterChange(next: Partial<UserFilters>) {
    setFilters((f) => ({ ...f, ...next }));
    setCursors([]);
    setSelectedIds(new Set());
  }

  function handleFilterReset() {
    setFilters(DEFAULT_FILTERS);
    setCursors([]);
    setSelectedIds(new Set());
  }

  function openModal(type: ModalState["type"], user: AdminUserRow, balance = 0) {
    setModalState({ type, user, balance });
  }

  function closeModal() {
    setModalState({ type: null, user: null, balance: 0 });
  }

  const items = data?.items ?? [];
  const total = data?.total ?? null;
  const nextCursor = data?.next_cursor ?? null;
  const page = cursors.length + 1;
  const hasNext = !!nextCursor;
  const hasPrev = cursors.length > 0;

  function goNext() {
    if (nextCursor) {
      setCursors((c) => [...c, nextCursor]);
      setSelectedIds(new Set());
    }
  }

  function goPrev() {
    setCursors((c) => c.slice(0, -1));
    setSelectedIds(new Set());
  }

  // Permission helpers
  function canAdjustKrub(target: AdminUserRow): boolean {
    if (target.status === "soft_deleted") return false;
    if (viewer.role === "admin" && (target.role === "admin" || target.role === "owner")) return false;
    if (viewer.id === target.id) return false;
    return true;
  }

  function canSuspend(target: AdminUserRow): boolean {
    if (target.status !== "active") return false;
    if (viewer.role === "admin" && (target.role === "admin" || target.role === "owner")) return false;
    if (viewer.id === target.id) return false;
    return true;
  }

  function isEligibleForCheckbox(target: AdminUserRow): boolean {
    if (target.status !== "active") return false;
    if (viewer.id === target.id) return false;
    return target.role === "user";
  }

  function isElevated(target: AdminUserRow): boolean {
    return target.role === "admin" || target.role === "owner";
  }

  function canUnsuspend(target: AdminUserRow): boolean {
    if (target.status !== "suspended") return false;
    if (viewer.role === "admin" && (target.role === "admin" || target.role === "owner")) return false;
    if (viewer.id === target.id) return false;
    return true;
  }

  function canRestore(target: AdminUserRow): boolean {
    if (viewer.role !== "owner") return false;
    if (target.status !== "soft_deleted") return false;
    if (viewer.id === target.id) return false;
    return isInGracePeriod(target.deleted_at);
  }

  // Checkbox logic
  const eligibleItems = items.filter(isEligibleForCheckbox);
  const eligibleIds = new Set(eligibleItems.map((u) => u.id));
  const selectedEligibleCount = [...selectedIds].filter((id) => eligibleIds.has(id)).length;
  const allEligibleSelected = eligibleItems.length > 0 && selectedEligibleCount === eligibleItems.length;
  const someSelected = selectedEligibleCount > 0 && !allEligibleSelected;

  function toggleSelectAll() {
    if (allEligibleSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        eligibleIds.forEach((id) => next.delete(id));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        eligibleIds.forEach((id) => next.add(id));
        return next;
      });
    }
  }

  function toggleRow(userId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  }

  // Bulk suspend helpers
  const selectedUsers = items.filter((u) => selectedIds.has(u.id));
  const suspendableSelected = selectedUsers.filter(canSuspend);
  const allSelectedAreElevated = selectedIds.size > 0 && suspendableSelected.length === 0;
  const primaryUser = suspendableSelected[0] ?? null;

  // -----------------------------------------------------------------------
  // Stat chips
  // -----------------------------------------------------------------------
  // `total` is wired from API response.
  // Per-status counts (active / suspended / soft_deleted) are NOT available
  // from GET /api/admin/users — the API only returns `total`.
  // Chips render "—" until Cheese adds aggregate counts to the endpoint.
  // See summary: backend needs `counts: { active, suspended, soft_deleted }`
  // added to GET /api/admin/users response (or a separate /stats endpoint).
  const totalCount = total;     // number | null — null until first data lands
  const activeCount: number | null = null;      // not in API response
  const suspendedCount: number | null = null;   // not in API response
  const deletedCount: number | null = null;     // not in API response

  // -----------------------------------------------------------------------
  // Pagination controls
  // -----------------------------------------------------------------------
  const paginationNode = (hasNext || hasPrev) ? (
    <div className="flex items-center justify-between px-4 py-3">
      <span className="font-ui text-xs text-[var(--color-fg-subtle)] tabular-nums">
        หน้า {page}{total !== null ? ` · รวม ${total.toLocaleString()} ผู้ใช้` : ""}
      </span>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={goPrev}
          disabled={!hasPrev}
          className="border-white/10 text-[var(--color-fg-muted)] hover:bg-[var(--color-bg-raised)] h-8"
        >
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={goNext}
          disabled={!hasNext}
          className="border-white/10 text-[var(--color-fg-muted)] hover:bg-[var(--color-bg-raised)] h-8"
        >
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  ) : null;

  // -----------------------------------------------------------------------
  // Table body
  // -----------------------------------------------------------------------
  const tableBody = (
    <>
      {isLoading && (
        <LoadingSkeleton
          colCount={COL_COUNT}
          cellShapes={["checkbox", "avatar", "text-lg", "text-md", "text-sm", "number", "text-sm", "action"]}
        />
      )}

      {isError && (
        <ErrorState
          colSpan={COL_COUNT}
          title="โหลดรายการผู้ใช้ไม่สำเร็จ"
          onRetry={() => void refetch()}
        />
      )}

      {!isLoading && !isError && items.length === 0 && (
        <EmptyState
          icon={Users}
          colSpan={COL_COUNT}
          title={
            filters.role || filters.status || filters.q
              ? "ไม่พบผู้ใช้ที่ตรงกับเงื่อนไข"
              : "ยังไม่มีผู้ใช้"
          }
          body={
            filters.role || filters.status || filters.q
              ? "ลองปรับหรือล้างตัวกรอง"
              : undefined
          }
          action={
            filters.role || filters.status || filters.q ? (
              <button
                onClick={handleFilterReset}
                className="font-ui text-sm text-[var(--color-accent)] hover:underline"
              >
                ล้างตัวกรอง
              </button>
            ) : undefined
          }
        />
      )}

      {!isLoading && !isError && items.map((user) => {
        const isSoftDeleted = user.status === "soft_deleted";
        const isSelected = selectedIds.has(user.id);
        const eligible = isEligibleForCheckbox(user);
        const elevated = isElevated(user);

        return (
          <tr
            key={user.id}
            className={cn(
              "h-12 border-t border-white/[0.05] motion-safe:transition-colors duration-150",
              isSelected
                ? "bg-[rgba(242,95,45,0.12)] border-l-2 border-l-[var(--color-accent)]"
                : "hover:bg-[var(--color-bg-raised)]",
            )}
          >
            {/* Checkbox */}
            <td className="w-10 pl-4 pr-2">
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => { if (eligible) toggleRow(user.id); }}
                disabled={!eligible}
                style={{ accentColor: "var(--color-accent)" }}
                className={cn(
                  "w-4 h-4",
                  eligible ? "cursor-pointer" : "cursor-not-allowed opacity-30",
                  elevated && !eligible && "opacity-20",
                )}
                title={elevated ? "admin/owner ไม่สามารถเลือกได้" : undefined}
              />
            </td>

            {/* Avatar */}
            <td className="w-10 px-2">
              <div className="w-8 h-8 rounded-full bg-[var(--color-bg-raised)] flex items-center justify-center text-[10px] font-ui text-[var(--color-fg-muted)]">
                {user.display_name ? user.display_name[0]?.toUpperCase() : "?"}
              </div>
            </td>

            {/* Email */}
            <td className="px-4">
              <span className="font-content text-sm text-[var(--color-fg-muted)] truncate max-w-[200px] block">
                {user.email ?? "—"}
              </span>
            </td>

            {/* ชื่อ */}
            <td className="w-32 px-4">
              <span className="font-ui text-sm text-[var(--color-fg)] truncate max-w-[128px] block">
                {user.display_name ?? "—"}
              </span>
            </td>

            {/* Role */}
            <td className="w-24 px-4">
              <UserRoleBadge role={user.role} />
            </td>

            {/* krub — not in list response */}
            <td className="w-24 px-4 font-mono text-sm text-right text-[var(--color-fg-muted)] tabular-nums">
              —
            </td>

            {/* Status */}
            <td className="w-28 px-4">
              <UserStatusBadge status={user.status} />
            </td>

            {/* Actions */}
            <td className="w-20 px-4 text-right">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-[var(--color-fg-subtle)] hover:text-[var(--color-fg)] hover:bg-white/[0.05]"
                  >
                    <span className="sr-only">actions</span>
                    <MoreHorizontal className="w-4 h-4" aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-[200px]">
                  <DropdownMenuItem
                    onClick={() => openDetailModal(user.id)}
                    className="font-ui text-sm cursor-pointer"
                  >
                    ดูรายละเอียด
                  </DropdownMenuItem>

                  {!isSoftDeleted && (
                    <>
                      <DropdownMenuSeparator className="bg-white/10" />
                      {canAdjustKrub(user) && (
                        <DropdownMenuItem
                          onClick={() => openModal("adjust", user)}
                          className="font-ui text-sm cursor-pointer"
                        >
                          ปรับ krub
                        </DropdownMenuItem>
                      )}
                      {canSuspend(user) && (
                        <DropdownMenuItem
                          onClick={() => openModal("suspend", user)}
                          className="font-ui text-sm text-[var(--color-warning-text)] focus:text-[var(--color-warning-text)] cursor-pointer"
                        >
                          ระงับบัญชี
                        </DropdownMenuItem>
                      )}
                      {canUnsuspend(user) && (
                        <DropdownMenuItem
                          onClick={() => {
                            void unsuspendMutation.mutateAsync(user.id);
                          }}
                          className="font-ui text-sm cursor-pointer"
                        >
                          ยกเลิกการระงับ
                        </DropdownMenuItem>
                      )}
                    </>
                  )}

                  {canRestore(user) && (
                    <>
                      <DropdownMenuSeparator className="bg-white/10" />
                      <DropdownMenuItem
                        onClick={() => openModal("restore", user)}
                        className="font-ui text-sm text-[var(--color-success-text)] focus:text-[var(--color-success-text)] cursor-pointer"
                      >
                        กู้คืนบัญชี
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </td>
          </tr>
        );
      })}
    </>
  );

  return (
    <div className="px-3 py-3 md:px-4 md:py-4 lg:px-6 lg:py-5 space-y-4 relative">
      {/* Bulk result banner — above PII banner */}
      {bulkResult && (
        <BulkResultBanner
          result={bulkResult}
          onDismiss={() => setBulkResult(null)}
        />
      )}

      {/* PageHeader with stat chips */}
      <PageHeader
        title="จัดการผู้ใช้"
        chips={
          <>
            <StatChip label="รวมผู้ใช้"    value={totalCount}     dot="neutral" />
            <StatChip label="เปิดใช้งาน"   value={activeCount}    dot="success" />
            <StatChip label="ระงับ"        value={suspendedCount} dot="warning" />
            <StatChip label="ถูกลบ"        value={deletedCount}   dot="error"   />
          </>
        }
      />

      {/* PII access banner (admin-page-template-mockup-b.md §11) */}
      <div
        className="flex items-center gap-2 px-4 py-3 rounded-lg border bg-[var(--color-info)]/[0.12] border-[var(--color-info)]/[0.30]"
      >
        <ShieldAlert
          className="w-4 h-4 shrink-0 text-[var(--color-info)]"
          aria-hidden="true"
        />
        <span className="font-ui text-sm text-[var(--color-info-text)]">
          การเข้าถึงข้อมูลนี้ถูกบันทึกแล้ว · อ่านข้อมูล PDPA
        </span>
      </div>

      {/* Filters */}
      <UserListFilters
        filters={filters}
        viewerRole={viewer.role}
        onChange={handleFilterChange}
        onReset={handleFilterReset}
      />

      {/* Desktop table */}
      <div className="hidden md:block">
        <TableCard
          head={
            <TableHead
              allEligibleSelected={allEligibleSelected}
              someSelected={someSelected}
              eligibleCount={eligibleItems.length}
              onToggleAll={toggleSelectAll}
              headerCheckboxRef={headerCheckboxRef}
            />
          }
          body={tableBody}
          pagination={paginationNode}
        />
      </div>

      {/* Mobile card view */}
      <div className="md:hidden space-y-3">
        {isLoading && (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-[var(--color-bg-muted)] rounded-xl border border-white/[0.08] p-4 space-y-2 motion-safe:animate-pulse">
                <div className="h-4 w-32 bg-white/[0.05] rounded" />
                <div className="h-3 w-48 bg-white/[0.05] rounded" />
                <div className="h-3 w-24 bg-white/[0.05] rounded" />
              </div>
            ))}
          </div>
        )}

        {isError && (
          <div className="flex items-center justify-between p-4 rounded-xl bg-[var(--color-error)]/10 border border-[var(--color-error)]/30">
            <span className="font-ui text-sm text-[var(--color-error-text)]">โหลดข้อมูลไม่สำเร็จ</span>
            <Button
              variant="outline"
              size="sm"
              className="border-[var(--color-error)]/30 text-[var(--color-error-text)] hover:bg-[var(--color-error)]/10"
              onClick={() => void refetch()}
            >
              ลองใหม่
            </Button>
          </div>
        )}

        {!isLoading && !isError && items.length === 0 && (
          <div className="py-12 text-center font-content text-sm text-[var(--color-fg-subtle)]">
            ยังไม่มีผู้ใช้ที่ตรงกับเงื่อนไข
          </div>
        )}

        {!isLoading && !isError && items.map((user) => (
          <div
            key={user.id}
            className="bg-[var(--color-bg-muted)] rounded-xl border border-white/[0.08] p-4 space-y-2"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="font-ui text-sm text-[var(--color-fg)]">
                  {user.display_name ?? "—"}
                </p>
                <p className="font-content text-xs text-[var(--color-fg-muted)] mt-0.5">
                  {user.email ?? "—"}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <UserRoleBadge role={user.role} />
                <UserStatusBadge status={user.status} />
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => openDetailModal(user.id)}
              className="w-full border-white/10 text-[var(--color-fg-muted)] hover:bg-[var(--color-bg-raised)] h-8 text-xs font-ui"
            >
              ดูรายละเอียด
            </Button>
          </div>
        ))}

        {/* Mobile pagination */}
        {(hasNext || hasPrev) && (
          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={goPrev}
              disabled={!hasPrev}
              className="flex-1 border-white/10 text-[var(--color-fg-muted)] hover:bg-[var(--color-bg-raised)]"
            >
              ← ก่อนหน้า
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={goNext}
              disabled={!hasNext}
              className="flex-1 border-white/10 text-[var(--color-fg-muted)] hover:bg-[var(--color-bg-raised)]"
            >
              ถัดไป →
            </Button>
          </div>
        )}
      </div>

      {/* StickyBulkActionBar — fixed bottom, hidden when no selection */}
      <StickyBulkActionBar
        count={selectedIds.size}
        primaryLabel="ระงับ"
        onPrimary={() => setShowBulkModal(true)}
        primaryDisabled={allSelectedAreElevated}
        primaryDisabledTitle={
          allSelectedAreElevated
            ? "ผู้ใช้ที่เลือกทั้งหมดเป็น admin/owner — ไม่สามารถระงับได้"
            : undefined
        }
        onClear={() => setSelectedIds(new Set())}
      />

      {/* Modals */}
      {modalState.type === "adjust" && modalState.user && (
        <AdjustKrubModal
          open
          user={modalState.user}
          balance={modalState.balance}
          onClose={closeModal}
          onSuccess={() => {
            closeModal();
            void queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
          }}
        />
      )}

      {modalState.type === "suspend" && modalState.user && (
        <SuspendUserModal
          open
          user={modalState.user}
          onClose={closeModal}
          onSuccess={() => {
            closeModal();
            void queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
          }}
        />
      )}

      {modalState.type === "restore" && modalState.user && (
        <RestoreUserModal
          open
          user={modalState.user}
          daysRemaining={daysUntilPurge(modalState.user.deleted_at ?? "")}
          onClose={closeModal}
          onSuccess={() => {
            closeModal();
            void queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
          }}
        />
      )}

      {/* Bulk suspend modal */}
      {showBulkModal && primaryUser && (
        <SuspendUserModal
          open
          user={primaryUser}
          users={suspendableSelected}
          onClose={() => setShowBulkModal(false)}
          onSuccess={() => {
            setShowBulkModal(false);
            setSelectedIds(new Set());
            void queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
          }}
          onBulkSuccess={(result) => {
            setBulkResult(result);
            setShowBulkModal(false);
            setSelectedIds(new Set());
            void queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
          }}
        />
      )}

      {/* User detail modal — opened by row action or /users/:id deep-link */}
      {detailUserId && (
        <UserDetailModal
          open={!!detailUserId}
          userId={detailUserId}
          onClose={closeDetailModal}
        />
      )}
    </div>
  );
}
