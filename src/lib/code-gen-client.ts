/**
 * code-gen-client.ts — Client-side helpers for coupon code generation & validation.
 *
 * These are UX helpers only — the server (Cheese's Worker) is the source of truth.
 * When mode !== 'manual_code', the client previews a code; the server generates
 * the final code. Success state must use `res.coupon.code`, not the client preview.
 *
 * Alphabet: Crockford base32 — digits + uppercase letters minus I, L, O, U.
 * This eliminates visual ambiguity and is safe to paste in Line OA / Facebook chat.
 *
 * Prefix mode enum — must match Cheese's Worker contract:
 *   'auto'          → prefix derived from channel field (Mode A)
 *   'manual_prefix' → prefix typed by admin (Mode B)
 *   'no_prefix'     → 8-char Crockford suffix only, no separator (Mode C)
 *   'manual_code'   → admin types the entire code; `code` field in request body
 */

export type PrefixMode = "auto" | "manual_prefix" | "no_prefix" | "manual_code";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Crockford base32 alphabet: 0-9 + A-Z minus I L O U */
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** Channel → prefix map (Mode A). OQ-02-04 confirmed by Pete 2026-05-18. */
export const CHANNEL_PREFIX_MAP: Record<string, string> = {
  line_oa:  "LINE",
  facebook: "FB",
  manual:   "MANUAL",
  other:    "PROMO",
};

/** Template quick-picks for free form Mode B (per A.4 wireframe) */
export const FREE_TEMPLATE_PREFIXES = ["WELCOME", "BDAY", "INFLUENCER"] as const;

/** Template quick-picks for paid form Mode B (per A.3 wireframe) */
export const PAID_TEMPLATE_PREFIXES = ["SUMMER", "WELCOME", "BDAY"] as const;

// ---------------------------------------------------------------------------
// Core generator
// ---------------------------------------------------------------------------

/**
 * Generate a cryptographically random N-character Crockford base32 string.
 * Uses crypto.getRandomValues — never Math.random.
 */
export function generateCrockfordSuffix(length: 8 | 12 = 8): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => CROCKFORD[b % CROCKFORD.length])
    .join("");
}

/**
 * Generate a client-side code preview based on current prefix mode.
 *
 * @param mode     - Current prefix mode
 * @param channel  - Channel field value (used only when mode === 'auto')
 * @param prefix   - Manual prefix (used only when mode === 'manual_prefix')
 * @returns        - Preview code string (server may differ by random re-roll)
 */
export function generateClientSuffix(
  mode: Exclude<PrefixMode, "manual_code">,
  channel: string,
  prefix: string,
): string {
  const suffix = generateCrockfordSuffix(8);
  switch (mode) {
    case "auto": {
      const p = CHANNEL_PREFIX_MAP[channel] ?? "PROMO";
      return `${p}-${suffix}`;
    }
    case "manual_prefix": {
      const p = sanitizePrefix(prefix);
      if (!p) return suffix; // fallback: no separator if prefix empty
      return `${p}-${suffix}`;
    }
    case "no_prefix":
      return generateCrockfordSuffix(12);
  }
}

// ---------------------------------------------------------------------------
// Prefix validation (Mode B)
// ---------------------------------------------------------------------------

const PREFIX_RE = /^[A-Z0-9_]{2,12}$/;

/** Normalize input: uppercase + strip disallowed chars */
export function sanitizePrefix(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9_]/g, "");
}

/** Returns error string or undefined if valid */
export function validatePrefix(value: string): string | undefined {
  if (!value) return "กรุณาระบุ prefix";
  if (value.length < 2) return "prefix อย่างน้อย 2 ตัว";
  if (value.length > 12) return "prefix ไม่เกิน 12 ตัว";
  if (!PREFIX_RE.test(value)) return "ใช้ได้เฉพาะ A-Z, 0-9, _ เท่านั้น";
  return undefined;
}

// ---------------------------------------------------------------------------
// Manual code validation (manual_code mode)
// ---------------------------------------------------------------------------

// Characters that are visually ambiguous — forbidden in manual codes
const FORBIDDEN_CHARS_RE = /[ILOU]/;
// Must contain at least 1 letter and 1 digit
const HAS_LETTER_RE = /[A-Z]/;
const HAS_DIGIT_RE = /[0-9]/;

/** Normalize manual code: uppercase only */
export function sanitizeManualCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Returns error string or undefined if valid */
export function validateManualCode(value: string): string | undefined {
  if (!value) return "กรุณาระบุ code";
  if (value.length < 8) return "code อย่างน้อย 8 ตัว";
  if (FORBIDDEN_CHARS_RE.test(value)) return "ห้ามใช้ตัวอักษร I, L, O, U";
  if (!HAS_LETTER_RE.test(value)) return "ต้องมีตัวอักษรอย่างน้อย 1 ตัว";
  if (!HAS_DIGIT_RE.test(value)) return "ต้องมีตัวเลขอย่างน้อย 1 ตัว";
  return undefined;
}

// ---------------------------------------------------------------------------
// Auto-suggest prefix — derived from list cache (no new endpoint needed)
// ---------------------------------------------------------------------------

/**
 * Extract up to N distinct prefixes from a list of coupon codes.
 * A prefix is the part before the first "-", 2-12 chars, alpha-numeric + _.
 * Returns most-recent first (assumes input is already newest-first from API).
 */
export function extractRecentPrefixes(codes: string[], limit = 5): string[] {
  const seen = new Set<string>();
  for (const code of codes) {
    const dashIdx = code.indexOf("-");
    if (dashIdx < 2 || dashIdx > 12) continue;
    const p = code.slice(0, dashIdx);
    if (/^[A-Z0-9_]{2,12}$/.test(p)) {
      seen.add(p);
      if (seen.size >= limit) break;
    }
  }
  return Array.from(seen);
}
