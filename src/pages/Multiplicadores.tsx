import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Users, Trophy, TrendingUp, UserPlus, Percent, Copy, CheckCircle2,
  Share2, Clock, Link2, ArrowRight, Crown, Medal, Award, Loader2,
} from "lucide-react";
import { toast } from "sonner";

export default function Multiplicadores() {
  const [copied, setCopied] = useState(false);

  // Get current client
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

  // Referral stats
  const { data: stats } = useQuery({
    queryKey: ["referral-stats", clientId],
    queryFn: async () => {
      const { count: totalCount } = await supabase
        .from("supporter_accounts")
        .select("*", { count: "exact", head: true })
        .eq("client_id", clientId!);

      const { count: referredCount } = await supabase
        .from("supporter_accounts")
        .select("*", { count: "exact", head: true })
        .eq("client_id", clientId!)
        .not("referred_by", "is", null);

      const { count: totalReferrals } = await supabase
        .from("referrals")
        .select("*", { count: "exact", head: true })
        .eq("client_id", clientId!);

      const { count: activeCodes } = await supabase
        .from("referral_codes")
        .select("*", { count: "exact", head: true })
        .eq("client_id", clientId!);

      return {
        total: totalCount || 0,
        referred: referredCount || 0,
        totalReferrals: totalReferrals || 0,
        organic: (totalCount || 0) - (referredCount || 0),
        percentage: totalCount ? Math.round(((referredCount || 0) / totalCount) * 100) : 0,
        activeCodes: activeCodes || 0,
      };
    },
    enabled: !!clientId,
  });

  // Top multipliers
  const { data: topMultipliers } = useQuery({
    queryKey: ["top-multipliers-full", clientId],
    queryFn: async () => {
      const { data } = await supabase
        .from("supporters")
        .select("id, name, referral_count")
        .eq("client_id", clientId!)
        .gt("referral_count", 0)
        .order("referral_count", { ascending: false })
        .limit(20);
      return (data || []) as Array<{ id: string; name: string; referral_count: number }>;
    },
    enabled: !!clientId,
  });

  // Recent referrals
  const { data: recentReferrals } = useQuery({
    queryKey: ["recent-referrals", clientId],
    queryFn: async () => {
      const { data } = await supabase
        .from("referrals")
        .select(`
          id, created_at,
          referrer:supporter_accounts!referrals_referrer_account_id_fkey(name),
          referred:supporter_accounts!referrals_referred_account_id_fkey(name)
        `)
        .eq("client_id", clientId!)
        .order("created_at", { ascending: false })
        .limit(30);
      return data || [];
    },
    enabled: !!clientId,
  });

  const registerLink = clientId ? `${window.location.origin}/cadastro/${clientId}` : "";

  const handleCopyLink = async () => {
    if (!registerLink) return;
    await navigator.clipboard.writeText(registerLink);
    setCopied(true);
    toast.success("Link de cadastro copiado!");
    setTimeout(() => setCopied(false), 2000);
  };

  const maxReferrals = topMultipliers?.[0]?.referral_count || 1;

  const getRankIcon = (index: number) => {
    if (index === 0) return <Crown className="w-4 h-4 text-amber-500" />;
    if (index === 1) return <Medal className="w-4 h-4 text-gray-400" />;
    if (index === 2) return <Award className="w-4 h-4 text-amber-700" />;
    return null;
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
        <h1 className="text-2xl font-bold">Rede de Multiplicadores</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Acompanhe o impacto dos convites e identifique seus maiores multiplicadores.
        </p>
      </div>

      {/* Explanation */}
      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
        <CardContent className="pt-4 pb-3 px-4">
          <p className="text-sm text-muted-foreground leading-relaxed">
            <strong className="text-foreground">Como funciona:</strong> Cada apoiador que se cadastra no portal recebe um <strong>código de convite exclusivo</strong>.
            Quando compartilham o link <code className="bg-muted px-1 rounded text-xs">/cadastro/:clientId?ref=CODIGO</code>, novos cadastros são automaticamente
            vinculados ao multiplicador. O ranking é atualizado em tempo real.
          </p>
        </CardContent>
      </Card>

      {/* Stats cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 mb-1">
              <Users className="w-3.5 h-3.5 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">Total Base</p>
            </div>
            <p className="text-2xl font-bold">{stats?.total || 0}</p>
            <p className="text-[10px] text-muted-foreground/70 mt-0.5">Apoiadores cadastrados no portal</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 mb-1">
              <UserPlus className="w-3.5 h-3.5 text-primary" />
              <p className="text-xs text-muted-foreground">Por Indicação</p>
            </div>
            <p className="text-2xl font-bold text-primary">{stats?.referred || 0}</p>
            <p className="text-[10px] text-muted-foreground/70 mt-0.5">Vieram pelo link de um multiplicador</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="w-3.5 h-3.5 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">Orgânico</p>
            </div>
            <p className="text-2xl font-bold">{stats?.organic || 0}</p>
            <p className="text-[10px] text-muted-foreground/70 mt-0.5">Cadastraram-se sem indicação</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 mb-1">
              <Link2 className="w-3.5 h-3.5 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">Códigos Ativos</p>
            </div>
            <p className="text-2xl font-bold">{stats?.activeCodes || 0}</p>
            <p className="text-[10px] text-muted-foreground/70 mt-0.5">Apoiadores com link de convite gerado</p>
          </CardContent>
        </Card>
      </div>

      {/* Organic vs Referral bar */}
      {stats && stats.total > 0 && (
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <p className="text-xs font-medium text-muted-foreground mb-1">Crescimento: Orgânico vs Indicação</p>
            <div className="flex rounded-full overflow-hidden h-4">
              <div
                className="bg-primary transition-all"
                style={{ width: `${stats.percentage}%` }}
              />
              <div
                className="bg-muted transition-all"
                style={{ width: `${100 - stats.percentage}%` }}
              />
            </div>
            <div className="flex justify-between mt-1.5 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-primary inline-block" />
                Indicação ({stats.percentage}%)
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-muted inline-block border" />
                Orgânico ({100 - stats.percentage}%)
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Link de cadastro */}
      <Card>
        <CardContent className="pt-4 pb-3 px-4">
          <p className="text-sm font-medium mb-2">Link de Cadastro (sem indicação)</p>
          <p className="text-xs text-muted-foreground mb-3">
            Compartilhe este link genérico para cadastro direto. Os apoiadores que quiserem indicar amigos usam o link personalizado que recebem no portal.
          </p>
          <div className="flex gap-2">
            <Input value={registerLink} readOnly className="text-xs font-mono" />
            <Button variant="outline" size="sm" onClick={handleCopyLink}>
              {copied ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="ranking">
        <TabsList>
          <TabsTrigger value="ranking">
            <Trophy className="w-4 h-4 mr-1.5" />
            Ranking
          </TabsTrigger>
          <TabsTrigger value="timeline">
            <Clock className="w-4 h-4 mr-1.5" />
            Histórico
          </TabsTrigger>
        </TabsList>

        {/* Ranking Tab */}
        <TabsContent value="ranking" className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Trophy className="w-4 h-4 text-primary" />
                Top Multiplicadores
              </CardTitle>
              <CardDescription className="text-xs">
                Apoiadores que mais trouxeram novos cadastros por indicação.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!topMultipliers || topMultipliers.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">
                  <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm font-medium">Nenhuma indicação registrada ainda</p>
                  <p className="text-xs mt-1">Quando apoiadores usarem seus links de convite, o ranking aparecerá aqui</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {topMultipliers.map((m, i) => (
                    <div key={m.id} className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                        i === 0 ? "bg-primary text-primary-foreground" :
                        i === 1 ? "bg-primary/20 text-primary" :
                        i === 2 ? "bg-primary/10 text-primary" :
                        "bg-muted text-muted-foreground"
                      }`}>
                        {getRankIcon(i) || <span>{i + 1}</span>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium truncate">{m.name}</p>
                          <Badge variant={i < 3 ? "default" : "secondary"} className="text-xs ml-2 shrink-0">
                            {m.referral_count} {m.referral_count === 1 ? "convite" : "convites"}
                          </Badge>
                        </div>
                        <Progress value={(m.referral_count / maxReferrals) * 100} className="h-1.5 mt-1" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Timeline Tab */}
        <TabsContent value="timeline" className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="w-4 h-4 text-primary" />
                Indicações Recentes
              </CardTitle>
              <CardDescription className="text-xs">
                Últimas 30 indicações realizadas pelos multiplicadores.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!recentReferrals || recentReferrals.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">
                  <Clock className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">Nenhuma indicação registrada</p>
                </div>
              ) : (
                <div className="space-y-0">
                  {recentReferrals.map((r: any) => (
                    <div key={r.id} className="flex items-center gap-3 py-3 border-b last:border-0">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <UserPlus className="w-4 h-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm">
                          <span className="font-medium">{r.referrer?.name || "Multiplicador"}</span>
                          <ArrowRight className="w-3 h-3 inline mx-1.5 text-muted-foreground" />
                          <span className="font-medium text-primary">{r.referred?.name || "Novo apoiador"}</span>
                        </p>
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {new Date(r.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
