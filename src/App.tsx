import { Routes, Route, Navigate } from "react-router-dom";
import LoginPage from "@/routes/login";
import AdminIndexPage from "@/routes/admin/index";
import NotFoundPage from "@/routes/admin/404";

/**
 * App — router shell สำหรับ AIKrub Admin.
 *
 * Wave 4.0 scaffold: placeholder routes only.
 * Wave 4.2: เพิ่ม auth guard (ตรวจสอบ session + role ก่อนเข้า /admin/*)
 */
export default function App() {
  return (
    <Routes>
      {/* Redirect root to admin index */}
      <Route path="/" element={<Navigate to="/admin" replace />} />

      {/* Login — Wave 4.2 builds real auth */}
      <Route path="/login" element={<LoginPage />} />

      {/* Admin section */}
      <Route path="/admin" element={<AdminIndexPage />} />

      {/* 404 fallback */}
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
