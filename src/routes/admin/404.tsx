import { Link } from "react-router-dom";

/**
 * 404 — หน้าไม่พบ สำหรับ admin panel.
 */
export default function NotFoundPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-surface">
      <div className="text-center">
        <p className="text-6xl font-display text-fg-subtle mb-4">404</p>
        <h1 className="text-xl text-fg mb-2">ไม่พบหน้าที่ต้องการ</h1>
        <p className="text-fg-muted text-sm mb-6">
          URL นี้ไม่มีอยู่ใน admin panel
        </p>
        <Link
          to="/admin"
          className="text-accent hover:text-accent-deep text-sm underline underline-offset-4"
        >
          กลับหน้าหลัก
        </Link>
      </div>
    </div>
  );
}
