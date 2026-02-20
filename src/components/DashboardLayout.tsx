import { useEffect, useState, useCallback } from "react";
import { Outlet, useNavigate, Link, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { LayoutDashboard, MessageSquare, Settings, LogOut, Shield, Link2, Users, TrendingUp, Crown, CalendarCheck } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

const DashboardLayout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);

  // Invalidate all queries to force fresh data
  const refreshAllData = useCallback(() => {
    queryClient.invalidateQueries();
  }, [queryClient]);

  useEffect(() => {
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        navigate("/auth");
        return;
      }

      setUser(session.user);
      setLoading(false);
      
      // Force fresh data on initial load
      refreshAllData();
    };

    checkUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session) {
        navigate("/auth");
      } else {
        setUser(session.user);
        // Refresh data on login/token refresh
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          refreshAllData();
        }
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate, refreshAllData]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast.success("Logout realizado com sucesso");
    navigate("/auth");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
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
    { icon: CalendarCheck, label: "Presenças", path: "/checkins" },
    { icon: Link2, label: "Integrações", path: "/integrations" },
    { icon: Settings, label: "Configurações", path: "/settings" },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-50 w-64 bg-sidebar text-sidebar-foreground shadow-xl">
        <div className="flex h-full flex-col">
          {/* Logo */}
          <div className="flex h-16 items-center gap-2 border-b border-sidebar-border px-6">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <Shield className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="text-lg font-bold">Sentinelle</span>
          </div>

          {/* Navigation */}
          <nav className="flex-1 space-y-1 p-4">
            {menuItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all hover:bg-sidebar-accent ${
                    isActive ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground/80"
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  {item.label}
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
                  <Crown className="w-5 h-5" />
                  Super Admin
                </Link>
              </div>
            )}
          </nav>

          {/* User Section */}
          <div className="border-t border-sidebar-border p-4">
            <div className="flex items-center gap-3 mb-3 px-2">
              <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                <span className="text-sm font-medium text-primary">
                  {user?.email?.[0]?.toUpperCase()}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{user?.email}</p>
              </div>
            </div>
            <Button
              variant="ghost"
              className="w-full justify-start gap-2 text-sidebar-foreground/80 hover:text-sidebar-foreground"
              onClick={handleLogout}
            >
              <LogOut className="w-4 h-4" />
              Sair
            </Button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="pl-64">
        <div className="min-h-screen">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default DashboardLayout;
