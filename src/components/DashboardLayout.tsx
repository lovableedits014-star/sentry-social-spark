import { useEffect, useState, useCallback } from "react";
import { Outlet, useNavigate, Link, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard, MessageSquare, Settings, LogOut, Shield,
  Link2, Users, TrendingUp, Crown, CalendarCheck, Menu, X,
} from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

const DashboardLayout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  const refreshAllData = useCallback(() => {
    queryClient.invalidateQueries();
  }, [queryClient]);

  useEffect(() => {
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate("/auth"); return; }
      setUser(session.user);
      setLoading(false);
      refreshAllData();
    };
    checkUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session) {
        navigate("/auth");
      } else {
        setUser(session.user);
        if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") refreshAllData();
      }
    });
    return () => subscription.unsubscribe();
  }, [navigate, refreshAllData]);

  // Close mobile sidebar on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast.success("Logout realizado com sucesso");
    navigate("/auth");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  const SUPER_ADMIN_EMAIL = "lovableedits014@gmail.com";
  const isSuperAdmin = user?.email === SUPER_ADMIN_EMAIL;

  const menuItems = [
    { icon: LayoutDashboard, label: "Dashboard", path: "/dashboard" },
    { icon: MessageSquare, label: "Comentários", path: "/comments" },
    { icon: Users, label: "Apoiadores", path: "/supporters" },
    { icon: TrendingUp, label: "Engajamento", path: "/engagement" },
    { icon: CalendarCheck, label: "Presenças / Disparos", path: "/checkins" },
    { icon: Link2, label: "Integrações", path: "/integrations" },
    { icon: Settings, label: "Configurações", path: "/settings" },
  ];

  const SidebarContent = () => (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div className="flex h-16 items-center gap-2 border-b border-sidebar-border px-6">
        <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center shrink-0">
          <Shield className="w-5 h-5 text-primary-foreground" />
        </div>
        <span className="text-lg font-bold">Sentinelle</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 p-4 overflow-y-auto">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all hover:bg-sidebar-accent ${
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/80"
              }`}
            >
              <Icon className="w-5 h-5 shrink-0" />
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}

        {isSuperAdmin && (
          <div className="pt-2 mt-2 border-t border-sidebar-border">
            <Link
              to="/super-admin"
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all hover:bg-sidebar-accent ${
                location.pathname === "/super-admin"
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-amber-400/90 hover:text-amber-400"
              }`}
            >
              <Crown className="w-5 h-5 shrink-0" />
              <span>Super Admin</span>
            </Link>
          </div>
        )}
      </nav>

      {/* User Section */}
      <div className="border-t border-sidebar-border p-4">
        <div className="flex items-center gap-3 mb-3 px-2">
          <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
            <span className="text-sm font-medium text-primary">
              {user?.email?.[0]?.toUpperCase()}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium truncate text-sidebar-foreground/80">{user?.email}</p>
          </div>
        </div>
        <Button
          variant="ghost"
          className="w-full justify-start gap-2 text-sidebar-foreground/80 hover:text-sidebar-foreground"
          onClick={handleLogout}
        >
          <LogOut className="w-4 h-4 shrink-0" />
          Sair
        </Button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">

      {/* ── DESKTOP sidebar (hidden on mobile) ── */}
      <aside className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-50 lg:flex lg:w-64 flex-col bg-sidebar text-sidebar-foreground shadow-xl">
        <SidebarContent />
      </aside>

      {/* ── MOBILE top bar ── */}
      <header className="lg:hidden fixed top-0 inset-x-0 z-40 h-14 flex items-center gap-3 border-b bg-sidebar text-sidebar-foreground px-4 shadow-sm">
        <button
          onClick={() => setMobileOpen(true)}
          className="p-1.5 rounded-md hover:bg-sidebar-accent transition-colors"
          aria-label="Abrir menu"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-primary rounded-md flex items-center justify-center shrink-0">
            <Shield className="w-4 h-4 text-primary-foreground" />
          </div>
          <span className="font-bold text-base">Sentinelle</span>
        </div>
      </header>

      {/* ── MOBILE drawer overlay ── */}
      {mobileOpen && (
        <>
          {/* Backdrop */}
          <div
            className="lg:hidden fixed inset-0 z-50 bg-black/50"
            onClick={() => setMobileOpen(false)}
          />
          {/* Drawer */}
          <aside className="lg:hidden fixed inset-y-0 left-0 z-50 w-72 bg-sidebar text-sidebar-foreground shadow-2xl flex flex-col">
            {/* Close button row */}
            <div className="flex items-center justify-between h-14 px-4 border-b border-sidebar-border">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 bg-primary rounded-md flex items-center justify-center shrink-0">
                  <Shield className="w-4 h-4 text-primary-foreground" />
                </div>
                <span className="font-bold text-base">Sentinelle</span>
              </div>
              <button
                onClick={() => setMobileOpen(false)}
                className="p-1.5 rounded-md hover:bg-sidebar-accent transition-colors"
                aria-label="Fechar menu"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Nav */}
            <nav className="flex-1 space-y-1 p-4 overflow-y-auto">
              {menuItems.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.path;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium transition-all hover:bg-sidebar-accent ${
                      isActive
                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                        : "text-sidebar-foreground/80"
                    }`}
                  >
                    <Icon className="w-5 h-5 shrink-0" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}

              {isSuperAdmin && (
                <div className="pt-2 mt-2 border-t border-sidebar-border">
                  <Link
                    to="/super-admin"
                    className={`flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium transition-all hover:bg-sidebar-accent ${
                      location.pathname === "/super-admin"
                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                        : "text-amber-400/90 hover:text-amber-400"
                    }`}
                  >
                    <Crown className="w-5 h-5 shrink-0" />
                    <span>Super Admin</span>
                  </Link>
                </div>
              )}
            </nav>

            {/* User */}
            <div className="border-t border-sidebar-border p-4">
              <div className="flex items-center gap-3 mb-3 px-2">
                <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                  <span className="text-sm font-medium text-primary">
                    {user?.email?.[0]?.toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate text-sidebar-foreground/80">{user?.email}</p>
                </div>
              </div>
              <Button
                variant="ghost"
                className="w-full justify-start gap-2 text-sidebar-foreground/80 hover:text-sidebar-foreground"
                onClick={handleLogout}
              >
                <LogOut className="w-4 h-4 shrink-0" />
                Sair
              </Button>
            </div>
          </aside>
        </>
      )}

      {/* ── Main Content ── */}
      {/* Desktop: offset by sidebar; Mobile: offset by top bar */}
      <main className="lg:pl-64 pt-14 lg:pt-0">
        <div className="min-h-screen">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default DashboardLayout;
