/**
 * CreateCouponModal — Wave 4.3 create-coupon experience as a Radix Dialog overlay.
 *
 * Section A.0 / A.3 / A.4 of admin-coupon-wireframes.md
 *
 * Features:
 *   - Radix Dialog overlaying /coupons list (no route change)
 *   - Internal tabs: paid | free (free disabled for admin role)
 *   - Prefix mode picker: Auto / Manual prefix / No prefix  (A.3.1)
 *   - Manual code toggle [✎ ตั้งชื่อเอง] — hides prefix picker (OQ-02b-01)
 *   - Auto-suggest prefixes derived from list query cache
 *   - Unsaved-changes guard with nested confirm (A.0)
 *   - Confirm modal before submit (A.5)
 *   - Sticky header + sticky footer (submit never hidden under fold)
 *   - Mobile: full-screen layout via CSS (no Vaul needed)
 *
 * Code preview vs server truth:
 *   The preview shown in CODE field is client-generated. Cheese's Worker
 *   generates the final code on the server. On success, res.coupon.code is
 *   used — not the client preview. Confirm modal labels the code "(ตัวอย่าง)".
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useQueryClient, useMutation, useQuery } from "@tanstack/react-query";
import {
  RefreshCw,
  Lock,
  Upload,
  X,
  AlertTriangle,
  ShieldAlert,
  Pencil,
  RotateCcw,
} from "lucide-react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  adminCreateCoupon,
  adminUploadSlip,
  adminListCoupons,
  CHANNEL_LABELS,
  PURPOSE_LABELS,
  type CouponChannel,
  type CouponPurpose,
  type CouponType,
  type CreatePaidCouponParams,
  type CreateFreeCouponParams,
} from "@/lib/api-admin";
import { useAdmin } from "@/components/AdminLayout";
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
import {
  type PrefixMode,
  generateClientSuffix,
  sanitizePrefix,
  validatePrefix,
  sanitizeManualCode,
  validateManualCode,
  extractRecentPrefixes,
  CHANNEL_PREFIX_MAP,
  PAID_TEMPLATE_PREFIXES,
  FREE_TEMPLATE_PREFIXES,
} from "@/lib/code-gen-client";

// ---------------------------------------------------------------------------
// Shared small components
// ---------------------------------------------------------------------------

function FieldLabel({
  children,
  required,
}: {
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <label className="font-ui font-medium text-xs text-muted-foreground uppercase tracking-wide block mb-1.5">
      {children}
      {required && <span className="text-[var(--color-error-text)] ml-1">*</span>}
    </label>
  );
}

// ---------------------------------------------------------------------------
// Prefix mode picker (A.3.1)
// ---------------------------------------------------------------------------

const PREFIX_MODE_OPTIONS: { mode: PrefixMode; label: string }[] = [
  { mode: "auto",          label: "จาก channel" },
  { mode: "manual_prefix", label: "กำหนด prefix" },
  { mode: "no_prefix",     label: "ไม่มี prefix" },
];

interface PrefixPickerProps {
  mode: PrefixMode;
  prefix: string;
  channel: string;
  dimmed: boolean;
  disableAuto?: boolean; // free form: Mode A disabled
  recentPrefixes: string[];
  templatePrefixes: readonly string[];
  onModeChange: (m: PrefixMode) => void;
  onPrefixChange: (p: string) => void;
  prefixError?: string;
}

function PrefixModePicker({
  mode,
  prefix,
  channel,
  dimmed,
  disableAuto,
  recentPrefixes,
  templatePrefixes,
  onModeChange,
  onPrefixChange,
  prefixError,
}: PrefixPickerProps) {
  const [showSuggest, setShowSuggest] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const suggestions = recentPrefixes.filter(
    (p) => !prefix || p.toLowerCase().startsWith(prefix.toLowerCase()),
  );

  return (
    <div className={cn("mb-2", dimmed && "opacity-50 pointer-events-none")}>
      {/* 3-segment control */}
      <div className="flex rounded-lg border border-white/10 overflow-hidden mb-2">
        {PREFIX_MODE_OPTIONS.map(({ mode: m, label }) => {
          const isDisabled = m === "auto" && disableAuto;
          const isActive = mode === m;
          return (
            <button
              key={m}
              type="button"
              disabled={isDisabled}
              onClick={() => !isDisabled && onModeChange(m)}
              className={cn(
                "flex-1 py-2 font-ui text-xs text-center transition-colors",
                isActive
                  ? "text-accent bg-accent/10 border-b-2 border-accent"
                  : "text-muted-foreground bg-[var(--color-bg)] hover:bg-secondary",
                isDisabled && "opacity-30 cursor-not-allowed hover:bg-[var(--color-bg)]",
              )}
              title={
                isDisabled
                  ? "ใช้ได้เฉพาะคูปองแบบจ่ายเงิน — ต้องมี channel"
                  : undefined
              }
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Mode A — show derived prefix hint */}
      {mode === "auto" && (
        <p className="font-ui text-xs text-fg-subtle mt-1">
          prefix ดึงจาก channel: <span className="text-muted-foreground font-mono">{CHANNEL_PREFIX_MAP[channel] ?? "PROMO"}</span>
        </p>
      )}

      {/* Mode B — prefix input + template pills + auto-suggest */}
      {mode === "manual_prefix" && (
        <div className="relative">
          <div className="flex items-center gap-2 mb-1.5">
            <input
              ref={inputRef}
              value={prefix}
              onChange={(e) => {
                onPrefixChange(sanitizePrefix(e.target.value));
              }}
              onFocus={() => setShowSuggest(true)}
              onBlur={() => setTimeout(() => setShowSuggest(false), 150)}
              maxLength={12}
              placeholder="เช่น SUMMER, BIRTHDAY"
              className={cn(
                "w-32 bg-[var(--color-bg)] border border-white/10 rounded-lg px-2 py-1.5 font-mono text-xs text-foreground uppercase focus:border-accent focus:outline-none",
                prefixError && "border-[var(--color-error)]",
              )}
            />
            {/* Template quick-picks */}
            <div className="flex gap-1.5 flex-wrap">
              {templatePrefixes.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => onPrefixChange(t)}
                  className="px-2 py-1 rounded bg-secondary text-muted-foreground font-mono text-xs cursor-pointer hover:bg-[var(--color-bg-raised)] transition-colors"
                >
                  {t}-
                </button>
              ))}
            </div>
          </div>

          {/* Auto-suggest dropdown */}
          {showSuggest && suggestions.length > 0 && (
            <ul className="absolute top-full left-0 z-10 mt-1 w-40 bg-[var(--color-bg)] border border-white/10 rounded-lg shadow-[0_8px_24px_rgba(0,0,0,0.40)] overflow-hidden">
              {suggestions.map((s) => (
                <li key={s}>
                  <button
                    type="button"
                    onMouseDown={() => {
                      onPrefixChange(s);
                      setShowSuggest(false);
                    }}
                    className="w-full px-3 py-1.5 text-left font-mono text-xs text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                  >
                    {s}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {prefixError && (
            <p className="font-content text-xs text-[var(--color-error-text)] mt-1">{prefixError}</p>
          )}
          <p className="font-content text-xs text-fg-subtle mt-0.5">
            A-Z, 0-9, _ ได้ | ไม่เกิน 12 ตัว
          </p>
        </div>
      )}

      {/* Mode C — no sub-row needed */}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Unsaved-changes guard dialog (nested Alert)
// ---------------------------------------------------------------------------

interface DiscardGuardProps {
  open: boolean;
  onStay: () => void;
  onDiscard: () => void;
}

function DiscardGuardDialog({ open, onStay, onDiscard }: DiscardGuardProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onStay(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>ทิ้งข้อมูลที่กรอกไว้?</DialogTitle>
        </DialogHeader>
        <p className="font-content text-sm text-muted-foreground">
          ข้อมูลที่กรอกจะหายไปถ้าปิดตอนนี้
        </p>
        <DialogFooter className="justify-between">
          <Button
            onClick={onDiscard}
            className="border border-[var(--color-error)]/40 text-[var(--color-error-text)] bg-transparent hover:bg-[var(--color-error)]/8 h-9 px-4 font-ui text-sm"
          >
            ทิ้ง
          </Button>
          <Button
            autoFocus
            onClick={onStay}
            className="bg-transparent border-2 border-accent text-accent hover:bg-accent/10 ring-2 ring-accent h-9 px-4 font-ui text-sm"
          >
            อยู่ต่อ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Confirm modal (A.5)
// ---------------------------------------------------------------------------

interface ConfirmModalProps {
  open: boolean;
  couponType: CouponType;
  codePreview: string;
  rows: { label: string; value: string }[];
  slipPreviewUrl: string | null;
  loading: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

function ConfirmModal({
  open,
  couponType,
  codePreview,
  rows,
  slipPreviewUrl,
  loading,
  error,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o && !loading) onCancel();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>ยืนยันการสร้างคูปอง</DialogTitle>
        </DialogHeader>

        <div className="space-y-2 text-sm">
          {/* Code row — labelled as preview */}
          <div className="flex justify-between gap-4">
            <span className="font-ui text-xs text-muted-foreground shrink-0">CODE</span>
            <span className="font-mono tabular-nums text-foreground text-right">
              {codePreview}{" "}
              <span className="text-fg-subtle text-xs">(ตัวอย่าง)</span>
            </span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="font-ui text-xs text-muted-foreground shrink-0">ประเภท</span>
            <span className="font-content text-foreground text-right">
              {couponType === "paid" ? "คูปองแบบจ่ายเงิน" : "คูปองแบบฟรี"}
            </span>
          </div>
          {rows.map((r) => (
            <div key={r.label} className="flex justify-between gap-4">
              <span className="font-ui text-xs text-muted-foreground shrink-0">{r.label}</span>
              <span className="font-content text-foreground text-right">{r.value}</span>
            </div>
          ))}
          {slipPreviewUrl && (
            <div className="flex justify-between gap-4">
              <span className="font-ui text-xs text-muted-foreground shrink-0">Slip</span>
              <img
                src={slipPreviewUrl}
                alt="slip preview"
                className="w-16 h-10 object-cover rounded border border-white/10"
              />
            </div>
          )}
        </div>

        <div className="mt-4 flex items-start gap-2 p-3 rounded-lg bg-[var(--color-warning)]/12 border border-[var(--color-warning)]/30">
          <AlertTriangle className="w-4 h-4 text-[var(--color-warning-text)] shrink-0 mt-0.5" />
          <p className="font-content text-xs text-[var(--color-warning-text)]">
            ตรวจสอบข้อมูลก่อนยืนยัน เมื่อสร้างแล้วจะแก้ไข code ไม่ได้
          </p>
        </div>

        {error && (
          <div className="mt-2 p-3 rounded-lg bg-[var(--color-error)]/12 border border-[var(--color-error)]/30">
            <p className="font-content text-xs text-[var(--color-error-text)]">{error}</p>
          </div>
        )}

        <DialogFooter>
          <DialogClose asChild>
            <Button
              variant="outline"
              className="border-white/20 text-muted-foreground hover:bg-white/5"
              disabled={loading}
              onClick={onCancel}
            >
              ยกเลิก
            </Button>
          </DialogClose>
          <Button
            variant="cta"
            onClick={onConfirm}
            disabled={loading}
            className="bg-accent hover:bg-accent/80 text-white"
          >
            {loading ? "กำลังสร้าง..." : "ยืนยัน สร้างคูปอง"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Paid form state + body
// ---------------------------------------------------------------------------

interface PaidFormState {
  code: string;         // used only when manualCode === true
  krub_amount: string;
  payment_thb: string;
  slip_ref: string;
  channel: CouponChannel;
  contact_info: string;
  expires_at: string;
  max_uses: string;
  note: string;
}

interface PaidFormErrors {
  code?: string;
  krub_amount?: string;
  payment_thb?: string;
  prefix?: string;
}

function defaultPaidForm(): PaidFormState {
  return {
    code: "",
    krub_amount: "",
    payment_thb: "",
    slip_ref: "",
    channel: "line_oa",
    contact_info: "",
    expires_at: "",
    max_uses: "1",
    note: "",
  };
}

interface PaidFormBodyProps {
  form: PaidFormState;
  errors: PaidFormErrors;
  prefixMode: PrefixMode;
  manualPrefix: string;
  manualCode: boolean;
  codePreview: string;
  slipFile: File | null;
  slipPreviewUrl: string | null;
  isDragging: boolean;
  isUploading: boolean;
  isUploadSuccess: boolean;
  isUploadError: boolean;
  recentPrefixes: string[];
  onFieldChange: <K extends keyof PaidFormState>(key: K, value: PaidFormState[K]) => void;
  onKrubChange: (v: string) => void;
  onChannelChange: (ch: CouponChannel) => void;
  onPrefixModeChange: (m: PrefixMode) => void;
  onManualPrefixChange: (p: string) => void;
  onManualCodeToggle: () => void;
  onReshuffle: () => void;
  onSlipFile: (f: File) => void;
  onRemoveSlip: () => void;
  onDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent<HTMLDivElement>) => void;
}

function PaidFormBody({
  form,
  errors,
  prefixMode,
  manualPrefix,
  manualCode,
  codePreview,
  slipFile,
  slipPreviewUrl,
  isDragging,
  isUploading,
  isUploadSuccess,
  isUploadError,
  recentPrefixes,
  onFieldChange,
  onKrubChange,
  onChannelChange,
  onPrefixModeChange,
  onManualPrefixChange,
  onManualCodeToggle,
  onReshuffle,
  onSlipFile,
  onRemoveSlip,
  onDragOver,
  onDragLeave,
  onDrop,
}: PaidFormBodyProps) {
  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) onSlipFile(file);
  }

  return (
    <div className="space-y-5">
      {/* CHANNEL */}
      <div>
        <FieldLabel required>Channel</FieldLabel>
        <select
          aria-label="ช่องทางการชำระเงิน"
          value={form.channel}
          onChange={(e) => onChannelChange(e.target.value as CouponChannel)}
          className="w-full bg-[var(--color-bg)] border border-white/10 rounded-lg px-3 py-2.5 font-ui text-sm text-foreground focus:border-accent focus:outline-none"
        >
          {(Object.entries(CHANNEL_LABELS) as [CouponChannel, string][]).map(
            ([val, label]) => (
              <option key={val} value={val}>
                {label}
              </option>
            ),
          )}
        </select>
      </div>

      {/* CODE */}
      <div>
        <FieldLabel required>CODE</FieldLabel>

        {/* Prefix mode picker (hidden when manual code is ON) */}
        <PrefixModePicker
          mode={prefixMode}
          prefix={manualPrefix}
          channel={form.channel}
          dimmed={manualCode}
          disableAuto={false}
          recentPrefixes={recentPrefixes}
          templatePrefixes={PAID_TEMPLATE_PREFIXES}
          onModeChange={onPrefixModeChange}
          onPrefixChange={onManualPrefixChange}
          prefixError={errors.prefix}
        />

        {/* Code field */}
        {manualCode ? (
          <>
            <div className="flex gap-2">
              <Input
                value={form.code}
                onChange={(e) =>
                  onFieldChange("code", sanitizeManualCode(e.target.value))
                }
                className={cn(
                  "bg-[var(--color-bg)] border-white/10 text-foreground font-mono uppercase focus:border-accent",
                  errors.code && "border-[var(--color-error)]",
                )}
                placeholder="WELCOME2026"
                maxLength={64}
              />
            </div>
            <p className="font-content text-xs text-warning mt-1 flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              อย่างน้อย 8 ตัว ผสมตัวเลข+ตัวอักษร ห้ามใช้ I L O U
            </p>
            {errors.code && (
              <p className="font-content text-xs text-[var(--color-error-text)] mt-1">{errors.code}</p>
            )}
            <button
              type="button"
              onClick={onManualCodeToggle}
              className="text-xs text-muted-foreground underline cursor-pointer mt-1 inline-flex items-center gap-1 hover:text-foreground transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
              สุ่มอัตโนมัติ
            </button>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2 bg-[var(--color-bg)] border border-white/10 rounded-lg px-3 py-2.5">
              <span className="flex-1 font-mono text-sm text-foreground tabular-nums truncate">
                {codePreview}
              </span>
              <button
                type="button"
                onClick={onReshuffle}
                className="shrink-0 px-3 py-1.5 rounded-md bg-secondary text-muted-foreground font-ui text-xs hover:bg-[var(--color-bg-raised)] hover:text-foreground flex items-center gap-1 transition-colors"
              >
                <RefreshCw className="w-3 h-3" />
                สุ่มใหม่
              </button>
            </div>
            <button
              type="button"
              onClick={onManualCodeToggle}
              className="text-xs text-accent underline cursor-pointer mt-1 inline-flex items-center gap-1"
            >
              <Pencil className="w-3 h-3" />
              ตั้งชื่อเอง
            </button>
          </>
        )}
      </div>

      {/* KRUB / THB */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <FieldLabel required>ยอด krub</FieldLabel>
          <Input
            type="number"
            min={1}
            value={form.krub_amount}
            onChange={(e) => onKrubChange(e.target.value)}
            className={cn(
              "bg-[var(--color-bg)] border-white/10 text-foreground font-mono tabular-nums focus:border-accent",
              errors.krub_amount && "border-[var(--color-error)]",
            )}
            placeholder="200"
          />
          {errors.krub_amount && (
            <p className="font-content text-xs text-[var(--color-error-text)] mt-1">
              {errors.krub_amount}
            </p>
          )}
        </div>
        <div>
          <FieldLabel required>ยอดชำระ (THB)</FieldLabel>
          <div className="relative">
            <Input
              type="number"
              min={1}
              value={form.payment_thb}
              readOnly
              className="bg-[var(--color-bg)] border-white/10 text-foreground font-mono tabular-nums cursor-not-allowed opacity-70 pr-10"
              placeholder="auto-sync"
            />
            <Lock className="w-4 h-4 text-fg-subtle absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
          <p className="font-content text-xs text-fg-subtle mt-1">
            auto-link: ยอด THB = krub (1:1)
          </p>
        </div>
      </div>

      {/* SLIP REF */}
      <div>
        <FieldLabel>Slip Ref</FieldLabel>
        <Input
          value={form.slip_ref}
          onChange={(e) => onFieldChange("slip_ref", e.target.value)}
          className="bg-[var(--color-bg)] border-white/10 text-foreground focus:border-accent"
          placeholder="REF20260518..."
        />
      </div>

      {/* SLIP UPLOAD */}
      <div>
        <FieldLabel>อัปโหลด Slip</FieldLabel>
        {!slipFile ? (
          <>
            {/* Desktop drag-drop zone */}
            <div
              className={cn(
                "hidden md:flex border-2 border-dashed rounded-xl p-6 flex-col items-center gap-2 transition-colors cursor-pointer",
                isDragging
                  ? "border-accent/50 bg-accent/5"
                  : "border-white/20 hover:border-accent/50 hover:bg-accent/5",
              )}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              onClick={() => document.getElementById("slip-input-modal")?.click()}
            >
              <Upload className="w-6 h-6 text-fg-subtle" />
              <p className="font-content text-sm text-muted-foreground">
                ลากไฟล์มาวาง หรือ คลิกเพื่อเลือกไฟล์
              </p>
              <input
                id="slip-input-modal"
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileInput}
              />
            </div>
            {/* Mobile */}
            <div className="md:hidden space-y-2">
              <label className="flex items-center gap-2 w-full px-4 py-3 bg-card rounded-lg font-ui text-sm text-foreground border border-white/8 active:bg-secondary cursor-pointer min-h-[44px]">
                <Upload className="w-4 h-4" />
                ถ่ายรูปสลิป
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={handleFileInput}
                />
              </label>
              <label className="flex items-center gap-2 w-full px-4 py-3 bg-card rounded-lg font-ui text-sm text-foreground border border-white/8 active:bg-secondary cursor-pointer min-h-[44px]">
                <Upload className="w-4 h-4" />
                เลือกจากคลัง
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleFileInput}
                />
              </label>
            </div>
          </>
        ) : (
          <div className="relative w-full aspect-video rounded-xl overflow-hidden border border-white/10">
            {slipPreviewUrl && (
              <img
                src={slipPreviewUrl}
                alt="slip preview"
                className="w-full h-full object-cover"
              />
            )}
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center gap-3">
              {isUploading && (
                <p className="font-ui text-sm text-white">กำลังอัปโหลด...</p>
              )}
              {isUploadSuccess && (
                <p className="font-ui text-sm text-[var(--color-success-text)]">อัปโหลดสำเร็จ ✓</p>
              )}
              {isUploadError && (
                <p className="font-ui text-sm text-[var(--color-error-text)]">อัปโหลดล้มเหลว</p>
              )}
            </div>
            <button
              type="button"
              onClick={onRemoveSlip}
              className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/60 flex items-center justify-center text-white hover:bg-black/80 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* CONTACT */}
      <div>
        <FieldLabel>Contact Info</FieldLabel>
        <Input
          value={form.contact_info}
          onChange={(e) => onFieldChange("contact_info", e.target.value)}
          className="bg-[var(--color-bg)] border-white/10 text-foreground focus:border-accent"
          placeholder="@lineid หรือ ชื่อ-นามสกุล"
        />
      </div>

      {/* EXPIRY + MAX USES */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <FieldLabel>วันหมดอายุ (ไม่บังคับ)</FieldLabel>
          <Input
            type="date"
            value={form.expires_at}
            onChange={(e) => onFieldChange("expires_at", e.target.value)}
            className="bg-[var(--color-bg)] border-white/10 text-foreground font-mono focus:border-accent"
          />
        </div>
        <div>
          <FieldLabel required>จำนวนครั้งที่ใช้ได้</FieldLabel>
          <Input
            type="number"
            min={1}
            value={form.max_uses}
            onChange={(e) => onFieldChange("max_uses", e.target.value)}
            className="bg-[var(--color-bg)] border-white/10 text-foreground font-mono tabular-nums focus:border-accent"
          />
          <p className="font-content text-xs text-fg-subtle mt-1">
            default 1 — ตั้งมากกว่า 1 สำหรับ campaign
          </p>
        </div>
      </div>

      {/* NOTE */}
      <div>
        <FieldLabel>Note (internal — ไม่แสดงให้ผู้ใช้)</FieldLabel>
        <textarea
          value={form.note}
          onChange={(e) => onFieldChange("note", e.target.value)}
          rows={3}
          className="w-full bg-[var(--color-bg)] border border-white/10 rounded-lg px-3 py-2.5 font-content text-sm text-foreground focus:border-accent focus:outline-none resize-none"
          placeholder="บันทึกภายใน..."
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Free form state + body
// ---------------------------------------------------------------------------

interface FreeFormState {
  code: string;
  krub_amount: string;
  purpose: CouponPurpose;
  campaign_tag: string;
  expires_at: string;
  max_uses: string;
  note: string;
}

interface FreeFormErrors {
  code?: string;
  krub_amount?: string;
  purpose?: string;
  prefix?: string;
}

function defaultFreeForm(): FreeFormState {
  return {
    code: "",
    krub_amount: "",
    purpose: "promotion",
    campaign_tag: "",
    expires_at: "",
    max_uses: "1",
    note: "",
  };
}

interface FreeFormBodyProps {
  form: FreeFormState;
  errors: FreeFormErrors;
  prefixMode: PrefixMode;
  manualPrefix: string;
  manualCode: boolean;
  codePreview: string;
  recentPrefixes: string[];
  onFieldChange: <K extends keyof FreeFormState>(key: K, value: FreeFormState[K]) => void;
  onPrefixModeChange: (m: PrefixMode) => void;
  onManualPrefixChange: (p: string) => void;
  onManualCodeToggle: () => void;
  onReshuffle: () => void;
}

function FreeFormBody({
  form,
  errors,
  prefixMode,
  manualPrefix,
  manualCode,
  codePreview,
  recentPrefixes,
  onFieldChange,
  onPrefixModeChange,
  onManualPrefixChange,
  onManualCodeToggle,
  onReshuffle,
}: FreeFormBodyProps) {
  return (
    <div className="space-y-5">
      {/* CODE */}
      <div>
        <FieldLabel required>CODE</FieldLabel>

        {/* Prefix mode picker — Mode A disabled for free coupons */}
        <PrefixModePicker
          mode={prefixMode}
          prefix={manualPrefix}
          channel=""
          dimmed={manualCode}
          disableAuto={true}
          recentPrefixes={recentPrefixes}
          templatePrefixes={FREE_TEMPLATE_PREFIXES}
          onModeChange={onPrefixModeChange}
          onPrefixChange={onManualPrefixChange}
          prefixError={errors.prefix}
        />

        {manualCode ? (
          <>
            <div className="flex gap-2">
              <Input
                value={form.code}
                onChange={(e) =>
                  onFieldChange("code", sanitizeManualCode(e.target.value))
                }
                className={cn(
                  "bg-[var(--color-bg)] border-white/10 text-foreground font-mono uppercase focus:border-accent",
                  errors.code && "border-[var(--color-error)]",
                )}
                placeholder="WELCOME2026"
                maxLength={64}
              />
            </div>
            <p className="font-content text-xs text-warning mt-1 flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              อย่างน้อย 8 ตัว ผสมตัวเลข+ตัวอักษร ห้ามใช้ I L O U
            </p>
            {errors.code && (
              <p className="font-content text-xs text-[var(--color-error-text)] mt-1">{errors.code}</p>
            )}
            <button
              type="button"
              onClick={onManualCodeToggle}
              className="text-xs text-muted-foreground underline cursor-pointer mt-1 inline-flex items-center gap-1 hover:text-foreground transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
              สุ่มอัตโนมัติ
            </button>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2 bg-[var(--color-bg)] border border-white/10 rounded-lg px-3 py-2.5">
              <span className="flex-1 font-mono text-sm text-foreground tabular-nums truncate">
                {codePreview}
              </span>
              <button
                type="button"
                onClick={onReshuffle}
                className="shrink-0 px-3 py-1.5 rounded-md bg-secondary text-muted-foreground font-ui text-xs hover:bg-[var(--color-bg-raised)] hover:text-foreground flex items-center gap-1 transition-colors"
              >
                <RefreshCw className="w-3 h-3" />
                สุ่มใหม่
              </button>
            </div>
            <button
              type="button"
              onClick={onManualCodeToggle}
              className="text-xs text-accent underline cursor-pointer mt-1 inline-flex items-center gap-1"
            >
              <Pencil className="w-3 h-3" />
              ตั้งชื่อเอง
            </button>
          </>
        )}
      </div>

      {/* KRUB AMOUNT */}
      <div>
        <FieldLabel required>ยอด krub</FieldLabel>
        <Input
          type="number"
          min={1}
          value={form.krub_amount}
          onChange={(e) => onFieldChange("krub_amount", e.target.value)}
          className={cn(
            "bg-[var(--color-bg)] border-white/10 text-foreground font-mono tabular-nums focus:border-accent",
            errors.krub_amount && "border-red-500",
          )}
          placeholder="50"
        />
        {errors.krub_amount && (
          <p className="font-content text-xs text-[var(--color-error-text)] mt-1">
            {errors.krub_amount}
          </p>
        )}
      </div>

      {/* PURPOSE */}
      <div>
        <FieldLabel required>วัตถุประสงค์</FieldLabel>
        <select
          aria-label="วัตถุประสงค์ของคูปอง"
          value={form.purpose}
          onChange={(e) => onFieldChange("purpose", e.target.value as CouponPurpose)}
          className={cn(
            "w-full bg-[var(--color-bg)] border border-white/10 rounded-lg px-3 py-2.5 font-ui text-sm text-foreground focus:border-accent focus:outline-none",
            errors.purpose && "border-[var(--color-error)]",
          )}
        >
          {(Object.entries(PURPOSE_LABELS) as [CouponPurpose, string][]).map(
            ([val, label]) => (
              <option key={val} value={val}>
                {label}
              </option>
            ),
          )}
        </select>
        {errors.purpose && (
          <p className="font-content text-xs text-[var(--color-error-text)] mt-1">{errors.purpose}</p>
        )}
      </div>

      {/* CAMPAIGN TAG */}
      <div>
        <FieldLabel>Campaign Tag (ไม่บังคับ)</FieldLabel>
        <Input
          value={form.campaign_tag}
          onChange={(e) => onFieldChange("campaign_tag", e.target.value)}
          className="bg-[var(--color-bg)] border-white/10 text-foreground focus:border-accent"
          placeholder="launch-may-2026"
        />
        <p className="font-content text-xs text-fg-subtle mt-1">
          groups this batch in reports
        </p>
      </div>

      {/* EXPIRY + MAX USES */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <FieldLabel>วันหมดอายุ (ไม่บังคับ)</FieldLabel>
          <Input
            type="date"
            value={form.expires_at}
            onChange={(e) => onFieldChange("expires_at", e.target.value)}
            className="bg-[var(--color-bg)] border-white/10 text-foreground font-mono focus:border-accent"
          />
        </div>
        <div>
          <FieldLabel required>จำนวนครั้งที่ใช้ได้</FieldLabel>
          <Input
            type="number"
            min={1}
            value={form.max_uses}
            onChange={(e) => onFieldChange("max_uses", e.target.value)}
            className="bg-[var(--color-bg)] border-white/10 text-foreground font-mono tabular-nums focus:border-accent"
          />
          <p className="font-content text-xs text-fg-subtle mt-1">
            default 1 — ตั้งมากกว่า 1 สำหรับ campaign
          </p>
        </div>
      </div>

      {/* NOTE */}
      <div>
        <FieldLabel>Note (internal — ไม่แสดงให้ผู้ใช้)</FieldLabel>
        <textarea
          value={form.note}
          onChange={(e) => onFieldChange("note", e.target.value)}
          rows={3}
          className="w-full bg-[var(--color-bg)] border border-white/10 rounded-lg px-3 py-2.5 font-content text-sm text-foreground focus:border-accent focus:outline-none resize-none"
          placeholder="บันทึกภายใน..."
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CreateCouponModal — main export
// ---------------------------------------------------------------------------

export interface CreateCouponModalProps {
  open: boolean;
  /** Which tab to default to on open */
  initialType?: CouponType;
  onClose: () => void;
  onSuccess: (code: string) => void;
}

export function CreateCouponModal({
  open,
  initialType = "paid",
  onClose,
  onSuccess,
}: CreateCouponModalProps) {
  const queryClient = useQueryClient();
  const { role } = useAdmin();

  // ---------------------------------------------------------------------------
  // Tabs
  // ---------------------------------------------------------------------------
  const [activeTab, setActiveTab] = useState<CouponType>(initialType);

  // Reset to initialType whenever modal opens
  useEffect(() => {
    if (open) setActiveTab(initialType);
  }, [open, initialType]);

  // ---------------------------------------------------------------------------
  // Dirty / close-guard state
  // ---------------------------------------------------------------------------
  const [formDirty, setFormDirty] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);

  /** Mark form as dirty on any user input (not auto-generated values) */
  const markDirty = useCallback(() => setFormDirty(true), []);

  function requestClose() {
    if (formDirty) {
      setDiscardOpen(true);
    } else {
      doClose();
    }
  }

  function doClose() {
    setDiscardOpen(false);
    setFormDirty(false);
    onClose();
    // Reset all form state deferred so animation completes
    setTimeout(() => {
      resetAll();
    }, 200);
  }

  // ---------------------------------------------------------------------------
  // Shared prefix / code state (both tabs)
  // ---------------------------------------------------------------------------
  const [paidPrefixMode, setPaidPrefixMode] = useState<PrefixMode>("auto");
  const [paidManualPrefix, setPaidManualPrefix] = useState("");
  const [paidManualCode, setPaidManualCode] = useState(false);

  // Free form defaults to Mode B (Mode A disabled per A.4)
  const [freePrefixMode, setFreePrefixMode] = useState<PrefixMode>("manual_prefix");
  const [freeManualPrefix, setFreeManualPrefix] = useState("");
  const [freeManualCode, setFreeManualCode] = useState(false);

  // ---------------------------------------------------------------------------
  // Code previews
  // ---------------------------------------------------------------------------
  const [paidCodePreview, setPaidCodePreview] = useState(() =>
    generateClientSuffix("auto", "line_oa", ""),
  );
  const [freeCodePreview, setFreeCodePreview] = useState(() =>
    generateClientSuffix("manual_prefix", "", ""),
  );

  function reshufflePaid() {
    const mode = paidManualCode ? "auto" : (paidPrefixMode as Exclude<PrefixMode, "manual_code">);
    setPaidCodePreview(generateClientSuffix(mode, paidForm.channel, paidManualPrefix));
  }

  function reshuffleFree() {
    const mode = freeManualCode ? "manual_prefix" : (freePrefixMode as Exclude<PrefixMode, "manual_code">);
    setFreeCodePreview(generateClientSuffix(mode, "", freeManualPrefix));
  }

  // ---------------------------------------------------------------------------
  // Paid form
  // ---------------------------------------------------------------------------
  const [paidForm, setPaidForm] = useState<PaidFormState>(defaultPaidForm);
  const [paidErrors, setPaidErrors] = useState<PaidFormErrors>({});
  const [slipFile, setSlipFile] = useState<File | null>(null);
  const [slipPreviewUrl, setSlipPreviewUrl] = useState<string | null>(null);
  const [uploadedSlipUrl, setUploadedSlipUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  function setPaidField<K extends keyof PaidFormState>(key: K, value: PaidFormState[K]) {
    setPaidForm((f) => ({ ...f, [key]: value }));
    setPaidErrors((e) => ({ ...e, [key]: undefined }));
    markDirty();
  }

  function setPaidKrub(value: string) {
    setPaidForm((f) => ({ ...f, krub_amount: value, payment_thb: value }));
    setPaidErrors((e) => ({ ...e, krub_amount: undefined, payment_thb: undefined }));
    markDirty();
  }

  function handleChannelChange(ch: CouponChannel) {
    setPaidForm((f) => ({ ...f, channel: ch }));
    markDirty();
    // Mode A: re-derive prefix silently (manual code toggle gates this via paidManualCode check)
    if (paidPrefixMode === "auto" && !paidManualCode) {
      setPaidCodePreview(generateClientSuffix("auto", ch, ""));
    }
  }

  function handlePaidPrefixModeChange(m: PrefixMode) {
    setPaidPrefixMode(m);
    setPaidCodePreview(
      generateClientSuffix(
        m as Exclude<PrefixMode, "manual_code">,
        paidForm.channel,
        paidManualPrefix,
      ),
    );
  }

  function handlePaidManualPrefixChange(p: string) {
    setPaidManualPrefix(p);
    markDirty();
    setPaidCodePreview(generateClientSuffix("manual_prefix", paidForm.channel, p));
    setPaidErrors((e) => ({ ...e, prefix: undefined }));
  }

  function togglePaidManualCode() {
    const next = !paidManualCode;
    setPaidManualCode(next);
    markDirty();
    if (!next) {
      // Switching back to random mode — regenerate preview
      setPaidCodePreview(
        generateClientSuffix(
          paidPrefixMode as Exclude<PrefixMode, "manual_code">,
          paidForm.channel,
          paidManualPrefix,
        ),
      );
    }
  }

  const uploadMutation = useMutation({
    mutationFn: (file: File) => adminUploadSlip(file),
    onSuccess: (res) => setUploadedSlipUrl(res.url),
  });

  function handleSlipFile(file: File) {
    setSlipFile(file);
    setUploadedSlipUrl(null);
    setSlipPreviewUrl(URL.createObjectURL(file));
    uploadMutation.mutate(file);
    markDirty();
  }

  function removeSlip() {
    setSlipFile(null);
    setSlipPreviewUrl(null);
    setUploadedSlipUrl(null);
  }

  // ---------------------------------------------------------------------------
  // Free form
  // ---------------------------------------------------------------------------
  const [freeForm, setFreeForm] = useState<FreeFormState>(defaultFreeForm);
  const [freeErrors, setFreeErrors] = useState<FreeFormErrors>({});

  function setFreeField<K extends keyof FreeFormState>(key: K, value: FreeFormState[K]) {
    setFreeForm((f) => ({ ...f, [key]: value }));
    setFreeErrors((e) => ({ ...e, [key]: undefined }));
    markDirty();
  }

  function handleFreePrefixModeChange(m: PrefixMode) {
    // Mode A is disabled for free coupons — guard
    if (m === "auto") return;
    setFreePrefixMode(m);
    setFreeCodePreview(
      generateClientSuffix(
        m as Exclude<PrefixMode, "manual_code">,
        "",
        freeManualPrefix,
      ),
    );
  }

  function handleFreeManualPrefixChange(p: string) {
    setFreeManualPrefix(p);
    markDirty();
    setFreeCodePreview(generateClientSuffix("manual_prefix", "", p));
    setFreeErrors((e) => ({ ...e, prefix: undefined }));
  }

  function toggleFreeManualCode() {
    const next = !freeManualCode;
    setFreeManualCode(next);
    markDirty();
    if (!next) {
      setFreeCodePreview(
        generateClientSuffix(
          freePrefixMode as Exclude<PrefixMode, "manual_code">,
          "",
          freeManualPrefix,
        ),
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Auto-suggest: derive from list cache
  // ---------------------------------------------------------------------------
  const listQuery = useQuery({
    queryKey: ["admin", "coupons", { limit: 100 }],
    queryFn: () => adminListCoupons({ limit: 100 }),
    staleTime: 5 * 60 * 1000,
    enabled: open,
  });

  const recentPrefixes = extractRecentPrefixes(
    (listQuery.data?.items ?? []).map((c) => c.code),
  );

  // ---------------------------------------------------------------------------
  // Confirm state
  // ---------------------------------------------------------------------------
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: (params: CreatePaidCouponParams | CreateFreeCouponParams) =>
      adminCreateCoupon(params),
    onSuccess: (res) => {
      setConfirmOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["admin", "coupons"] });
      setFormDirty(false);
      doClose();
      onSuccess(res.coupon.code);
    },
    onError: (err: Error) => {
      setSubmitError(err.message);
    },
  });

  // ---------------------------------------------------------------------------
  // Validation
  // ---------------------------------------------------------------------------

  function validatePaid(): boolean {
    const newErrors: PaidFormErrors = {};

    if (paidManualCode) {
      const codeErr = validateManualCode(paidForm.code);
      if (codeErr) newErrors.code = codeErr;
    } else if (paidPrefixMode === "manual_prefix") {
      const prefixErr = validatePrefix(paidManualPrefix);
      if (prefixErr) newErrors.prefix = prefixErr;
    }

    if (!paidForm.krub_amount || Number(paidForm.krub_amount) <= 0) {
      newErrors.krub_amount = "กรุณาระบุจำนวน krub";
    }
    if (Number(paidForm.payment_thb) !== Number(paidForm.krub_amount)) {
      newErrors.payment_thb = "ยอด THB ต้องเท่ากับ krub (1:1)";
    }

    setPaidErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  function validateFree(): boolean {
    const newErrors: FreeFormErrors = {};

    if (freeManualCode) {
      const codeErr = validateManualCode(freeForm.code);
      if (codeErr) newErrors.code = codeErr;
    } else if (freePrefixMode === "manual_prefix") {
      const prefixErr = validatePrefix(freeManualPrefix);
      if (prefixErr) newErrors.prefix = prefixErr;
    }

    if (!freeForm.krub_amount || Number(freeForm.krub_amount) <= 0) {
      newErrors.krub_amount = "กรุณาระบุจำนวน krub";
    }
    if (!freeForm.purpose) {
      newErrors.purpose = "กรุณาเลือกวัตถุประสงค์";
    }

    setFreeErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  function handleSubmitClick() {
    const ok = activeTab === "paid" ? validatePaid() : validateFree();
    if (!ok) return;
    setSubmitError(null);
    setConfirmOpen(true);
  }

  function handleConfirm() {
    if (activeTab === "paid") {
      const codeGenMode = paidManualCode
        ? "manual_code"
        : paidPrefixMode;
      const params: CreatePaidCouponParams = {
        coupon_type: "paid",
        channel: paidForm.channel,
        code_generation: {
          mode: codeGenMode,
          ...(codeGenMode === "manual_prefix" ? { prefix: paidManualPrefix } : {}),
        },
        ...(paidManualCode ? { code: paidForm.code } : {}),
        krub_amount: Number(paidForm.krub_amount),
        payment_thb: Number(paidForm.payment_thb),
        max_uses: Number(paidForm.max_uses) || 1,
        ...(paidForm.slip_ref ? { slip_ref: paidForm.slip_ref } : {}),
        ...(uploadedSlipUrl ? { slip_image_url: uploadedSlipUrl } : {}),
        ...(paidForm.contact_info ? { contact_info: paidForm.contact_info } : {}),
        ...(paidForm.expires_at
          ? { expires_at: new Date(paidForm.expires_at).toISOString() }
          : {}),
        ...(paidForm.note ? { note: paidForm.note } : {}),
      };
      createMutation.mutate(params);
    } else {
      const codeGenMode = freeManualCode ? "manual_code" : freePrefixMode;
      const params: CreateFreeCouponParams = {
        coupon_type: "free",
        code_generation: {
          mode: codeGenMode,
          ...(codeGenMode === "manual_prefix" ? { prefix: freeManualPrefix } : {}),
        },
        ...(freeManualCode ? { code: freeForm.code } : {}),
        krub_amount: Number(freeForm.krub_amount),
        purpose: freeForm.purpose,
        max_uses: Number(freeForm.max_uses) || 1,
        ...(freeForm.campaign_tag ? { campaign_tag: freeForm.campaign_tag } : {}),
        ...(freeForm.expires_at
          ? { expires_at: new Date(freeForm.expires_at).toISOString() }
          : {}),
        ...(freeForm.note ? { note: freeForm.note } : {}),
      };
      createMutation.mutate(params);
    }
  }

  // ---------------------------------------------------------------------------
  // Reset
  // ---------------------------------------------------------------------------

  function resetAll() {
    setPaidForm(defaultPaidForm());
    setPaidErrors({});
    setPaidPrefixMode("auto");
    setPaidManualPrefix("");
    setPaidManualCode(false);
    setPaidCodePreview(generateClientSuffix("auto", "line_oa", ""));
    setSlipFile(null);
    setSlipPreviewUrl(null);
    setUploadedSlipUrl(null);
    setIsDragging(false);

    setFreeForm(defaultFreeForm());
    setFreeErrors({});
    setFreePrefixMode("manual_prefix");
    setFreeManualPrefix("");
    setFreeManualCode(false);
    setFreeCodePreview(generateClientSuffix("manual_prefix", "", ""));

    setSubmitError(null);
    setFormDirty(false);
    setConfirmOpen(false);
  }

  function handleReset() {
    resetAll();
  }

  // ---------------------------------------------------------------------------
  // Confirm modal rows
  // ---------------------------------------------------------------------------

  const confirmRows =
    activeTab === "paid"
      ? [
          { label: "ยอด krub",  value: `${paidForm.krub_amount} krub` },
          { label: "ยอด THB",   value: `${paidForm.payment_thb} THB` },
          { label: "ใช้ได้",    value: `${paidForm.max_uses} ครั้ง` },
          { label: "หมดอายุ",   value: paidForm.expires_at || "ไม่มีกำหนด" },
          { label: "Channel",   value: CHANNEL_LABELS[paidForm.channel] },
          { label: "Slip Ref",  value: paidForm.slip_ref || "—" },
          { label: "Contact",   value: paidForm.contact_info || "—" },
          { label: "Note",      value: paidForm.note || "—" },
        ]
      : [
          { label: "ยอด krub",       value: `${freeForm.krub_amount} krub` },
          { label: "วัตถุประสงค์",   value: PURPOSE_LABELS[freeForm.purpose] },
          { label: "Campaign",       value: freeForm.campaign_tag || "—" },
          { label: "ใช้ได้",         value: `${freeForm.max_uses} ครั้ง` },
          { label: "หมดอายุ",        value: freeForm.expires_at || "ไม่มีกำหนด" },
          { label: "Note",           value: freeForm.note || "—" },
        ];

  const confirmCodePreview =
    activeTab === "paid"
      ? paidManualCode
        ? paidForm.code
        : paidCodePreview
      : freeManualCode
        ? freeForm.code
        : freeCodePreview;

  // ---------------------------------------------------------------------------
  // Render — custom Radix Dialog with sticky header/footer
  // ---------------------------------------------------------------------------

  return (
    <>
      {/* Main create modal — custom layout for sticky header/footer */}
      <DialogPrimitive.Root
        open={open}
        onOpenChange={(o) => {
          if (!o) requestClose();
        }}
      >
        <DialogPrimitive.Portal>
          {/* Backdrop */}
          <DialogPrimitive.Overlay className="fixed inset-0 z-[50] bg-black/50 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />

          {/* Dialog content — custom layout */}
          <DialogPrimitive.Content
            className={cn(
              // Mobile: full-screen
              "fixed inset-0 z-50 flex flex-col bg-card overflow-hidden",
              // Desktop: centered modal
              "md:inset-auto md:left-1/2 md:top-[7.5vh] md:-translate-x-1/2",
              "md:w-full md:max-w-[640px] md:max-h-[85dvh] md:rounded-xl",
              "md:border md:border-white/8 md:shadow-2xl",
              "data-[state=open]:animate-in data-[state=closed]:animate-out",
              "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
              "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
            )}
          >
            {/* Sticky header */}
            <div className="sticky top-0 bg-card flex items-center justify-between px-6 py-4 border-b border-white/8 z-10 shrink-0">
              <h2 className="font-display text-base text-foreground">
                สร้างคูปอง
              </h2>
              <DialogPrimitive.Close asChild>
                <button
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white/8 transition-colors"
                  aria-label="ปิด"
                >
                  <X className="w-4 h-4" />
                </button>
              </DialogPrimitive.Close>
            </div>

            {/* Tab bar */}
            <div className="flex border-b border-white/8 px-6 shrink-0">
              <button
                type="button"
                onClick={() => setActiveTab("paid")}
                className={cn(
                  "px-4 py-2.5 font-ui text-sm transition-colors",
                  activeTab === "paid"
                    ? "text-foreground border-b-2 border-accent"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                คูปองแบบจ่ายเงิน
              </button>
              <button
                type="button"
                onClick={() => {
                  if (role === "owner") setActiveTab("free");
                }}
                disabled={role !== "owner"}
                className={cn(
                  "px-4 py-2.5 font-ui text-sm transition-colors flex items-center gap-1",
                  activeTab === "free"
                    ? "text-foreground border-b-2 border-accent"
                    : role === "owner"
                      ? "text-muted-foreground hover:text-foreground"
                      : "text-fg-subtle cursor-not-allowed",
                )}
                title={role !== "owner" ? "owner เท่านั้น" : undefined}
              >
                คูปองแบบฟรี ★
                {role !== "owner" && (
                  <span className="text-fg-subtle text-xs">(owner)</span>
                )}
              </button>
            </div>

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto px-6 py-5">
              {activeTab === "paid" ? (
                <PaidFormBody
                  form={paidForm}
                  errors={paidErrors}
                  prefixMode={paidPrefixMode}
                  manualPrefix={paidManualPrefix}
                  manualCode={paidManualCode}
                  codePreview={paidCodePreview}
                  slipFile={slipFile}
                  slipPreviewUrl={slipPreviewUrl}
                  isDragging={isDragging}
                  isUploading={uploadMutation.isPending}
                  isUploadSuccess={uploadMutation.isSuccess}
                  isUploadError={uploadMutation.isError}
                  recentPrefixes={recentPrefixes}
                  onFieldChange={setPaidField}
                  onKrubChange={setPaidKrub}
                  onChannelChange={handleChannelChange}
                  onPrefixModeChange={handlePaidPrefixModeChange}
                  onManualPrefixChange={handlePaidManualPrefixChange}
                  onManualCodeToggle={togglePaidManualCode}
                  onReshuffle={reshufflePaid}
                  onSlipFile={handleSlipFile}
                  onRemoveSlip={removeSlip}
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                    const f = e.dataTransfer.files[0];
                    if (f) handleSlipFile(f);
                  }}
                />
              ) : role !== "owner" ? (
                /* Owner gate inside modal */
                <div className="py-8 flex flex-col items-center gap-4 text-center">
                  <ShieldAlert className="w-12 h-12 text-[var(--color-warning-text)]" />
                  <div>
                    <h3 className="font-display text-lg text-foreground mb-1">
                      ฟีเจอร์นี้สำหรับ owner เท่านั้น
                    </h3>
                    <p className="font-content text-sm text-muted-foreground">
                      การสร้างคูปองแบบฟรีต้องใช้สิทธิ์ owner เนื่องจากไม่มีการตรวจสอบการชำระเงิน
                    </p>
                  </div>
                </div>
              ) : (
                <FreeFormBody
                  form={freeForm}
                  errors={freeErrors}
                  prefixMode={freePrefixMode}
                  manualPrefix={freeManualPrefix}
                  manualCode={freeManualCode}
                  codePreview={freeCodePreview}
                  recentPrefixes={recentPrefixes}
                  onFieldChange={setFreeField}
                  onPrefixModeChange={handleFreePrefixModeChange}
                  onManualPrefixChange={handleFreeManualPrefixChange}
                  onManualCodeToggle={toggleFreeManualCode}
                  onReshuffle={reshuffleFree}
                />
              )}
            </div>

            {/* Sticky footer */}
            <div className="sticky bottom-0 bg-card flex justify-between items-center px-6 py-4 border-t border-white/8 shrink-0">
              <Button
                type="button"
                variant="outline"
                onClick={handleReset}
                className="border-white/20 text-muted-foreground hover:bg-white/5 h-11 px-4"
              >
                ล้างฟอร์ม
              </Button>
              <Button
                type="button"
                variant="cta"
                onClick={handleSubmitClick}
                disabled={createMutation.isPending || uploadMutation.isPending}
                className="bg-accent hover:bg-accent/80 text-white h-11 px-6 font-ui text-sm"
              >
                สร้างคูปอง →
              </Button>
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      {/* Discard guard (nested) */}
      <DiscardGuardDialog
        open={discardOpen}
        onStay={() => setDiscardOpen(false)}
        onDiscard={doClose}
      />

      {/* Confirm modal */}
      <ConfirmModal
        open={confirmOpen}
        couponType={activeTab}
        codePreview={confirmCodePreview}
        rows={confirmRows}
        slipPreviewUrl={activeTab === "paid" ? slipPreviewUrl : null}
        loading={createMutation.isPending}
        error={submitError}
        onConfirm={handleConfirm}
        onCancel={() => {
          setConfirmOpen(false);
          setSubmitError(null);
        }}
      />
    </>
  );
}
