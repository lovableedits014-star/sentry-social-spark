import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Link } from "react-router-dom";
import {
  Users, UserPlus, CalendarCheck, Trophy, Share2, Sparkles,
  BookUser, TrendingUp, Crown, ArrowRight, Flame, MapPin,
} from "lucide-react";

interface DashboardOverviewProps {
  clientId: string;
}

export function DashboardOverview({ clientId }: DashboardOverviewProps) {
  // Base Política count
  const { data: pessoasCount } = useQuery({
    queryKey: ["overview-pessoas", clientId],
    queryFn: async () => {
      const { count } = await supabase
        .from("pessoas")
        .select("*", { count: "exact", head: true })
        .eq("client_id", clientId);
      return count || 0;
    },
    enabled: !!clientId,
  });

  // Portal accounts count
  const { data: accountStats } = useQuery({
    queryKey: ["overview-accounts", clientId],
    queryFn: async () => {
      const { count: total } = await supabase
        .from("supporter_accounts")
        .select("*", { count: "exact", head: true })
        .eq("client_id", clientId);

      const { count: referred } = await supabase
        .from("supporter_accounts")
        .select("*", { count: "exact", head: true })
        .eq("client_id", clientId)
        .not("referred_by", "is", null);

      return { total: total || 0, referred: referred || 0 };
    },
    enabled: !!clientId,
  });

  // Check-ins today
  const { data: checkinStats } = useQuery({
    queryKey: ["overview-checkins", clientId],
    queryFn: async () => {
      const today = new Date().toISOString().split("T")[0];
      const { count: todayCount } = await supabase
        .from("supporter_checkins")
        .select("*", { count: "exact", head: true })
        .eq("client_id", clientId)
        .eq("checkin_date", today);

      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const { count: weekCount } = await supabase
        .from("supporter_checkins")
        .select("*", { count: "exact", head: true })
        .eq("client_id", clientId)
        .gte("checkin_date", sevenDaysAgo.toISOString().split("T")[0]);

      return { today: todayCount || 0, week: weekCount || 0 };
    },
    enabled: !!clientId,
  });

  // Top multiplier
  const { data: topMultiplier } = useQuery({
    queryKey: ["overview-top-mult", clientId],
    queryFn: async () => {
      const { data } = await supabase
        .from("supporters")
        .select("name, referral_count")
        .eq("client_id", clientId)
        .gt("referral_count", 0)
        .order("referral_count", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: !!clientId,
  });

  // Top digital leader (composite score - simplified)
  const { data: topLeader } = useQuery({
    queryKey: ["overview-top-leader", clientId],
    queryFn: async () => {
      const { data: accounts } = await supabase
        .from("supporter_accounts")
        .select("id, name, supporter_id")
        .eq("client_id", clientId);

      if (!accounts || accounts.length === 0) return null;

      const accountIds = accounts.map(a => a.id);

      // Count referrals
      const { data: referrals } = await supabase
        .from("referrals")
        .select("referrer_account_id")
        .eq("client_id", clientId)
        .in("referrer_account_id", accountIds);

      const refCounts: Record<string, number> = {};
      (referrals || []).forEach((r: any) => {
        refCounts[r.referrer_account_id] = (refCounts[r.referrer_account_id] || 0) + 1;
      });

      // Count checkins (30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const { data: checkins } = await supabase
        .from("supporter_checkins")
        .select("supporter_account_id")
        .eq("client_id", clientId)
        .in("supporter_account_id", accountIds)
        .gte("checkin_date", thirtyDaysAgo.toISOString().split("T")[0]);

      const checkinCounts: Record<string, number> = {};
      (checkins || []).forEach((c: any) => {
        checkinCounts[c.supporter_account_id] = (checkinCounts[c.supporter_account_id] || 0) + 1;
      });

      // Engagement scores
      const supporterIds = accounts.map(a => a.supporter_id).filter(Boolean) as string[];
      const engScores: Record<string, number> = {};
      if (supporterIds.length > 0) {
        const { data: supporters } = await supabase
          .from("supporters")
          .select("id, engagement_score")
          .in("id", supporterIds);
        (supporters || []).forEach((s: any) => {
          engScores[s.id] = s.engagement_score || 0;
        });
      }

      let best: { name: string; score: number } | null = null;
      for (const a of accounts) {
        const score = ((refCounts[a.id] || 0) * 10) +
          ((checkinCounts[a.id] || 0) * 2) +
          (a.supporter_id ? (engScores[a.supporter_id] || 0) : 0);
        if (score > 0 && (!best || score > best.score)) {
          best = { name: a.name, score };
        }
      }
      return best;
    },
    enabled: !!clientId,
  });

  // Territorial zones
  const { data: zonesCount } = useQuery({
    queryKey: ["overview-zones", clientId],
    queryFn: async () => {
      const { count } = await supabase
        .from("territorial_zones")
        .select("*", { count: "exact", head: true })
        .eq("client_id", clientId);
      return count || 0;
    },
    enabled: !!clientId,
  });

  // Active missions
  const { data: missionsCount } = useQuery({
    queryKey: ["overview-missions", clientId],
    queryFn: async () => {
      const { count } = await supabase
        .from("portal_missions")
        .select("*", { count: "exact", head: true })
        .eq("client_id", clientId)
        .eq("is_active", true);
      return count || 0;
    },
    enabled: !!clientId,
  });

  const referralPct = accountStats && accountStats.total > 0
    ? Math.round((accountStats.referred / accountStats.total) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* Section title */}
      <div className="flex items-center gap-2">
        <Flame className="w-5 h-5 text-primary" />
        <h2 className="text-lg font-bold">Visão Geral da Mobilização</h2>
      </div>

      {/* Metrics grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Link to="/pessoas" className="block">
          <Card className="hover:shadow-md transition-shadow h-full cursor-pointer">
            <CardContent className="pt-4 pb-3 px-4">
              <BookUser className="w-4 h-4 text-primary mb-1" />
              <p className="text-2xl font-bold">{pessoasCount ?? 0}</p>
              <p className="text-[10px] text-muted-foreground">Base Política</p>
            </CardContent>
          </Card>
        </Link>

        <Link to="/multiplicadores" className="block">
          <Card className="hover:shadow-md transition-shadow h-full cursor-pointer">
            <CardContent className="pt-4 pb-3 px-4">
              <Share2 className="w-4 h-4 text-primary mb-1" />
              <p className="text-2xl font-bold">{accountStats?.total ?? 0}</p>
              <p className="text-[10px] text-muted-foreground">Portal ({referralPct}% indicação)</p>
            </CardContent>
          </Card>
        </Link>

        <Link to="/checkins" className="block">
          <Card className="hover:shadow-md transition-shadow h-full cursor-pointer">
            <CardContent className="pt-4 pb-3 px-4">
              <CalendarCheck className="w-4 h-4 text-primary mb-1" />
              <p className="text-2xl font-bold">{checkinStats?.today ?? 0}</p>
              <p className="text-[10px] text-muted-foreground">Check-ins hoje ({checkinStats?.week ?? 0} sem.)</p>
            </CardContent>
          </Card>
        </Link>

        <Link to="/missoes-ia" className="block">
          <Card className="hover:shadow-md transition-shadow h-full cursor-pointer">
            <CardContent className="pt-4 pb-3 px-4">
              <Sparkles className="w-4 h-4 text-primary mb-1" />
              <p className="text-2xl font-bold">{missionsCount ?? 0}</p>
              <p className="text-[10px] text-muted-foreground">Missões ativas</p>
            </CardContent>
          </Card>
        </Link>

        <Link to="/territorial" className="block">
          <Card className="hover:shadow-md transition-shadow h-full cursor-pointer">
            <CardContent className="pt-4 pb-3 px-4">
              <MapPin className="w-4 h-4 text-primary mb-1" />
              <p className="text-2xl font-bold">{zonesCount ?? 0}</p>
              <p className="text-[10px] text-muted-foreground">Zonas territoriais</p>
            </CardContent>
          </Card>
        </Link>

        <Link to="/recrutamento" className="block">
          <Card className="hover:shadow-md transition-shadow h-full cursor-pointer">
            <CardContent className="pt-4 pb-3 px-4">
              <UserPlus className="w-4 h-4 text-primary mb-1" />
              <p className="text-2xl font-bold">{accountStats?.referred ?? 0}</p>
              <p className="text-[10px] text-muted-foreground">Por indicação</p>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Highlight cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Top Multiplier */}
        <Link to="/multiplicadores" className="block">
          <Card className="hover:shadow-md transition-shadow cursor-pointer border-primary/10">
            <CardContent className="pt-4 pb-3 px-4 flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <Crown className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground">Top Multiplicador</p>
                {topMultiplier ? (
                  <>
                    <p className="font-bold truncate">{topMultiplier.name}</p>
                    <p className="text-xs text-muted-foreground">{topMultiplier.referral_count} indicações</p>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">Nenhuma indicação ainda</p>
                )}
              </div>
              <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
            </CardContent>
          </Card>
        </Link>

        {/* Top Digital Leader */}
        <Link to="/lideres" className="block">
          <Card className="hover:shadow-md transition-shadow cursor-pointer border-primary/10">
            <CardContent className="pt-4 pb-3 px-4 flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <Trophy className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground">Top Líder Digital</p>
                {topLeader ? (
                  <>
                    <p className="font-bold truncate">{topLeader.name}</p>
                    <p className="text-xs text-muted-foreground">{topLeader.score} pts</p>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">Nenhum líder identificado</p>
                )}
              </div>
              <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}
