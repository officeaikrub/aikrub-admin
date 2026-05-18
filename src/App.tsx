import { Routes, Route, Navigate } from "react-router-dom";
import LoginPage from "@/routes/login";
import AdminLayout from "@/components/AdminLayout";
import DashboardPlaceholder from "@/components/DashboardPlaceholder";
import ComingSoon from "@/components/ComingSoon";
import SystemPricing from "@/routes/admin/system";
import NotFoundPage from "@/routes/admin/404";
import CouponList from "@/routes/admin/coupons/list";
import CouponDetail from "@/routes/admin/coupons/detail";
import UserList from "@/routes/admin/users/list";
import UserDetail from "@/routes/admin/users/detail";

/**
 * App — router shell สำหรับ AIKrub Admin.
 *
 * Wave 4.2b / 4.3:
 *   - /login → LoginPage (Supabase auth + role check)
 *   - /* wrapped in AdminLayout (auth guard + glass nav shell)
 *   - Wave 4.3: /coupons/create-paid + /coupons/create-free removed;
 *     coupon creation is now a Radix Dialog modal over /coupons (CreateCouponModal)
 */
export default function App() {
  return (
    <Routes>
      {/* Login — no auth guard */}
      <Route path="/login" element={<LoginPage />} />

      {/* Authenticated admin section — AdminLayout handles auth guard */}
      <Route element={<AdminLayout />}>
        <Route index element={<DashboardPlaceholder />} />
        <Route path="/coupons">
          <Route index element={<CouponList />} />
          {/* create-paid and create-free routes removed in Wave 4.3 — modal-only */}
          <Route path=":id" element={<CouponDetail />} />
        </Route>
        <Route path="/users">
          <Route index element={<UserList />} />
          <Route path=":id" element={<UserDetail />} />
        </Route>
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
          element={<SystemPricing />}
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
