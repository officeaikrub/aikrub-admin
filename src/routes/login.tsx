/**
 * /login — Admin login page.
 *
 * Auth flow:
 * 1. signInWithPassword via Supabase (shared user pool with main app)
 * 2. Query profiles.role — must be 'admin' or 'owner'
 * 3. If not → sign out + show Thai error
 * 4. If OK → navigate to / (admin home)
 *
 * NO OTP — email + password only (OQ-01 yanked, Wave 4.2b).
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { WordmarkLogo } from "@/components/WordmarkLogo";

export default function LoginPage() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // Client-side validation
    if (!email.trim()) {
      setError("กรุณากรอกอีเมลค่ะ");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("รูปแบบอีเมลไม่ถูกต้องค่ะ");
      return;
    }
    if (!password) {
      setError("กรุณากรอกรหัสผ่านค่ะ");
      return;
    }

    setLoading(true);

    try {
      // Step 1: Supabase email/password auth
      const { data: authData, error: authError } =
        await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

      if (authError) {
        if (authError.code === "email_not_confirmed") {
          setError("กรุณาตรวจสอบอีเมลของคุณเพื่อยืนยันบัญชีก่อนนะคะ");
        } else {
          setError("อีเมลหรือรหัสผ่านไม่ถูกต้องค่ะ");
        }
        return;
      }

      if (!authData.user) {
        setError("เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ กรุณาลองใหม่อีกครั้งค่ะ");
        return;
      }

      // Step 2: Check role in profiles table
      // Cast through unknown because Database type stub hasn't been generated yet.
      // TODO: replace with generated types when `supabase gen types` runs (Wave 4.x).
      const profileRes = await (supabase as unknown as {
        from: (table: string) => {
          select: (cols: string) => {
            eq: (col: string, val: string) => {
              single: () => Promise<{
                data: { role: string } | null;
                error: { message: string } | null;
              }>;
            };
          };
        };
      })
        .from("profiles")
        .select("role")
        .eq("id", authData.user.id)
        .single();

      if (profileRes.error || !profileRes.data) {
        await supabase.auth.signOut();
        setError("ไม่สามารถตรวจสอบสิทธิ์ได้ กรุณาลองใหม่อีกครั้งค่ะ");
        return;
      }

      const role = profileRes.data.role;

      // Step 3: Only admin/owner may enter
      if (role !== "admin" && role !== "owner") {
        await supabase.auth.signOut();
        setError("บัญชีนี้ไม่มีสิทธิ์เข้าสู่ระบบ admin");
        return;
      }

      // Step 4: Authorized — go to admin home
      navigate("/", { replace: true });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4">
      {/* Brand */}
      <div className="text-center mb-8">
        <h1 className="font-display text-3xl tracking-tighter">
          <WordmarkLogo suffix=" Admin" />
        </h1>
        <p className="font-content text-sm text-muted-foreground mt-1">
          ระบบจัดการสำหรับทีม AIKrub
        </p>
      </div>

      {/* Card */}
      <div className="glass-shell w-full max-w-[400px] rounded-xl px-8 py-10">
        <h2 className="font-display text-xl text-foreground mb-6">
          เข้าสู่ระบบ
        </h2>

        <form
          onSubmit={(e) => {
            void handleSubmit(e);
          }}
          className="space-y-4"
        >
          {/* Email */}
          <div>
            <label className="block font-ui font-medium text-xs text-muted-foreground uppercase tracking-wide mb-1.5">
              อีเมล
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setError(null);
              }}
              placeholder="pete@aikrub.ai"
              autoComplete="email"
              className="w-full bg-background border border-white/10 rounded-sm px-3 py-2.5
                         font-content text-sm text-foreground placeholder:text-muted-foreground/50
                         focus:outline-none focus:border-primary transition-colors"
            />
          </div>

          {/* Password */}
          <div>
            <label className="block font-ui font-medium text-xs text-muted-foreground uppercase tracking-wide mb-1.5">
              รหัสผ่าน
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError(null);
                }}
                placeholder="••••••••"
                autoComplete="current-password"
                className="w-full bg-background border border-white/10 rounded-sm px-3 py-2.5 pr-11
                           font-content text-sm text-foreground placeholder:text-muted-foreground/50
                           focus:outline-none focus:border-primary transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                aria-label={showPassword ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
              >
                {showPassword ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          {/* Error message */}
          {error && (
            <p
              className="font-ui text-sm text-destructive"
              role="alert"
            >
              {error}
            </p>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="w-full h-11 rounded-sm bg-[var(--color-accent-deep)] hover:bg-[var(--color-accent-deep)]
                       text-primary-foreground font-ui text-sm font-medium
                       disabled:opacity-50 disabled:cursor-not-allowed
                       transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {loading ? "กำลังตรวจสอบ..." : "เข้าสู่ระบบ"}
          </button>
        </form>
      </div>
    </div>
  );
}
