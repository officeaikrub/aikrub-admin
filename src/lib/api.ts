/**
 * Admin API client — typed fetch wrapper สำหรับ AIKrub Cloudflare Workers backend.
 *
 * Base URL: import.meta.env.VITE_API_URL
 * Worker: aikrub-api.office-aikrub.workers.dev
 * Admin routes: /api/admin/* (ต้องมี Bearer token จาก Supabase session + role owner/admin)
 *
 * Error envelope contract:
 *   { ok: false, error: { code: string, message?: string } }
 */

import { supabase } from "@/lib/supabase";

// ---------------------------------------------------------------------------
// Typed error
// ---------------------------------------------------------------------------

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// ---------------------------------------------------------------------------
// Core fetch wrapper
// ---------------------------------------------------------------------------

const API_BASE =
  (import.meta.env["VITE_API_URL"] as string | undefined) ?? "";

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  requireAuth = true,
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> | undefined),
  };

  if (requireAuth) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session?.access_token) {
      headers["Authorization"] = `Bearer ${session.access_token}`;
    }
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
    const envelope = body as { ok?: boolean; error?: { code?: string; message?: string } };
    const code = envelope?.error?.code ?? "unknown_error";
    const message =
      envelope?.error?.message ?? `Request failed with status ${res.status}`;
    throw new ApiError(code, message, res.status);
  }

  return body as T;
}

// ---------------------------------------------------------------------------
// Admin API stubs — Wave 4.2+ จะ implement จริง
// ---------------------------------------------------------------------------

/**
 * GET /api/admin/kie-balance — Kie.ai credit balance ที่เหลือ
 * TODO (Wave 4.2): implement
 */
export async function fetchKieBalance(): Promise<{ credits: number }> {
  return apiFetch<{ credits: number }>("/api/admin/kie-balance");
}

/**
 * POST /api/admin/coupons — สร้าง coupon ใหม่
 * TODO (Wave 4.2): implement
 */
export async function createCoupon(_params: {
  krub: number;
  type: "paid" | "free";
  note?: string;
}): Promise<{ ok: true; code: string }> {
  return apiFetch<{ ok: true; code: string }>("/api/admin/coupons", {
    method: "POST",
    body: JSON.stringify(_params),
  });
}

/**
 * GET /api/admin/coupons — รายการ coupon ทั้งหมด
 * TODO (Wave 4.2): implement
 */
export async function fetchCoupons(): Promise<{ items: unknown[] }> {
  return apiFetch<{ items: unknown[] }>("/api/admin/coupons");
}
