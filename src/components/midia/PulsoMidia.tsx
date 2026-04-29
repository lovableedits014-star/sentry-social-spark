import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  RefreshCw, Plus, X, ExternalLink, AlertTriangle, TrendingUp, TrendingDown, Minus,
  Newspaper, Target, Activity, Flame,
} from "lucide-react";

type Alvo = { id: string; termo: string; tipo: string; ativo: boolean };
type Noticia = {
  id: string;
  url: string;
  titulo: string;
  resumo_ia: string | null;
  portal_nome: string | null;
  data_publicacao: string | null;
  data_coleta: string;
  sentimento: string | null;
  sentimento_score: number | null;
  relevancia_politica: number | null;
  alvos_mencionados: string[];
  tags_assunto: string[];
  alerta_critico: boolean;
};
type Log = {
  id: string;
  iniciado_em: string;
  finalizado_em: string | null;
  portais_processados: number | null;
  noticias_novas: number | null;
  noticias_analisadas: number | null;
  creditos_firecrawl: number | null;
  status: string;
};

function fmtDateTime(iso: string | null) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }); } catch { return iso; }
}
function sentimentoColor(s: string | null) {
  if (s === "positivo") return "text-green-600 dark:text-green-400";
  if (s === "negativo") return "text-red-600 dark:text-red-400";
  return "text-muted-foreground";
}
function SentimentoIcon({ s }: { s: string | null }) {
  if (s === "positivo") return <TrendingUp className="w-3.5 h-3.5" />;
  if (s === "negativo") return <TrendingDown className="w-3.5 h-3.5" />;
  return <Minus className="w-3.5 h-3.5" />;
}

export default function PulsoMidia() {
  const qc = useQueryClient();
  const [novoTermo, setNovoTermo] = useState("");
  const [novoTipo, setNovoTipo] = useState<string>("candidato");
  const [filtro, setFiltro] = useState<string>("todas");

  // Resolve client_id atual
  const { data: clientId } = useQuery({
    queryKey: ["my-client-id"],
    staleTime: Infinity,
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data: c } = await supabase.from("clients").select("id").eq("user_id", user.id).maybeSingle();
      if (c?.id) return c.id as string;
      const { data: tm } = await supabase.from("team_members").select("client_id").eq("user_id", user.id).limit(1).maybeSingle();
      return (tm?.client_id as string | undefined) ?? null;
    },
  });

  // Alvos
  const { data: alvos = [] } = useQuery<Alvo[]>({
    queryKey: ["midia-alvos", clientId],
    enabled: !!clientId,
    staleTime: Infinity,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("midia_alvos_monitoramento" as any)
        .select("id,termo,tipo,ativo")
        .eq("client_id", clientId!)
        .order("created_at");
      if (error) throw error;
      return (data as any) || [];
    },
  });

  // Notícias
  const { data: noticias = [], isLoading: loadingNoticias } = useQuery<Noticia[]>({
    queryKey: ["midia-noticias", clientId, filtro],
    enabled: !!clientId,
    staleTime: Infinity,
    queryFn: async () => {
      let q = supabase
        .from("midia_noticias" as any)
        .select("id,url,titulo,resumo_ia,portal_nome,data_publicacao,data_coleta,sentimento,sentimento_score,relevancia_politica,alvos_mencionados,tags_assunto,alerta_critico")
        .eq("client_id", clientId!)
        .order("data_coleta", { ascending: false })
        .limit(150);
      if (filtro === "alertas") q = q.eq("alerta_critico", true);
      else if (filtro === "negativas") q = q.eq("sentimento", "negativo");
      else if (filtro === "positivas") q = q.eq("sentimento", "positivo");
      const { data, error } = await q;
      if (error) throw error;
      return (data as any) || [];
    },
  });

  // Último log
  const { data: ultimoLog } = useQuery<Log | null>({
    queryKey: ["midia-ultimo-log", clientId],
    enabled: !!clientId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("midia_coleta_log" as any)
        .select("*")
        .eq("client_id", clientId!)
        .order("iniciado_em", { ascending: false })
        .limit(1)
        .maybeSingle();
      return (data as any) || null;
    },
  });

  const stats = useMemo(() => {
    const total = noticias.length;
    const negativas = noticias.filter((n) => n.sentimento === "negativo").length;
    const positivas = noticias.filter((n) => n.sentimento === "positivo").length;
    const alertas = noticias.filter((n) => n.alerta_critico).length;
    return { total, negativas, positivas, alertas };
  }, [noticias]);

  const addAlvo = useMutation({
    mutationFn: async () => {
      if (!novoTermo.trim() || !clientId) return;
      const { error } = await supabase.from("midia_alvos_monitoramento" as any).insert({
        client_id: clientId,
        termo: novoTermo.trim(),
        tipo: novoTipo,
        ativo: true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setNovoTermo("");
      qc.invalidateQueries({ queryKey: ["midia-alvos", clientId] });
      toast.success("Alvo adicionado");
    },
    onError: (e: any) => toast.error(e?.message || "Erro ao adicionar"),
  });

  const removeAlvo = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("midia_alvos_monitoramento" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["midia-alvos", clientId] });
      toast.success("Alvo removido");
    },
  });

  const coletar = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("midia-coleta", { body: {} });
      if (error) throw error;
      return data;
    },
    onSuccess: (d: any) => {
      toast.success(`Coleta concluída: ${d?.noticias_novas ?? 0} novas notícias (${d?.creditos_firecrawl ?? 0} créditos)`);
      qc.invalidateQueries({ queryKey: ["midia-noticias", clientId] });
      qc.invalidateQueries({ queryKey: ["midia-ultimo-log", clientId] });
    },
    onError: (e: any) => toast.error(e?.message || "Falha na coleta"),
  });

  return (
    <div className="space-y-4">
      {/* Header informativo */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Flame className="w-5 h-5 text-orange-500" /> Pulso da Mídia
          </CardTitle>
          <CardDescription>
            Monitoramento diário de portais brasileiros via Firecrawl + análise de sentimento por IA.
            Define os <b>termos a rastrear</b> (seu nome, adversários, partidos, temas) e a IA classifica
            automaticamente cada matéria como positiva, negativa ou neutra para você.
          </CardDescription>
        </CardHeader>
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1"><Newspaper className="w-3.5 h-3.5" /> Notícias coletadas</CardDescription>
            <CardTitle className="text-2xl">{stats.total}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1 text-green-600 dark:text-green-400"><TrendingUp className="w-3.5 h-3.5" /> Positivas</CardDescription>
            <CardTitle className="text-2xl">{stats.positivas}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1 text-red-600 dark:text-red-400"><TrendingDown className="w-3.5 h-3.5" /> Negativas</CardDescription>
            <CardTitle className="text-2xl">{stats.negativas}</CardTitle>
          </CardHeader>
        </Card>
        <Card className={stats.alertas > 0 ? "border-orange-500" : ""}>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1 text-orange-600 dark:text-orange-400"><AlertTriangle className="w-3.5 h-3.5" /> Alertas críticos</CardDescription>
            <CardTitle className="text-2xl">{stats.alertas}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Tabs defaultValue="noticias">
        <TabsList>
          <TabsTrigger value="noticias" className="gap-1.5"><Newspaper className="w-4 h-4" /> Notícias</TabsTrigger>
          <TabsTrigger value="alvos" className="gap-1.5"><Target className="w-4 h-4" /> Alvos rastreados</TabsTrigger>
          <TabsTrigger value="execucoes" className="gap-1.5"><Activity className="w-4 h-4" /> Execuções</TabsTrigger>
        </TabsList>

        {/* === NOTÍCIAS === */}
        <TabsContent value="noticias" className="mt-4 space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex gap-2 flex-wrap">
              <Button variant={filtro === "todas" ? "default" : "outline"} size="sm" onClick={() => setFiltro("todas")}>Todas</Button>
              <Button variant={filtro === "alertas" ? "default" : "outline"} size="sm" onClick={() => setFiltro("alertas")}>
                <AlertTriangle className="w-3.5 h-3.5 mr-1" /> Alertas
              </Button>
              <Button variant={filtro === "negativas" ? "default" : "outline"} size="sm" onClick={() => setFiltro("negativas")}>
                <TrendingDown className="w-3.5 h-3.5 mr-1" /> Negativas
              </Button>
              <Button variant={filtro === "positivas" ? "default" : "outline"} size="sm" onClick={() => setFiltro("positivas")}>
                <TrendingUp className="w-3.5 h-3.5 mr-1" /> Positivas
              </Button>
            </div>
            <Button onClick={() => coletar.mutate()} disabled={coletar.isPending} size="sm">
              <RefreshCw className={`w-4 h-4 mr-1.5 ${coletar.isPending ? "animate-spin" : ""}`} />
              {coletar.isPending ? "Coletando..." : "Coletar agora"}
            </Button>
          </div>

          {loadingNoticias ? (
            <div className="space-y-2">
              {[1,2,3].map((i) => <Skeleton key={i} className="h-24 w-full" />)}
            </div>
          ) : noticias.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <Newspaper className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p className="font-medium mb-1">Nenhuma notícia ainda</p>
                <p className="text-sm">Configure pelo menos 1 alvo na aba "Alvos rastreados" e clique em "Coletar agora".</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {noticias.map((n) => (
                <Card key={n.id} className={n.alerta_critico ? "border-orange-500/50 bg-orange-50/30 dark:bg-orange-950/10" : ""}>
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                          <Badge variant="outline" className="text-xs">{n.portal_nome || "Portal"}</Badge>
                          <span>{fmtDateTime(n.data_publicacao || n.data_coleta)}</span>
                          {n.alerta_critico && <Badge variant="destructive" className="text-xs gap-1"><AlertTriangle className="w-3 h-3" /> Crítico</Badge>}
                        </div>
                        <a href={n.url} target="_blank" rel="noreferrer" className="font-semibold hover:underline inline-flex items-center gap-1.5">
                          {n.titulo}
                          <ExternalLink className="w-3.5 h-3.5 opacity-60 shrink-0" />
                        </a>
                        {n.resumo_ia && <p className="text-sm text-muted-foreground mt-1">{n.resumo_ia}</p>}
                      </div>
                      <div className={`flex items-center gap-1 text-sm font-medium ${sentimentoColor(n.sentimento)}`}>
                        <SentimentoIcon s={n.sentimento} />
                        {n.sentimento || "n/a"}
                      </div>
                    </div>
                    {(n.alvos_mencionados?.length > 0 || n.tags_assunto?.length > 0) && (
                      <div className="flex flex-wrap gap-1 pt-1">
                        {n.alvos_mencionados?.map((a) => (
                          <Badge key={`a-${a}`} variant="secondary" className="text-xs">🎯 {a}</Badge>
                        ))}
                        {n.tags_assunto?.map((t) => (
                          <Badge key={`t-${t}`} variant="outline" className="text-xs">#{t}</Badge>
                        ))}
                        {typeof n.relevancia_politica === "number" && (
                          <Badge variant="outline" className="text-xs">Relevância: {n.relevancia_politica}/100</Badge>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* === ALVOS === */}
        <TabsContent value="alvos" className="mt-4 space-y-3">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Adicionar alvo</CardTitle>
              <CardDescription>
                Termos exatos que a IA vai rastrear nas notícias. Inclua o nome do candidato, adversários,
                aliados, partidos e temas-chave (ex: <i>"saúde Campo Grande"</i>).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2 flex-wrap">
                <Input
                  placeholder='Ex: "Junior Coringa"'
                  value={novoTermo}
                  onChange={(e) => setNovoTermo(e.target.value)}
                  className="flex-1 min-w-[200px]"
                  onKeyDown={(e) => e.key === "Enter" && novoTermo.trim() && addAlvo.mutate()}
                />
                <Select value={novoTipo} onValueChange={setNovoTipo}>
                  <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="candidato">Candidato (eu)</SelectItem>
                    <SelectItem value="adversario">Adversário</SelectItem>
                    <SelectItem value="aliado">Aliado</SelectItem>
                    <SelectItem value="partido">Partido</SelectItem>
                    <SelectItem value="tema">Tema</SelectItem>
                  </SelectContent>
                </Select>
                <Button onClick={() => addAlvo.mutate()} disabled={!novoTermo.trim() || addAlvo.isPending}>
                  <Plus className="w-4 h-4 mr-1" /> Adicionar
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Alvos ativos ({alvos.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {alvos.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">Nenhum alvo configurado. Adicione pelo menos 1 acima.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {alvos.map((a) => (
                    <Badge key={a.id} variant={a.tipo === "adversario" ? "destructive" : a.tipo === "candidato" ? "default" : "secondary"} className="gap-1.5 pl-2.5 pr-1 py-1">
                      <span>{a.termo}</span>
                      <span className="opacity-70 text-[10px] uppercase">{a.tipo}</span>
                      <button onClick={() => removeAlvo.mutate(a.id)} className="hover:bg-black/20 rounded p-0.5">
                        <X className="w-3 h-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* === EXECUÇÕES === */}
        <TabsContent value="execucoes" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Última coleta</CardTitle>
              <CardDescription>Acompanhe quanto crédito Firecrawl foi consumido e o que foi capturado.</CardDescription>
            </CardHeader>
            <CardContent>
              {!ultimoLog ? (
                <p className="text-sm text-muted-foreground">Nenhuma coleta executada ainda. Clique em "Coletar agora" na aba Notícias.</p>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  <div><div className="text-muted-foreground text-xs">Iniciado</div><div className="font-medium">{fmtDateTime(ultimoLog.iniciado_em)}</div></div>
                  <div><div className="text-muted-foreground text-xs">Status</div><Badge variant={ultimoLog.status === "sucesso" ? "default" : ultimoLog.status === "falhou" ? "destructive" : "secondary"}>{ultimoLog.status}</Badge></div>
                  <div><div className="text-muted-foreground text-xs">Portais processados</div><div className="font-medium">{ultimoLog.portais_processados ?? 0}</div></div>
                  <div><div className="text-muted-foreground text-xs">Notícias novas</div><div className="font-medium">{ultimoLog.noticias_novas ?? 0}</div></div>
                  <div><div className="text-muted-foreground text-xs">Analisadas pela IA</div><div className="font-medium">{ultimoLog.noticias_analisadas ?? 0}</div></div>
                  <div><div className="text-muted-foreground text-xs">Créditos Firecrawl</div><div className="font-medium">{ultimoLog.creditos_firecrawl ?? 0}</div></div>
                  <div className="col-span-2 md:col-span-2"><div className="text-muted-foreground text-xs">Plano grátis (500/mês)</div><div className="font-medium">{500 - (ultimoLog.creditos_firecrawl ?? 0)} restantes nesta execução</div></div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}