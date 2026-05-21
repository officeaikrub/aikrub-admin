/**
 * CouponDetail — รายละเอียดคูปอง + ประวัติ Redeem + per-row clawback
 *
 * Section C of admin-coupon-wireframes.md
 * - PII access transparency banner (Q-OQ-05)
 * - All 18 coupon columns displayed
 * - Slip image with lightbox (click to enlarge)
 * - Redemption history table (newest first, max 50) with per-row clawback actions
 * - Action buttons: Disable / Revoke (modal)
 *   Clawback moved to per-row in the redemption table
 *
 * Uses useAdmin() for role check — loaded inside AdminLayout context.
 */

import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Copy, X, ExternalLink } from "lucide-react";
import {
  adminGetCoupon,
  adminDisableCoupon,
  adminRevokeCoupon,
  formatDateTime,
  CHANNEL_LABELS,
  PURPOSE_LABELS,
  STATUS_LABELS,
  type CouponStatus,
  type CouponType,
  type RevokeReason,
  type Coupon,
  type RedemptionRecord,
} from "@/lib/api-admin";
import { ClawbackRowModal } from "@/components/ClawbackRowModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
// Sub-components: badges
// ---------------------------------------------------------------------------

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
    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-ui border", s.badge)}>
      <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", s.dot)} />
      {STATUS_LABELS[status]}
    </span>
  );
}

function TypeBadge({ type }: { type: CouponType }) {
  return type === "paid" ? (
    <span className="px-2 py-0.5 rounded bg-[var(--color-info)]/12 text-[var(--color-info-text)] text-xs font-ui">จ่าย</span>
  ) : (
    <span className="px-2 py-0.5 rounded bg-[var(--color-fg-muted)]/12 text-[var(--color-fg-muted)] text-xs font-ui">ฟรี</span>
  );
}

// ---------------------------------------------------------------------------
// Detail row helper
// ---------------------------------------------------------------------------

function DetailRow({ label, value, mono = false }: { label: string; value: string | null | undefined; mono?: boolean }) {
  return (
    <div className="flex justify-between items-start gap-4 py-2 border-b border-white/5 last:border-0">
      <span className="font-ui text-xs text-muted-foreground shrink-0">{label}</span>
      <span className={cn("text-sm text-foreground text-right", mono ? "font-mono tabular-nums" : "font-content")}>
        {value || "—"}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Copy helper
// ---------------------------------------------------------------------------

function copyToClipboard(text: string) {
  void navigator.clipboard.writeText(text);
}

// ---------------------------------------------------------------------------
// Revoke reason modal
// ---------------------------------------------------------------------------

interface RevokeModalState {
  open: boolean;
}

function RevokeModal({
  coupon,
  state,
  onClose,
  onConfirm,
  loading,
}: {
  coupon: Coupon;
  state: RevokeModalState;
  onClose: () => void;
  onConfirm: (reason: RevokeReason, note: string) => void;
  loading: boolean;
}) {
  const [reason, setReason] = useState<RevokeReason>("other");
  const [note, setNote] = useState("");

  return (
    <Dialog open={state.open} onOpenChange={(o) => { if (!o && !loading) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>ยืนยัน Revoke คูปอง</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="font-mono text-sm text-foreground">{coupon.code}</p>
          <div>
            <label className="font-ui font-medium text-xs text-muted-foreground uppercase tracking-wide block mb-1.5">
              หมวดหมู่เหตุผล *
            </label>
            <select
              aria-label="หมวดหมู่เหตุผล Revoke"
              value={reason}
              onChange={(e) => setReason(e.target.value as RevokeReason)}
              className="w-full bg-[var(--color-bg)] border border-white/10 rounded-lg px-3 py-2.5 font-ui text-sm text-foreground focus:border-[var(--color-accent)] focus:outline-none"
            >
              <option value="fraud">Fraud</option>
              <option value="duplicate_slip">สลิปซ้ำ</option>
              <option value="refund_request">ขอคืนเงิน</option>
              <option value="other">อื่นๆ</option>
            </select>
          </div>
          <div>
            <label className="font-ui font-medium text-xs text-muted-foreground uppercase tracking-wide block mb-1.5">
              หมายเหตุ (ไม่บังคับ)
            </label>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="รายละเอียดเพิ่มเติม..."
              className="bg-[var(--color-bg)] border-white/10 text-foreground focus:border-[var(--color-accent)]"
            />
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button
              variant="outline"
              className="border-white/20 text-muted-foreground hover:bg-white/5"
              disabled={loading}
              onClick={onClose}
            >
              ยกเลิก
            </Button>
          </DialogClose>
          <Button
            onClick={() => onConfirm(reason, note)}
            disabled={loading}
            className="border border-[var(--color-error)] text-[var(--color-error-text)] bg-transparent hover:bg-[var(--color-error)]/8"
          >
            {loading ? "กำลัง Revoke..." : "Revoke ✕"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Slip lightbox
// ---------------------------------------------------------------------------

function SlipLightbox({ url, onClose }: { url: string; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center"
      onClick={onClose}
    >
      <button
        className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-colors"
        onClick={onClose}
      >
        <X className="w-5 h-5" />
      </button>
      <img
        src={url}
        alt="slip enlarged"
        className="max-w-[90vw] max-h-[90vh] rounded-lg"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Redemption history table (with per-row clawback actions)
// ---------------------------------------------------------------------------

interface RedemptionTableProps {
  couponId: string;
  couponStatus: CouponStatus;
  records: RedemptionRecord[];
  onClawbackSuccess: (redemptionId: string, clawedBackAt: string) => void;
}

interface ClawbackModalTarget {
  redemptionId: string;
  userEmail: string;
  krubAmount: number;
}

function formatThaiDate(iso: string): string {
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
}

function RedemptionTable({ couponId, couponStatus, records, onClawbackSuccess }: RedemptionTableProps) {
  const [clawbackTarget, setClawbackTarget] = useState<ClawbackModalTarget | null>(null);

  if (records.length === 0) {
    return (
      <p className="font-content text-sm text-fg-subtle py-4 text-center">ยังไม่มีการ Redeem</p>
    );
  }

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <th className="px-3 py-2 font-ui font-medium text-xs text-muted-foreground uppercase tracking-wide text-left">User</th>
              <th className="px-3 py-2 font-ui font-medium text-xs text-muted-foreground uppercase tracking-wide text-left">วันที่ใช้</th>
              <th className="px-3 py-2 font-ui font-medium text-xs text-muted-foreground uppercase tracking-wide text-right">Krub</th>
              <th className="px-3 py-2 font-ui font-medium text-xs text-muted-foreground uppercase tracking-wide text-right">Action</th>
              <th className="px-3 py-2 w-8" />
            </tr>
          </thead>
          <tbody>
            {records.map((r) => (
              <tr key={r.id} className="border-t border-white/5">
                <td className="px-3 py-2 font-content text-sm text-muted-foreground max-w-[200px] truncate" title={r.user_email}>
                  {r.user_email}
                </td>
                <td className="px-3 py-2 font-mono text-xs text-fg-subtle tabular-nums whitespace-nowrap">
                  {formatDateTime(r.redeemed_at)}
                </td>
                <td className="px-3 py-2 text-right font-mono text-sm text-foreground tabular-nums">
                  {r.krub_credited}
                </td>
                <td className="px-3 py-2 text-right">
                  {couponStatus === "revoked" ? (
                    r.status === "clawed_back" ? (
                      <span className="font-ui text-xs text-fg-subtle cursor-default">
                        ✓ คืนแล้ว {r.clawed_back_at ? formatThaiDate(r.clawed_back_at) : ""}
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setClawbackTarget({
                          redemptionId: r.id,
                          userEmail: r.user_email,
                          krubAmount: r.krub_credited,
                        })}
                        className="border border-[var(--color-error)]/40 text-[var(--color-error-text)] hover:bg-[var(--color-error)]/8 rounded-lg px-3 py-1 text-xs font-ui transition-colors"
                      >
                        ↩ ดึงคืน
                      </button>
                    )
                  ) : (
                    <span className="text-fg-subtle">—</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <Link
                    to={`/users/${r.user_id}`}
                    className="flex items-center justify-center w-7 h-7 rounded text-fg-subtle hover:text-accent transition-colors"
                    title="ดูผู้ใช้"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="px-3 py-2 font-ui text-xs text-fg-subtle text-right">
          รวม {records.length} รายการ
        </p>
      </div>

      {clawbackTarget && (
        <ClawbackRowModal
          open={clawbackTarget !== null}
          couponId={couponId}
          redemptionId={clawbackTarget.redemptionId}
          userEmail={clawbackTarget.userEmail}
          krubAmount={clawbackTarget.krubAmount}
          onClose={() => setClawbackTarget(null)}
          onSuccess={(clawedBackAt) => {
            onClawbackSuccess(clawbackTarget.redemptionId, clawedBackAt);
            setClawbackTarget(null);
          }}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// CouponDetail page
// ---------------------------------------------------------------------------

export default function CouponDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [revokeModal, setRevokeModal] = useState<RevokeModalState>({ open: false });
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["admin", "coupon", id],
    queryFn: () => adminGetCoupon(id!),
    enabled: !!id,
  });

  const disableMutation = useMutation({
    mutationFn: () => adminDisableCoupon(id!),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "coupon", id] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "coupons"] });
    },
  });

  const revokeMutation = useMutation({
    mutationFn: ({ reason, note }: { reason: RevokeReason; note: string }) =>
      adminRevokeCoupon(id!, reason, note || undefined),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "coupon", id] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "coupons"] });
      setRevokeModal({ open: false });
    },
  });

  function handleClawbackSuccess(redemptionId: string, clawedBackAt: string) {
    queryClient.setQueryData(
      ["admin", "coupon", id],
      (old: typeof data) => {
        if (!old) return old;
        return {
          ...old,
          redemptions: old.redemptions.map((r) =>
            r.id === redemptionId
              ? { ...r, status: "clawed_back" as const, clawed_back_at: clawedBackAt }
              : r,
          ),
        };
      },
    );
  }

  if (isLoading) {
    return (
      <div className="px-4 py-6 md:px-6 md:py-8 space-y-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-8 rounded-lg bg-white/5 animate-pulse" style={{ width: `${60 + (i * 15) % 40}%` }} />
        ))}
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="px-4 py-6 md:px-6 md:py-8">
        <div className="rounded-xl border border-[var(--color-error)]/30 bg-[var(--color-error)]/12 p-4 flex items-center justify-between">
          <p className="font-ui text-sm text-[var(--color-error-text)]">โหลดข้อมูลล้มเหลว</p>
          <Button size="sm" variant="outline" onClick={() => void refetch()} className="border-[var(--color-error)]/30 text-[var(--color-error-text)] hover:bg-[var(--color-error)]/8">
            ลองใหม่
          </Button>
        </div>
      </div>
    );
  }

  const { coupon } = data;

  return (
    <div className="px-4 py-6 md:px-6 md:py-8 space-y-6">
      {/* PII access transparency banner (Q-OQ-05) */}
      <div className="flex items-center gap-2 p-3 rounded-lg bg-card border border-white/8">
        <span className="text-muted-foreground text-sm">🔒</span>
        <p className="font-content text-xs text-muted-foreground">
          การเข้าถึงนี้ถูกบันทึกแล้ว — ข้อมูลนี้มี PII บันทึกไว้ใน audit log
        </p>
      </div>

      {/* Back + heading */}
      <div>
        <button
          onClick={() => navigate("/coupons")}
          className="font-ui text-sm text-muted-foreground hover:text-foreground mb-2 flex items-center gap-1 transition-colors"
        >
          ← รายการคูปอง
        </button>
        <h1 className="font-display text-xl text-foreground">รายละเอียดคูปอง</h1>
      </div>

      {/* Hero: code + badges */}
      <div className="bg-card rounded-xl border border-white/8 p-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="font-mono text-lg text-foreground tabular-nums font-bold">{coupon.code}</span>
              <button
                onClick={() => copyToClipboard(coupon.code)}
                className="p-1 rounded text-fg-subtle hover:text-accent transition-colors"
                title="copy code"
              >
                <Copy className="w-4 h-4" />
              </button>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <StatusBadge status={coupon.status} />
              <TypeBadge type={coupon.coupon_type} />
              <span className="font-mono text-sm text-muted-foreground tabular-nums">{coupon.krub_amount} krub</span>
              <span className="font-content text-sm text-muted-foreground">ใช้แล้ว {coupon.used_count}/{coupon.max_uses}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main info + slip evidence */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* ข้อมูลหลัก */}
        <div className="bg-card rounded-xl border border-white/8 p-4">
          <h2 className="font-ui font-medium text-xs text-muted-foreground uppercase tracking-wide mb-3">ข้อมูลหลัก</h2>
          <div>
            <DetailRow label="ID" value={`${coupon.id.slice(0, 8)}...${coupon.id.slice(-4)}`} mono />
            <DetailRow label="สร้างเมื่อ" value={formatDateTime(coupon.created_at)} mono />
            <DetailRow label="สร้างโดย" value={coupon.created_by} />
            <DetailRow label="Channel" value={coupon.channel ? CHANNEL_LABELS[coupon.channel] : null} />
            <DetailRow label="Contact" value={coupon.contact_info} />
            <DetailRow
              label="หมดอายุ"
              value={coupon.expires_at ? formatDateTime(coupon.expires_at) : "ไม่มีกำหนด"}
              mono
            />
            <DetailRow label="Note" value={coupon.note} />
            <DetailRow label="Campaign" value={coupon.campaign_tag} />
            <DetailRow
              label="วัตถุประสงค์"
              value={coupon.purpose ? PURPOSE_LABELS[coupon.purpose] : null}
            />
          </div>
        </div>

        {/* หลักฐานการชำระเงิน (paid only) */}
        <div className="bg-card rounded-xl border border-white/8 p-4">
          <h2 className="font-ui font-medium text-xs text-muted-foreground uppercase tracking-wide mb-3">หลักฐานการชำระเงิน</h2>
          {coupon.coupon_type === "paid" ? (
            <div className="space-y-3">
              {coupon.slip_image_url && (
                <button
                  onClick={() => setLightboxUrl(coupon.slip_image_url!)}
                  className="w-full aspect-video rounded-xl overflow-hidden border border-white/10 relative group"
                >
                  <img
                    src={coupon.slip_image_url}
                    alt="slip"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 flex items-center justify-center transition-colors">
                    <span className="font-ui text-sm text-white opacity-0 group-hover:opacity-100 transition-opacity">
                      คลิกเพื่อขยาย
                    </span>
                  </div>
                </button>
              )}
              {!coupon.slip_image_url && (
                <div className="w-full aspect-video rounded-xl border border-white/8 bg-[var(--color-bg)] flex items-center justify-center">
                  <p className="font-content text-sm text-fg-subtle">ไม่มีรูป Slip</p>
                </div>
              )}
              <DetailRow label="Slip Ref" value={coupon.slip_ref} mono />
              <DetailRow label="ยอด THB" value={coupon.payment_thb != null ? `${coupon.payment_thb} THB` : null} mono />
            </div>
          ) : (
            <p className="font-content text-sm text-fg-subtle py-4 text-center">คูปองฟรี — ไม่มีหลักฐานการชำระเงิน</p>
          )}
        </div>
      </div>

      {/* Redemption history with per-row clawback */}
      {data.redemptions.length > 0 && (
        <div className="bg-card rounded-xl border border-white/8 overflow-hidden">
          <div className="px-4 pt-4 pb-2">
            <h2 className="font-ui font-medium text-xs text-muted-foreground uppercase tracking-wide">ประวัติการใช้คูปอง</h2>
          </div>
          <RedemptionTable
            couponId={coupon.id}
            couponStatus={coupon.status}
            records={data.redemptions}
            onClawbackSuccess={handleClawbackSuccess}
          />
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-3 flex-wrap pt-2">
        {coupon.status === "active" && (
          <Button
            variant="outline"
            onClick={() => disableMutation.mutate()}
            disabled={disableMutation.isPending}
            className="border-[var(--color-warning)]/30 text-[var(--color-warning-text)] hover:bg-[var(--color-warning)]/8"
          >
            {disableMutation.isPending ? "กำลังปิด..." : "ปิดใช้งาน"}
          </Button>
        )}

        {(coupon.status === "active" || coupon.status === "disabled") && (
          <Button
            variant="outline"
            onClick={() => setRevokeModal({ open: true })}
            className="border-[var(--color-error)]/30 text-[var(--color-error-text)] hover:bg-[var(--color-error)]/8"
          >
            ยกเลิก (Revoke)
          </Button>
        )}
      </div>

      {/* Revoke modal */}
      <RevokeModal
        coupon={coupon}
        state={revokeModal}
        onClose={() => setRevokeModal({ open: false })}
        onConfirm={(reason, note) => revokeMutation.mutate({ reason, note })}
        loading={revokeMutation.isPending}
      />

      {/* Slip lightbox */}
      {lightboxUrl && (
        <SlipLightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />
      )}
    </div>
  );
}
