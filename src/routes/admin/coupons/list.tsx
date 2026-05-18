/**
 * CouponList — รายการคูปองทั้งหมด
 *
 * Section B of admin-coupon-wireframes.md
 * - Filter bar (glass): type pills, status pill, campaign tag, search
 * - Desktop table + mobile card list
 * - Cursor-based pagination (Next/Prev stack from API next_cursor)
 * - Bulk select + Bulk revoke (max 100)
 * - Empty / Loading / Error states
 */

import { useState, useCallback, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Search, Plus, Copy, MoreHorizontal, X } from "lucide-react";
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
import { useAdmin } from "@/components/AdminLayout";
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
import { cn } from "@/lib/utils";

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

function StatusBadge({ status }: { status: CouponStatus }) {
  const map: Record<CouponStatus, { dot: string; bg: string; text: string }> = {
    active:   { dot: "bg-green-400",  bg: "bg-green-900/30",  text: "text-green-400"  },
    disabled: { dot: "bg-amber-400",  bg: "bg-amber-900/30",  text: "text-amber-400"  },
    revoked:  { dot: "bg-red-400",    bg: "bg-red-900/30",    text: "text-red-400"    },
    used:     { dot: "bg-slate-400",  bg: "bg-slate-700/60",  text: "text-slate-400"  },
    expired:  { dot: "bg-orange-400", bg: "bg-orange-900/30", text: "text-orange-400" },
  };
  const s = map[status];
  return (
    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-ui", s.bg, s.text)}>
      <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", s.dot)} />
      {STATUS_LABELS[status]}
    </span>
  );
}

function TypeBadge({ type }: { type: CouponType }) {
  return type === "paid" ? (
    <span className="px-2 py-0.5 rounded bg-blue-900/30 text-blue-300 text-xs font-ui">จ่าย</span>
  ) : (
    <span className="px-2 py-0.5 rounded bg-purple-900/30 text-purple-300 text-xs font-ui">ฟรี</span>
  );
}

function copyToClipboard(text: string) {
  void navigator.clipboard.writeText(text);
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
          <p className="font-mono text-sm text-[#F1F5F9]">{state.coupon?.code}</p>
          <div>
            <label className="font-ui text-xs text-[#94A3B8] uppercase tracking-wide block mb-1.5">
              เหตุผล *
            </label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value as RevokeReason)}
              className="w-full bg-[#0F172A] border border-white/10 rounded-lg px-3 py-2.5 font-ui text-sm text-[#F1F5F9] focus:border-[#F25F2D] focus:outline-none"
            >
              <option value="fraud">Fraud</option>
              <option value="duplicate_slip">สลิปซ้ำ</option>
              <option value="refund_request">ขอคืนเงิน</option>
              <option value="other">อื่นๆ</option>
            </select>
          </div>
          <div>
            <label className="font-ui text-xs text-[#94A3B8] uppercase tracking-wide block mb-1.5">
              หมายเหตุ (ไม่บังคับ)
            </label>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="รายละเอียดเพิ่มเติม..."
              className="bg-[#0F172A] border-white/10 text-[#F1F5F9] focus:border-[#F25F2D]"
            />
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" className="border-white/20 text-[#94A3B8] hover:bg-white/5" onClick={onClose}>
              ยกเลิก
            </Button>
          </DialogClose>
          <Button
            onClick={handleConfirm}
            disabled={loading}
            className="bg-red-600 hover:bg-red-700 text-white"
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
          <div className="bg-[#0F172A] rounded-lg p-3 max-h-32 overflow-y-auto space-y-1">
            {state.codes.map((code) => (
              <p key={code} className="font-mono text-xs text-[#94A3B8]">{code}</p>
            ))}
          </div>
          <div>
            <label className="font-ui text-xs text-[#94A3B8] uppercase tracking-wide block mb-1.5">
              เหตุผล *
            </label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value as RevokeReason)}
              className="w-full bg-[#0F172A] border border-white/10 rounded-lg px-3 py-2.5 font-ui text-sm text-[#F1F5F9] focus:border-[#F25F2D] focus:outline-none"
            >
              <option value="fraud">Fraud</option>
              <option value="duplicate_slip">สลิปซ้ำ</option>
              <option value="refund_request">ขอคืนเงิน</option>
              <option value="other">อื่นๆ</option>
            </select>
          </div>
          <div>
            <label className="font-ui text-xs text-[#94A3B8] uppercase tracking-wide block mb-1.5">
              หมายเหตุ (ไม่บังคับ)
            </label>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="รายละเอียดเพิ่มเติม..."
              className="bg-[#0F172A] border-white/10 text-[#F1F5F9] focus:border-[#F25F2D]"
            />
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" className="border-white/20 text-[#94A3B8] hover:bg-white/5" onClick={onClose}>
              ยกเลิก
            </Button>
          </DialogClose>
          <Button
            onClick={() => onConfirm(reason, note)}
            disabled={loading}
            className="bg-red-600 hover:bg-red-700 text-white"
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
  const navigate = useNavigate();
  const location = useLocation();
  const { role } = useAdmin();
  const queryClient = useQueryClient();

  // Create coupon modal state
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createModalType, setCreateModalType] = useState<"paid" | "free">("paid");

  function openCreateModal(type: "paid" | "free") {
    setCreateModalType(type);
    setCreateModalOpen(true);
  }

  // Success banner — from modal onSuccess or from location state (legacy)
  const [successCode, setSuccessCode] = useState<string | null>(
    (location.state as { successCode?: string } | null)?.successCode ?? null
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
    setBulkModal({ open: true, ids: selected.map((c) => c.id), codes: selected.map((c) => c.code) });
  }

  // Type pill filter list
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

  return (
    <div className="px-4 py-6 md:px-6 md:py-8 space-y-4">
      {/* ── Page header ── */}
      <div className="flex items-center justify-between">
        <h1 className="font-display text-xl font-bold text-[#F1F5F9]">รายการคูปอง</h1>

        {/* Create dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button className="bg-[#F25F2D] hover:bg-[#C7461A] text-white h-10 gap-2">
              <Plus className="w-4 h-4" />
              สร้างคูปองใหม่
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => openCreateModal("paid")}>
              คูปองแบบจ่ายเงิน
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => { if (role === "owner") openCreateModal("free"); }}
              className={cn(role !== "owner" && "opacity-40 cursor-not-allowed")}
            >
              คูปองแบบฟรี {role !== "owner" && "(owner เท่านั้น)"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* ── Success banner (auto-dismiss 5s) ── */}
      {successCode && (
        <div className="flex items-center justify-between gap-3 px-4 py-3 bg-green-900/30 border border-green-500/30 rounded-xl">
          <p className="font-ui text-sm text-green-400">
            สร้างคูปอง <span className="font-mono font-bold">{successCode}</span> เรียบร้อยแล้ว
          </p>
          <button
            onClick={() => setSuccessCode(null)}
            className="shrink-0 p-1 rounded text-green-400/60 hover:text-green-400 hover:bg-green-900/40 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ── Filter bar (glass) ── */}
      <div className="flex flex-wrap items-center gap-2 p-3 bg-slate-900/70 backdrop-blur-sm rounded-xl border border-white/8">
        {/* Type pills */}
        {TYPE_PILLS.map((p) => (
          <button
            key={p.value}
            onClick={() => setTypeFilter(p.value)}
            className={cn(
              "px-3 py-1.5 rounded-full font-ui text-xs cursor-pointer transition-colors",
              filters.coupon_type === p.value
                ? "bg-[#F25F2D]/20 text-[#F25F2D] border border-[#F25F2D]/40"
                : "bg-[#334155] text-[#94A3B8] hover:bg-[#475569] hover:text-[#F1F5F9]"
            )}
          >
            {p.label}
          </button>
        ))}

        <div className="w-px h-5 bg-white/10 mx-1 hidden md:block" />

        {/* Status pills */}
        {STATUS_PILLS.map((p) => (
          <button
            key={p.value}
            onClick={() => setStatusFilter(p.value)}
            className={cn(
              "px-3 py-1.5 rounded-full font-ui text-xs cursor-pointer transition-colors",
              filters.status === p.value
                ? "bg-[#F25F2D]/20 text-[#F25F2D] border border-[#F25F2D]/40"
                : "bg-[#334155] text-[#94A3B8] hover:bg-[#475569] hover:text-[#F1F5F9]"
            )}
          >
            {p.label}
          </button>
        ))}

        {/* Search */}
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#475569]" />
          <Input
            value={filters.q}
            onChange={handleSearchChange}
            placeholder="ค้นหาด้วย code..."
            className="pl-8 bg-[#0F172A] border-white/10 text-[#F1F5F9] placeholder:text-[#475569] focus:border-[#F25F2D] h-8 text-sm"
          />
        </div>
      </div>

      {/* ── Bulk actions bar ── */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 px-4 py-2.5 bg-slate-900/95 backdrop-blur-md border border-white/10 rounded-full shadow-2xl whitespace-nowrap">
          <span className="font-ui text-sm text-[#F1F5F9]">เลือกแล้ว {selectedIds.size} รายการ</span>
          <Button
            size="sm"
            onClick={openBulkRevoke}
            className="bg-red-600 hover:bg-red-700 text-white h-8"
          >
            Revoke ที่เลือก
          </Button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="flex items-center justify-center w-7 h-7 rounded-full hover:bg-white/10 text-[#94A3B8] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ── Table / Cards ── */}
      {isLoading && <LoadingSkeleton />}

      {isError && (
        <div className="rounded-xl border border-red-500/30 bg-red-900/20 p-4 flex items-center justify-between">
          <p className="font-ui text-sm text-red-400">โหลดข้อมูลล้มเหลว</p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void refetch()}
            className="border-red-500/30 text-red-400 hover:bg-red-900/20"
          >
            ลองใหม่
          </Button>
        </div>
      )}

      {!isLoading && !isError && items.length === 0 && (
        <div className="rounded-xl border border-white/8 bg-[#1E293B] py-16 flex flex-col items-center gap-4">
          <p className="font-display text-lg text-[#475569]">ยังไม่มีคูปอง</p>
          <Button
            onClick={() => openCreateModal("paid")}
            className="bg-[#F25F2D] hover:bg-[#C7461A] text-white"
          >
            เริ่มสร้างคูปองแรก →
          </Button>
        </div>
      )}

      {/* Desktop table */}
      {!isLoading && !isError && items.length > 0 && (
        <>
          <div className="hidden md:block bg-[#1E293B] rounded-xl overflow-hidden border border-white/8">
            <table className="w-full">
              <thead>
                <tr className="bg-[#0F172A]/60 backdrop-blur-sm sticky top-0">
                  <th className="px-4 py-3 w-10">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleSelectAll}
                      className="w-4 h-4 rounded border-white/20 bg-[#0F172A] accent-[#F25F2D]"
                    />
                  </th>
                  <th className="px-4 py-3 font-ui text-xs text-[#94A3B8] uppercase tracking-wide text-left">Code</th>
                  <th className="px-4 py-3 font-ui text-xs text-[#94A3B8] uppercase tracking-wide text-left">ประเภท</th>
                  <th className="px-4 py-3 font-ui text-xs text-[#94A3B8] uppercase tracking-wide text-right">krub</th>
                  <th className="px-4 py-3 font-ui text-xs text-[#94A3B8] uppercase tracking-wide text-right">ใช้/สูงสุด</th>
                  <th className="px-4 py-3 font-ui text-xs text-[#94A3B8] uppercase tracking-wide text-left">สถานะ</th>
                  <th className="px-4 py-3 font-ui text-xs text-[#94A3B8] uppercase tracking-wide text-left">สร้างโดย</th>
                  <th className="px-4 py-3 font-ui text-xs text-[#94A3B8] uppercase tracking-wide text-left">วันที่สร้าง</th>
                  <th className="px-4 py-3 w-10" />
                </tr>
              </thead>
              <tbody>
                {items.map((coupon) => (
                  <DesktopRow
                    key={coupon.id}
                    coupon={coupon}
                    selected={selectedIds.has(coupon.id)}
                    onToggleSelect={() => toggleSelect(coupon.id)}
                    onView={() => navigate(`/coupons/${coupon.id}`)}
                    onDisable={() => disableMutation.mutate(coupon.id)}
                    onRevoke={() => setRevokeModal({ open: true, coupon })}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {items.map((coupon) => (
              <MobileCard
                key={coupon.id}
                coupon={coupon}
                onView={() => navigate(`/coupons/${coupon.id}`)}
                onRevoke={() => setRevokeModal({ open: true, coupon })}
              />
            ))}
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between mt-4 px-2">
            <div className="flex items-center gap-2">
              <span className="font-ui text-xs text-[#475569]">แสดง</span>
              <select
                value={filters.limit}
                onChange={handleLimitChange}
                className="bg-[#0F172A] border border-white/10 rounded px-2 py-1 font-ui text-xs text-[#94A3B8]"
              >
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
              <span className="font-ui text-xs text-[#475569]">รายการ</span>
            </div>
            <div className="flex items-center gap-2">
              {cursorStack.length > 0 && (
                <Button size="sm" variant="outline" onClick={goPrev} className="border-white/20 text-[#94A3B8] hover:bg-white/5 h-8 text-xs">
                  ← ก่อนหน้า
                </Button>
              )}
              {data?.next_cursor && (
                <Button size="sm" variant="outline" onClick={goNext} className="border-white/20 text-[#94A3B8] hover:bg-white/5 h-8 text-xs">
                  ถัดไป →
                </Button>
              )}
              {data?.total != null && (
                <span className="font-ui text-xs text-[#475569]">รวม {data.total} รายการ</span>
              )}
            </div>
          </div>
        </>
      )}

      {/* Revoke modal (single) */}
      <RevokeReasonModal
        state={revokeModal}
        onClose={() => setRevokeModal({ open: false, coupon: null })}
        onConfirm={(reason, note) => {
          if (!revokeModal.coupon) return;
          revokeMutation.mutate({ id: revokeModal.coupon.id, reason, note });
        }}
        loading={revokeMutation.isPending}
      />

      {/* Bulk revoke modal */}
      <BulkRevokeModal
        state={bulkModal}
        onClose={() => setBulkModal({ open: false, ids: [], codes: [] })}
        onConfirm={(reason, note) => bulkRevokeMutation.mutate({ ids: bulkModal.ids, reason, note })}
        loading={bulkRevokeMutation.isPending}
      />

      {/* Create coupon modal (Wave 4.3 pivot) */}
      <CreateCouponModal
        open={createModalOpen}
        initialType={createModalType}
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
// Desktop table row
// ---------------------------------------------------------------------------

interface DesktopRowProps {
  coupon: Coupon;
  selected: boolean;
  onToggleSelect: () => void;
  onView: () => void;
  onDisable: () => void;
  onRevoke: () => void;
}

function DesktopRow({ coupon, selected, onToggleSelect, onView, onDisable, onRevoke }: DesktopRowProps) {
  return (
    <tr
      className={cn(
        "border-t border-white/5 hover:bg-white/5 transition-colors group cursor-pointer",
        selected && "bg-[#F25F2D]/5"
      )}
      onClick={onView}
    >
      <td className="px-4 py-3" onClick={(e) => { e.stopPropagation(); onToggleSelect(); }}>
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelect}
          className="w-4 h-4 rounded border-white/20 bg-[#0F172A] accent-[#F25F2D]"
          onClick={(e) => e.stopPropagation()}
        />
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-xs text-[#F1F5F9] tabular-nums">{coupon.code}</span>
          <button
            className="p-0.5 rounded text-[#475569] hover:text-[#F25F2D] opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={(e) => { e.stopPropagation(); copyToClipboard(coupon.code); }}
            title="copy code"
          >
            <Copy className="w-3.5 h-3.5" />
          </button>
        </div>
      </td>
      <td className="px-4 py-3"><TypeBadge type={coupon.coupon_type} /></td>
      <td className="px-4 py-3 text-right font-mono text-sm text-[#F1F5F9] tabular-nums">{coupon.krub_amount}</td>
      <td className="px-4 py-3 text-right font-content text-sm text-[#94A3B8] tabular-nums">{coupon.used_count}/{coupon.max_uses}</td>
      <td className="px-4 py-3"><StatusBadge status={coupon.status} /></td>
      <td className="px-4 py-3 font-content text-sm text-[#94A3B8]">{coupon.created_by}</td>
      <td className="px-4 py-3 font-mono text-xs text-[#475569] tabular-nums">{formatDateTime(coupon.created_at)}</td>
      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center justify-center w-8 h-8 rounded-md text-[#475569] hover:text-[#F1F5F9] hover:bg-white/8 transition-colors">
              <MoreHorizontal className="w-4 h-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[160px]">
            <DropdownMenuItem onClick={() => copyToClipboard(coupon.code)}>
              <Copy className="w-4 h-4 mr-2" /> copy code
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onView}>ดูรายละเอียด</DropdownMenuItem>
            <DropdownMenuSeparator />
            {coupon.status === "active" && (
              <DropdownMenuItem onClick={onDisable} className="text-amber-400">
                ปิดใช้งาน
              </DropdownMenuItem>
            )}
            {(coupon.status === "active" || coupon.status === "disabled") && (
              <DropdownMenuItem onClick={onRevoke} className="text-red-400">
                ยกเลิก (Revoke)
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Mobile card
// ---------------------------------------------------------------------------

function MobileCard({ coupon, onView, onRevoke }: { coupon: Coupon; onView: () => void; onRevoke: () => void }) {
  return (
    <div className="bg-[#1E293B] rounded-xl border border-white/8 p-4 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <StatusBadge status={coupon.status} />
          <TypeBadge type={coupon.coupon_type} />
        </div>
        <button
          onClick={() => copyToClipboard(coupon.code)}
          className="shrink-0 p-1.5 rounded-lg text-[#475569] hover:text-[#F25F2D] hover:bg-white/5 transition-colors"
        >
          <Copy className="w-4 h-4" />
        </button>
      </div>
      <p className="font-mono text-sm text-[#F1F5F9] tabular-nums">{coupon.code}</p>
      <p className="font-content text-sm text-[#94A3B8]">
        {coupon.krub_amount} krub · ใช้แล้ว {coupon.used_count}/{coupon.max_uses}
      </p>
      <p className="font-mono text-xs text-[#475569] tabular-nums">{formatDateTime(coupon.created_at)} · {coupon.created_by}</p>
      <div className="flex items-center gap-2 pt-1">
        <Button size="sm" variant="outline" onClick={onView} className="flex-1 border-white/20 text-[#94A3B8] hover:bg-white/5 h-9">
          ดูรายละเอียด
        </Button>
        {(coupon.status === "active" || coupon.status === "disabled") && (
          <Button size="sm" onClick={onRevoke} className="bg-red-600/20 border border-red-500/30 text-red-400 hover:bg-red-900/40 h-9">
            Revoke
          </Button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function LoadingSkeleton() {
  return (
    <div className="bg-[#1E293B] rounded-xl border border-white/8 overflow-hidden">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="border-t border-white/5 first:border-t-0 px-4 py-3 flex items-center gap-4">
          <div className="h-4 w-4 rounded bg-white/5 animate-pulse shrink-0" />
          <div className="h-4 rounded bg-white/5 animate-pulse" style={{ width: `${100 + (i * 30) % 80}px` }} />
          <div className="h-4 w-10 rounded bg-white/5 animate-pulse" />
          <div className="h-4 w-16 rounded bg-white/5 animate-pulse ml-auto" />
          <div className="h-4 w-20 rounded bg-white/5 animate-pulse" />
          <div className="h-4 w-24 rounded bg-white/5 animate-pulse" />
        </div>
      ))}
    </div>
  );
}
