/**
 * DashboardPlaceholder — placeholder สำหรับ / (admin home).
 * Sprint 4 จะ replace ด้วย Dashboard จริง.
 */

import { WordmarkLogo } from "@/components/WordmarkLogo";

export default function DashboardPlaceholder() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 px-6">
      <div className="text-center">
        <h1 className="font-display text-2xl mb-2">
          <WordmarkLogo suffix=" Admin" />
        </h1>
        <p className="font-content text-sm text-muted-foreground">
          ภาพรวม — กำลังสร้าง (Sprint 4)
        </p>
        <p className="font-ui text-xs text-muted-foreground/60 mt-3">
          ระบบ auth + nav shell พร้อมแล้ว ✓
        </p>
      </div>
    </div>
  );
}
