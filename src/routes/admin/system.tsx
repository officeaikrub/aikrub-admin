/**
 * SystemPricing — ตั้งค่าราคา resolution + packs
 *
 * Wave 4.6 scope (pricing-only):
 *   - Resolution pricing: 1K / 2K / 4K (positive int, max 99 krub each)
 *   - Top-up packs: list of { thb, krub } pairs (min 1 pack required)
 *   - Owner-gating: both roles read, only owner can save
 *   - Confirm modal before save: shows changed rows + warning text
 *   - Dirty-flag guard: beforeunload + ยกเลิก button confirm
 *
 * Endpoint contract (Cheese builds parallel):
 *   GET  /api/admin/config/pricing
 *   PATCH /api/admin/config/pricing  (owner only — server enforces)
 */

import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, X } from "lucide-react";
import {
  adminGetPricing,
  adminUpdatePricing,
  adminGetNotificationSettings,
  adminUpdateNotificationSetting,
  type PricingConfig,
  type PricingPack,
  type NotificationSettingRow,
  type NotificationSeverity,
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
import {
  Tooltip,
  TooltipProvider,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types (local form state)
// ---------------------------------------------------------------------------

interface ResolutionForm {
  k1: string;
  k2: string;
  k4: string;
}

interface PackRow {
  /** ephemeral key for React list reconciliation — not sent to server */
  _key: number;
  thb: string;
  krub: string;
}

interface FormState {
  resolution: ResolutionForm;
  packs: PackRow[];
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

function isPositiveInt(val: string, max: number): boolean {
  const n = Number(val);
  return Number.isInteger(n) && n >= 1 && n <= max;
}

interface FieldErrors {
  k1?: string;
  k2?: string;
  k4?: string;
  packs: (Partial<Record<"thb" | "krub", string>>)[];
  global?: string;
}

function validateForm(form: FormState): FieldErrors {
  const errors: FieldErrors = { packs: [] };

  if (!isPositiveInt(form.resolution.k1, 99))
    errors.k1 = "ต้องเป็นจำนวนเต็ม 1–99";
  if (!isPositiveInt(form.resolution.k2, 99))
    errors.k2 = "ต้องเป็นจำนวนเต็ม 1–99";
  if (!isPositiveInt(form.resolution.k4, 99))
    errors.k4 = "ต้องเป็นจำนวนเต็ม 1–99";

  for (const pack of form.packs) {
    const pe: Partial<Record<"thb" | "krub", string>> = {};
    if (!isPositiveInt(pack.thb, 99999)) pe.thb = "1–99999";
    if (!isPositiveInt(pack.krub, 99999)) pe.krub = "1–99999";
    errors.packs.push(pe);
  }

  if (form.packs.length === 0) {
    errors.global = "ต้องมี pack อย่างน้อย 1 อัน";
  }

  return errors;
}

function hasErrors(e: FieldErrors): boolean {
  if (e.k1 || e.k2 || e.k4 || e.global) return true;
  return e.packs.some((pe) => pe.thb || pe.krub);
}

// ---------------------------------------------------------------------------
// Diff helpers (for confirm modal)
// ---------------------------------------------------------------------------

interface DiffLine {
  label: string;
  from: number;
  to: number;
}

function buildDiff(original: PricingConfig, next: FormState): DiffLine[] {
  const lines: DiffLine[] = [];

  const resKeys: { label: string; orig: number; next: number }[] = [
    { label: "1K", orig: original.krub_per_resolution["1K"], next: Number(next.resolution.k1) },
    { label: "2K", orig: original.krub_per_resolution["2K"], next: Number(next.resolution.k2) },
    { label: "4K", orig: original.krub_per_resolution["4K"], next: Number(next.resolution.k4) },
  ];
  for (const r of resKeys) {
    if (r.orig !== r.next) {
      lines.push({ label: r.label, from: r.orig, to: r.next });
    }
  }

  // Packs: compare serialized to detect any change
  const origPackStr = JSON.stringify(
    original.packs.map((p) => ({ thb: p.thb, krub: p.krub }))
  );
  const nextPackStr = JSON.stringify(
    next.packs.map((p) => ({ thb: Number(p.thb), krub: Number(p.krub) }))
  );
  if (origPackStr !== nextPackStr) {
    lines.push({ label: "Packs", from: original.packs.length, to: next.packs.length });
  }

  return lines;
}

function isDirty(original: PricingConfig | undefined, form: FormState): boolean {
  if (!original) return false;
  const diff = buildDiff(original, form);
  return diff.length > 0;
}

// ---------------------------------------------------------------------------
// Convert server data → form state
// ---------------------------------------------------------------------------

let packKeyCounter = 0;

function serverToForm(config: PricingConfig): FormState {
  return {
    resolution: {
      k1: String(config.krub_per_resolution["1K"]),
      k2: String(config.krub_per_resolution["2K"]),
      k4: String(config.krub_per_resolution["4K"]),
    },
    packs: config.packs.map((p) => ({
      _key: ++packKeyCounter,
      thb: String(p.thb),
      krub: String(p.krub),
    })),
  };
}

// ---------------------------------------------------------------------------
// ResolutionSection
// ---------------------------------------------------------------------------

interface ResolutionSectionProps {
  form: ResolutionForm;
  errors: Pick<FieldErrors, "k1" | "k2" | "k4">;
  readonly: boolean;
  onChange: (key: keyof ResolutionForm, val: string) => void;
}

function ResolutionSection({ form, errors, readonly, onChange }: ResolutionSectionProps) {
  const rows: { label: string; key: keyof ResolutionForm }[] = [
    { label: "1K", key: "k1" },
    { label: "2K", key: "k2" },
    { label: "4K", key: "k4" },
  ];

  return (
    <div className="bg-card rounded-xl border border-white/8 p-5 space-y-3">
      <p className="font-ui text-xs text-muted-foreground uppercase tracking-wide mb-4">
        ราคา krub ตาม resolution
      </p>
      {rows.map((r) => {
        const err = errors[r.key];
        return (
          <div key={r.key} className="flex items-center gap-3">
            <span className="font-mono text-sm text-muted-foreground w-8 shrink-0">{r.label}</span>
            <div className="relative flex items-center gap-2 flex-1">
              <Input
                type="number"
                min={1}
                max={99}
                step={1}
                value={form[r.key]}
                disabled={readonly}
                onChange={(e) => onChange(r.key, e.target.value)}
                className={cn(
                  "w-24 font-mono tabular-nums",
                  err && "border-red-500"
                )}
              />
              <span className="font-ui text-sm text-fg-subtle">krub</span>
            </div>
            {err && (
              <span className="font-ui text-xs text-red-400">{err}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// PacksSection
// ---------------------------------------------------------------------------

interface PacksSectionProps {
  packs: PackRow[];
  errors: FieldErrors["packs"];
  globalError?: string;
  readonly: boolean;
  onAdd: () => void;
  onRemove: (key: number) => void;
  onChange: (key: number, field: "thb" | "krub", val: string) => void;
}

function PacksSection({
  packs,
  errors,
  globalError,
  readonly,
  onAdd,
  onRemove,
  onChange,
}: PacksSectionProps) {
  return (
    <div className="bg-card rounded-xl border border-white/8 p-5">
      <p className="font-ui text-xs text-muted-foreground uppercase tracking-wide mb-4">
        Packs ราคาเติม
      </p>

      {/* Column headers */}
      <div className="flex items-center gap-3 mb-2">
        <span className="font-ui text-xs text-fg-subtle uppercase tracking-wide w-8 shrink-0" />
        <span className="font-ui text-xs text-muted-foreground uppercase tracking-wide w-28">THB</span>
        <span className="font-ui text-xs text-muted-foreground uppercase tracking-wide w-28">KRUB</span>
      </div>

      <div className="space-y-2">
        {packs.map((pack, idx) => {
          const pe = errors[idx] ?? {};
          return (
            <div key={pack._key} className="flex items-center gap-3">
              <span className="font-mono text-xs text-fg-subtle w-8 shrink-0 tabular-nums">
                {idx + 1}
              </span>
              <div className="flex flex-col">
                <Input
                  type="number"
                  min={1}
                  max={99999}
                  step={1}
                  value={pack.thb}
                  disabled={readonly}
                  onChange={(e) => onChange(pack._key, "thb", e.target.value)}
                  placeholder="50"
                  className={cn(
                    "w-28 font-mono tabular-nums",
                    pe.thb && "border-red-500"
                  )}
                />
                {pe.thb && (
                  <span className="font-ui text-xs text-red-400 mt-0.5">{pe.thb}</span>
                )}
              </div>
              <div className="flex flex-col">
                <Input
                  type="number"
                  min={1}
                  max={99999}
                  step={1}
                  value={pack.krub}
                  disabled={readonly}
                  onChange={(e) => onChange(pack._key, "krub", e.target.value)}
                  placeholder="50"
                  className={cn(
                    "w-28 font-mono tabular-nums",
                    pe.krub && "border-red-500"
                  )}
                />
                {pe.krub && (
                  <span className="font-ui text-xs text-red-400 mt-0.5">{pe.krub}</span>
                )}
              </div>
              {!readonly && (
                <button
                  onClick={() => onRemove(pack._key)}
                  disabled={packs.length <= 1}
                  title={packs.length <= 1 ? "ต้องมีอย่างน้อย 1 pack" : "ลบ pack นี้"}
                  className={cn(
                    "flex items-center justify-center w-8 h-8 rounded-md transition-colors",
                    packs.length <= 1
                      ? "opacity-30 cursor-not-allowed text-fg-subtle"
                      : "text-fg-subtle hover:text-red-400 hover:bg-red-900/20"
                  )}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {globalError && (
        <p className="font-ui text-xs text-red-400 mt-2">{globalError}</p>
      )}

      {!readonly && (
        <button
          onClick={onAdd}
          className="mt-4 flex items-center gap-1.5 font-ui text-sm text-[#F25F2D] hover:text-[#C7461A] transition-colors"
        >
          <Plus className="w-4 h-4" />
          เพิ่ม pack
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ConfirmModal
// ---------------------------------------------------------------------------

interface ConfirmModalProps {
  open: boolean;
  original: PricingConfig;
  form: FormState;
  isSaving: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

function ConfirmModal({
  open,
  original,
  form,
  isSaving,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const diff = buildDiff(original, form);
  const changedRes = diff.filter((d) => d.label !== "Packs");
  const packChanged = diff.some((d) => d.label === "Packs");

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onCancel(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-display text-lg">ยืนยันบันทึกราคา</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {/* Changed resolution rows */}
          {changedRes.length > 0 && (
            <div className="space-y-1">
              <p className="font-ui text-xs text-muted-foreground uppercase tracking-wide">
                Resolution ที่เปลี่ยน
              </p>
              {changedRes.map((d) => {
                const delta = d.to - d.from;
                return (
                  <div key={d.label} className="flex items-center justify-between py-1 px-3 rounded-md bg-white/4 font-mono text-sm">
                    <span className="text-muted-foreground">{d.label}</span>
                    <span className="text-foreground">
                      {d.from} → {d.to}
                    </span>
                    <span className={cn(
                      "text-xs",
                      delta > 0 ? "text-green-400" : "text-red-400"
                    )}>
                      ({delta > 0 ? "+" : ""}{delta})
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Pack change summary */}
          {packChanged && (
            <div className="py-1 px-3 rounded-md bg-white/4 font-ui text-sm text-muted-foreground">
              Packs เปลี่ยนแปลง ({original.packs.length} → {form.packs.length} รายการ)
            </div>
          )}

          {changedRes.length === 0 && !packChanged && (
            <p className="font-content text-sm text-fg-subtle text-center py-2">
              ไม่มีการเปลี่ยนแปลง
            </p>
          )}

          {/* Warning */}
          <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-amber-900/20 border border-amber-500/30 text-amber-300 text-sm font-content">
            <span className="shrink-0">⚠</span>
            <span>
              ราคาใหม่จะมีผลทันที. การสร้างที่กำลังรันอยู่ใช้ราคาเดิม.
            </span>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <DialogClose asChild>
            <Button variant="outline" onClick={onCancel} disabled={isSaving}>
              ยกเลิก
            </Button>
          </DialogClose>
          <Button
            variant="cta"
            onClick={onConfirm}
            disabled={isSaving || (changedRes.length === 0 && !packChanged)}
            className="bg-[#F25F2D] hover:bg-[#C7461A] text-white"
          >
            {isSaving ? "กำลังบันทึก..." : "ยืนยัน บันทึก"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Inline toggle component (no Switch shadcn dep needed)
// ---------------------------------------------------------------------------

interface ToggleSwitchProps {
  checked: boolean;
  disabled?: boolean;
  onChange: (val: boolean) => void;
  id: string;
}

function ToggleSwitch({ checked, disabled, onChange, id }: ToggleSwitchProps) {
  return (
    <button
      id={id}
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent",
        "transition-colors duration-200 ease-in-out",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F25F2D] focus-visible:ring-offset-2",
        "disabled:cursor-not-allowed disabled:opacity-40",
        checked ? "bg-[#F25F2D]" : "bg-secondary"
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm",
          "transform transition duration-200 ease-in-out",
          checked ? "translate-x-4" : "translate-x-0"
        )}
      />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Severity badge
// ---------------------------------------------------------------------------

function SeverityBadge({ severity }: { severity: NotificationSeverity }) {
  const map: Record<NotificationSeverity, { label: string; cls: string }> = {
    critical: { label: "CRITICAL", cls: "bg-red-900/30 text-red-300 border-red-500/30" },
    warning:  { label: "WARNING",  cls: "bg-amber-900/30 text-amber-300 border-amber-500/30" },
    info:     { label: "INFO",     cls: "bg-blue-900/30 text-blue-300 border-blue-500/30" },
  };
  const { label, cls } = map[severity];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full border font-ui text-[10px] font-medium tracking-wide ${cls}`}>
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// NotificationSettingsSection
// ---------------------------------------------------------------------------

interface NotificationSettingsSectionProps {
  isOwner: boolean;
}

function NotificationSettingsSection({ isOwner }: NotificationSettingsSectionProps) {
  const qc = useQueryClient();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["admin", "notification-settings"],
    queryFn: adminGetNotificationSettings,
  });

  const updateMutation = useMutation({
    mutationFn: ({ type, enabled }: { type: string; enabled: boolean }) =>
      adminUpdateNotificationSetting(type, { enabled }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin", "notification-settings"] });
    },
  });

  if (isLoading) {
    return (
      <div className="bg-card rounded-xl border border-white/8 p-5 animate-pulse">
        <div className="h-4 w-36 bg-white/5 rounded mb-4" />
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="h-9 bg-white/3 rounded mb-2" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="bg-card rounded-xl border border-white/8 p-5">
        <p className="font-ui text-xs text-muted-foreground uppercase tracking-wide mb-3">
          การแจ้งเตือน — ระบบ
        </p>
        <div className="flex items-center justify-between p-3 rounded-lg bg-red-900/20 border border-red-500/30 text-red-300 text-sm font-ui">
          <span>โหลดข้อมูลไม่สำเร็จ (รอ Cheese deploy endpoint)</span>
          <Button
            variant="outline"
            size="sm"
            className="border-red-500/30 text-red-300 hover:bg-red-900/30"
            onClick={() => refetch()}
          >
            ลองใหม่
          </Button>
        </div>
      </div>
    );
  }

  const items = data ?? [];

  return (
    <div className="bg-card rounded-xl border border-white/8 p-5">
      <p className="font-ui text-xs text-muted-foreground uppercase tracking-wide mb-4">
        การแจ้งเตือน — ระบบ
      </p>

      {/* Column headers */}
      <div className="grid grid-cols-[1fr_auto_auto] gap-3 mb-2 px-1">
        <span className="font-ui text-xs text-fg-subtle uppercase tracking-wide">ประเภท</span>
        <span className="font-ui text-xs text-fg-subtle uppercase tracking-wide w-20 text-center">Severity</span>
        <span className="font-ui text-xs text-fg-subtle uppercase tracking-wide w-16 text-center">เปิด</span>
      </div>

      <div className="space-y-1">
        {items.map((row: NotificationSettingRow) => {
          const isLocked = row.owner_only_override;
          const isPending =
            updateMutation.isPending &&
            (updateMutation.variables as { type: string } | undefined)?.type === row.type;

          return (
            <div
              key={row.type}
              className="grid grid-cols-[1fr_auto_auto] gap-3 items-center
                         py-2 px-3 rounded-lg hover:bg-white/4 transition-colors"
            >
              {/* Label */}
              <div className="flex items-center gap-2 min-w-0">
                {isLocked && (
                  <span aria-hidden="true" className="text-muted-foreground text-xs shrink-0">🔒</span>
                )}
                <span className={`font-ui text-sm truncate ${isLocked ? "text-fg-subtle" : "text-foreground"}`}>
                  {row.label}
                </span>
              </div>

              {/* Severity badge */}
              <div className="w-20 flex justify-center">
                <SeverityBadge severity={row.severity_default} />
              </div>

              {/* Toggle or lock label */}
              <div className="w-16 flex justify-center">
                {isLocked ? (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="font-ui text-xs text-fg-subtle cursor-default select-none">
                          ส่งเสมอ
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="font-ui text-xs">ห้ามปิด — สำหรับความปลอดภัย user</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ) : (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span>
                          <ToggleSwitch
                            id={`notif-toggle-${row.type}`}
                            checked={row.enabled}
                            disabled={!isOwner || isPending}
                            onChange={(enabled) => {
                              updateMutation.mutate({ type: row.type, enabled });
                            }}
                          />
                        </span>
                      </TooltipTrigger>
                      {!isOwner && (
                        <TooltipContent>
                          <p className="font-ui text-xs">เฉพาะ owner เท่านั้น</p>
                        </TooltipContent>
                      )}
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Save error inline */}
      {updateMutation.isError && (
        <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-red-900/20 border border-red-500/30 text-red-300 text-sm font-ui">
          <span>✕</span>
          <span>
            บันทึกไม่สำเร็จ —{" "}
            {updateMutation.error instanceof Error
              ? updateMutation.error.message
              : "เกิดข้อผิดพลาด"}
          </span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SystemPricing page
// ---------------------------------------------------------------------------

export default function SystemPricing() {
  const { user: viewer } = useAdmin();
  const queryClient = useQueryClient();
  const isOwner = viewer.role === "owner";

  // Server data
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin", "config", "pricing"],
    queryFn: adminGetPricing,
  });

  // Form state (mirrors server data)
  const [form, setForm] = useState<FormState>({
    resolution: { k1: "12", k2: "12", k4: "15" },
    packs: [],
  });

  // Sync form when server data arrives
  useEffect(() => {
    if (data) {
      setForm(serverToForm(data));
    }
  }, [data]);

  // Dirty flag
  const dirty = isDirty(data, form);

  // Block tab close when dirty
  useEffect(() => {
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      if (dirty) {
        e.preventDefault();
      }
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [dirty]);

  // Validation state — only shown after first save attempt
  const [validated, setValidated] = useState(false);
  const errors = validated ? validateForm(form) : { packs: [] };
  const formHasErrors = validated && hasErrors(errors);

  // Confirm modal
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: adminUpdatePricing,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "config", "pricing"] });
      // Form re-syncs via useEffect on `data` after invalidateQueries refetches GET
      setValidated(false);
      setConfirmOpen(false);
    },
  });

  // Handlers
  const handleResolutionChange = useCallback(
    (key: keyof ResolutionForm, val: string) => {
      setForm((prev) => ({
        ...prev,
        resolution: { ...prev.resolution, [key]: val },
      }));
    },
    []
  );

  const handlePackChange = useCallback(
    (key: number, field: "thb" | "krub", val: string) => {
      setForm((prev) => ({
        ...prev,
        packs: prev.packs.map((p) =>
          p._key === key ? { ...p, [field]: val } : p
        ),
      }));
    },
    []
  );

  const handlePackAdd = useCallback(() => {
    setForm((prev) => ({
      ...prev,
      packs: [
        ...prev.packs,
        { _key: ++packKeyCounter, thb: "", krub: "" },
      ],
    }));
  }, []);

  const handlePackRemove = useCallback((key: number) => {
    setForm((prev) => ({
      ...prev,
      packs: prev.packs.filter((p) => p._key !== key),
    }));
  }, []);

  const handleCancel = useCallback(() => {
    if (dirty) {
      const ok = window.confirm("ทิ้งการเปลี่ยนแปลงทั้งหมดหรือไม่?");
      if (!ok) return;
    }
    if (data) {
      setForm(serverToForm(data));
      setValidated(false);
    }
  }, [dirty, data]);

  const handleSaveClick = useCallback(() => {
    setValidated(true);
    const e = validateForm(form);
    if (hasErrors(e)) return;
    setConfirmOpen(true);
  }, [form]);

  const handleConfirm = useCallback(() => {
    saveMutation.mutate({
      krub_per_resolution: {
        "1K": Number(form.resolution.k1),
        "2K": Number(form.resolution.k2),
        "4K": Number(form.resolution.k4),
      },
      packs: form.packs.map((p): PricingPack => ({
        thb: Number(p.thb),
        krub: Number(p.krub),
      })),
    });
  }, [form, saveMutation]);

  // ---------------------------------------------------------------------------
  // Render states
  // ---------------------------------------------------------------------------

  if (isLoading) {
    return (
      <div className="p-4 md:p-6 space-y-4 animate-pulse">
        <div className="h-6 w-48 bg-white/5 rounded" />
        <div className="h-[140px] bg-card rounded-xl border border-white/8" />
        <div className="h-[220px] bg-card rounded-xl border border-white/8" />
      </div>
    );
  }

  if (isError) {
    const isNotDeployed =
      error instanceof Error &&
      (error.message.includes("404") || error.message.includes("not found"));

    return (
      <div className="p-4 md:p-6">
        <div className="flex items-center justify-between p-4 rounded-lg bg-red-900/20 border border-red-500/30 text-red-300 text-sm font-ui">
          <span>
            {isNotDeployed
              ? "รอ Cheese deploy endpoint (GET /api/admin/config/pricing)"
              : "โหลดข้อมูลไม่สำเร็จ"}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="border-red-500/30 text-red-300 hover:bg-red-900/30"
            onClick={() => refetch()}
          >
            ลองใหม่
          </Button>
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="p-4 md:p-6 space-y-4 max-w-2xl">
        {/* Page title */}
        <h1 className="font-display text-xl font-bold text-foreground">
          ตั้งค่าระบบ
        </h1>

        {/* PII access banner */}
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-900/20 border border-blue-500/30 text-blue-300 text-sm font-ui">
          <span>🔒</span>
          <span>การเปลี่ยนแปลงการตั้งค่านี้จะถูกบันทึกใน audit log</span>
        </div>

        {/* Save error banner */}
        {saveMutation.isError && (
          <div className="flex items-start gap-2 px-4 py-2.5 rounded-lg bg-red-900/20 border border-red-500/30 text-red-300 text-sm font-ui">
            <span>✕</span>
            <span>
              บันทึกไม่สำเร็จ —{" "}
              {saveMutation.error instanceof Error
                ? saveMutation.error.message
                : "เกิดข้อผิดพลาด"}
            </span>
          </div>
        )}

        {/* Save success banner */}
        {saveMutation.isSuccess && (
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-green-900/20 border border-green-500/30 text-green-300 text-sm font-ui">
            <span>✓</span>
            <span>บันทึกราคาสำเร็จแล้ว</span>
          </div>
        )}

        {/* Resolution section */}
        <ResolutionSection
          form={form.resolution}
          errors={{ k1: errors.k1, k2: errors.k2, k4: errors.k4 }}
          readonly={!isOwner}
          onChange={handleResolutionChange}
        />

        {/* Packs section */}
        <PacksSection
          packs={form.packs}
          errors={errors.packs}
          globalError={errors.global}
          readonly={!isOwner}
          onAdd={handlePackAdd}
          onRemove={handlePackRemove}
          onChange={handlePackChange}
        />

        {/* Notification settings section */}
        <NotificationSettingsSection isOwner={isOwner} />

        {/* Form-level validation error summary */}
        {formHasErrors && (
          <p className="font-ui text-sm text-red-400">
            กรุณาแก้ไขข้อผิดพลาดก่อนบันทึก
          </p>
        )}

        {/* Action row */}
        <div className="flex items-center gap-3 pt-2">
          {isOwner ? (
            <Button
              variant="cta"
              onClick={handleSaveClick}
              disabled={saveMutation.isPending}
              className="bg-[#F25F2D] hover:bg-[#C7461A] text-white"
            >
              {saveMutation.isPending ? "กำลังบันทึก..." : "บันทึก"}
            </Button>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-block">
                  <Button
                    disabled
                    className="bg-[#F25F2D]/40 text-white cursor-not-allowed pointer-events-none"
                  >
                    บันทึก
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>เฉพาะ owner เท่านั้น</TooltipContent>
            </Tooltip>
          )}

          <Button
            variant="outline"
            onClick={handleCancel}
            disabled={saveMutation.isPending}
          >
            ยกเลิก
          </Button>

          <p className="font-ui text-xs text-fg-subtle ml-2">
            ⚠ การเปลี่ยนราคามีผลทันทีสำหรับการสร้างใหม่
          </p>
        </div>

        {/* Confirm modal */}
        {data && confirmOpen && (
          <ConfirmModal
            open={confirmOpen}
            original={data}
            form={form}
            isSaving={saveMutation.isPending}
            onConfirm={handleConfirm}
            onCancel={() => setConfirmOpen(false)}
          />
        )}
      </div>
    </TooltipProvider>
  );
}
