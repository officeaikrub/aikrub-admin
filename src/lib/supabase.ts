import { createClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Database type stub
// TODO (Wave 4.2): Replace with generated types from:
//   npx supabase gen types typescript --project-id nenrhsiyepxaemhclctl > src/lib/db/types.ts
// Then: import type { Database } from "@/lib/db/types"
// ---------------------------------------------------------------------------
type Database = Record<string, unknown>;

// Vite injects VITE_* vars at build time — always strings or undefined.
const supabaseUrl = (import.meta.env["VITE_SUPABASE_URL"] as string | undefined) ?? "";
const supabaseAnonKey =
  (import.meta.env["VITE_SUPABASE_ANON_KEY"] as string | undefined) ?? "";

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    "[supabase] VITE_SUPABASE_URL หรือ VITE_SUPABASE_ANON_KEY ยังไม่ได้ตั้งค่า. " +
      "Copy .env.example → .env.local แล้วใส่ค่าจาก credentials.env"
  );
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);
