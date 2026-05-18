import { Routes, Route, Navigate } from "react-router-dom";
import LoginPage from "@/routes/login";
import AdminLayout from "@/components/AdminLayout";
import DashboardPlaceholder from "@/components/DashboardPlaceholder";
import ComingSoon from "@/components/ComingSoon";
import NotFoundPage from "@/routes/admin/404";

/**
 * App — router shell สำหรับ AIKrub Admin.
 *
 * Wave 4.2b:
 *   - /login → LoginPage (Supabase auth + role check)
 *   - /* wrapped in AdminLayout (auth guard + glass nav shell)
 *   - Placeholder routes for Wave 4.3/4.4/Sprint 3/4
 */
export default function App() {
  return (
    <Routes>
      {/* Login — no auth guard */}
      <Route path="/login" element={<LoginPage />} />

      {/* Authenticated admin section — AdminLayout handles auth guard */}
      <Route element={<AdminLayout />}>
        <Route index element={<DashboardPlaceholder />} />
        <Route
          path="/coupons"
          element={<ComingSoon name="จัดการคูปอง" />}
        />
        <Route
          path="/users"
          element={<ComingSoon name="จัดการผู้ใช้" />}
        />
        <Route
          path="/generations"
          element={<ComingSoon name="ประวัติการสร้าง" />}
        />
        <Route
          path="/financials"
          element={<ComingSoon name="รายการเงิน" />}
        />
        <Route
          path="/providers"
          element={<ComingSoon name="จัดการ Provider" />}
        />
        <Route
          path="/system"
          element={<ComingSoon name="ตั้งค่าระบบ" />}
        />
        <Route
          path="/admins"
          element={<ComingSoon name="จัดการแอดมิน" />}
        />
      </Route>

      {/* Redirect /admin → / for backward compat with Wave 4.0 scaffold */}
      <Route path="/admin" element={<Navigate to="/" replace />} />
      <Route path="/admin/*" element={<Navigate to="/" replace />} />

      {/* 404 fallback */}
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
