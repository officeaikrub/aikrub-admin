# AIKrub Admin

ระบบ Admin Panel สำหรับ AIKrub — Vite + React + TypeScript + Tailwind (dark-first)

Deploy ที่: `https://aikrub-admin.pages.dev`
Backend (shared Worker): `https://aikrub-api.office-aikrub.workers.dev`

---

## โครงสร้างโฟลเดอร์

```
007-admin/
├── .env.example          # template env vars — copy to .env.local (gitignored)
├── index.html            # entry HTML — title "AIKrub Admin", dark bg pre-hydration
├── package.json          # Vite + React 18 + TS strict + Tailwind
├── tailwind.config.ts    # design tokens (mirror main AIKrub repo)
├── vite.config.ts        # dev port 5174 (ไม่ชนกับ main 5173)
├── src/
│   ├── main.tsx          # React entry — dark mode init, QueryClient, BrowserRouter
│   ├── index.css         # design tokens + glass-shell utility class
│   ├── App.tsx           # router shell (placeholder routes)
│   ├── routes/
│   │   ├── login.tsx     # placeholder — Wave 4.2 builds real auth
│   │   └── admin/
│   │       ├── index.tsx # placeholder admin home
│   │       └── 404.tsx   # 404 fallback
│   ├── components/
│   │   └── admin/        # empty — Wave 4.2+ เพิ่ม components ที่นี่
│   └── lib/
│       ├── supabase.ts   # Supabase client (same project as main repo)
│       └── api.ts        # typed fetch wrapper → Worker /api/admin/*
└── public/
    └── _redirects        # Cloudflare Pages SPA fallback (/* → /index.html 200)
```

Links ที่เกี่ยวข้อง:
- Main repo: `D:\AI\Claude CLI\Project\007\` / GitHub: https://github.com/officeaikrub/AIKrub
- Admin spec: `007/docs/specs/admin-backend-spec.md`
- Design research: `007/docs/research/admin-design-glassmorphism-utility-2026.md`

---

## วิธี run dev

```bash
# 1. install dependencies
npm install

# 2. copy env template
cp .env.example .env.local

# 3. ใส่ค่าจริงใน .env.local
#    VITE_SUPABASE_ANON_KEY → copy จาก C:\Users\Admin\Documents\AIKrub-secrets\credentials.env

# 4. start dev server (port 5174)
npm run dev
```

เปิด browser: http://localhost:5174

---

## วิธี deploy

push ขึ้น `main` → Cloudflare Pages auto-deploy

Build settings ที่ตั้งใน Cloudflare Pages dashboard:
- **Build command:** `npm run build`
- **Build output directory:** `dist`
- **Node.js version:** 20+

Environment variables ที่ต้องตั้งใน Cloudflare Pages dashboard (Settings → Environment variables):
```
VITE_API_URL            = https://aikrub-api.office-aikrub.workers.dev
VITE_SUPABASE_URL       = https://nenrhsiyepxaemhclctl.supabase.co
VITE_SUPABASE_ANON_KEY  = <ค่าจาก credentials.env>
```

---

## Wave roadmap

| Wave | งาน |
|------|-----|
| 4.0 ✓ | Scaffold repo นี้ — structure + tokens + build pass |
| 4.2 | Login จริง (Supabase auth + role check) + Coupon UI |
| 4.3 | User management (view-only list + credit adjust) |
| 4.4 | System health dashboard (Kie.ai balance, error rate) |
