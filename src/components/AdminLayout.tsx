/**
 * AdminLayout — glassmorphism nav shell for all authenticated admin routes.
 *
 * Desktop (≥768px):
 *   - Left sidebar (collapsible with chevron toggle): glass-shell
 *   - Top bar: glass-shell, brand wordmark + avatar dropdown
 *   - Main content: solid bg-card/95
 *
 * Mobile (<768px):
 *   - Bottom nav (5 core items)
 *   - Top bar: hamburger → Sheet drawer with full menu
 *
 * Auth guard:
 *   - On mount: GET /api/admin/whoami
 *   - 401/403 → redirect /login
 *   - 200 → render children via AdminContext
 *
 * Role context:
 *   - Exposes { user, role } via useAdmin()
 *   - "จัดการแอดมิน" menu item hidden when role !== 'owner'
 */

import { createContext, useContext, useEffect, useState } from "react";
import { Outlet, useNavigate, useLocation, Link } from "react-router-dom";
import {
  LayoutDashboard,
  Ticket,
  Users,
  History,
  Wallet,
  Package,
  Settings,
  Shield,
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
  LogOut,
  User,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { apiFetch, ApiError } from "@/lib/api";
import { WordmarkLogo } from "@/components/WordmarkLogo";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetClose,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AdminUser {
  id: string;
  email: string;
  role: "admin" | "owner";
}

interface AdminContextValue {
  user: AdminUser;
  role: "admin" | "owner";
}

const AdminContext = createContext<AdminContextValue | null>(null);

export function useAdmin(): AdminContextValue {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error("useAdmin must be used inside AdminLayout");
  return ctx;
}

// ---------------------------------------------------------------------------
// whoami response type
// ---------------------------------------------------------------------------

interface WhoamiResponse {
  ok: true;
  user: {
    id: string;
    email: string;
    role: "admin" | "owner";
  };
}

// ---------------------------------------------------------------------------
// Nav items definition
// ---------------------------------------------------------------------------

interface NavItem {
  label: string;
  icon: React.ReactNode;
  to: string;
  ownerOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { label: "ภาพรวม",           icon: <LayoutDashboard className="w-4 h-4" />, to: "/" },
  { label: "จัดการคูปอง",      icon: <Ticket          className="w-4 h-4" />, to: "/coupons" },
  { label: "จัดการผู้ใช้",     icon: <Users           className="w-4 h-4" />, to: "/users" },
  { label: "ประวัติการสร้าง",  icon: <History         className="w-4 h-4" />, to: "/generations" },
  { label: "รายการเงิน",       icon: <Wallet          className="w-4 h-4" />, to: "/financials" },
  { label: "จัดการ Provider",  icon: <Package         className="w-4 h-4" />, to: "/providers" },
  { label: "ตั้งค่าระบบ",      icon: <Settings        className="w-4 h-4" />, to: "/system" },
  { label: "จัดการแอดมิน",    icon: <Shield          className="w-4 h-4" />, to: "/admins", ownerOnly: true },
];

// Bottom nav (mobile) — 5 most-used items
const BOTTOM_NAV_ITEMS: NavItem[] = [
  { label: "ภาพรวม",      icon: <LayoutDashboard className="w-5 h-5" />, to: "/" },
  { label: "คูปอง",       icon: <Ticket          className="w-5 h-5" />, to: "/coupons" },
  { label: "ผู้ใช้",      icon: <Users           className="w-5 h-5" />, to: "/users" },
  { label: "การเงิน",     icon: <Wallet          className="w-5 h-5" />, to: "/financials" },
  { label: "ตั้งค่า",     icon: <Settings        className="w-5 h-5" />, to: "/system" },
];

// ---------------------------------------------------------------------------
// NavLink helper
// ---------------------------------------------------------------------------

function SidebarNavLink({
  item,
  collapsed,
  onClick,
}: {
  item: NavItem;
  collapsed: boolean;
  onClick?: () => void;
}) {
  const location = useLocation();
  const isActive =
    item.to === "/"
      ? location.pathname === "/"
      : location.pathname.startsWith(item.to);

  return (
    <Link
      to={item.to}
      onClick={onClick}
      title={collapsed ? item.label : undefined}
      className={cn(
        "flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors",
        "font-ui text-sm min-h-[44px]",
        isActive
          ? "bg-primary/15 text-primary border border-primary/20"
          : "text-muted-foreground hover:bg-white/6 hover:text-foreground",
        collapsed && "justify-center px-2"
      )}
    >
      <span className="shrink-0">{item.icon}</span>
      {!collapsed && <span className="truncate">{item.label}</span>}
    </Link>
  );
}

// ---------------------------------------------------------------------------
// AdminLayout
// ---------------------------------------------------------------------------

export default function AdminLayout() {
  const navigate = useNavigate();

  const [adminUser, setAdminUser] = useState<AdminUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Auth guard: call /api/admin/whoami
  useEffect(() => {
    async function checkAuth() {
      try {
        const res = await apiFetch<WhoamiResponse>("/api/admin/whoami");
        setAdminUser({
          id: res.user.id,
          email: res.user.email,
          role: res.user.role,
        });
      } catch (err) {
        if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
          navigate("/login", { replace: true });
        } else {
          // Network error or endpoint not deployed yet — fall back to Supabase local session
          const { data: { session } } = await supabase.auth.getSession();
          if (!session) {
            navigate("/login", { replace: true });
            return;
          }
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
            .eq("id", session.user.id)
            .single();

          const role = profileRes.data?.role;
          if (role !== "admin" && role !== "owner") {
            await supabase.auth.signOut();
            navigate("/login", { replace: true });
            return;
          }
          setAdminUser({
            id: session.user.id,
            email: session.user.email ?? "",
            role: role as "admin" | "owner",
          });
        }
      } finally {
        setAuthLoading(false);
      }
    }
    void checkAuth();
  }, [navigate]);

  async function handleSignOut() {
    await supabase.auth.signOut();
    navigate("/login", { replace: true });
  }

  // Loading state while auth check runs
  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="font-ui text-sm text-muted-foreground">กำลังตรวจสอบสิทธิ์...</p>
      </div>
    );
  }

  if (!adminUser) {
    // Should have navigated away already, but render nothing as safety net
    return null;
  }

  const visibleNavItems = NAV_ITEMS.filter(
    (item) => !item.ownerOnly || adminUser.role === "owner"
  );

  // Avatar initial
  const avatarInitial = (adminUser.email[0] ?? "A").toUpperCase();

  return (
    <AdminContext.Provider value={{ user: adminUser, role: adminUser.role }}>
      <div className="min-h-screen bg-background flex flex-col">
        {/* ── TOP BAR ── */}
        <header className="glass-shell sticky top-0 z-40 h-14 flex items-center gap-4 px-4 border-b border-white/10">
          {/* Mobile hamburger */}
          <button
            className="md:hidden flex items-center justify-center w-11 h-11 rounded-md text-muted-foreground hover:text-foreground hover:bg-white/6 transition-colors"
            onClick={() => setMobileMenuOpen(true)}
            aria-label="เปิดเมนู"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Desktop sidebar collapse toggle */}
          <button
            className="hidden md:flex items-center justify-center w-8 h-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-white/6 transition-colors shrink-0"
            onClick={() => setSidebarCollapsed((v) => !v)}
            aria-label={sidebarCollapsed ? "ขยาย sidebar" : "ย่อ sidebar"}
          >
            {sidebarCollapsed ? (
              <ChevronRight className="w-4 h-4" />
            ) : (
              <ChevronLeft className="w-4 h-4" />
            )}
          </button>

          {/* Brand wordmark */}
          <span className="font-display text-lg font-bold tracking-tight">
            <WordmarkLogo suffix=" Admin" />
          </span>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Avatar dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="flex items-center justify-center w-9 h-9 rounded-full bg-primary/20 border border-primary/30 text-primary font-ui text-sm font-medium hover:bg-primary/30 transition-colors"
                aria-label="เมนูผู้ใช้"
              >
                {avatarInitial}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <div className="px-3 py-2">
                <p className="font-ui text-xs text-muted-foreground truncate max-w-[180px]">
                  {adminUser.email}
                </p>
                <p className="font-ui text-xs text-primary mt-0.5 capitalize">
                  {adminUser.role}
                </p>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem>
                <User className="w-4 h-4 text-muted-foreground" />
                โปรไฟล์
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => {
                  void handleSignOut();
                }}
                className="text-destructive focus:text-destructive"
              >
                <LogOut className="w-4 h-4" />
                ออกจากระบบ
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        {/* ── BODY: sidebar + content ── */}
        <div className="flex flex-1 overflow-hidden">
          {/* Desktop sidebar */}
          <aside
            className={cn(
              "hidden md:flex flex-col glass-shell border-r border-white/10",
              "h-[calc(100vh-56px)] sticky top-14 shrink-0 transition-all duration-200",
              sidebarCollapsed ? "w-14" : "w-56"
            )}
          >
            <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
              {visibleNavItems.map((item) => (
                <SidebarNavLink
                  key={item.to}
                  item={item}
                  collapsed={sidebarCollapsed}
                />
              ))}
            </nav>
          </aside>

          {/* Mobile hamburger Sheet */}
          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetContent side="left" className="flex flex-col">
              <SheetHeader className="flex-row items-center justify-between pb-2">
                <SheetTitle>
                  <WordmarkLogo suffix=" Admin" />
                </SheetTitle>
                <SheetClose asChild>
                  <button
                    className="flex items-center justify-center w-8 h-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-white/6 transition-colors"
                    aria-label="ปิดเมนู"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </SheetClose>
              </SheetHeader>
              <nav className="flex-1 px-2 py-2 space-y-0.5 overflow-y-auto">
                {visibleNavItems.map((item) => (
                  <SidebarNavLink
                    key={item.to}
                    item={item}
                    collapsed={false}
                    onClick={() => setMobileMenuOpen(false)}
                  />
                ))}
              </nav>
              <div className="px-4 py-4 border-t border-white/10">
                <p className="font-ui text-xs text-muted-foreground truncate">{adminUser.email}</p>
                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    void handleSignOut();
                  }}
                  className="mt-2 flex items-center gap-2 font-ui text-sm text-destructive hover:text-destructive/80 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  ออกจากระบบ
                </button>
              </div>
            </SheetContent>
          </Sheet>

          {/* Main content */}
          <main className="flex-1 min-w-0 bg-card/95 overflow-y-auto pb-20 md:pb-0">
            <Outlet />
          </main>
        </div>

        {/* ── MOBILE BOTTOM NAV ── */}
        <nav className="md:hidden glass-shell fixed bottom-0 inset-x-0 z-40 border-t border-white/10 h-16 flex items-center justify-around px-2">
          {BOTTOM_NAV_ITEMS.map((item) => (
            <MobileBottomNavItem key={item.to} item={item} />
          ))}
        </nav>
      </div>
    </AdminContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Mobile bottom nav item
// ---------------------------------------------------------------------------

function MobileBottomNavItem({ item }: { item: NavItem }) {
  const location = useLocation();
  const isActive =
    item.to === "/"
      ? location.pathname === "/"
      : location.pathname.startsWith(item.to);

  return (
    <Link
      to={item.to}
      className={cn(
        "flex flex-col items-center gap-1 min-w-[44px] min-h-[44px] justify-center rounded-md transition-colors",
        isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
      )}
    >
      {item.icon}
      <span className="font-ui text-[10px] leading-none">{item.label}</span>
    </Link>
  );
}
