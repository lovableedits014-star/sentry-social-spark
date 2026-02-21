import { useState, useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  MessageSquare, TrendingUp, TrendingDown, Minus, AlertCircle,
  RefreshCw, Loader2, Users, Shield, Sparkles, Activity, ShieldAlert,
} from "lucide-react";
import { toast } from "sonner";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { PieChart, Pie, Cell, LineChart, Line, XAxis, YAxis, CartesianGrid, Legend, ResponsiveContainer } from "recharts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CommentItem, type CommentData } from "@/components/CommentItem";
import { IEDPanel } from "@/components/IEDPanel";

interface DashboardComment {
  id: string;
  comment_id: string;
  post_id: string;
  client_id: string;
  sentiment: string | null;
  status: string | null;
  created_at: string;
  comment_created_time: string | null;
  author_name: string | null;
  author_id: string | null;
  author_profile_picture: string | null;
  text: string;
  platform: string | null;
  platform_user_id: string | null;
  social_profile_id: string | null;
  author_unavailable: boolean;
  author_unavailable_reason: string | null;
  ai_response: string | null;
  final_response: string | null;
  post_message: string | null;
  post_permalink_url: string | null;
  post_full_picture: string | null;
  post_media_type: string | null;
  parent_comment_id: string | null;
  is_page_owner: boolean;
  is_hidden: boolean;
}

interface TimelineData {
  date: string;
  positive: number;
  neutral: number;
  negative: number;
}

const Dashboard = () => {
  const [syncing, setSyncing] = useState(false);
  const [analyzingSentiments, setAnalyzingSentiments] = useState(false);
  const [periodDays, setPeriodDays] = useState<number>(30);
  const [clientId, setClientId] = useState<string>("");
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [generatingResponse, setGeneratingResponse] = useState<string | null>(null);
  const [responding, setResponding] = useState<string | null>(null);
  const [managingComment, setManagingComment] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const fetchDashboardData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("No user");

    const { data: clients } = await supabase
      .from("clients")
      .select("id")
      .eq("user_id", user.id);

    if (!clients || clients.length === 0) return { allComments: [] as DashboardComment[], supportersCount: 0, clientId: "" };

    const cId = clients[0].id;

    // Fetch ALL comments (paginated)
    const PAGE_SIZE = 1000;
    let allData: DashboardComment[] = [];
    let page = 0;
    let hasMore = true;

    while (hasMore) {
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const { data } = await supabase
        .from("comments")
        .select("id, comment_id, post_id, client_id, sentiment, status, created_at, comment_created_time, author_name, author_id, author_profile_picture, text, platform, platform_user_id, social_profile_id, author_unavailable, author_unavailable_reason, ai_response, final_response, post_message, post_permalink_url, post_full_picture, post_media_type, parent_comment_id, is_page_owner, is_hidden")
        .eq("client_id", cId)
        .not("text", "eq", "__post_stub__")
        .eq("is_page_owner", false)
        .order("comment_created_time", { ascending: false })
        .range(from, to);

      if (data) allData = [...allData, ...data as DashboardComment[]];
      hasMore = (data?.length || 0) === PAGE_SIZE;
      page++;
    }

    // Fetch supporters count
    const { count: supCount } = await supabase
      .from("supporters")
      .select("id", { count: "exact", head: true })
      .eq("client_id", cId);

    return { allComments: allData, supportersCount: supCount || 0, clientId: cId };
  }, []);

  const { data: dashData, isLoading: loading } = useQuery({
    queryKey: ["dashboard-data"],
    queryFn: fetchDashboardData,
    staleTime: Infinity, // Never auto-refetch — only manual
    gcTime: 1000 * 60 * 30, // Keep in cache 30 min
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
  });

  const allComments = dashData?.allComments ?? [];
  const supportersCount = dashData?.supportersCount ?? 0;

  // Keep clientId in state for actions
  if (dashData?.clientId && dashData.clientId !== clientId) {
    setClientId(dashData.clientId);
  }

  const reloadData = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["dashboard-data"] });
  }, [queryClient]);

  // Manual sync only
  const handleManualSync = async () => {
    if (!clientId || syncing) return;
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('fetch-meta-comments', {
        body: { clientId, postsLimit: 30 }
      });
      if (error) throw error;
      if (data?.success) {
        toast.success(`🔄 ${data.message}`);
        setLastSync(new Date().toLocaleString("pt-BR"));
        if (data.warnings?.length > 0) {
          for (const w of data.warnings) toast.warning(w, { duration: 8000 });
        }
        reloadData();
      } else {
        const errMsg = data?.error || "Erro na sincronização";
        if (errMsg.includes('expirado') || errMsg.includes('expired')) {
          toast.error("⚠️ Token Meta expirado! Atualize na página de Integrações.");
        } else {
          toast.error(errMsg);
        }
      }
    } catch (err: any) {
      console.error("Sync error:", err);
      toast.error("Erro ao sincronizar");
    } finally {
      setSyncing(false);
    }
  };

  // Batch sentiment analysis
  const handleAnalyzeSentiments = async (reanalyzeAll = false) => {
    if (!clientId || analyzingSentiments) return;
    setAnalyzingSentiments(true);
    try {
      const { data, error } = await supabase.functions.invoke('batch-analyze-sentiments', {
        body: { clientId, reanalyzeAll }
      });
      if (error) throw error;
      if (data?.success) {
        toast.success(data.message);
        if (data.remaining > 0) {
          toast.info(`Restam ${data.remaining} comentários. Execute novamente para continuar.`, { duration: 8000 });
        }
        reloadData();
      } else {
        toast.error(data?.error || "Erro ao analisar sentimentos");
      }
    } catch (err: any) {
      console.error("Sentiment analysis error:", err);
      toast.error(err.message || "Erro ao analisar sentimentos");
    } finally {
      setAnalyzingSentiments(false);
    }
  };

  // Comment actions (for crisis section)
  const handleGenerateResponse = async (commentId: string, isRegenerate = false) => {
    setGeneratingResponse(commentId);
    try {
      const { data, error } = await supabase.functions.invoke('generate-response', {
        body: { commentId, clientId }
      });
      if (error) throw error;
      if (data.success) {
        reloadData();
        toast.success(isRegenerate ? "Nova resposta gerada!" : "Resposta gerada!");
      } else {
        toast.error(data.error || 'Erro ao gerar resposta.');
      }
    } catch (error: any) {
      toast.error(error.message || "Erro ao gerar resposta.");
    } finally {
      setGeneratingResponse(null);
    }
  };

  const handleSendResponse = async (commentId: string, responseText: string, platform: string) => {
    if (!responseText?.trim()) { toast.error("Resposta vazia"); return; }
    setResponding(commentId);
    try {
      const { data, error } = await supabase.functions.invoke('respond-to-comment', {
        body: { commentId, clientId, responseText }
      });
      if (error) throw error;
      if (data.success) {
        reloadData();
        toast.success("Resposta publicada!");
      } else if (data.code === 'RATE_LIMITED') {
        toast.warning(data.error, { duration: 10000 });
      } else {
        toast.error(data.error || 'Falha ao publicar');
      }
    } catch (error: any) {
      toast.error(error.message || "Erro ao publicar resposta");
    } finally {
      setResponding(null);
    }
  };

  const handleManageComment = async (commentId: string, action: 'delete' | 'hide' | 'unhide' | 'block_user') => {
    setManagingComment(commentId);
    try {
      const { data, error } = await supabase.functions.invoke('manage-comment', {
        body: { commentId, clientId, action }
      });
      if (error) throw error;
      if (data.success) {
        toast.success(data.message);
        reloadData();
      } else {
        toast.error(data.error || 'Erro na operação');
      }
    } catch (error: any) {
      toast.error(error.message || 'Erro ao gerenciar comentário');
    } finally {
      setManagingComment(null);
    }
  };

  // Filter comments by period
  const filteredComments = useMemo(() => {
    return allComments.filter(c => {
      const dateStr = c.comment_created_time || c.created_at;
      if (!dateStr) return false;
      const since = new Date();
      since.setDate(since.getDate() - periodDays);
      return new Date(dateStr) >= since;
    });
  }, [allComments, periodDays]);

  const stats = useMemo(() => {
    const total = filteredComments.length;
    const positive = filteredComments.filter(c => c.sentiment === "positive").length;
    const neutral = filteredComments.filter(c => c.sentiment === "neutral").length;
    const negative = filteredComments.filter(c => c.sentiment === "negative").length;
    const unanalyzed = filteredComments.filter(c => !c.sentiment).length;
    const posPercent = total > 0 ? Math.round((positive / total) * 100) : 0;
    const negPercent = total > 0 ? Math.round((negative / total) * 100) : 0;
    const neuPercent = total > 0 ? Math.round((neutral / total) * 100) : 0;
    const respondedCount = filteredComments.filter(c => c.status === "responded").length;
    const pendingCount = filteredComments.filter(c => c.status === "pending").length;
    return { total, positive, neutral, negative, unanalyzed, posPercent, negPercent, neuPercent, respondedCount, pendingCount };
  }, [filteredComments]);

  // Negative comments for crisis section
  const negativeComments = useMemo(() => {
    return filteredComments
      .filter(c => c.sentiment === "negative" && c.status !== "responded")
      .sort((a, b) => (b.comment_created_time || b.created_at || '').localeCompare(a.comment_created_time || a.created_at || ''))
      .slice(0, 20);
  }, [filteredComments]);

  // Timeline data
  const timelineData: TimelineData[] = useMemo(() => {
    const grouped: Record<string, TimelineData> = {};
    for (const c of filteredComments) {
      const dateStr = c.comment_created_time || c.created_at;
      if (!dateStr) continue;
      const date = new Date(dateStr).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
      if (!grouped[date]) grouped[date] = { date, positive: 0, neutral: 0, negative: 0 };
      if (c.sentiment === "positive") grouped[date].positive++;
      if (c.sentiment === "neutral") grouped[date].neutral++;
      if (c.sentiment === "negative") grouped[date].negative++;
    }
    return Object.values(grouped);
  }, [filteredComments]);

  // Platform breakdown
  const platformStats = useMemo(() => {
    const fb = filteredComments.filter(c => c.platform === "facebook").length;
    const ig = filteredComments.filter(c => c.platform === "instagram").length;
    return { facebook: fb, instagram: ig };
  }, [filteredComments]);

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-1/4" />
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map(i => <div key={i} className="h-32 bg-muted rounded" />)}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {stats.total.toLocaleString()} comentários • {supportersCount} apoiadores • Últimos {periodDays} dias
          </p>
          {lastSync && (
            <p className="text-xs text-muted-foreground mt-0.5">Última sincronização: {lastSync}</p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleManualSync}
            disabled={syncing}
          >
            {syncing ? (
              <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />Sincronizando...</>
            ) : (
              <><RefreshCw className="w-4 h-4 mr-1.5" />Sincronizar Meta</>
            )}
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => handleAnalyzeSentiments(false)}
            disabled={analyzingSentiments}
          >
            {analyzingSentiments ? (
              <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />Analisando...</>
            ) : (
              <><Sparkles className="w-4 h-4 mr-1.5" />Analisar Sentimentos{stats.unanalyzed > 0 && ` (${stats.unanalyzed})`}</>
            )}
          </Button>

          <Select value={String(periodDays)} onValueChange={(v) => setPeriodDays(Number(v))}>
            <SelectTrigger className="w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">7 dias</SelectItem>
              <SelectItem value="15">15 dias</SelectItem>
              <SelectItem value="30">30 dias</SelectItem>
              <SelectItem value="60">60 dias</SelectItem>
              <SelectItem value="90">90 dias</SelectItem>
              <SelectItem value="365">1 ano</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Unanalyzed alert */}
      {stats.unanalyzed > 0 && (
        <div className="flex items-center gap-3 p-3 rounded-lg border border-warning/30 bg-warning/5">
          <AlertCircle className="w-5 h-5 text-warning shrink-0" />
          <p className="text-sm text-warning">
            <strong>{stats.unanalyzed}</strong> comentários sem análise de sentimento.
            Clique em "Analisar Sentimentos" para classificá-los automaticamente com IA.
          </p>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Total</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total.toLocaleString()}</div>
            <p className="text-[10px] text-muted-foreground mt-1">
              {platformStats.facebook} FB · {platformStats.instagram} IG
            </p>
          </CardContent>
        </Card>

        <Card className="border-green-500/20 bg-green-500/5">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Positivos</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.positive}</div>
            <p className="text-[10px] text-muted-foreground mt-1">{stats.posPercent}%</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Neutros</CardTitle>
            <Minus className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.neutral}</div>
            <p className="text-[10px] text-muted-foreground mt-1">{stats.neuPercent}%</p>
          </CardContent>
        </Card>

        <Card className="border-destructive/20 bg-destructive/5">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Negativos</CardTitle>
            <TrendingDown className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{stats.negative}</div>
            <p className="text-[10px] text-muted-foreground mt-1">{stats.negPercent}%</p>
          </CardContent>
        </Card>

        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Apoiadores</CardTitle>
            <Users className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{supportersCount}</div>
            <p className="text-[10px] text-muted-foreground mt-1">
              {stats.respondedCount} respondidos · {stats.pendingCount} pendentes
            </p>
          </CardContent>
        </Card>
      </div>

      {/* IED Panel */}
      {clientId && <IEDPanel clientId={clientId} />}

      {/* Charts */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Distribuição de Sentimentos</CardTitle>
          </CardHeader>
          <CardContent>
            {stats.total === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <MessageSquare className="w-10 h-10 mx-auto mb-3 opacity-20" />
                <p className="text-sm">Sem dados</p>
              </div>
            ) : (
              <ChartContainer
                config={{
                  positive: { label: "Positivos", color: "hsl(142, 71%, 45%)" },
                  neutral: { label: "Neutros", color: "hsl(var(--muted-foreground))" },
                  negative: { label: "Negativos", color: "hsl(var(--destructive))" },
                }}
                className="h-[250px]"
              >
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={[
                        { name: "Positivos", value: stats.positive, fill: "hsl(142, 71%, 45%)" },
                        { name: "Neutros", value: stats.neutral, fill: "hsl(var(--muted-foreground))" },
                        { name: "Negativos", value: stats.negative, fill: "hsl(var(--destructive))" },
                      ]}
                      cx="50%" cy="50%" labelLine={false}
                      label={({ name, percent }) => percent > 0.02 ? `${name}: ${(percent * 100).toFixed(0)}%` : ''}
                      outerRadius={80} dataKey="value"
                    />
                    <ChartTooltip content={<ChartTooltipContent />} />
                  </PieChart>
                </ResponsiveContainer>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Evolução no Período</CardTitle>
          </CardHeader>
          <CardContent>
            {timelineData.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Activity className="w-10 h-10 mx-auto mb-3 opacity-20" />
                <p className="text-sm">Sem dados</p>
              </div>
            ) : (
              <ChartContainer
                config={{
                  positive: { label: "Positivos", color: "hsl(142, 71%, 45%)" },
                  neutral: { label: "Neutros", color: "hsl(var(--muted-foreground))" },
                  negative: { label: "Negativos", color: "hsl(var(--destructive))" },
                }}
                className="h-[250px]"
              >
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={timelineData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Legend />
                    <Line type="monotone" dataKey="positive" stroke="hsl(142, 71%, 45%)" strokeWidth={2} name="Positivos" dot={false} />
                    <Line type="monotone" dataKey="neutral" stroke="hsl(var(--muted-foreground))" strokeWidth={2} name="Neutros" dot={false} />
                    <Line type="monotone" dataKey="negative" stroke="hsl(var(--destructive))" strokeWidth={2} name="Negativos" dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </ChartContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Crisis Management Section */}
      <Card className="border-destructive/30">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-destructive" />
              <CardTitle className="text-base">Gestão de Crise</CardTitle>
            </div>
            <Badge variant="destructive" className="text-xs">
              {negativeComments.length} negativos pendentes
            </Badge>
          </div>
          <CardDescription>
            Comentários negativos que precisam de atenção — responda, exclua ou bloqueie
          </CardDescription>
        </CardHeader>
        <CardContent>
          {negativeComments.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Shield className="w-10 h-10 mx-auto mb-3 opacity-20" />
              <p className="text-sm font-medium">Nenhum comentário negativo pendente!</p>
              <p className="text-xs mt-1">Sua reputação está protegida.</p>
            </div>
          ) : (
            <div className="divide-y divide-border rounded-lg border overflow-hidden">
              {negativeComments.map((comment) => (
                <CommentItem
                  key={comment.id}
                  comment={comment as CommentData}
                  onGenerateResponse={handleGenerateResponse}
                  onSendResponse={handleSendResponse}
                  onManageComment={handleManageComment}
                  isGenerating={generatingResponse === comment.id}
                  isResponding={responding === comment.id}
                  isManaging={managingComment === comment.id}
                  showPostInfo={true}
                />
              ))}
            </div>
          )}

          {stats.negative > negativeComments.length && (
            <p className="text-xs text-muted-foreground mt-3 text-center">
              Mostrando os {negativeComments.length} mais recentes de {stats.negative} negativos no período.
              Acesse Comentários para ver todos.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Re-analyze all button */}
      <div className="flex justify-center">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => handleAnalyzeSentiments(true)}
          disabled={analyzingSentiments}
          className="text-xs text-muted-foreground"
        >
          {analyzingSentiments ? (
            <><Loader2 className="w-3 h-3 mr-1.5 animate-spin" />Reanalisando...</>
          ) : (
            <><Sparkles className="w-3 h-3 mr-1.5" />Reanalisar todos os sentimentos</>
          )}
        </Button>
      </div>
    </div>
  );
};

export default Dashboard;
