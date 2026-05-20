/**
 * UserList — รายการผู้ใช้ทั้งหมด
 *
 * Section A of admin-user-mgmt-wireframes.md
 * - PII access banner (always shown on page load)
 * - Role tab bar (owner sees all; admin sees only user tab)
 * - Status filter + search
 * - Desktop table + mobile card view
 * - Multi-select checkbox column (desktop only, md:+)
 *   - Checkbox col 0, sticky left, z-index above scroll
 *   - Header checkbox with indeterminate state on partial selection
 *   - admin/owner rows: checkbox visible but disabled + greyed
 *   - Selected rows: bg-amber-900/10
 * - Sticky action bar at bottom-4 when ≥1 selected
 * - Bulk suspend result banner (above PII banner, 8s auto-dismiss)
 * - Row actions: ดูรายละเอียด / ปรับ krub / ระงับ / ยกเลิกระงับ / กู้คืน
 * - Cursor-based pagination
 *
 * OQ-04m-05 resolved: Worker filters admin/owner rows server-side for admin viewers.
 * No redacted-cell branch needed — admin viewers never receive admin/owner rows.
 *
 * Pom RED-1: bulk suspend response has no skipped_elevated[] — silent skip client-side.
 * Result banner shows only: ✓ Suspended X • ✗ Failed Z
 */

import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MoreHorizontal, ChevronLeft, ChevronRight } from "lucide-react";
import {
  adminListUsers,
  adminUnsuspendUser,
  formatDateTime,
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
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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
// Status badge
// ---------------------------------------------------------------------------

function UserStatusBadge({ status }: { status: UserStatus }) {
  const map: Record<UserStatus, { dot: string; badge: string; label: string }> = {
    active:       { dot: "bg-[var(--color-success)]",   badge: "bg-[var(--color-success)]/15   text-[var(--color-success)]   border-[var(--color-success)]/20",   label: "เปิดใช้งาน" },
    suspended:    { dot: "bg-[var(--color-warning)]",   badge: "bg-[var(--color-warning)]/15   text-[var(--color-warning)]   border-[var(--color-warning)]/20",   label: "ระงับ"       },
    soft_deleted: { dot: "bg-[var(--color-error)]",     badge: "bg-[var(--color-error)]/15     text-[var(--color-error)]     border-[var(--color-error)]/20",     label: "ลบแล้ว"      },
  };
  const s = map[status];
  return (
    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-ui border", s.badge)}>
      <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", s.dot)} />
      {s.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Role badge
// ---------------------------------------------------------------------------

function UserRoleBadge({ role }: { role: UserRole }) {
  const map: Record<UserRole, string> = {
    user:  "px-2 py-0.5 rounded bg-slate-700/50 text-slate-300 text-xs font-ui",
    admin: "px-2 py-0.5 rounded bg-blue-900/40 text-blue-300 text-xs font-ui",
    owner: "px-2 py-0.5 rounded bg-amber-900/40 text-amber-300 text-xs font-ui",
  };
  return <span className={map[role]}>{role}</span>;
}

// ---------------------------------------------------------------------------
// Skeleton row (10 columns now: checkbox + 9 original)
// ---------------------------------------------------------------------------

function SkeletonRows() {
  return (
    <>
      {[...Array(5)].map((_, i) => (
        <tr key={i} className="border-t border-white/5">
          {[...Array(10)].map((__, j) => (
            <td key={j} className="px-3 py-3">
              <div
                className={cn(
                  "h-4 rounded bg-white/5 animate-pulse",
                  j === 0 ? "w-4" : j === 3 ? "w-36" : j === 4 ? "w-20" : "w-12",
                )}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Bulk result banner
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
    <div className="bg-card border border-white/8 rounded-xl px-4 py-3 flex items-center gap-4 flex-wrap">
      {suspendedCount > 0 && (
        <span className="font-ui text-sm text-green-400">
          ✓ ระงับแล้ว {suspendedCount} คน
        </span>
      )}
      {failedCount > 0 && (
        <span className="font-ui text-sm text-red-400">
          ✗ ล้มเหลว {failedCount} คน
        </span>
      )}
      {suspendedCount === 0 && failedCount === 0 && (
        <span className="font-ui text-sm text-muted-foreground">ไม่มีการดำเนินการ</span>
      )}
      <button
        onClick={onDismiss}
        className="ml-auto font-ui text-xs text-fg-subtle hover:text-muted-foreground transition-colors"
      >
        ✕
      </button>
    </div>
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
  const queryClient = useQueryClient();

  const [filters, setFilters] = useState<UserFilters>(DEFAULT_FILTERS);
  const [cursors, setCursors] = useState<string[]>([]);
  const [modalState, setModalState] = useState<ModalState>({ type: null, user: null, balance: 0 });

  // Bulk selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkResult, setBulkResult] = useState<BulkSuspendResult | null>(null);

  // Header checkbox ref for indeterminate state
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
    setSelectedIds(new Set()); // Clear selection on filter change
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
  const total = data?.total ?? 0;
  const nextCursor = data?.next_cursor ?? null;
  const page = cursors.length + 1;
  const hasNext = !!nextCursor;
  const hasPrev = cursors.length > 0;

  function goNext() {
    if (nextCursor) {
      setCursors((c) => [...c, nextCursor]);
      setSelectedIds(new Set()); // Clear selection on page change
    }
  }

  function goPrev() {
    setCursors((c) => c.slice(0, -1));
    setSelectedIds(new Set()); // Clear selection on page change
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
    // Eligible = can be selected (must be active user, not self, not elevated)
    if (target.status !== "active") return false;
    if (viewer.id === target.id) return false;
    // admin/owner rows are shown as disabled checkbox
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

  // Update header checkbox indeterminate state
  useEffect(() => {
    if (headerCheckboxRef.current) {
      headerCheckboxRef.current.indeterminate = someSelected;
    }
  }, [someSelected]);

  function toggleSelectAll() {
    if (allEligibleSelected) {
      // Deselect all eligible on current page
      setSelectedIds((prev) => {
        const next = new Set(prev);
        eligibleIds.forEach((id) => next.delete(id));
        return next;
      });
    } else {
      // Select all eligible on current page
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

  // Bulk suspend: collect full AdminUserRow for selected IDs
  const selectedUsers = items.filter((u) => selectedIds.has(u.id));
  // Only eligible (canSuspend) users go into the modal
  const suspendableSelected = selectedUsers.filter(canSuspend);
  const allSelectedAreElevated = selectedIds.size > 0 && suspendableSelected.length === 0;

  // The user shown in single-mode modal when exactly 1 eligible selected.
  // Must be null when no suspendable users are selected — never fall back to an
  // arbitrary row that the admin may not have intended to suspend.
  const primaryUser = suspendableSelected[0] ?? null;

  return (
    <div className="p-4 md:p-6 space-y-4 relative">
      {/* Bulk result banner — above PII banner */}
      {bulkResult && (
        <BulkResultBanner
          result={bulkResult}
          onDismiss={() => setBulkResult(null)}
        />
      )}

      {/* Page header */}
      <div className="flex items-center justify-between">
        <h1 className="font-display text-xl text-foreground">จัดการผู้ใช้</h1>
        <span className="font-ui text-sm text-fg-subtle">รวม {total.toLocaleString()} คน</span>
      </div>

      {/* PII access banner */}
      <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-900/20 border border-blue-500/30 text-blue-300 text-sm font-ui">
        <span>🔒</span>
        <span>การเข้าถึงข้อมูลนี้ถูกบันทึกแล้ว · อ่านข้อมูล PDPA</span>
      </div>

      {/* Filters */}
      <UserListFilters
        filters={filters}
        viewerRole={viewer.role}
        onChange={handleFilterChange}
        onReset={handleFilterReset}
      />

      {/* Content */}
      {isError && (
        <div className="flex items-center justify-between p-4 rounded-lg bg-red-900/20 border border-red-500/30 text-red-300 text-sm font-ui">
          <span>โหลดข้อมูลไม่สำเร็จ</span>
          <Button
            variant="outline"
            size="sm"
            className="border-red-500/30 text-red-300 hover:bg-red-900/30"
            onClick={() => refetch()}
          >
            ลองใหม่
          </Button>
        </div>
      )}

      {/* Desktop table */}
      <div className="hidden md:block bg-card rounded-xl border border-white/8 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/8">
                {/* Checkbox column */}
                <th className="w-[40px] px-2 py-3 sticky left-0 z-10 bg-card">
                  <input
                    ref={headerCheckboxRef}
                    type="checkbox"
                    checked={allEligibleSelected}
                    onChange={toggleSelectAll}
                    disabled={eligibleItems.length === 0}
                    style={{ accentColor: "#F25F2D" }}
                    className="w-4 h-4 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                    aria-label="เลือกทั้งหมด"
                  />
                </th>
                <th className="w-[4%] px-2 py-3">
                  <span className="sr-only">avatar</span>
                </th>
                <th className="w-[22%] px-3 py-3 font-ui text-xs text-muted-foreground uppercase tracking-wide text-left">Email</th>
                <th className="w-[12%] px-3 py-3 font-ui text-xs text-muted-foreground uppercase tracking-wide text-left">ชื่อ</th>
                <th className="w-[7%] px-3 py-3 font-ui text-xs text-muted-foreground uppercase tracking-wide text-left">Role</th>
                <th className="w-[9%] px-3 py-3 font-ui text-xs text-muted-foreground uppercase tracking-wide text-right">krub</th>
                <th className="w-[9%] px-3 py-3 font-ui text-xs text-muted-foreground uppercase tracking-wide text-left">สถานะ</th>
                <th className="w-[10%] px-3 py-3 font-ui text-xs text-muted-foreground uppercase tracking-wide text-left">สมัคร</th>
                <th className="w-[9%] px-3 py-3 font-ui text-xs text-muted-foreground uppercase tracking-wide text-left">Login ล่าสุด</th>
                <th className="w-[8%] px-3 py-3 font-ui text-xs text-muted-foreground uppercase tracking-wide text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && <SkeletonRows />}

              {!isLoading && items.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center font-content text-sm text-fg-subtle">
                    ยังไม่มีผู้ใช้ที่ตรงกับเงื่อนไข
                    {(filters.role || filters.status || filters.q) && (
                      <>
                        {" "}—{" "}
                        <button onClick={handleFilterReset} className="text-[#F25F2D] hover:underline">
                          ล้างตัวกรอง
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              )}

              {!isLoading && items.map((user) => {
                const isSoftDeleted = user.status === "soft_deleted";
                const isSelected = selectedIds.has(user.id);
                const eligible = isEligibleForCheckbox(user);
                const elevated = isElevated(user);

                return (
                  <tr
                    key={user.id}
                    className={cn(
                      "border-t border-white/5 transition-colors",
                      isSelected ? "bg-[rgba(242,95,45,0.12)] border-l-2 border-l-[var(--color-accent)]" : "hover:bg-white/[0.02]",
                    )}
                  >
                    {/* Checkbox */}
                    <td className="px-2 py-3 sticky left-0 z-10" style={{ background: "inherit" }}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => { if (eligible) toggleRow(user.id); }}
                        disabled={!eligible}
                        style={{ accentColor: "#F25F2D" }}
                        className={cn(
                          "w-4 h-4",
                          eligible ? "cursor-pointer" : "cursor-not-allowed opacity-30",
                          elevated && !eligible && "opacity-20",
                        )}
                        title={elevated ? "admin/owner ไม่สามารถเลือกได้" : undefined}
                      />
                    </td>

                    {/* Avatar */}
                    <td className="px-2 py-3">
                      <div className="w-7 h-7 rounded-full bg-slate-700 flex items-center justify-center text-[10px] font-ui text-muted-foreground">
                        {user.display_name ? user.display_name[0]?.toUpperCase() : "?"}
                      </div>
                    </td>

                    {/* Email */}
                    <td className="px-3 py-3">
                      <span className="font-content text-sm text-muted-foreground truncate max-w-[180px] block">
                        {user.email ?? "—"}
                      </span>
                    </td>

                    {/* Name */}
                    <td className="px-3 py-3 font-ui text-sm text-foreground">
                      {user.display_name ?? "—"}
                    </td>

                    {/* Role */}
                    <td className="px-3 py-3">
                      <UserRoleBadge role={user.role} />
                    </td>

                    {/* krub balance — no separate fetch for list; show N/A */}
                    <td className="px-3 py-3 font-mono text-sm text-right text-muted-foreground tabular-nums">
                      —
                    </td>

                    {/* Status */}
                    <td className="px-3 py-3">
                      <UserStatusBadge status={user.status} />
                    </td>

                    {/* Created at */}
                    <td className="px-3 py-3 font-mono text-xs text-fg-subtle tabular-nums">
                      {user.created_at ? formatDateTime(user.created_at).slice(0, 10) : "—"}
                    </td>

                    {/* Last login (not in list response — omit) */}
                    <td className="px-3 py-3 font-mono text-xs text-fg-subtle tabular-nums">
                      —
                    </td>

                    {/* Actions */}
                    <td className="px-3 py-3 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-fg-subtle hover:text-foreground hover:bg-white/5"
                          >
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          align="end"
                          className="min-w-[200px]"
                        >
                          <DropdownMenuItem
                            onClick={() => navigate(`/users/${user.id}`)}
                            className="font-ui text-sm text-foreground cursor-pointer"
                          >
                            👁 ดูรายละเอียด
                          </DropdownMenuItem>

                          {!isSoftDeleted && (
                            <>
                              <DropdownMenuSeparator className="bg-white/10" />
                              {canAdjustKrub(user) && (
                                <DropdownMenuItem
                                  onClick={() => openModal("adjust", user)}
                                  className="font-ui text-sm text-foreground cursor-pointer"
                                >
                                  ⚡ ปรับ krub
                                </DropdownMenuItem>
                              )}
                              {canSuspend(user) && (
                                <DropdownMenuItem
                                  onClick={() => openModal("suspend", user)}
                                  className="font-ui text-sm text-amber-300 cursor-pointer"
                                >
                                  ⊘ ระงับบัญชี
                                </DropdownMenuItem>
                              )}
                              {canUnsuspend(user) && (
                                <DropdownMenuItem
                                  onClick={() => {
                                    void unsuspendMutation.mutateAsync(user.id);
                                  }}
                                  className="font-ui text-sm text-muted-foreground cursor-pointer"
                                >
                                  ◎ ยกเลิกการระงับ
                                </DropdownMenuItem>
                              )}
                            </>
                          )}

                          {canRestore(user) && (
                            <>
                              <DropdownMenuSeparator className="bg-white/10" />
                              <DropdownMenuItem
                                onClick={() => openModal("restore", user)}
                                className="font-ui text-sm text-green-300 cursor-pointer"
                              >
                                ↩ กู้คืนบัญชี
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {(hasNext || hasPrev) && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-white/8">
            <span className="font-ui text-xs text-fg-subtle">
              หน้า {page} · รวม {total.toLocaleString()} ผู้ใช้
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={goPrev}
                disabled={!hasPrev}
                className="border-white/10 text-muted-foreground hover:bg-white/5 h-8"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={goNext}
                disabled={!hasNext}
                className="border-white/10 text-muted-foreground hover:bg-white/5 h-8"
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Mobile card view */}
      <div className="md:hidden space-y-3">
        {isLoading && (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-card rounded-xl border border-white/8 p-4 space-y-2 animate-pulse">
                <div className="h-4 w-32 bg-white/5 rounded" />
                <div className="h-3 w-48 bg-white/5 rounded" />
                <div className="h-3 w-24 bg-white/5 rounded" />
              </div>
            ))}
          </div>
        )}

        {!isLoading && items.length === 0 && (
          <div className="py-12 text-center font-content text-sm text-fg-subtle">
            ยังไม่มีผู้ใช้ที่ตรงกับเงื่อนไข
          </div>
        )}

        {!isLoading && items.map((user) => (
          <div
            key={user.id}
            className="bg-card rounded-xl border border-white/8 p-4 space-y-2"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="font-ui text-sm text-foreground">
                  {user.display_name ?? "—"}
                </p>
                <p className="font-content text-xs text-muted-foreground mt-0.5">
                  {user.email ?? "—"}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <UserRoleBadge role={user.role} />
                <UserStatusBadge status={user.status} />
              </div>
            </div>
            <p className="font-mono text-xs text-fg-subtle">
              สมัคร {user.created_at ? formatDateTime(user.created_at).slice(0, 10) : "—"}
              {user.status === "soft_deleted" && user.deleted_at && (
                <> · ลบแล้ว ({daysUntilPurge(user.deleted_at)} วัน เหลือ)</>
              )}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate(`/users/${user.id}`)}
              className="w-full border-white/10 text-muted-foreground hover:bg-white/5 h-8 text-xs"
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
              className="flex-1 border-white/10 text-muted-foreground hover:bg-white/5"
            >
              ← ก่อนหน้า
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={goNext}
              disabled={!hasNext}
              className="flex-1 border-white/10 text-muted-foreground hover:bg-white/5"
            >
              ถัดไป →
            </Button>
          </div>
        )}
      </div>

      {/* Sticky action bar — desktop only, slides in when ≥1 selected */}
      {selectedIds.size >= 1 && (
        <div className="hidden md:flex sticky bottom-4 z-20 items-center gap-3 bg-card border border-amber-500/30 rounded-xl px-4 py-3 transition-colors">
          <span className="text-[#F25F2D] font-ui text-sm">⊘</span>
          <span className="font-ui text-sm text-foreground">
            {selectedIds.size} user เลือก
          </span>
          <div className="flex-1" />
          <button
            onClick={() => setShowBulkModal(true)}
            disabled={allSelectedAreElevated}
            title={allSelectedAreElevated ? "ผู้ใช้ที่เลือกทั้งหมดเป็น admin/owner — ไม่สามารถระงับได้" : undefined}
            className={cn(
              "px-4 py-1.5 rounded-lg font-ui text-sm transition-colors",
              allSelectedAreElevated
                ? "bg-amber-600/30 text-amber-300/40 cursor-not-allowed"
                : "bg-amber-600 hover:bg-amber-700 text-white",
            )}
          >
            Suspend ทั้งหมด
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="font-ui text-sm text-muted-foreground hover:text-foreground underline transition-colors"
          >
            ล้างการเลือก
          </button>
        </div>
      )}

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
    </div>
  );
}
