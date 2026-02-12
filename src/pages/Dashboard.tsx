import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MessageSquare, TrendingUp, TrendingDown, Minus, AlertCircle, RefreshCw, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { PieChart, Pie, Cell, LineChart, Line, XAxis, YAxis, CartesianGrid, Legend, BarChart, Bar, ResponsiveContainer } from "recharts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface CommentRow {
  id: string;
  sentiment: string | null;
  created_at: string | null;
  comment_created_time: string | null;
  author_name: string | null;
  text: string;
  platform: string | null;
}

interface TimelineData {
  date: string;
  positive: number;
  neutral: number;
  negative: number;
}

const Dashboard = () => {
  const [allComments, setAllComments] = useState<CommentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncMessage, setLastSyncMessage] = useState<string | null>(null);
  const [periodDays, setPeriodDays] = useState<number>(30);
  const [clientId, setClientId] = useState<string>("");
  const syncAttempted = useRef(false);

  // Load client and all comments
  const loadData = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: clients } = await supabase
        .from("clients")
        .select("id")
        .eq("user_id", user.id);

      if (!clients || clients.length === 0) {
        setLoading(false);
        return;
      }

      const cId = clients[0].id;
      setClientId(cId);

      // Fetch ALL comments (up to 1000 most recent)
      const { data: comments } = await supabase
        .from("comments")
        .select("id, sentiment, created_at, comment_created_time, author_name, text, platform")
        .eq("client_id", cId)
        .order("comment_created_time", { ascending: false })
        .limit(1000);

      if (comments) {
        setAllComments(comments as CommentRow[]);
      }
    } catch (error) {
      console.error("Error loading data:", error);
      toast.error("Erro ao carregar dados");
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-sync on first load
  const autoSync = useCallback(async (cId: string) => {
    if (syncAttempted.current || !cId) return;
    syncAttempted.current = true;

    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('fetch-meta-comments', {
        body: { clientId: cId, postsLimit: 30 }
      });

      if (error) {
        // Check if it's a token error
        const errMsg = error.message || '';
        if (errMsg.includes('expired') || errMsg.includes('token')) {
          toast.error("⚠️ Token Meta expirado! Atualize na página de Integrações.");
        } else {
          toast.error("Erro na sincronização: " + errMsg);
        }
        return;
      }

      if (data?.success) {
        const msg = data.message || 'Sincronizado';
        setLastSyncMessage(msg);
        
        if (data.warnings?.length > 0) {
          for (const w of data.warnings) {
            toast.warning(w, { duration: 8000 });
          }
        }

        if (data.newComments > 0 || data.updatedComments > 0) {
          toast.success(`🔄 ${msg}`);
          // Reload comments after sync
          await loadData();
        } else {
          toast.info("Dados já atualizados, nenhum comentário novo.");
        }
      } else if (data?.error) {
        if (data.error.includes('expirado') || data.error.includes('expired')) {
          toast.error("⚠️ Token Meta expirado! Atualize na página de Integrações.");
        } else {
          toast.error(data.error);
        }
      }
    } catch (err: any) {
      console.error("Auto-sync error:", err);
      toast.error("Erro ao sincronizar dados do Meta");
    } finally {
      setSyncing(false);
    }
  }, [loadData]);

  useEffect(() => {
    loadData().then(() => {
      // Auto-sync after loading data
    });
  }, [loadData]);

  // Trigger auto-sync after clientId is set
  useEffect(() => {
    if (clientId && !syncAttempted.current) {
      autoSync(clientId);
    }
  }, [clientId, autoSync]);

  const handleManualSync = async () => {
    if (!clientId || syncing) return;
    syncAttempted.current = false; // Allow re-sync
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('fetch-meta-comments', {
        body: { clientId, postsLimit: 30 }
      });

      if (error) throw error;

      if (data?.success) {
        toast.success(`🔄 ${data.message}`);
        setLastSyncMessage(data.message);
        if (data.warnings?.length > 0) {
          for (const w of data.warnings) {
            toast.warning(w, { duration: 8000 });
          }
        }
        await loadData();
      } else {
        toast.error(data?.error || "Erro na sincronização");
      }
    } catch (err: any) {
      console.error("Sync error:", err);
      toast.error("Erro ao sincronizar");
    } finally {
      setSyncing(false);
    }
  };

  // Filter comments by period (locally)
  const filteredComments = allComments.filter(c => {
    const dateStr = c.comment_created_time || c.created_at;
    if (!dateStr) return false;
    const since = new Date();
    since.setDate(since.getDate() - periodDays);
    return new Date(dateStr) >= since;
  });

  const stats = {
    total: filteredComments.length,
    positive: filteredComments.filter(c => c.sentiment === "positive").length,
    neutral: filteredComments.filter(c => c.sentiment === "neutral").length,
    negative: filteredComments.filter(c => c.sentiment === "negative").length,
  };

  const recentComments = filteredComments.slice(0, 5);

  // Build timeline data
  const timelineData: TimelineData[] = (() => {
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
  })();

  const getSentimentIcon = (sentiment: string) => {
    switch (sentiment) {
      case "positive": return <TrendingUp className="w-5 h-5 text-success" />;
      case "negative": return <TrendingDown className="w-5 h-5 text-destructive" />;
      default: return <Minus className="w-5 h-5 text-muted-foreground" />;
    }
  };

  const getSentimentColor = (sentiment: string) => {
    switch (sentiment) {
      case "positive": return "text-success";
      case "negative": return "text-destructive";
      default: return "text-muted-foreground";
    }
  };

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-1/4"></div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-32 bg-muted rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 space-y-6 md:space-y-8">
      {/* Header with Sync */}
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground mt-1 text-sm md:text-base">
            Visão geral — {stats.total} comentários nos últimos {periodDays} dias
          </p>
          {lastSyncMessage && (
            <p className="text-xs text-muted-foreground mt-1">Última sync: {lastSyncMessage}</p>
          )}
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={handleManualSync}
            disabled={syncing}
          >
            {syncing ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Sincronizando...</>
            ) : (
              <><RefreshCw className="w-4 h-4 mr-2" />Sincronizar Meta</>
            )}
          </Button>

          {syncing && (
            <Badge variant="secondary" className="animate-pulse">
              Buscando últimas 30 postagens...
            </Badge>
          )}

          <Select value={String(periodDays)} onValueChange={(v) => setPeriodDays(Number(v))}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Período" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Últimos 7 dias</SelectItem>
              <SelectItem value="15">Últimos 15 dias</SelectItem>
              <SelectItem value="30">Últimos 30 dias</SelectItem>
              <SelectItem value="60">Últimos 60 dias</SelectItem>
              <SelectItem value="90">Últimos 90 dias</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
            <p className="text-xs text-muted-foreground">Comentários monitorados</p>
          </CardContent>
        </Card>

        <Card className="border-success/20 bg-success/5">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Positivos</CardTitle>
            <TrendingUp className="h-4 w-4 text-success" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-success">{stats.positive}</div>
            <p className="text-xs text-muted-foreground">
              {stats.total > 0 ? Math.round((stats.positive / stats.total) * 100) : 0}%
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Neutros</CardTitle>
            <Minus className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.neutral}</div>
            <p className="text-xs text-muted-foreground">
              {stats.total > 0 ? Math.round((stats.neutral / stats.total) * 100) : 0}%
            </p>
          </CardContent>
        </Card>

        <Card className="border-destructive/20 bg-destructive/5">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Negativos</CardTitle>
            <AlertCircle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{stats.negative}</div>
            <p className="text-xs text-muted-foreground">
              {stats.total > 0 ? Math.round((stats.negative / stats.total) * 100) : 0}%
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Distribuição de Sentimentos</CardTitle>
            <CardDescription>Proporção por sentimento</CardDescription>
          </CardHeader>
          <CardContent>
            {stats.total === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <MessageSquare className="w-12 h-12 mx-auto mb-4 opacity-20" />
                <p>Sem dados para exibir</p>
              </div>
            ) : (
              <ChartContainer
                config={{
                  positive: { label: "Positivos", color: "hsl(var(--success))" },
                  neutral: { label: "Neutros", color: "hsl(var(--muted-foreground))" },
                  negative: { label: "Negativos", color: "hsl(var(--destructive))" },
                }}
                className="h-[300px]"
              >
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={[
                        { name: "Positivos", value: stats.positive, fill: "hsl(var(--success))" },
                        { name: "Neutros", value: stats.neutral, fill: "hsl(var(--muted-foreground))" },
                        { name: "Negativos", value: stats.negative, fill: "hsl(var(--destructive))" },
                      ]}
                      cx="50%" cy="50%" labelLine={false}
                      label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
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
          <CardHeader>
            <CardTitle>Evolução no Período</CardTitle>
            <CardDescription>Tendência de sentimentos</CardDescription>
          </CardHeader>
          <CardContent>
            {timelineData.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <TrendingUp className="w-12 h-12 mx-auto mb-4 opacity-20" />
                <p>Sem dados para exibir</p>
              </div>
            ) : (
              <ChartContainer
                config={{
                  positive: { label: "Positivos", color: "hsl(var(--success))" },
                  neutral: { label: "Neutros", color: "hsl(var(--muted-foreground))" },
                  negative: { label: "Negativos", color: "hsl(var(--destructive))" },
                }}
                className="h-[300px]"
              >
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={timelineData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" />
                    <YAxis stroke="hsl(var(--muted-foreground))" />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Legend />
                    <Line type="monotone" dataKey="positive" stroke="hsl(var(--success))" strokeWidth={2} name="Positivos" />
                    <Line type="monotone" dataKey="neutral" stroke="hsl(var(--muted-foreground))" strokeWidth={2} name="Neutros" />
                    <Line type="monotone" dataKey="negative" stroke="hsl(var(--destructive))" strokeWidth={2} name="Negativos" />
                  </LineChart>
                </ResponsiveContainer>
              </ChartContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Bar Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Comparação de Sentimentos</CardTitle>
          <CardDescription>Volume por categoria</CardDescription>
        </CardHeader>
        <CardContent>
          {stats.total === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <AlertCircle className="w-12 h-12 mx-auto mb-4 opacity-20" />
              <p>Sem dados para exibir</p>
            </div>
          ) : (
            <ChartContainer
              config={{ value: { label: "Quantidade", color: "hsl(var(--primary))" } }}
              className="h-[300px]"
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={[
                    { name: "Positivos", value: stats.positive, fill: "hsl(var(--success))" },
                    { name: "Neutros", value: stats.neutral, fill: "hsl(var(--muted-foreground))" },
                    { name: "Negativos", value: stats.negative, fill: "hsl(var(--destructive))" },
                  ]}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" />
                  <YAxis stroke="hsl(var(--muted-foreground))" />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="value" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
          )}
        </CardContent>
      </Card>

      {/* Recent Comments */}
      <Card>
        <CardHeader>
          <CardTitle>Comentários Recentes</CardTitle>
          <CardDescription>Últimos comentários do período selecionado</CardDescription>
        </CardHeader>
        <CardContent>
          {recentComments.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <MessageSquare className="w-12 h-12 mx-auto mb-4 opacity-20" />
              <p>Nenhum comentário neste período</p>
              <p className="text-sm mt-2">Sincronize ou ajuste o filtro de período</p>
            </div>
          ) : (
            <div className="space-y-4">
              {recentComments.map((comment) => (
                <div
                  key={comment.id}
                  className="flex items-start gap-4 p-4 rounded-lg border bg-card hover:bg-accent/5 transition-colors"
                >
                  <div className="mt-1">{getSentimentIcon(comment.sentiment || "neutral")}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-sm font-medium">{comment.author_name || "Desconhecido"}</p>
                      {comment.platform && (
                        <Badge variant="outline" className="text-[10px]">
                          {comment.platform === 'facebook' ? 'FB' : 'IG'}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-2">{comment.text}</p>
                    <div className="flex items-center gap-4 mt-2">
                      <span className={`text-xs font-medium ${getSentimentColor(comment.sentiment || "neutral")}`}>
                        {comment.sentiment === "positive" && "Positivo"}
                        {comment.sentiment === "negative" && "Negativo"}
                        {(comment.sentiment === "neutral" || !comment.sentiment) && "Neutro"}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {(comment.comment_created_time || comment.created_at) &&
                          new Date(comment.comment_created_time || comment.created_at!).toLocaleDateString("pt-BR")}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Dashboard;
