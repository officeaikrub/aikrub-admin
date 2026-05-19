/**
 * api-admin.ts — Typed fetch wrappers for all coupon admin endpoints.
 *
 * All endpoints require Authorization: Bearer <session.access_token>
 * Base URL: import.meta.env.VITE_API_URL
 *
 * Coupon endpoint contract (Cheese builds parallel):
 *   POST   /api/admin/coupons
 *   GET    /api/admin/coupons?cursor=&limit=&status=&coupon_type=&campaign_tag=&q=
 *   GET    /api/admin/coupons/:id
 *   PATCH  /api/admin/coupons/:id/disable
 *   POST   /api/admin/coupons/:id/revoke
 *   POST   /api/admin/coupons/bulk-revoke
 *   POST   /api/admin/coupons/slip-upload
 */

import { supabase } from "@/lib/supabase";
import { ApiError } from "@/lib/api";

// ---------------------------------------------------------------------------
// Re-export ApiError so callers don't need to import from api.ts
// ---------------------------------------------------------------------------
export { ApiError };

// ---------------------------------------------------------------------------
// Coupon types — mirrors 18-column DB schema from wireframes Section C.1
// ---------------------------------------------------------------------------

export type CouponType = "paid" | "free";
export type CouponStatus = "active" | "disabled" | "revoked" | "used" | "expired";
export type CouponChannel = "line_oa" | "facebook" | "manual" | "other";
export type CouponPurpose = "promotion" | "welcome" | "compensation" | "influencer" | "other";
export type RevokeReason = "fraud" | "duplicate_slip" | "refund_request" | "other";

export interface Coupon {
  id: string;
  code: string;
  coupon_type: CouponType;
  krub_amount: number;
  max_uses: number;
  used_count: number;
  expires_at: string | null;
  status: CouponStatus;
  created_by: string;
  created_at: string;
  note: string | null;
  // paid-only fields
  payment_thb: number | null;
  slip_ref: string | null;
  slip_image_url: string | null;
  channel: CouponChannel | null;
  contact_info: string | null;
  // free-only fields
  purpose: CouponPurpose | null;
  campaign_tag: string | null;
}

export interface RedemptionRecord {
  id: string;
  coupon_id: string;
  user_id: string;
  user_email: string;
  redeemed_at: string;
  krub_credited: number;
  status: "active" | "clawed_back";
  clawed_back_at: string | null;
}

// ---------------------------------------------------------------------------
// Request / response types
// ---------------------------------------------------------------------------

/**
 * Code generation specification sent to the Worker.
 *
 * mode enum — must match Cheese's Worker contract (see code-gen-client.ts):
 *   'auto'          → Worker derives prefix from channel field
 *   'manual_prefix' → Worker uses provided prefix + generates 8-char Crockford suffix
 *   'no_prefix'     → Worker generates 12-char Crockford code, no separator
 *   'manual_code'   → Worker uses provided `code` field verbatim (validated server-side)
 */
export interface CodeGenerationSpec {
  mode: "auto" | "manual_prefix" | "no_prefix" | "manual_code";
  prefix?: string; // only when mode === 'manual_prefix'
}

export interface CreatePaidCouponParams {
  coupon_type: "paid";
  /** Only sent when code_generation.mode === 'manual_code' */
  code?: string;
  /** Required for all modes (ops metadata) */
  channel: CouponChannel;
  code_generation: CodeGenerationSpec;
  krub_amount: number;
  payment_thb: number;
  slip_ref?: string;
  slip_image_url?: string;
  contact_info?: string;
  expires_at?: string;
  max_uses: number;
  note?: string;
}

export interface CreateFreeCouponParams {
  coupon_type: "free";
  /** Only sent when code_generation.mode === 'manual_code' */
  code?: string;
  code_generation: CodeGenerationSpec;
  krub_amount: number;
  purpose: CouponPurpose;
  campaign_tag?: string;
  expires_at?: string;
  max_uses: number;
  note?: string;
}

export type CreateCouponParams = CreatePaidCouponParams | CreateFreeCouponParams;

export interface CouponListParams {
  cursor?: string;
  limit?: number;
  status?: CouponStatus | "";
  coupon_type?: CouponType | "";
  campaign_tag?: string;
  q?: string;
}

export interface CouponListResponse {
  ok: true;
  items: Coupon[];
  next_cursor: string | null;
  total: number;
}

export interface CouponDetailResponse {
  ok: true;
  coupon: Coupon;
  redemptions: RedemptionRecord[];
}

export interface BulkRevokeParams {
  ids: string[];
  reason: RevokeReason;
  note?: string;
}

export interface SlipUploadResponse {
  ok: true;
  url: string;
}

// ---------------------------------------------------------------------------
// Internal fetch helper for admin API (handles auth + JSON)
// ---------------------------------------------------------------------------

const API_BASE =
  (import.meta.env["VITE_API_URL"] as string | undefined) ?? "";

async function adminFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> | undefined),
  };

  // Do NOT set Content-Type for FormData — browser sets multipart boundary
  if (!(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }

  if (session?.access_token) {
    headers["Authorization"] = `Bearer ${session.access_token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new ApiError("parse_error", "Invalid response from server", res.status);
  }

  if (!res.ok) {
    const envelope = body as {
      ok?: boolean;
      error?: { code?: string; message?: string };
    };
    const code = envelope?.error?.code ?? "unknown_error";
    const message =
      envelope?.error?.message ?? `Request failed with status ${res.status}`;
    throw new ApiError(code, message, res.status);
  }

  return body as T;
}

// ---------------------------------------------------------------------------
// Coupon API functions
// ---------------------------------------------------------------------------

/**
 * POST /api/admin/coupons — สร้าง coupon ใหม่ (paid หรือ free)
 */
export async function adminCreateCoupon(
  params: CreateCouponParams,
): Promise<{ ok: true; coupon: Coupon }> {
  return adminFetch<{ ok: true; coupon: Coupon }>("/api/admin/coupons", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

/**
 * GET /api/admin/coupons — รายการ coupon พร้อม filter + pagination
 */
export async function adminListCoupons(
  params: CouponListParams = {},
): Promise<CouponListResponse> {
  const query = new URLSearchParams();
  if (params.cursor) query.set("cursor", params.cursor);
  if (params.limit) query.set("limit", String(params.limit));
  if (params.status) query.set("status", params.status);
  if (params.coupon_type) query.set("coupon_type", params.coupon_type);
  if (params.campaign_tag) query.set("campaign_tag", params.campaign_tag);
  if (params.q) query.set("q", params.q);
  const qs = query.toString();
  return adminFetch<CouponListResponse>(
    `/api/admin/coupons${qs ? `?${qs}` : ""}`,
  );
}

/**
 * GET /api/admin/coupons/:id — detail + redemption history
 */
export async function adminGetCoupon(id: string): Promise<CouponDetailResponse> {
  return adminFetch<CouponDetailResponse>(`/api/admin/coupons/${id}`);
}

/**
 * PATCH /api/admin/coupons/:id/disable — soft-disable
 */
export async function adminDisableCoupon(
  id: string,
): Promise<{ ok: true; coupon: Coupon }> {
  return adminFetch<{ ok: true; coupon: Coupon }>(
    `/api/admin/coupons/${id}/disable`,
    { method: "PATCH" },
  );
}

/**
 * POST /api/admin/coupons/:id/revoke — revoke with reason
 */
export async function adminRevokeCoupon(
  id: string,
  reason: RevokeReason,
  note?: string,
): Promise<{ ok: true; coupon: Coupon }> {
  return adminFetch<{ ok: true; coupon: Coupon }>(
    `/api/admin/coupons/${id}/revoke`,
    {
      method: "POST",
      body: JSON.stringify({ reason, note }),
    },
  );
}

/**
 * POST /api/admin/coupons/bulk-revoke — bulk action
 */
export async function adminBulkRevoke(
  params: BulkRevokeParams,
): Promise<{ ok: true; revoked_count: number }> {
  return adminFetch<{ ok: true; revoked_count: number }>(
    "/api/admin/coupons/bulk-revoke",
    {
      method: "POST",
      body: JSON.stringify(params),
    },
  );
}

/**
 * POST /api/admin/coupons/:id/clawback-row — ดึงคืน Krub รายแถว
 * Body: { redemption_id, reason_category, note? }
 */
export async function adminClawbackRow(
  couponId: string,
  params: {
    redemption_id: string;
    reason_category: ClawbackReason;
    note?: string;
  },
): Promise<{
  ok: true;
  transaction: {
    id: string;
    user_id: string;
    kind: string;
    delta: number;
    created_at: string;
    related_redemption_id: string | null;
  };
  new_balance: number;
}> {
  return adminFetch<{
    ok: true;
    transaction: {
      id: string;
      user_id: string;
      kind: string;
      delta: number;
      created_at: string;
      related_redemption_id: string | null;
    };
    new_balance: number;
  }>(
    `/api/admin/coupons/${couponId}/clawback-row`,
    {
      method: "POST",
      body: JSON.stringify(params),
    },
  );
}

/**
 * POST /api/admin/coupons/slip-upload — multipart slip image upload
 */
export async function adminUploadSlip(file: File): Promise<SlipUploadResponse> {
  const form = new FormData();
  form.append("slip", file);
  return adminFetch<SlipUploadResponse>("/api/admin/coupons/slip-upload", {
    method: "POST",
    body: form,
  });
}

// ---------------------------------------------------------------------------
// User management types (Wave 4.4)
// ---------------------------------------------------------------------------

export type UserRole = "user" | "admin" | "owner";
export type UserStatus = "active" | "suspended" | "soft_deleted";
export type SuspendReason = "fraud" | "abuse" | "non_payment" | "user_request" | "other";
export type BulkSuspendReason = "spam" | "abuse" | "fraud" | "tos_violation" | "other";
export type DurationOption = "1d" | "7d" | "30d" | "permanent";
export type ClawbackReason = "fraud" | "duplicate" | "error" | "other";

export interface PiiAccessLogRow {
  admin_id: string;
  admin_email: string;
  viewed_field: string;
  viewed_at: string;
  ip_address: string | null;
}

export interface AdminUserRow {
  id: string;
  email: string | null;
  display_name: string | null;
  role: UserRole;
  status: UserStatus;
  created_at: string;
  suspended_at: string | null;
  suspended_reason: string | null;
  deleted_at: string | null;
}

export interface AdminUserDetail {
  user: AdminUserRow;
  credits: {
    balance: number;
    lifetime_topup: number;
    lifetime_spend: number;
  };
  recent_generations: {
    id: string;
    model: string;
    provider: string;
    cost: number;
    status: string;
    created_at: string;
  }[];
  recent_redemptions: {
    coupon_id: string;
    krub_added: number;
    redeemed_at: string;
  }[];
  audit_trail: {
    id: string;
    actor_id: string;
    actor_role: string;
    action: string;
    payload: Record<string, unknown>;
    ip_address: string | null;
    created_at: string;
  }[];
  pii_access_log: PiiAccessLogRow[];
}

export interface UserListParams {
  cursor?: string;
  limit?: number;
  q?: string;
  role?: UserRole | "";
  status?: UserStatus | "";
}

export interface UserListResponse {
  ok: true;
  items: AdminUserRow[];
  next_cursor: string | null;
  total: number;
}

// ---------------------------------------------------------------------------
// User API functions (Wave 4.4)
// ---------------------------------------------------------------------------

/**
 * GET /api/admin/users — รายการผู้ใช้พร้อม filter + cursor pagination
 */
export async function adminListUsers(
  params: UserListParams = {},
): Promise<UserListResponse> {
  const query = new URLSearchParams();
  if (params.cursor) query.set("cursor", params.cursor);
  if (params.limit) query.set("limit", String(params.limit));
  if (params.q) query.set("q", params.q);
  if (params.role) query.set("role", params.role);
  if (params.status) query.set("status", params.status);
  const qs = query.toString();
  return adminFetch<UserListResponse>(
    `/api/admin/users${qs ? `?${qs}` : ""}`,
  );
}

/**
 * GET /api/admin/users/:id — รายละเอียดผู้ใช้ + credits + generations + coupons + audit
 */
export async function adminGetUser(id: string): Promise<{ ok: true } & AdminUserDetail> {
  return adminFetch<{ ok: true } & AdminUserDetail>(`/api/admin/users/${id}`);
}

/**
 * POST /api/admin/users/:id/credits/adjust — ปรับยอด krub (admin+owner)
 * Body: { delta: number (int, non-zero), note: string (≥5 chars) }
 * Note: wireframe says "reason" but endpoint field is "note"; min is 5 server-side,
 *       we enforce 10 client-side for safety.
 */
export async function adminAdjustKrub(
  userId: string,
  delta: number,
  note: string,
): Promise<{ ok: true; new_balance: number }> {
  return adminFetch<{ ok: true; new_balance: number }>(
    `/api/admin/users/${userId}/credits/adjust`,
    {
      method: "POST",
      body: JSON.stringify({ delta, note }),
    },
  );
}

/**
 * POST /api/admin/users/:id/suspend — ระงับบัญชี (admin+owner)
 * Body: { reason_category, duration_option, notify_user, note? }
 */
export async function adminSuspendUser(
  userId: string,
  reason_category: SuspendReason,
  duration_option: DurationOption,
  notify_user: boolean,
  note?: string,
): Promise<{ ok: true; user: AdminUserRow; already_suspended?: boolean }> {
  return adminFetch<{ ok: true; user: AdminUserRow; already_suspended?: boolean }>(
    `/api/admin/users/${userId}/suspend`,
    {
      method: "POST",
      body: JSON.stringify({ reason_category, duration_option, notify_user, note }),
    },
  );
}

export interface BulkSuspendResult {
  ok: true;
  suspended: { user_id: string; email: string; suspended_until: string | null }[];
  failed: { user_id: string; error: string }[];
}

/**
 * POST /api/admin/users/bulk-suspend — ระงับหลายบัญชีพร้อมกัน (admin+owner)
 * Body: { user_ids, reason_category, duration_option, notify_user, note? }
 * Note: skipped_elevated[] removed per Pom RED-1 security audit (enumeration risk)
 */
export async function adminBulkSuspend(params: {
  user_ids: string[];
  reason_category: BulkSuspendReason;
  duration_option: DurationOption;
  notify_user: boolean;
  note?: string;
}): Promise<BulkSuspendResult> {
  return adminFetch<BulkSuspendResult>(
    "/api/admin/users/bulk-suspend",
    {
      method: "POST",
      body: JSON.stringify(params),
    },
  );
}

/**
 * POST /api/admin/users/:id/unsuspend — ยกเลิกการระงับ (admin+owner)
 */
export async function adminUnsuspendUser(
  userId: string,
): Promise<{ ok: true; user: AdminUserRow }> {
  return adminFetch<{ ok: true; user: AdminUserRow }>(
    `/api/admin/users/${userId}/unsuspend`,
    { method: "POST", body: JSON.stringify({}) },
  );
}

/**
 * POST /api/admin/users/:id/soft-delete — ลบบัญชี soft (owner only)
 * Body: { confirm_text: "DELETE" }
 */
export async function adminSoftDeleteUser(
  userId: string,
): Promise<{ ok: true; user: AdminUserRow }> {
  return adminFetch<{ ok: true; user: AdminUserRow }>(
    `/api/admin/users/${userId}/soft-delete`,
    {
      method: "POST",
      body: JSON.stringify({ confirm_text: "DELETE" }),
    },
  );
}

/**
 * POST /api/admin/users/:id/restore — กู้คืนบัญชี (owner only, grace period only)
 */
export async function adminRestoreUser(
  userId: string,
): Promise<{ ok: true; user: AdminUserRow; warning?: string }> {
  return adminFetch<{ ok: true; user: AdminUserRow; warning?: string }>(
    `/api/admin/users/${userId}/restore`,
    { method: "POST", body: JSON.stringify({}) },
  );
}

// ---------------------------------------------------------------------------
// Pricing config types (Wave 4.6)
// ---------------------------------------------------------------------------

export interface PricingPack {
  thb: number;
  krub: number;
}

export interface PricingConfig {
  krub_per_resolution: {
    "1K": number;
    "2K": number;
    "4K": number;
  };
  packs: PricingPack[];
}

export interface UpdatePricingParams {
  krub_per_resolution: {
    "1K": number;
    "2K": number;
    "4K": number;
  };
  packs: PricingPack[];
}

// ---------------------------------------------------------------------------
// Pricing API functions (Wave 4.6)
// ---------------------------------------------------------------------------

/**
 * GET /api/admin/config/pricing — อ่านราคาปัจจุบัน (admin + owner)
 *
 * Server returns flat shape: { ok, krub_per_resolution, packs }
 * (no `config` wrapper)
 */
export async function adminGetPricing(): Promise<PricingConfig> {
  const { ok: _ok, ...config } = await adminFetch<
    { ok: true } & PricingConfig
  >("/api/admin/config/pricing");
  return config;
}

/**
 * PATCH /api/admin/config/pricing — อัปเดตราคา (owner only — server enforces)
 *
 * Server returns { ok: true } only — no config echo.
 * Request body uses "1K"/"2K"/"4K" keys matching server contract.
 */
export async function adminUpdatePricing(
  params: UpdatePricingParams,
): Promise<{ ok: true }> {
  return adminFetch<{ ok: true }>(
    "/api/admin/config/pricing",
    {
      method: "PATCH",
      body: JSON.stringify(params),
    },
  );
}

// ---------------------------------------------------------------------------
// Notification settings types (Wave 4.5)
// ---------------------------------------------------------------------------

export type NotificationSeverity = "info" | "warning" | "critical";

export interface NotificationSettingRow {
  type: string;
  /** Thai label for display */
  label: string;
  severity_default: NotificationSeverity;
  enabled: boolean;
  /** When true, UI shows disabled toggle + security tooltip */
  owner_only_override: boolean;
}

export interface NotificationSettingsResponse {
  ok: true;
  items: NotificationSettingRow[];
}

export interface UpdateNotificationSettingParams {
  enabled: boolean;
}

// ---------------------------------------------------------------------------
// Notification settings API functions (Wave 4.5)
// ---------------------------------------------------------------------------

/**
 * GET /api/admin/notification-settings — รายการ notification type ทั้งหมด + toggle state
 */
export async function adminGetNotificationSettings(): Promise<NotificationSettingRow[]> {
  const res = await adminFetch<NotificationSettingsResponse>(
    "/api/admin/notification-settings",
  );
  return res.items;
}

/**
 * PATCH /api/admin/notification-settings/:type — เปลี่ยน enabled state per type
 */
export async function adminUpdateNotificationSetting(
  type: string,
  params: UpdateNotificationSettingParams,
): Promise<{ ok: true }> {
  return adminFetch<{ ok: true }>(
    `/api/admin/notification-settings/${type}`,
    {
      method: "PATCH",
      body: JSON.stringify(params),
    },
  );
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

/**
 * Format ISO date to "2026-05-17 13:42" (Bangkok UTC+7)
 */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const bkk = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
  return bkk.replace("T", " ");
}

export const CHANNEL_LABELS: Record<CouponChannel, string> = {
  line_oa: "Line OA",
  facebook: "Facebook",
  manual: "Manual",
  other: "Other",
};

export const PURPOSE_LABELS: Record<CouponPurpose, string> = {
  promotion: "โปรโมชั่น",
  welcome: "Welcome",
  compensation: "Compensation",
  influencer: "Influencer",
  other: "อื่นๆ",
};

export const STATUS_LABELS: Record<CouponStatus, string> = {
  active: "active",
  disabled: "ปิดใช้งาน",
  revoked: "ยกเลิกแล้ว",
  used: "หมดแล้ว",
  expired: "หมดอายุ",
};
