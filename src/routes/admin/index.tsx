/**
 * Admin Index — placeholder (Wave 4.0 scaffold).
 * Wave 4.2+: Coupon management, user list, system health dashboard.
 */
export default function AdminIndexPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-surface">
      <div className="glass-shell rounded-lg p-10 w-full max-w-md text-center">
        <h1 className="font-display text-3xl font-bold text-fg mb-3">
          AIKrub Admin
        </h1>
        <p className="text-fg-muted">
          เมนู Coupon และระบบจัดการกำลังสร้าง — Wave 4.2
        </p>
        <div className="mt-6 flex flex-col gap-2 text-xs text-fg-subtle">
          <span>Scaffold: Wave 4.0 ✓</span>
          <span>Auth + Coupon UI: Wave 4.2</span>
          <span>User Management: Wave 4.3</span>
        </div>
      </div>
    </div>
  );
}
