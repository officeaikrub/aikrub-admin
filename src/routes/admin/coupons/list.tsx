/**
 * CouponList — รายการคูปองทั้งหมด (Wave 4 redesign — v2 template)
 *
 * Spec: admin-wireframe-deltas-v2.md §5 + admin-page-template-mockup-b.md
 *
 * Changes from pre-Wave-4:
 *  - PageHeader with 4 StatChips (คูปองทั้งหมด / ใช้งานได้ / หมดอายุ / ถูกยกเลิก)
 *  - TableCard (glass sticky header + solid body) — dense h-12 rows
 *  - StickyBulkActionBar (fixed bottom-6 / bottom-20, glass-shell rounded-full)
 *  - EmptyState, LoadingSkeleton (coupon cellShapes), ErrorState primitives
 *  - Removed: 'สร้างโดย' + 'วันที่สร้าง' columns (move to coupon detail DrawerPanel — later wave)
 *  - Added: 'มูลค่า' (krub_amount) + 'หมดอายุ' (expires_at, nullable) columns per §5
 *  - FORBID-list clean:
 *      • TypeBadge: blue-900/blue-300 + purple-900/purple-300 → token-bound info/neutral
 *      • Success banner: green-900/green-400 → --color-success token
 *      • Revoke buttons: bg-red-600/red-700 → variant="destructive"
 *      • Dropdown items: text-amber-400 / text-red-400 → --color-warning / --color-error tokens
 *      • Inputs/selects: bg-[#0F172A] / focus:border-[#F25F2D] → --color-bg / accent CSS var
 *      • Filter pills: #F25F2D literal → --color-accent token
 *      • CTA header button: inline hex overrides removed, relies on variant="cta"
 *      • Row height: py-3 → h-12 + py-0 (dense spec)
 *      • No row-level onClick (view on row removed — v2 interaction model is dropdown-first)
 *  - MobileCard removed — TableCard horizontal-scroll handles mobile per §3.7
 *  - Stat-chip data: คูปองทั้งหมด wired to data.total — renders immediately.
 *    Other 3 chips (ใช้งานได้/หมดอายุ/ถูกยกเลิก): value=null → StatChip hides itself
 *    (primitive returns null when value===null, so no "—" chip appears).
 *    Backend needs: counts: { active, expired, revoked } in list response to enable them.
 *
 * Preserved intact: CreateCoupon dropdown + modal, bulk-revoke flow + confirm,
 * filter pills, search, cursor pagination, row selection, permission rules.
 */

import { useState, useCallback, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Search,
  Plus,
  Copy,
  MoreHorizontal,
  X,
  Ticket,
} from "lucide-react";
import {
  adminListCoupons,
  adminDisableCoupon,
  adminRevokeCoupon,
  adminBulkRevoke,
  formatDateTime,
  STATUS_LABELS,
  type CouponListParams,
  type CouponType,
  type CouponStatus,
  type RevokeReason,
  type Coupon,
} from "@/lib/api-admin";
import { CreateCouponModal } from "@/components/CreateCouponModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
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

/**
 * Desktop table column count:
 *   [checkbox] [CODE] [สถานะ] [ประเภท] [มูลค่า] [ใช้แล้ว/สูงสุด] [หมดอายุ] [actions] = 8
 *
 * สถานะ moved to col 3 (right after CODE identity anchor) — F-pattern reading order.
 * CODE stays left identity anchor; no avatar in coupons table.
 */
const COL_COUNT = 8;

/**
 * LoadingSkeleton cell shapes — coupon-shaped (no avatar column).
 * Index order: checkbox / code / สถานะ / ประเภท / มูลค่า / ใช้แล้ว/สูงสุด / หมดอายุ / actions
 */
const SKELETON_SHAPES = [
  "checkbox",
  "text-md",
  "text-sm",
  "text-sm",
  "number",
  "number",
  "text-md",
  "action",
] as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Filters {
  coupon_type: CouponType | "";
  status: CouponStatus | "";
  campaign_tag: string;
  q: string;
  limit: number;
}

interface BulkRevokeModalState {
  open: boolean;
  ids: string[];
  codes: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function copyToClipboard(text: string) {
  void navigator.clipboard.writeText(text);
}

/**
 * StatusBadge — dot + label per design-system-v2.md §5.
 * Token-bound colors only — no saturated tailwind classes.
 */
function StatusBadge({ status }: { status: CouponStatus }) {
  const map: Record<CouponStatus, { dot: string; badge: string }> = {
    active:   { dot: "bg-[var(--color-success)]",   badge: "bg-[var(--color-success)]/12   text-[var(--color-success-text)]   border-[var(--color-success)]/20"   },
    disabled: { dot: "bg-[var(--color-warning)]",   badge: "bg-[var(--color-warning)]/12   text-[var(--color-warning-text)]   border-[var(--color-warning)]/20"   },
    revoked:  { dot: "bg-[var(--color-error)]",     badge: "bg-[var(--color-error)]/12     text-[var(--color-error-text)]     border-[var(--color-error)]/20"     },
    used:     { dot: "bg-[var(--color-fg-subtle)]", badge: "bg-[var(--color-fg-subtle)]/12 text-[var(--color-fg-subtle)]     border-[var(--color-fg-subtle)]/20" },
    expired:  { dot: "bg-[var(--color-warning)]",   badge: "bg-[var(--color-warning)]/12   text-[var(--color-warning-text)]   border-[var(--color-warning)]/20"   },
  };
  const s = map[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-ui border",
        s.badge,
      )}
    >
      <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", s.dot)} aria-hidden="true" />
      {STATUS_LABELS[status]}
    </span>
  );
}

/**
 * TypeBadge — paid vs free label.
 * Note: Coupon type is paid/free, not a "% or fixed" discount type.
 * Mind's column header "ประเภทส่วนลด" maps to this paid/free axis.
 * If a true discount-percentage field is added later, this badge can be extended.
 * FORBID-fix: removed blue-900/blue-300 + purple-900/purple-300 → token-bound.
 */
function TypeBadge({ type }: { type: CouponType }) {
  return type === "paid" ? (
    <span className="px-2 py-0.5 rounded bg-[var(--color-info)]/12 text-[var(--color-info-text)] text-xs font-ui">
      จ่าย
    </span>
  ) : (
    <span className="px-2 py-0.5 rounded bg-[var(--color-fg-muted)]/12 text-[var(--color-fg-muted)] text-xs font-ui">
      ฟรี
    </span>
  );
}

// ---------------------------------------------------------------------------
// Revoke reason modal (single row)
// ---------------------------------------------------------------------------

interface RevokeModalState {
  open: boolean;
  coupon: Coupon | null;
}

function RevokeReasonModal({
  state,
  onClose,
  onConfirm,
  loading,
}: {
  state: RevokeModalState;
  onClose: () => void;
  onConfirm: (reason: RevokeReason, note: string) => void;
  loading: boolean;
}) {
  const [reason, setReason] = useState<RevokeReason>("other");
  const [note, setNote] = useState("");

  function handleConfirm() {
    onConfirm(reason, note);
  }

  return (
    <Dialog open={state.open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>ยืนยัน Revoke คูปอง</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="font-mono text-sm text-[var(--color-fg)]">{state.coupon?.code}</p>
          <div>
            <label className="font-ui font-medium text-xs text-[var(--color-fg-muted)] uppercase tracking-wide block mb-1.5">
              เหตุผล *
            </label>
            <select
              aria-label="เหตุผล Revoke คูปอง"
              value={reason}
              onChange={(e) => setReason(e.target.value as RevokeReason)}
              className="w-full bg-[var(--color-bg)] border border-white/10 rounded-lg px-3 py-2.5 font-ui text-sm text-[var(--color-fg)] focus:border-[var(--color-accent)] focus:outline-none"
            >
              <option value="fraud">Fraud</option>
              <option value="duplicate_slip">สลิปซ้ำ</option>
              <option value="refund_request">ขอคืนเงิน</option>
              <option value="other">อื่นๆ</option>
            </select>
          </div>
          <div>
            <label className="font-ui font-medium text-xs text-[var(--color-fg-muted)] uppercase tracking-wide block mb-1.5">
              หมายเหตุ (ไม่บังคับ)
            </label>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="รายละเอียดเพิ่มเติม..."
              className="bg-[var(--color-bg)] border-white/10 text-[var(--color-fg)] focus:border-[var(--color-accent)]"
            />
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" onClick={onClose}>
              ยกเลิก
            </Button>
          </DialogClose>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={loading}
          >
            {loading ? "กำลัง Revoke..." : "Revoke ✕"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Bulk revoke modal
// ---------------------------------------------------------------------------

function BulkRevokeModal({
  state,
  onClose,
  onConfirm,
  loading,
}: {
  state: BulkRevokeModalState;
  onClose: () => void;
  onConfirm: (reason: RevokeReason, note: string) => void;
  loading: boolean;
}) {
  const [reason, setReason] = useState<RevokeReason>("other");
  const [note, setNote] = useState("");

  return (
    <Dialog open={state.open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>⚠ ยืนยัน Revoke คูปอง {state.ids.length} รายการ</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="bg-[var(--color-bg)] rounded-lg p-3 max-h-32 overflow-y-auto space-y-1">
            {state.codes.map((code) => (
              <p key={code} className="font-mono text-xs text-[var(--color-fg-muted)]">{code}</p>
            ))}
          </div>
          <div>
            <label className="font-ui font-medium text-xs text-[var(--color-fg-muted)] uppercase tracking-wide block mb-1.5">
              เหตุผล *
            </label>
            <select
              aria-label="เหตุผล Revoke คูปองหลายรายการ"
              value={reason}
              onChange={(e) => setReason(e.target.value as RevokeReason)}
              className="w-full bg-[var(--color-bg)] border border-white/10 rounded-lg px-3 py-2.5 font-ui text-sm text-[var(--color-fg)] focus:border-[var(--color-accent)] focus:outline-none"
            >
              <option value="fraud">Fraud</option>
              <option value="duplicate_slip">สลิปซ้ำ</option>
              <option value="refund_request">ขอคืนเงิน</option>
              <option value="other">อื่นๆ</option>
            </select>
          </div>
          <div>
            <label className="font-ui font-medium text-xs text-[var(--color-fg-muted)] uppercase tracking-wide block mb-1.5">
              หมายเหตุ (ไม่บังคับ)
            </label>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="รายละเอียดเพิ่มเติม..."
              className="bg-[var(--color-bg)] border-white/10 text-[var(--color-fg)] focus:border-[var(--color-accent)]"
            />
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" onClick={onClose}>
              ยกเลิก
            </Button>
          </DialogClose>
          <Button
            variant="destructive"
            onClick={() => onConfirm(reason, note)}
            disabled={loading}
          >
            {loading ? "กำลัง Revoke..." : "Revoke ✕"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// CouponList page
// ---------------------------------------------------------------------------

export default function CouponList() {
  const location = useLocation();
  const queryClient = useQueryClient();

  // Create coupon modal state
  const [createModalOpen, setCreateModalOpen] = useState(false);

  // Success banner — auto-dismiss 5s
  const [successCode, setSuccessCode] = useState<string | null>(
    (location.state as { successCode?: string } | null)?.successCode ?? null,
  );
  useEffect(() => {
    if (!successCode) return;
    const t = setTimeout(() => setSuccessCode(null), 5000);
    return () => clearTimeout(t);
  }, [successCode]);

  // Filter state
  const [filters, setFilters] = useState<Filters>({
    coupon_type: "",
    status: "",
    campaign_tag: "",
    q: "",
    limit: 20,
  });

  // Cursor stack for prev/next pagination
  const [cursorStack, setCursorStack] = useState<string[]>([]);
  const [currentCursor, setCurrentCursor] = useState<string | undefined>(undefined);

  // Selected row IDs for bulk actions
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Revoke modal (single)
  const [revokeModal, setRevokeModal] = useState<RevokeModalState>({ open: false, coupon: null });

  // Bulk revoke modal
  const [bulkModal, setBulkModal] = useState<BulkRevokeModalState>({ open: false, ids: [], codes: [] });

  // Build query params
  const queryParams: CouponListParams = {
    limit: filters.limit,
    ...(currentCursor ? { cursor: currentCursor } : {}),
    ...(filters.coupon_type ? { coupon_type: filters.coupon_type } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.campaign_tag ? { campaign_tag: filters.campaign_tag } : {}),
    ...(filters.q ? { q: filters.q } : {}),
  };

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["admin", "coupons", queryParams],
    queryFn: () => adminListCoupons(queryParams),
  });

  // Disable mutation
  const disableMutation = useMutation({
    mutationFn: (id: string) => adminDisableCoupon(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "coupons"] });
    },
  });

  // Revoke mutation (single)
  const revokeMutation = useMutation({
    mutationFn: ({ id, reason, note }: { id: string; reason: RevokeReason; note: string }) =>
      adminRevokeCoupon(id, reason, note || undefined),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "coupons"] });
      setRevokeModal({ open: false, coupon: null });
    },
  });

  // Bulk revoke mutation
  const bulkRevokeMutation = useMutation({
    mutationFn: ({ ids, reason, note }: { ids: string[]; reason: RevokeReason; note: string }) =>
      adminBulkRevoke({ ids, reason, note: note || undefined }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "coupons"] });
      setSelectedIds(new Set());
      setBulkModal({ open: false, ids: [], codes: [] });
    },
  });

  // Pagination handlers
  function goNext() {
    if (!data?.next_cursor) return;
    setCursorStack((prev) => [...prev, currentCursor ?? ""]);
    setCurrentCursor(data.next_cursor ?? undefined);
    setSelectedIds(new Set());
  }

  function goPrev() {
    const stack = [...cursorStack];
    const prev = stack.pop();
    setCursorStack(stack);
    setCurrentCursor(prev === "" ? undefined : prev);
    setSelectedIds(new Set());
  }

  // Filter change helpers
  const setTypeFilter = useCallback((t: CouponType | "") => {
    setFilters((f) => ({ ...f, coupon_type: t }));
    setCurrentCursor(undefined);
    setCursorStack([]);
  }, []);

  const setStatusFilter = useCallback((s: CouponStatus | "") => {
    setFilters((f) => ({ ...f, status: s }));
    setCurrentCursor(undefined);
    setCursorStack([]);
  }, []);

  function handleSearchChange(e: React.ChangeEvent<HTMLInputElement>) {
    setFilters((f) => ({ ...f, q: e.target.value }));
    setCurrentCursor(undefined);
    setCursorStack([]);
  }

  function handleLimitChange(e: React.ChangeEvent<HTMLSelectElement>) {
    setFilters((f) => ({ ...f, limit: Number(e.target.value) }));
    setCurrentCursor(undefined);
    setCursorStack([]);
  }

  // Bulk select
  const items = data?.items ?? [];
  const allSelected = items.length > 0 && items.every((c) => selectedIds.has(c.id));

  function toggleSelectAll() {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(items.map((c) => c.id)));
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function openBulkRevoke() {
    const selected = items.filter((c) => selectedIds.has(c.id));
    setBulkModal({
      open: true,
      ids: selected.map((c) => c.id),
      codes: selected.map((c) => c.code),
    });
  }

  // Filter pill definitions
  const TYPE_PILLS: { label: string; value: CouponType | "" }[] = [
    { label: "ทั้งหมด", value: "" },
    { label: "จ่าย", value: "paid" },
    { label: "ฟรี", value: "free" },
  ];

  const STATUS_PILLS: { label: string; value: CouponStatus | "" }[] = [
    { label: "ทุกสถานะ", value: "" },
    { label: "active", value: "active" },
    { label: "ปิดใช้งาน", value: "disabled" },
    { label: "ยกเลิกแล้ว", value: "revoked" },
    { label: "หมดแล้ว", value: "used" },
    { label: "หมดอายุ", value: "expired" },
  ];

  // ---------------------------------------------------------------------------
  // Stat chips — wired from data.counts (Wave B — Cheese now returns counts).
  // null fallback: StatChip hides itself if value===null → no "—" shown during load.
  // ---------------------------------------------------------------------------
  const totalCount: number | null = data?.total ?? null;
  const activeCount: number | null = data?.counts?.active ?? null;
  const expiredCount: number | null = data?.counts?.expired ?? null;
  const revokedCount: number | null = data?.counts?.revoked ?? null;

  // ---------------------------------------------------------------------------
  // Pagination node — rendered in TableCard.pagination slot
  // ---------------------------------------------------------------------------
  const hasPrev = cursorStack.length > 0;
  const hasNext = !!data?.next_cursor;
  const page = cursorStack.length + 1;

  // Pagination — only render when prev or next is available (mirrors users/list pattern)
  const paginationNode = (hasPrev || hasNext) ? (
    <div className="flex items-center justify-between px-4 py-3">
      {/* Limit selector + total */}
      <div className="flex items-center gap-2">
        <span className="font-ui text-xs text-[var(--color-fg-subtle)]">แสดง</span>
        <select
          aria-label="จำนวนรายการต่อหน้า"
          value={filters.limit}
          onChange={handleLimitChange}
          className="bg-[var(--color-bg)] border border-white/10 rounded px-2 py-1 font-ui text-xs text-[var(--color-fg-muted)]"
        >
          <option value={20}>20</option>
          <option value={50}>50</option>
          <option value={100}>100</option>
        </select>
        <span className="font-ui text-xs text-[var(--color-fg-subtle)]">รายการ</span>
        {totalCount !== null && (
          <span className="font-ui text-xs text-[var(--color-fg-subtle)] tabular-nums">
            · รวม {totalCount.toLocaleString()} รายการ
          </span>
        )}
      </div>
      {/* Page indicator + Prev/Next */}
      <div className="flex items-center gap-2">
        <span className="font-ui text-xs text-[var(--color-fg-subtle)] tabular-nums">
          หน้า {page}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={goPrev}
          disabled={!hasPrev}
          className="border-white/10 text-[var(--color-fg-muted)] hover:bg-[var(--color-bg-raised)] h-8"
        >
          ← ก่อนหน้า
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={goNext}
          disabled={!hasNext}
          className="border-white/10 text-[var(--color-fg-muted)] hover:bg-[var(--color-bg-raised)] h-8"
        >
          ถัดไป →
        </Button>
      </div>
    </div>
  ) : null;

  // ---------------------------------------------------------------------------
  // Table head — col order: checkbox / CODE / สถานะ / ประเภท / มูลค่า / ใช้แล้ว/สูงสุด / หมดอายุ / actions
  // ---------------------------------------------------------------------------
  const tableHead = (
    <tr className="h-10">
      {/* Checkbox */}
      <th className="w-10 pl-4 pr-2">
        <input
          type="checkbox"
          checked={allSelected}
          onChange={toggleSelectAll}
          disabled={items.length === 0}
          style={{ accentColor: "var(--color-accent)" }}
          className="w-4 h-4 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
          aria-label="เลือกทั้งหมด"
        />
      </th>
      {/* CODE — left identity anchor */}
      <th className="w-36 px-4 text-left">
        <span className="font-ui font-medium text-xs text-[var(--color-fg-muted)] uppercase tracking-wide">Code</span>
      </th>
      {/* สถานะ — col 3, right after CODE (F-pattern: code+status together) */}
      <th className="w-28 px-4 text-left">
        <span className="font-ui font-medium text-xs text-[var(--color-fg-muted)] uppercase tracking-wide">สถานะ</span>
      </th>
      {/* ประเภท */}
      <th className="w-28 px-4 text-left">
        <span className="font-ui font-medium text-xs text-[var(--color-fg-muted)] uppercase tracking-wide">ประเภท</span>
      </th>
      {/* มูลค่า */}
      <th className="w-24 px-4 text-right">
        <span className="font-ui font-medium text-xs text-[var(--color-fg-muted)] uppercase tracking-wide">มูลค่า</span>
      </th>
      {/* ใช้แล้ว / สูงสุด */}
      <th className="w-28 px-4 text-right">
        <span className="font-ui font-medium text-xs text-[var(--color-fg-muted)] uppercase tracking-wide">ใช้แล้ว&nbsp;/&nbsp;สูงสุด</span>
      </th>
      {/* หมดอายุ */}
      <th className="w-32 px-4 text-left">
        <span className="font-ui font-medium text-xs text-[var(--color-fg-muted)] uppercase tracking-wide">หมดอายุ</span>
      </th>
      {/* Actions */}
      <th className="w-16 px-4 text-right">
        <span className="sr-only">Actions</span>
      </th>
    </tr>
  );

  // ---------------------------------------------------------------------------
  // Table body
  // ---------------------------------------------------------------------------
  const hasFilters = !!(filters.coupon_type || filters.status || filters.q || filters.campaign_tag);

  const tableBody = (
    <>
      {isLoading && (
        <LoadingSkeleton
          colCount={COL_COUNT}
          cellShapes={[...SKELETON_SHAPES]}
        />
      )}

      {isError && (
        <ErrorState
          colSpan={COL_COUNT}
          title="โหลดรายการคูปองไม่สำเร็จ"
          onRetry={() => void refetch()}
        />
      )}

      {!isLoading && !isError && items.length === 0 && (
        <EmptyState
          icon={Ticket}
          colSpan={COL_COUNT}
          title={hasFilters ? "ไม่พบคูปองที่ตรงกับเงื่อนไข" : "ยังไม่มีคูปอง"}
          body={hasFilters ? "ลองปรับหรือล้างตัวกรอง" : undefined}
          action={
            hasFilters ? (
              <button
                onClick={() => {
                  setFilters((f) => ({ ...f, coupon_type: "", status: "", q: "", campaign_tag: "" }));
                  setCurrentCursor(undefined);
                  setCursorStack([]);
                }}
                className="font-ui text-sm text-[var(--color-accent)] hover:underline"
              >
                ล้างตัวกรอง
              </button>
            ) : (
              <Button variant="cta" onClick={() => setCreateModalOpen(true)}>
                เริ่มสร้างคูปองแรก →
              </Button>
            )
          }
        />
      )}

      {!isLoading && !isError && items.map((coupon) => (
        <CouponRow
          key={coupon.id}
          coupon={coupon}
          selected={selectedIds.has(coupon.id)}
          onToggleSelect={() => toggleSelect(coupon.id)}
          onDisable={() => disableMutation.mutate(coupon.id)}
          onRevoke={() => setRevokeModal({ open: true, coupon })}
        />
      ))}
    </>
  );

  return (
    <div className="px-3 py-3 md:px-4 md:py-4 lg:px-6 lg:py-5 space-y-4">

      {/* ── Page header ── */}
      <PageHeader
        title="รายการคูปอง"
        chips={
          <>
            <StatChip label="คูปองทั้งหมด" value={totalCount} dot="neutral" />
            <StatChip label="ใช้งานได้" value={activeCount} dot="success" />
            <StatChip label="หมดอายุ" value={expiredCount} dot="neutral" />
            <StatChip label="ถูกยกเลิก" value={revokedCount} dot="error" />
          </>
        }
        cta={
          /* variant="cta" carries accent + glow per design-system §4 */
          <Button variant="cta" size="sm" className="gap-1.5" onClick={() => setCreateModalOpen(true)}>
            <Plus className="w-4 h-4" aria-hidden="true" />
            สร้างคูปองใหม่
          </Button>
        }
      />

      {/* ── Success banner (auto-dismiss 5s) ── */}
      {successCode && (
        <div className="flex items-center justify-between gap-3 px-4 py-3 bg-[var(--color-success)]/15 border border-[var(--color-success)]/30 rounded-xl">
          <p className="font-ui text-sm text-[var(--color-success-text)]">
            สร้างคูปอง <span className="font-mono font-bold">{successCode}</span> เรียบร้อยแล้ว
          </p>
          <button
            onClick={() => setSuccessCode(null)}
            className="shrink-0 p-1 rounded text-[var(--color-success-text)]/60 hover:text-[var(--color-success-text)] hover:bg-[var(--color-success)]/10 motion-safe:transition-colors duration-150"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ── Filter bar (glass — template §5) ── */}
      <div
        className={cn(
          "flex flex-wrap items-center gap-2 px-4 py-3 mb-4",
          "bg-[rgba(15,23,42,0.70)] backdrop-blur-sm",
          "border border-white/[0.08] rounded-xl",
        )}
      >
        {/* Type pills */}
        {TYPE_PILLS.map((p) => (
          <button
            key={p.value}
            onClick={() => setTypeFilter(p.value)}
            className={cn(
              "px-3 py-1.5 rounded-full font-ui text-xs cursor-pointer motion-safe:transition-colors duration-150",
              filters.coupon_type === p.value
                ? "bg-[var(--color-accent)]/20 text-[var(--color-accent)] border border-[var(--color-accent)]/40"
                : "bg-secondary text-[var(--color-fg-muted)] border border-transparent hover:bg-[var(--color-bg-raised)] hover:text-[var(--color-fg)]",
            )}
          >
            {p.label}
          </button>
        ))}

        <div className="w-px h-5 bg-white/10 mx-1 hidden md:block" aria-hidden="true" />

        {/* Status pills */}
        {STATUS_PILLS.map((p) => (
          <button
            key={p.value}
            onClick={() => setStatusFilter(p.value)}
            className={cn(
              "px-3 py-1.5 rounded-full font-ui text-xs cursor-pointer motion-safe:transition-colors duration-150",
              filters.status === p.value
                ? "bg-[var(--color-accent)]/20 text-[var(--color-accent)] border border-[var(--color-accent)]/40"
                : "bg-secondary text-[var(--color-fg-muted)] border border-transparent hover:bg-[var(--color-bg-raised)] hover:text-[var(--color-fg)]",
            )}
          >
            {p.label}
          </button>
        ))}

        {/* Search */}
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--color-fg-subtle)]" aria-hidden="true" />
          <Input
            value={filters.q}
            onChange={handleSearchChange}
            placeholder="ค้นหาด้วย code..."
            className="pl-8 bg-[var(--color-bg)] border-white/10 text-[var(--color-fg)] placeholder:text-[var(--color-fg-subtle)] focus:border-[var(--color-accent)] h-8 text-sm"
          />
        </div>
      </div>

      {/* ── TableCard (desktop + horizontal-scroll mobile) ── */}
      <TableCard
        head={tableHead}
        body={tableBody}
        pagination={paginationNode}
      />

      {/* ── StickyBulkActionBar ── */}
      <StickyBulkActionBar
        count={selectedIds.size}
        primaryLabel="Revoke ที่เลือก"
        onPrimary={openBulkRevoke}
        onClear={() => setSelectedIds(new Set())}
      />

      {/* ── Revoke modal (single) ── */}
      <RevokeReasonModal
        state={revokeModal}
        onClose={() => setRevokeModal({ open: false, coupon: null })}
        onConfirm={(reason, note) => {
          if (!revokeModal.coupon) return;
          revokeMutation.mutate({ id: revokeModal.coupon.id, reason, note });
        }}
        loading={revokeMutation.isPending}
      />

      {/* ── Bulk revoke modal ── */}
      <BulkRevokeModal
        state={bulkModal}
        onClose={() => setBulkModal({ open: false, ids: [], codes: [] })}
        onConfirm={(reason, note) => bulkRevokeMutation.mutate({ ids: bulkModal.ids, reason, note })}
        loading={bulkRevokeMutation.isPending}
      />

      {/* ── Create coupon modal ── */}
      <CreateCouponModal
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onSuccess={(code) => {
          setCreateModalOpen(false);
          setSuccessCode(code);
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Coupon table row — dense h-12, no row-level onClick (v2 interaction model)
// ---------------------------------------------------------------------------

interface CouponRowProps {
  coupon: Coupon;
  selected: boolean;
  onToggleSelect: () => void;
  onDisable: () => void;
  onRevoke: () => void;
}

function CouponRow({ coupon, selected, onToggleSelect, onDisable, onRevoke }: CouponRowProps) {
  return (
    <tr
      className={cn(
        "h-12 border-t border-white/[0.05] motion-safe:transition-colors duration-150",
        selected
          ? "bg-[rgba(242,95,45,0.12)] border-l-2 border-l-[var(--color-accent)]"
          : "hover:bg-[var(--color-bg-raised)]",
      )}
    >
      {/* Checkbox */}
      <td
        className="w-10 pl-4 pr-2 py-0"
        onClick={(e) => { e.stopPropagation(); onToggleSelect(); }}
      >
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelect}
          style={{ accentColor: "var(--color-accent)" }}
          className="w-4 h-4 cursor-pointer"
          onClick={(e) => e.stopPropagation()}
          aria-label={`เลือกคูปอง ${coupon.code}`}
        />
      </td>

      {/* CODE — monospace 12px, uppercase; left identity anchor */}
      <td className="w-36 px-4 py-0">
        <div className="flex items-center gap-1.5 group">
          <span className="font-mono text-xs text-[var(--color-fg)] uppercase tabular-nums">
            {coupon.code}
          </span>
          <button
            className="p-0.5 rounded text-[var(--color-fg-subtle)] hover:text-[var(--color-accent)] opacity-0 group-hover:opacity-100 motion-safe:transition-opacity duration-150"
            onClick={(e) => { e.stopPropagation(); copyToClipboard(coupon.code); }}
            title="copy code"
            aria-label={`คัดลอก ${coupon.code}`}
          >
            <Copy className="w-3.5 h-3.5" />
          </button>
        </div>
      </td>

      {/* สถานะ — col 3, right after CODE (F-pattern: code+status together) */}
      <td className="w-28 px-4 py-0">
        <StatusBadge status={coupon.status} />
      </td>

      {/* ประเภทส่วนลด — paid/free badge (see TypeBadge note in header) */}
      <td className="w-28 px-4 py-0">
        <TypeBadge type={coupon.coupon_type} />
      </td>

      {/* มูลค่า — right-aligned tabular-nums */}
      <td className="w-24 px-4 py-0 text-right font-mono text-sm text-[var(--color-fg)] tabular-nums">
        {coupon.krub_amount.toLocaleString()}
      </td>

      {/* ใช้แล้ว / สูงสุด — "3 / 10" format per spec §5 */}
      <td className="w-28 px-4 py-0 text-right font-content text-sm text-[var(--color-fg-muted)] tabular-nums">
        {coupon.used_count} / {coupon.max_uses}
      </td>

      {/* หมดอายุ — nullable: show "—" when null */}
      <td className="w-32 px-4 py-0 font-mono text-xs text-[var(--color-fg-muted)] tabular-nums">
        {coupon.expires_at ? formatDateTime(coupon.expires_at) : "—"}
      </td>

      {/* Actions — dropdown, w-16 */}
      <td className="w-16 px-4 py-0 text-right" onClick={(e) => e.stopPropagation()}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="flex items-center justify-center w-8 h-8 rounded-md text-[var(--color-fg-subtle)] hover:text-[var(--color-fg)] hover:bg-white/[0.08] motion-safe:transition-colors duration-150"
              aria-label="เมนู"
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[160px]">
            <DropdownMenuItem
              onClick={() => copyToClipboard(coupon.code)}
              className="font-ui text-sm cursor-pointer"
            >
              <Copy className="w-4 h-4 mr-2" aria-hidden="true" /> copy code
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {coupon.status === "active" && (
              <DropdownMenuItem
                onClick={onDisable}
                className="font-ui text-sm cursor-pointer text-[var(--color-warning-text)] focus:text-[var(--color-warning-text)]"
              >
                ปิดใช้งาน
              </DropdownMenuItem>
            )}
            {(coupon.status === "active" || coupon.status === "disabled") && (
              <DropdownMenuItem
                onClick={onRevoke}
                className="font-ui text-sm cursor-pointer text-[var(--color-error-text)] focus:text-[var(--color-error-text)]"
              >
                ยกเลิก (Revoke)
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </td>
    </tr>
  );
}
