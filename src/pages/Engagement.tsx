import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import { 
  TrendingUp, 
  TrendingDown, 
  Activity,
  Heart,
  MessageCircle,
  Share2,
  Settings,
  RefreshCw,
  Trophy,
  AlertTriangle,
  History,
  Calendar,
  Megaphone
} from "lucide-react";
import { EngagementPostCards } from "@/components/engagement/EngagementPostCards";

type EngagementConfig = {
  id: string;
  client_id: string;
  like_points: number;
  comment_points: number;
  share_points: number;
  reaction_points: number;
  inactivity_days: number;
};

type SupporterProfile = {
  platform: string;
  platform_username: string | null;
  profile_picture_url: string | null;
};

type SupporterWithScore = {
  id: string;
  name: string;
  classification: string | null;
  engagement_score: number | null;
  last_interaction_date: string | null;
  supporter_profiles: SupporterProfile[];
};

const classificationLabels: Record<string, string> = {
  apoiador_ativo: "Apoiador Ativo",
  apoiador_passivo: "Apoiador Passivo",
  neutro: "Neutro",
  critico: "Crítico"
};

const classificationColors: Record<string, string> = {
  apoiador_ativo: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-300",
  apoiador_passivo: "bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-300",
  neutro: "bg-muted text-muted-foreground",
  critico: "bg-destructive/10 text-destructive"
};

export default function Engagement() {
  const [periodDays, setPeriodDays] = useState<string>("30");
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [configForm, setConfigForm] = useState<Partial<EngagementConfig>>({});
  const [selectedMonth, setSelectedMonth] = useState<string>("");

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
    }
  });

  const { data: engagementConfig, refetch: refetchConfig } = useQuery({
    queryKey: ["engagement-config", client?.id],
    queryFn: async () => {
      if (!client?.id) return null;
      const { data, error } = await supabase
        .from("engagement_config" as any)
        .select("*")
        .eq("client_id", client.id)
        .maybeSingle();
      if (error && error.code !== "PGRST116") throw error;
      const config = data as unknown as EngagementConfig | null;
      if (config) setConfigForm(config);
      return config;
    },
    enabled: !!client?.id
  });

  const { data: supporters, refetch: refetchSupporters } = useQuery({
    queryKey: ["supporters-engagement", client?.id],
    queryFn: async () => {
      if (!client?.id) return [];
      const { data, error } = await supabase
        .from("supporters")
        .select(`
          id, name, classification, engagement_score, last_interaction_date,
          supporter_profiles (platform, platform_username, profile_picture_url)
        `)
        .eq("client_id", client.id)
        .order("engagement_score", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (data || []) as SupporterWithScore[];
    },
    enabled: !!client?.id
  });

  // Monthly history
  const { data: scoreHistory, refetch: refetchHistory } = useQuery({
    queryKey: ["score-history", client?.id],
    queryFn: async () => {
      if (!client?.id) return [];
      const { data, error } = await supabase
        .from("engagement_score_history" as any)
        .select("*")
        .eq("client_id", client.id)
        .order("month_year", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as Array<{
        id: string;
        supporter_id: string;
        month_year: string;
        score: number;
        action_count: number;
      }>;
    },
    enabled: !!client?.id
  });

  // Get unique months
  const availableMonths = [...new Set(scoreHistory?.map(h => h.month_year) || [])].sort().reverse();
  const currentMonth = new Date().toISOString().slice(0, 7);
  const activeMonth = selectedMonth || (availableMonths[0] || currentMonth);

  // Get history for selected month
  const monthHistory = scoreHistory?.filter(h => h.month_year === activeMonth) || [];
  const monthRanking = monthHistory
    .map(h => {
      const supporter = supporters?.find(s => s.id === h.supporter_id);
      return supporter ? { ...supporter, monthScore: h.score, monthActions: h.action_count } : null;
    })
    .filter(Boolean)
    .sort((a, b) => (b?.monthScore || 0) - (a?.monthScore || 0));

  const engagementStats = useQuery({
    queryKey: ["engagement-stats", client?.id, periodDays],
    queryFn: async () => {
      if (!client?.id) return null;
      const daysAgo = new Date();
      daysAgo.setDate(daysAgo.getDate() - parseInt(periodDays));
      const { data, error } = await supabase
        .from("engagement_actions" as any)
        .select("action_type")
        .eq("client_id", client.id)
        .gte("action_date", daysAgo.toISOString());
      if (error) throw error;
      const stats = { likes: 0, comments: 0, shares: 0, reactions: 0, total: 0 };
      const actions = data as unknown as Array<{ action_type: string }>;
      (actions || []).forEach((action) => {
        stats.total++;
        switch (action.action_type) {
          case "like": stats.likes++; break;
          case "comment": stats.comments++; break;
          case "share": stats.shares++; break;
          case "reaction": stats.reactions++; break;
        }
      });
      return stats;
    },
    enabled: !!client?.id
  });

  const stats = engagementStats.data;

  const inactiveSupporters = supporters?.filter(s => {
    if (!s.last_interaction_date) return true;
    const lastDate = new Date(s.last_interaction_date);
    const daysAgo = new Date();
    daysAgo.setDate(daysAgo.getDate() - (engagementConfig?.inactivity_days || 7));
    return lastDate < daysAgo;
  }) || [];

  const saveConfig = async () => {
    if (!client?.id) return;
    try {
      const configData = {
        client_id: client.id,
        like_points: configForm.like_points || 1,
        comment_points: configForm.comment_points || 3,
        share_points: configForm.share_points || 5,
        reaction_points: configForm.reaction_points || 1,
        inactivity_days: configForm.inactivity_days || 7
      };
      if (engagementConfig?.id) {
        const { error } = await supabase.from("engagement_config" as any).update(configData).eq("id", engagementConfig.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("engagement_config" as any).insert(configData);
        if (error) throw error;
      }
      toast.success("Configuração salva!");
      refetchConfig();
    } catch (error) {
      console.error("Erro ao salvar configuração:", error);
      toast.error("Erro ao salvar configuração");
    }
  };

  const recalculateScores = async () => {
    if (!client?.id) return;
    setIsRecalculating(true);
    try {
      // Link orphan actions
      const { data: linked, error: linkError } = await supabase.rpc(
        "link_orphan_engagement_actions" as any,
        { p_client_id: client.id }
      );
      if (linkError) console.error("Erro ao vincular ações:", linkError);

      // Recalculate scores
      if (supporters && supporters.length > 0) {
        for (const supporter of supporters) {
          await supabase.rpc("calculate_engagement_score", {
            p_supporter_id: supporter.id,
            p_days: parseInt(periodDays)
          });
        }
      }

      // Snapshot current month
      await supabase.rpc("snapshot_monthly_scores" as any, { p_client_id: client.id });

      const linkedCount = typeof linked === 'number' ? linked : 0;
      toast.success(`Scores recalculados! ${linkedCount > 0 ? `${linkedCount} ações vinculadas.` : ''}`);
      refetchSupporters();
      refetchHistory();
    } catch (error) {
      console.error("Erro ao recalcular scores:", error);
      toast.error("Erro ao recalcular scores");
    } finally {
      setIsRecalculating(false);
    }
  };

  const getActivityStatus = (score: number | null, lastInteraction: string | null) => {
    if (!lastInteraction) return { label: "Sem interação", color: "text-muted-foreground" };
    const lastDate = new Date(lastInteraction);
    const daysAgo = Math.floor((Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
    if (daysAgo <= 3) return { label: "Muito ativo", color: "text-emerald-600" };
    if (daysAgo <= 7) return { label: "Ativo", color: "text-sky-600" };
    if (daysAgo <= 14) return { label: "Pouco ativo", color: "text-amber-600" };
    return { label: "Inativo", color: "text-destructive" };
  };

  const getProfilePicture = (s: SupporterWithScore) => 
    s.supporter_profiles?.find(p => p.profile_picture_url)?.profile_picture_url;

  const formatMonth = (m: string) => {
    const [year, month] = m.split("-");
    const months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
    return `${months[parseInt(month) - 1]} ${year}`;
  };

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Engajamento</h1>
          <p className="text-sm text-muted-foreground">
            Acompanhe o desempenho dos apoiadores
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={periodDays} onValueChange={setPeriodDays}>
            <SelectTrigger className="w-[140px] sm:w-[180px]">
              <SelectValue placeholder="Período" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">7 dias</SelectItem>
              <SelectItem value="15">15 dias</SelectItem>
              <SelectItem value="30">30 dias</SelectItem>
              <SelectItem value="60">60 dias</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={recalculateScores} disabled={isRecalculating} variant="outline" size="sm">
            <RefreshCw className={`mr-2 h-4 w-4 ${isRecalculating ? 'animate-spin' : ''}`} />
            Recalcular
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 px-3 pt-3 sm:px-6 sm:pt-6">
            <CardTitle className="text-xs sm:text-sm font-medium">Total</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="px-3 pb-3 sm:px-6 sm:pb-6">
            <div className="text-xl sm:text-2xl font-bold">{stats?.total || 0}</div>
            <p className="text-xs text-muted-foreground hidden sm:block">Últimos {periodDays} dias</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 px-3 pt-3 sm:px-6 sm:pt-6">
            <CardTitle className="text-xs sm:text-sm font-medium">Curtidas</CardTitle>
            <Heart className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent className="px-3 pb-3 sm:px-6 sm:pb-6">
            <div className="text-xl sm:text-2xl font-bold">{stats?.likes || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 px-3 pt-3 sm:px-6 sm:pt-6">
            <CardTitle className="text-xs sm:text-sm font-medium">Comentários</CardTitle>
            <MessageCircle className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent className="px-3 pb-3 sm:px-6 sm:pb-6">
            <div className="text-xl sm:text-2xl font-bold">{stats?.comments || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 px-3 pt-3 sm:px-6 sm:pt-6">
            <CardTitle className="text-xs sm:text-sm font-medium">Compartilhar</CardTitle>
            <Share2 className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent className="px-3 pb-3 sm:px-6 sm:pb-6">
            <div className="text-xl sm:text-2xl font-bold">{stats?.shares || 0}</div>
          </CardContent>
        </Card>
        <Card className="col-span-2 sm:col-span-1">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 px-3 pt-3 sm:px-6 sm:pt-6">
            <CardTitle className="text-xs sm:text-sm font-medium">Inativos</CardTitle>
            <AlertTriangle className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent className="px-3 pb-3 sm:px-6 sm:pb-6">
            <div className="text-xl sm:text-2xl font-bold">{inactiveSupporters.length}</div>
            <p className="text-xs text-muted-foreground">{engagementConfig?.inactivity_days || 7}+ dias</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="central" className="space-y-4">
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="central" className="text-xs sm:text-sm">
            <Megaphone className="mr-1 sm:mr-2 h-4 w-4" />
            Central
          </TabsTrigger>
          <TabsTrigger value="ranking" className="text-xs sm:text-sm">
            <Trophy className="mr-1 sm:mr-2 h-4 w-4" />
            Ranking
          </TabsTrigger>
          <TabsTrigger value="historico" className="text-xs sm:text-sm">
            <History className="mr-1 sm:mr-2 h-4 w-4" />
            Histórico
          </TabsTrigger>
          <TabsTrigger value="inativos" className="text-xs sm:text-sm">
            <AlertTriangle className="mr-1 sm:mr-2 h-4 w-4" />
            Inativos ({inactiveSupporters.length})
          </TabsTrigger>
          <TabsTrigger value="config" className="text-xs sm:text-sm">
            <Settings className="mr-1 sm:mr-2 h-4 w-4" />
            Config
          </TabsTrigger>
        </TabsList>

        {/* Central Tab - Post Cards */}
        <TabsContent value="central">
          <EngagementPostCards clientId={client?.id} />
        </TabsContent>

        {/* Ranking Tab */}
        <TabsContent value="ranking">
          <Card>
            <CardHeader className="px-3 sm:px-6">
              <CardTitle className="text-lg sm:text-xl">Ranking de Engajamento</CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                Score do mês atual — soma de todas as redes sociais
              </CardDescription>
            </CardHeader>
            <CardContent className="px-0 sm:px-6">
              {/* Mobile: card layout */}
              <div className="sm:hidden space-y-2 px-3">
                {supporters?.map((supporter, index) => {
                  const status = getActivityStatus(supporter.engagement_score, supporter.last_interaction_date);
                  return (
                    <div key={supporter.id} className="flex items-center gap-3 p-3 rounded-lg border">
                      <div className="shrink-0 w-6 text-center">
                        {index < 3 ? (
                          <Trophy className={`h-5 w-5 mx-auto ${
                            index === 0 ? 'text-amber-400' : index === 1 ? 'text-slate-400' : 'text-amber-600'
                          }`} />
                        ) : (
                          <span className="text-sm text-muted-foreground">{index + 1}</span>
                        )}
                      </div>
                      <Avatar className="h-8 w-8 shrink-0">
                        <AvatarImage src={getProfilePicture(supporter) || undefined} />
                        <AvatarFallback className="text-xs">{supporter.name.charAt(0)}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{supporter.name}</p>
                        <p className={`text-xs ${status.color}`}>{status.label}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="font-bold text-lg">{supporter.engagement_score || 0}</span>
                        {(supporter.engagement_score || 0) > 50 ? (
                          <TrendingUp className="h-3 w-3 text-emerald-500 inline ml-1" />
                        ) : (supporter.engagement_score || 0) < 10 ? (
                          <TrendingDown className="h-3 w-3 text-destructive inline ml-1" />
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Desktop: table layout */}
              <div className="hidden sm:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[50px]">#</TableHead>
                      <TableHead>Apoiador</TableHead>
                      <TableHead>Classificação</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Score</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {supporters?.map((supporter, index) => {
                      const status = getActivityStatus(supporter.engagement_score, supporter.last_interaction_date);
                      return (
                        <TableRow key={supporter.id}>
                          <TableCell>
                            {index < 3 ? (
                              <Trophy className={`h-5 w-5 ${
                                index === 0 ? 'text-amber-400' : index === 1 ? 'text-slate-400' : 'text-amber-600'
                              }`} />
                            ) : (
                              <span className="text-muted-foreground">{index + 1}</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <Avatar className="h-8 w-8">
                                <AvatarImage src={getProfilePicture(supporter) || undefined} />
                                <AvatarFallback>{supporter.name.charAt(0).toUpperCase()}</AvatarFallback>
                              </Avatar>
                              <div>
                                <p className="font-medium">{supporter.name}</p>
                                {supporter.supporter_profiles?.[0]?.platform_username && (
                                  <p className="text-sm text-muted-foreground">
                                    @{supporter.supporter_profiles[0].platform_username}
                                  </p>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary" className={classificationColors[supporter.classification || 'neutro']}>
                              {classificationLabels[supporter.classification || 'neutro']}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <span className={status.color}>{status.label}</span>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <span className="font-bold text-lg">{supporter.engagement_score || 0}</span>
                              {(supporter.engagement_score || 0) > 50 ? (
                                <TrendingUp className="h-4 w-4 text-emerald-500" />
                              ) : (supporter.engagement_score || 0) < 10 ? (
                                <TrendingDown className="h-4 w-4 text-destructive" />
                              ) : null}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {(!supporters || supporters.length === 0) && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                          Nenhum apoiador cadastrado.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="historico">
          <Card>
            <CardHeader className="px-3 sm:px-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <CardTitle className="text-lg sm:text-xl flex items-center gap-2">
                    <Calendar className="h-5 w-5" />
                    Histórico Mensal
                  </CardTitle>
                  <CardDescription className="text-xs sm:text-sm">
                    Pontuação de cada mês — os scores são resetados mensalmente
                  </CardDescription>
                </div>
                <Select value={activeMonth} onValueChange={setSelectedMonth}>
                  <SelectTrigger className="w-[160px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {availableMonths.length === 0 && (
                      <SelectItem value={currentMonth}>{formatMonth(currentMonth)} (atual)</SelectItem>
                    )}
                    {availableMonths.map(m => (
                      <SelectItem key={m} value={m}>
                        {formatMonth(m)} {m === currentMonth ? "(atual)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent className="px-0 sm:px-6">
              {monthRanking.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground px-3">
                  <History className="w-12 h-12 mx-auto mb-4 opacity-20" />
                  <p>Nenhum histórico para este mês.</p>
                  <p className="text-sm mt-2">Clique em "Recalcular" para gerar o snapshot do mês atual.</p>
                </div>
              ) : (
                <>
                  {/* Mobile */}
                  <div className="sm:hidden space-y-2 px-3">
                    {monthRanking.map((item, index) => item && (
                      <div key={item.id} className="flex items-center gap-3 p-3 rounded-lg border">
                        <div className="shrink-0 w-6 text-center">
                          {index < 3 ? (
                            <Trophy className={`h-5 w-5 mx-auto ${
                              index === 0 ? 'text-amber-400' : index === 1 ? 'text-slate-400' : 'text-amber-600'
                            }`} />
                          ) : (
                            <span className="text-sm text-muted-foreground">{index + 1}</span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{item.name}</p>
                          <p className="text-xs text-muted-foreground">{item.monthActions} ações</p>
                        </div>
                        <span className="font-bold text-lg shrink-0">{item.monthScore}</span>
                      </div>
                    ))}
                  </div>

                  {/* Desktop */}
                  <div className="hidden sm:block">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[50px]">#</TableHead>
                          <TableHead>Apoiador</TableHead>
                          <TableHead className="text-center">Ações no mês</TableHead>
                          <TableHead className="text-right">Score</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {monthRanking.map((item, index) => item && (
                          <TableRow key={item.id}>
                            <TableCell>
                              {index < 3 ? (
                                <Trophy className={`h-5 w-5 ${
                                  index === 0 ? 'text-amber-400' : index === 1 ? 'text-slate-400' : 'text-amber-600'
                                }`} />
                              ) : (
                                <span className="text-muted-foreground">{index + 1}</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-3">
                                <Avatar className="h-8 w-8">
                                  <AvatarImage src={getProfilePicture(item) || undefined} />
                                  <AvatarFallback>{item.name.charAt(0)}</AvatarFallback>
                                </Avatar>
                                <span className="font-medium">{item.name}</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-center">{item.monthActions}</TableCell>
                            <TableCell className="text-right font-bold text-lg">{item.monthScore}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Inactive Tab */}
        <TabsContent value="inativos">
          <Card>
            <CardHeader className="px-3 sm:px-6">
              <CardTitle>Apoiadores Inativos</CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                Sem interação há {engagementConfig?.inactivity_days || 7}+ dias
              </CardDescription>
            </CardHeader>
            <CardContent className="px-0 sm:px-6">
              {/* Mobile */}
              <div className="sm:hidden space-y-2 px-3">
                {inactiveSupporters.map((supporter) => (
                  <div key={supporter.id} className="flex items-center gap-3 p-3 rounded-lg border">
                    <Avatar className="h-8 w-8 shrink-0">
                      <AvatarImage src={getProfilePicture(supporter) || undefined} />
                      <AvatarFallback className="text-xs">{supporter.name.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{supporter.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {supporter.last_interaction_date
                          ? new Date(supporter.last_interaction_date).toLocaleDateString('pt-BR')
                          : "Nunca"}
                      </p>
                    </div>
                    <span className="font-bold shrink-0">{supporter.engagement_score || 0}</span>
                  </div>
                ))}
                {inactiveSupporters.length === 0 && (
                  <p className="text-center py-8 text-muted-foreground">Nenhum inativo 🎉</p>
                )}
              </div>

              {/* Desktop */}
              <div className="hidden sm:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Apoiador</TableHead>
                      <TableHead>Classificação</TableHead>
                      <TableHead>Última Interação</TableHead>
                      <TableHead className="text-right">Score</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {inactiveSupporters.map((supporter) => (
                      <TableRow key={supporter.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar className="h-8 w-8">
                              <AvatarImage src={getProfilePicture(supporter) || undefined} />
                              <AvatarFallback>{supporter.name.charAt(0).toUpperCase()}</AvatarFallback>
                            </Avatar>
                            <p className="font-medium">{supporter.name}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={classificationColors[supporter.classification || 'neutro']}>
                            {classificationLabels[supporter.classification || 'neutro']}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {supporter.last_interaction_date
                            ? new Date(supporter.last_interaction_date).toLocaleDateString('pt-BR')
                            : <span className="text-muted-foreground">Nunca</span>}
                        </TableCell>
                        <TableCell className="text-right font-bold">{supporter.engagement_score || 0}</TableCell>
                      </TableRow>
                    ))}
                    {inactiveSupporters.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                          Nenhum inativo 🎉
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Config Tab */}
        <TabsContent value="config">
          <Card>
            <CardHeader className="px-3 sm:px-6">
              <CardTitle>Configuração de Pontuação</CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                Pontos por tipo de ação — os scores somam Facebook + Instagram
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 px-3 sm:px-6">
              <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
                <div className="space-y-2">
                  <Label htmlFor="like_points" className="flex items-center gap-2 text-xs sm:text-sm">
                    <Heart className="h-4 w-4 text-destructive" />
                    Curtida
                  </Label>
                  <Input id="like_points" type="number" min="0"
                    value={configForm.like_points || 1}
                    onChange={(e) => setConfigForm({ ...configForm, like_points: parseInt(e.target.value) })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="comment_points" className="flex items-center gap-2 text-xs sm:text-sm">
                    <MessageCircle className="h-4 w-4 text-primary" />
                    Comentário
                  </Label>
                  <Input id="comment_points" type="number" min="0"
                    value={configForm.comment_points || 3}
                    onChange={(e) => setConfigForm({ ...configForm, comment_points: parseInt(e.target.value) })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="share_points" className="flex items-center gap-2 text-xs sm:text-sm">
                    <Share2 className="h-4 w-4 text-emerald-500" />
                    Compartilhar
                  </Label>
                  <Input id="share_points" type="number" min="0"
                    value={configForm.share_points || 5}
                    onChange={(e) => setConfigForm({ ...configForm, share_points: parseInt(e.target.value) })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reaction_points" className="flex items-center gap-2 text-xs sm:text-sm">
                    <Activity className="h-4 w-4 text-violet-500" />
                    Reação
                  </Label>
                  <Input id="reaction_points" type="number" min="0"
                    value={configForm.reaction_points || 1}
                    onChange={(e) => setConfigForm({ ...configForm, reaction_points: parseInt(e.target.value) })}
                  />
                </div>
              </div>

              <div className="max-w-xs space-y-2">
                <Label htmlFor="inactivity_days" className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  Dias para considerar inativo
                </Label>
                <Input id="inactivity_days" type="number" min="1"
                  value={configForm.inactivity_days || 7}
                  onChange={(e) => setConfigForm({ ...configForm, inactivity_days: parseInt(e.target.value) })}
                />
              </div>

              <Button onClick={saveConfig}>Salvar Configuração</Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
