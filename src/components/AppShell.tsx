import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { useEffect, useState, type ReactNode } from "react";
import {
  LayoutDashboard,
  Package,
  Receipt,
  ShoppingCart,
  LogOut,
  Wifi,
  WifiOff,
  ClipboardList,
  TrendingUp,
  Tag,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { BRAND_LOGO_URL } from "@/lib/brand-logo";

export { BRAND_LOGO_URL };

export function AppShell({ children, role }: { children: ReactNode; role: "admin" | "cashier" }) {
  const { user, logout, loading } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [online, setOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login" });
    else if (!loading && user && role === "admin" && user.role !== "admin")
      navigate({ to: "/pos" });
  }, [user, loading, role, navigate]);

  // Refresh the on-device item catalog from the shared one (silent, best effort).
  useEffect(() => {
    let done = false;
    void import("@/lib/items-sync").then(({ syncItemsQuietly }) => {
      if (!done) void syncItemsQuietly();
    });
    return () => {
      done = true;
    };
  }, []);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  if (loading) {
    return <ShellFallback message="Loading your POS workspace…" />;
  }

  if (!user) {
    return <ShellFallback message="Redirecting to sign in…" />;
  }

  const adminNav = [
    { to: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
    { to: "/admin/sales-margin", label: "Sales & Margin", icon: TrendingUp },
    { to: "/admin/items", label: "Items", icon: Package },
    { to: "/admin/price-cards", label: "Price Cards", icon: Tag },
    { to: "/admin/members", label: "Members", icon: Users },
    { to: "/admin/transactions", label: "Transactions", icon: Receipt },
    { to: "/admin/stock-opname", label: "Stock Opname", icon: ClipboardList },
    { to: "/pos", label: "Open POS", icon: ShoppingCart },
  ] as const;

  const cashierNav = [{ to: "/pos", label: "POS", icon: ShoppingCart, exact: true }] as const;
  const nav = role === "admin" ? adminNav : cashierNav;

  return (
    <div className="min-h-screen flex bg-background">
      <aside className="hidden md:flex w-64 flex-col bg-[color:var(--sidebar)] text-[color:var(--sidebar-foreground)]">
        <div className="px-4 py-3 flex items-center gap-3 border-b border-[color:var(--sidebar-border)] bg-white/95">
          <img src={BRAND_LOGO_URL} alt="AmanMart" className="h-10 w-auto object-contain" />
          <div className="ml-auto text-[10px] uppercase tracking-wider text-neutral-600 font-semibold">
            {role}
          </div>
        </div>
        <nav className="p-3 flex-1 space-y-1">
          {nav.map((n) => {
            const Icon = n.icon;
            const active = "exact" in n && n.exact ? pathname === n.to : pathname.startsWith(n.to);
            return (
              <Link
                key={n.to}
                to={n.to}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
                  active
                    ? "bg-[color:var(--sidebar-accent)] text-[color:var(--sidebar-accent-foreground)]"
                    : "text-[color:var(--sidebar-foreground)]/80 hover:bg-[color:var(--sidebar-accent)]/60",
                )}
              >
                <Icon className="h-4 w-4" />
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t border-[color:var(--sidebar-border)] space-y-2">
          <div className="flex items-center gap-2 px-2 text-xs">
            {online ? (
              <>
                <Wifi className="h-3.5 w-3.5 text-[color:var(--accent)]" />{" "}
                <span className="text-[color:var(--sidebar-foreground)]/70">Online</span>
              </>
            ) : (
              <>
                <WifiOff className="h-3.5 w-3.5 text-warning" />{" "}
                <span className="text-[color:var(--sidebar-foreground)]/70">Offline mode</span>
              </>
            )}
          </div>
          <div className="px-2 text-sm">
            <div className="font-medium truncate">{user.name}</div>
            <div className="text-xs text-[color:var(--sidebar-foreground)]/60">
              @{user.username}
            </div>
          </div>
          <Button
            variant="secondary"
            size="sm"
            className="w-full"
            onClick={() => {
              logout();
              navigate({ to: "/login" });
            }}
          >
            <LogOut className="h-4 w-4 mr-2" /> Sign out
          </Button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 inset-x-0 z-40 bg-white text-neutral-900 flex items-center justify-between px-3 h-14 border-b border-[color:var(--sidebar-border)]">
        <img src={BRAND_LOGO_URL} alt="AmanMart" className="h-9 w-auto object-contain" />
        <div className="flex items-center gap-2">
          {!online && <WifiOff className="h-4 w-4 text-warning" />}
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              logout();
              navigate({ to: "/login" });
            }}
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <main className="flex-1 md:ml-0 pt-14 md:pt-0 min-w-0">{children}</main>
    </div>
  );
}

function ShellFallback({ message }: { message: string }) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6">
      <div className="w-full max-w-md rounded-xl border bg-card p-6 shadow-soft text-center">
        <div className="mx-auto mb-4 h-10 w-10 rounded-lg bg-primary text-primary-foreground grid place-items-center font-display font-bold">
          A
        </div>
        <h1 className="font-display text-2xl font-bold">AmanPOS</h1>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
      </div>
    </div>
  );
}
