import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Crown, Medal, Award, Users, TrendingUp, MessageCircle,
  CalendarCheck, UserPlus, Star, Loader2, Flame, Trophy,
} from "lucide-react";

type LeaderScore = {
  id: string;
  name: string;
  referralCount: number;
  checkinCount: number;
  engagementScore: number;
  totalScore: number;
};

export default function LideresDigitais() {
  const [period, setPeriod] = useState<"30" | "90" | "all">("30");

  const { data: client } = useQuery({
    queryKey: ["my-client"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data } = await supabase
        .from("clients")
        .select("id, name")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!data) {
        const { data: tm } = await supabase
          .from("team_members")
          .select("client_id, clients(id, name)")
          .eq("user_id", user.id)
          .maybeSingle();
        return (tm as any)?.clients || null;
      }
      return data;
    },
  });

  const clientId = client?.id;

  const { data: leaders, isLoading } = useQuery({
    queryKey: ["lideres-digitais", clientId, period],
    queryFn: async () => {
      // 1. Get all supporter_accounts with supporter link
      const { data: accounts } = await supabase
        .from("supporter_accounts")
        .select("id, name, supporter_id")
        .eq("client_id", clientId!);

      if (!accounts || accounts.length === 0) return [];

      const accountIds = accounts.map(a => a.id);
      const supporterIds = accounts.map(a => a.supporter_id).filter(Boolean) as string[];

      // 2. Count referrals per account
      const { data: referrals } = await supabase
        .from("referrals")
        .select("referrer_account_id")
        .eq("client_id", clientId!)
        .in("referrer_account_id", accountIds);

      const refCounts: Record<string, number> = {};
      (referrals || []).forEach((r: any) => {
        refCounts[r.referrer_account_id] = (refCounts[r.referrer_account_id] || 0) + 1;
      });

      // 3. Count check-ins per account (within period)
      let checkinQuery = supabase
        .from("supporter_checkins")
        .select("supporter_account_id")
        .eq("client_id", clientId!)
        .in("supporter_account_id", accountIds);

      if (period !== "all") {
        const daysAgo = new Date();
        daysAgo.setDate(daysAgo.getDate() - parseInt(period));
        checkinQuery = checkinQuery.gte("checkin_date", daysAgo.toISOString().split("T")[0]);
      }
      const { data: checkins } = await checkinQuery;

      const checkinCounts: Record<string, number> = {};
      (checkins || []).forEach((c: any) => {
        checkinCounts[c.supporter_account_id] = (checkinCounts[c.supporter_account_id] || 0) + 1;
      });

      // 4. Get engagement scores from supporters table
      const engScores: Record<string, number> = {};
      if (supporterIds.length > 0) {
        const { data: supporters } = await supabase
          .from("supporters")
          .select("id, engagement_score, referral_count")
          .in("id", supporterIds);

        (supporters || []).forEach((s: any) => {
          engScores[s.id] = s.engagement_score || 0;
        });
      }

      // 5. Build composite scores
      // Weights: referrals * 10, checkins * 2, engagement_score * 1
      const scored: LeaderScore[] = accounts.map(a => {
        const referralCount = refCounts[a.id] || 0;
        const checkinCount = checkinCounts[a.id] || 0;
        const engagementScore = a.supporter_id ? (engScores[a.supporter_id] || 0) : 0;

        const totalScore = (referralCount * 10) + (checkinCount * 2) + engagementScore;

        return {
          id: a.id,
          name: a.name,
          referralCount,
          checkinCount,
          engagementScore,
          totalScore,
        };
      });

      return scored
        .filter(s => s.totalScore > 0)
        .sort((a, b) => b.totalScore - a.totalScore)
        .slice(0, 30);
    },
    enabled: !!clientId,
  });

  // Summary stats
  const totalLeaders = leaders?.length || 0;
  const totalRefByLeaders = leaders?.reduce((s, l) => s + l.referralCount, 0) || 0;
  const totalCheckinsByLeaders = leaders?.reduce((s, l) => s + l.checkinCount, 0) || 0;
  const maxScore = leaders?.[0]?.totalScore || 1;

  const getRankDisplay = (index: number) => {
    if (index === 0) return <Crown className="w-5 h-5 text-amber-500" />;
    if (index === 1) return <Medal className="w-5 h-5 text-slate-400" />;
    if (index === 2) return <Award className="w-5 h-5 text-amber-700" />;
    return <span className="text-sm font-bold text-muted-foreground">{index + 1}</span>;
  };

  const getTier = (score: number) => {
    if (score >= maxScore * 0.8) return { label: "Elite", color: "bg-primary text-primary-foreground" };
    if (score >= maxScore * 0.5) return { label: "Ouro", color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400" };
    if (score >= maxScore * 0.25) return { label: "Prata", color: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" };
    return { label: "Bronze", color: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" };
  };

  if (!clientId) {
    return (
      <div className="p-6 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">Líderes Digitais</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Ranking dos apoiadores que mais mobilizam a base — por indicações, presenças e engajamento social.
        </p>
      </div>

      {/* Explanation */}
      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
        <CardContent className="pt-4 pb-3 px-4">
          <p className="text-sm text-muted-foreground leading-relaxed">
            <strong className="text-foreground">Como o score é calculado:</strong> Cada apoiador recebe uma pontuação composta:
            <strong> Indicações × 10</strong> (maior peso, pois multiplicam a base),
            <strong> Check-ins × 2</strong> (mostram comprometimento diário) e
            <strong> Score de Engajamento × 1</strong> (interações em publicações sociais).
            O ranking identifica quem realmente move a campanha.
          </p>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3 px-4 text-center">
            <Flame className="w-5 h-5 text-primary mx-auto mb-1" />
            <p className="text-2xl font-bold">{totalLeaders}</p>
            <p className="text-xs text-muted-foreground">Líderes Ativos</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4 text-center">
            <UserPlus className="w-5 h-5 text-primary mx-auto mb-1" />
            <p className="text-2xl font-bold">{totalRefByLeaders}</p>
            <p className="text-xs text-muted-foreground">Indicações Totais</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4 text-center">
            <CalendarCheck className="w-5 h-5 text-primary mx-auto mb-1" />
            <p className="text-2xl font-bold">{totalCheckinsByLeaders}</p>
            <p className="text-xs text-muted-foreground">Check-ins Totais</p>
          </CardContent>
        </Card>
      </div>

      {/* Period filter */}
      <div className="flex gap-2">
        {(["30", "90", "all"] as const).map(p => (
          <Button
            key={p}
            variant={period === p ? "default" : "outline"}
            size="sm"
            onClick={() => setPeriod(p)}
          >
            {p === "30" ? "30 dias" : p === "90" ? "90 dias" : "Todo período"}
          </Button>
        ))}
      </div>

      {/* Ranking */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : !leaders || leaders.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            <Trophy className="w-12 h-12 mx-auto mb-3 opacity-20" />
            <p className="font-medium">Nenhum líder digital identificado ainda</p>
            <p className="text-sm mt-1">Quando apoiadores fizerem indicações, check-ins ou interagirem nas redes, o ranking aparecerá aqui.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Podium - Top 3 */}
          {leaders.length >= 3 && (
            <div className="grid grid-cols-3 gap-3">
              {[1, 0, 2].map(idx => {
                const leader = leaders[idx];
                if (!leader) return null;
                const isFirst = idx === 0;
                return (
                  <Card key={leader.id} className={`text-center ${isFirst ? "border-primary/40 bg-primary/5 md:-mt-4" : ""}`}>
                    <CardContent className="pt-5 pb-4 px-3">
                      <div className="mb-2">{getRankDisplay(idx)}</div>
                      <p className={`font-bold truncate ${isFirst ? "text-base" : "text-sm"}`}>{leader.name}</p>
                      <p className={`font-bold text-primary ${isFirst ? "text-3xl" : "text-2xl"} mt-1`}>{leader.totalScore}</p>
                      <p className="text-[10px] text-muted-foreground">pontos</p>
                      <div className="flex justify-center gap-3 mt-2 text-[10px] text-muted-foreground">
                        <span title="Indicações">👥 {leader.referralCount}</span>
                        <span title="Check-ins">📅 {leader.checkinCount}</span>
                        <span title="Engajamento">⚡ {leader.engagementScore}</span>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {/* Full list */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Ranking Completo</CardTitle>
              <CardDescription className="text-xs">
                Score composto = (Indicações × 10) + (Check-ins × 2) + Engajamento
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {leaders.map((leader, i) => {
                const tier = getTier(leader.totalScore);
                return (
                  <div key={leader.id} className="flex items-center gap-3 py-2.5 border-b last:border-0">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-muted">
                      {getRankDisplay(i)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium truncate">{leader.name}</p>
                        <Badge className={`text-[10px] px-1.5 py-0 ${tier.color}`}>{tier.label}</Badge>
                      </div>
                      <Progress value={(leader.totalScore / maxScore) * 100} className="h-1 mt-1" />
                      <div className="flex gap-3 mt-1 text-[10px] text-muted-foreground">
                        <span className="flex items-center gap-0.5">
                          <UserPlus className="w-2.5 h-2.5" /> {leader.referralCount}
                        </span>
                        <span className="flex items-center gap-0.5">
                          <CalendarCheck className="w-2.5 h-2.5" /> {leader.checkinCount}
                        </span>
                        <span className="flex items-center gap-0.5">
                          <MessageCircle className="w-2.5 h-2.5" /> {leader.engagementScore}
                        </span>
                      </div>
                    </div>
                    <p className="text-lg font-bold text-primary shrink-0">{leader.totalScore}</p>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
