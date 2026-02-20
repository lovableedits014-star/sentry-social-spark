import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CalendarCheck, Flame, Trophy, Search, RefreshCw, Loader2, Copy, Target, Bell } from "lucide-react";
import { toast } from "sonner";
import { PortalMissionsPanel } from "@/components/engagement/PortalMissionsPanel";
import { PushNotificationsPanel } from "@/components/PushNotificationsPanel";

interface CheckinStat {
  supporter_account_id: string;
  name: string;
  email: string;
  total_checkins: number;
  streak: number;
  last_checkin: string | null;
  checked_today: boolean;
}

function SupporterCheckinsOnly({ clientId }: { clientId: string }) {
  const [stats, setStats] = useState<CheckinStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const loadStats = async () => {
    setLoading(true);
    try {
      const { data: accounts } = await supabase
        .from("supporter_accounts")
        .select("id, name, email")
        .eq("client_id", clientId);

      if (!accounts) { setLoading(false); return; }

      const today = new Date().toISOString().split("T")[0];

      const results: CheckinStat[] = await Promise.all(
        accounts.map(async (acc) => {
          const { data: checkins } = await supabase
            .from("supporter_checkins")
            .select("checkin_date")
            .eq("supporter_account_id", acc.id)
            .order("checkin_date", { ascending: false })
            .limit(90);

          const total = checkins?.length || 0;
          const checkedToday = checkins?.some(c => c.checkin_date === today) || false;
          const lastCheckin = checkins?.[0]?.checkin_date || null;

          let streak = 0;
          const nowDate = new Date();
          for (let i = 0; i < (checkins?.length || 0); i++) {
            const expected = new Date(nowDate);
            expected.setDate(expected.getDate() - i);
            const expectedStr = expected.toISOString().split("T")[0];
            if (checkins![i].checkin_date === expectedStr) streak++;
            else break;
          }

          return {
            supporter_account_id: acc.id,
            name: acc.name,
            email: acc.email,
            total_checkins: total,
            streak,
            last_checkin: lastCheckin,
            checked_today: checkedToday,
          };
        })
      );

      results.sort((a, b) => b.streak - a.streak || b.total_checkins - a.total_checkins);
      setStats(results);
    } catch (err) {
      console.error(err);
      toast.error("Erro ao carregar presenças");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (clientId) loadStats();
  }, [clientId]);

  const filtered = stats.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.email.toLowerCase().includes(search.toLowerCase())
  );

  const todayCount = stats.filter(s => s.checked_today).length;
  const topStreak = stats[0]?.streak || 0;

  const formatDate = (str: string | null) => {
    if (!str) return "Nunca";
    const [y, m, d] = str.split("-");
    return `${d}/${m}/${y}`;
  };

  const copyPortalLink = () => {
    const url = `${window.location.origin}/portal/${clientId}`;
    navigator.clipboard.writeText(url);
    toast.success("Link do portal copiado!");
  };

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4 text-center">
            <CalendarCheck className="w-5 h-5 mx-auto mb-1 text-emerald-500" />
            <p className="text-2xl font-bold text-emerald-600">{todayCount}</p>
            <p className="text-xs text-muted-foreground">Presentes hoje</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <CalendarCheck className="w-5 h-5 mx-auto mb-1 text-muted-foreground" />
            <p className="text-2xl font-bold">{stats.length - todayCount}</p>
            <p className="text-xs text-muted-foreground">Ausentes hoje</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Flame className="w-5 h-5 mx-auto mb-1 text-orange-500" />
            <p className="text-2xl font-bold">{topStreak}</p>
            <p className="text-xs text-muted-foreground">Maior sequência</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Trophy className="w-5 h-5 mx-auto mb-1 text-primary" />
            <p className="text-2xl font-bold">{stats.length}</p>
            <p className="text-xs text-muted-foreground">Apoiadores no portal</p>
          </CardContent>
        </Card>
      </div>

      {/* Portal link */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="p-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium">Link do Portal para Apoiadores</p>
            <p className="text-xs text-muted-foreground">
              Envie este link para seus apoiadores se cadastrarem e marcarem presença diária
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={copyPortalLink}>
            <Copy className="w-4 h-4 mr-1" /> Copiar Link
          </Button>
        </CardContent>
      </Card>

      {/* Ranking */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Trophy className="w-4 h-4 text-primary" />
                Ranking de Presenças
              </CardTitle>
              <CardDescription className="text-xs mt-1">
                Ordenado por sequência de dias consecutivos
              </CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={loadStats} disabled={loading}>
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar apoiador..."
              className="pl-9"
            />
          </div>

          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <CalendarCheck className="w-10 h-10 mx-auto mb-3 opacity-20" />
              <p className="text-sm">Nenhum apoiador cadastrado no portal ainda.</p>
              <p className="text-xs mt-1">Compartilhe o link do portal para eles se cadastrarem.</p>
            </div>
          ) : (
            <ScrollArea className="max-h-[500px]">
              <div className="space-y-1">
                {filtered.map((s, idx) => (
                  <div
                    key={s.supporter_account_id}
                    className={`flex items-center gap-3 p-3 rounded-lg transition-colors ${
                      s.checked_today
                        ? "bg-emerald-500/5 border border-emerald-500/20"
                        : "hover:bg-muted/50"
                    }`}
                  >
                    <div className="w-7 text-center shrink-0">
                      {idx === 0 ? <span className="text-lg">🥇</span>
                        : idx === 1 ? <span className="text-lg">🥈</span>
                        : idx === 2 ? <span className="text-lg">🥉</span>
                        : <span className="text-sm text-muted-foreground font-medium">{idx + 1}</span>}
                    </div>

                    <Avatar className="h-8 w-8 shrink-0">
                      <AvatarFallback className="text-xs bg-primary/10 text-primary">
                        {s.name.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium truncate">{s.name}</p>
                        {s.checked_today && (
                          <Badge className="text-xs h-4 px-1 bg-emerald-500/15 text-emerald-600 border-emerald-500/30 shrink-0">
                            ✅ Hoje
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Último: {formatDate(s.last_checkin)}
                      </p>
                    </div>

                    <div className="text-right shrink-0 space-y-0.5">
                      <div className="flex items-center gap-1 justify-end">
                        <Flame className="w-3.5 h-3.5 text-orange-500" />
                        <span className="text-sm font-bold">{s.streak}</span>
                        <span className="text-xs text-muted-foreground">dias</span>
                      </div>
                      <p className="text-xs text-muted-foreground">{s.total_checkins} total</p>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function Checkins() {
  const { data: client } = useQuery({
    queryKey: ["client"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");
      const { data, error } = await supabase
        .from("clients")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Presenças & Missões</h1>
        <p className="text-sm text-muted-foreground">
          Ranking de check-ins, missões do portal e notificações push
        </p>
      </div>

      <Tabs defaultValue="presencas" className="space-y-4">
        <TabsList className="flex flex-wrap h-auto gap-1 w-full sm:w-auto">
          <TabsTrigger value="presencas" className="text-xs sm:text-sm gap-1.5">
            <CalendarCheck className="h-4 w-4" />
            Ranking de Presenças
          </TabsTrigger>
          <TabsTrigger value="missoes" className="text-xs sm:text-sm gap-1.5">
            <Target className="h-4 w-4" />
            Missões do Portal
          </TabsTrigger>
          <TabsTrigger value="notificacoes" className="text-xs sm:text-sm gap-1.5">
            <Bell className="h-4 w-4" />
            Notificações Push
          </TabsTrigger>
        </TabsList>

        <TabsContent value="presencas">
          {client?.id && <SupporterCheckinsOnly clientId={client.id} />}
        </TabsContent>

        <TabsContent value="missoes">
          {client?.id && <PortalMissionsPanel clientId={client.id} />}
        </TabsContent>

        <TabsContent value="notificacoes">
          {client?.id && <PushNotificationsPanel clientId={client.id} />}
        </TabsContent>
      </Tabs>
    </div>
  );
}
