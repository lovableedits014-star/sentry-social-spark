import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Newspaper, Globe2, TrendingUp, TrendingDown, Minus, ExternalLink, RefreshCw, Info, Search, Sparkles, X, Bell } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis, CartesianGrid, BarChart, Bar, Line, LineChart, Legend } from "recharts";
import MediaAlertsManager from "@/components/midia/MediaAlertsManager";

/**
 * Página dedicada de Mídia (GDELT) — cobertura noticiosa em tempo quase real.
 * Filtros: UF, município, palavras-chave (livres + presets), janela temporal, país.
 */

type GdeltArticle = {
  title: string;
  url: string;
  domain: string;
  seendate: string;
  language: string;
  sourcecountry: string;
  tone: number | null;
};

type GdeltData = {
  query: string;
  timespan: string;
  country: string;
  total_articles: number;
  tone_summary: { avg: number | null; positives: number; neutrals: number; negatives: number; total: number };
  top_sources: { domain: string; count: number }[];
  timeline: { date: string; volume: number; tone: number | null }[];
  articles: GdeltArticle[];
  generated_at: string;
};

const UFS = [
  "AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT","PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO",
];

const PRESETS = [
  { label: "Eleições 2026", terms: ["eleições 2026", "candidato"] },
  { label: "Reforma Tributária", terms: ["reforma tributária"] },
  { label: "Segurança Pública", terms: ["segurança pública", "violência"] },
  { label: "Saúde", terms: ["saúde", "SUS"] },
  { label: "Educação", terms: ["educação", "escola"] },
  { label: "Economia", terms: ["economia", "inflação", "juros"] },
  { label: "Lula", terms: ["Lula"] },
  { label: "Bolsonaro", terms: ["Bolsonaro"] },
  { label: "Congresso", terms: ["congresso", "câmara", "senado"] },
  { label: "STF", terms: ["STF", "supremo"] },
];

function fmtDate(iso: string) {
  if (!iso) return "";
  if (/^\d{8}T/.test(iso)) {
    const y = iso.slice(0, 4), m = iso.slice(4, 6), d = iso.slice(6, 8);
    return `${d}/${m}/${y}`;
  }
  const dt = new Date(iso);
  return Number.isNaN(dt.getTime()) ? iso : dt.toLocaleDateString("pt-BR");
}

function toneColor(tone: number | null) {
  if (tone == null) return "bg-muted text-muted-foreground";
  if (tone >= 1.5) return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30";
  if (tone <= -1.5) return "bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30";
  return "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30";
}

function toneLabel(tone: number | null) {
  if (tone == null) return "—";
  if (tone >= 1.5) return "Positivo";
  if (tone <= -1.5) return "Negativo";
  return "Neutro";
}

/** Monta query string GDELT a partir de termos + município + UF */
function buildQuery(terms: string[], municipio: string, uf: string): string {
  const parts: string[] = [];
  const cleanTerms = terms.map((t) => t.trim()).filter(Boolean);
  if (cleanTerms.length > 0) {
    // Termos com espaço viram "frase exata"
    const wrapped = cleanTerms.map((t) => (t.includes(" ") && !t.startsWith('"') ? `"${t}"` : t));
    parts.push(wrapped.length > 1 ? `(${wrapped.join(" OR ")})` : wrapped[0]);
  }
  if (municipio) parts.push(`"${municipio}"`);
  if (uf) parts.push(uf);
  return parts.join(" ");
}

const MidiaPage = () => {
  const [terms, setTerms] = useState<string[]>([]);
  const [termInput, setTermInput] = useState("");
  const [uf, setUf] = useState<string>("");
  const [municipio, setMunicipio] = useState<string>("");
  const [country, setCountry] = useState<string>("BR");
  const [timespan, setTimespan] = useState<string>("7d");
  const [submitted, setSubmitted] = useState<{ q: string; ts: string; c: string } | null>(null);
  const [clientId, setClientId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: clients } = await supabase.from("clients").select("id").eq("user_id", user.id).limit(1);
      if (clients && clients.length > 0) setClientId(clients[0].id);
    })();
  }, []);

  // Contador de alertas não lidos para o badge da aba
  const { data: unreadAlerts = 0 } = useQuery<number>({
    queryKey: ["media-alert-unread", clientId],
    enabled: !!clientId,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { count } = await supabase
        .from("media_alert_events")
        .select("id", { count: "exact", head: true })
        .eq("client_id", clientId!)
        .eq("is_read", false);
      return count || 0;
    },
  });

  const addTerm = (t: string) => {
    const v = t.trim();
    if (!v) return;
    if (!terms.includes(v)) setTerms((prev) => [...prev, v]);
  };
  const removeTerm = (t: string) => setTerms((prev) => prev.filter((x) => x !== t));

  const handleAddInput = () => {
    if (termInput.trim()) {
      addTerm(termInput);
      setTermInput("");
    }
  };

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const q = buildQuery(terms, municipio.trim(), uf.trim());
    if (q.length < 2) return;
    setSubmitted({ q, ts: timespan, c: country });
  };

  const { data, isLoading, isFetching, refetch, error } = useQuery<GdeltData | null>({
    queryKey: ["midia-gdelt", submitted?.q, submitted?.ts, submitted?.c],
    enabled: !!submitted && (submitted.q?.length ?? 0) >= 2,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      if (!submitted) return null;
      const params = new URLSearchParams({
        query: submitted.q,
        country: submitted.c,
        timespan: submitted.ts,
        maxrecords: "75",
      });
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/gdelt-media-fetch?${params.toString()}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Falha ao consultar GDELT");
      return json.data as GdeltData;
    },
  });

  const chartData = useMemo(() => {
    if (!data?.timeline) return [];
    return data.timeline.map((p) => ({ date: p.date, volume: p.volume, tone: p.tone ?? 0 }));
  }, [data]);

  const sentimentBars = useMemo(() => {
    if (!data) return [];
    return [
      { label: "Positivo", value: data.tone_summary.positives },
      { label: "Neutro", value: data.tone_summary.neutrals },
      { label: "Negativo", value: data.tone_summary.negatives },
    ];
  }, [data]);

  return (
    <div className="container mx-auto p-4 md:p-6 max-w-7xl space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Newspaper className="w-8 h-8 text-primary" />
            Mídia & Cobertura Noticiosa
          </h1>
          <p className="text-muted-foreground mt-1 max-w-2xl">
            Monitore como temas, figuras políticas e municípios estão sendo cobertos pela imprensa.
            Combine palavras-chave, território (UF/município) e janela temporal. Dados via{" "}
            <a href="https://www.gdeltproject.org/" target="_blank" rel="noopener noreferrer" className="text-primary underline">GDELT Project</a>.
          </p>
        </div>
        {data && (
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isFetching ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        )}
      </div>

      <Tabs defaultValue="monitor" className="space-y-4">
        <TabsList>
          <TabsTrigger value="monitor" className="gap-1.5">
            <Search className="w-3.5 h-3.5" /> Monitoramento
          </TabsTrigger>
          <TabsTrigger value="alerts" className="gap-1.5">
            <Bell className="w-3.5 h-3.5" /> Alertas
            {unreadAlerts > 0 && (
              <Badge variant="destructive" className="ml-1 h-5 px-1.5 text-[10px]">{unreadAlerts}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="monitor" className="space-y-6 mt-0">
      {/* Filtros */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Search className="w-4 h-4" /> Filtros de busca
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  Adicione múltiplas palavras-chave (combinadas com OR). UF e município restringem
                  geograficamente. Use os presets para temas comuns.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </CardTitle>
          <CardDescription>Combine palavras-chave + território + janela temporal</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Palavras-chave */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                Palavras-chave (Enter para adicionar)
              </label>
              <div className="flex gap-2">
                <Input
                  value={termInput}
                  onChange={(e) => setTermInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddInput();
                    }
                  }}
                  placeholder='Ex.: "reforma tributária", Lula, "Campo Grande"'
                />
                <Button type="button" variant="outline" onClick={handleAddInput} disabled={!termInput.trim()}>
                  Adicionar
                </Button>
              </div>
              {terms.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {terms.map((t) => (
                    <Badge key={t} variant="secondary" className="gap-1">
                      {t}
                      <button type="button" onClick={() => removeTerm(t)} className="hover:text-destructive">
                        <X className="w-3 h-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {/* Presets */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block flex items-center gap-1">
                <Sparkles className="w-3 h-3" /> Presets
              </label>
              <div className="flex flex-wrap gap-1.5">
                {PRESETS.map((p) => (
                  <Button
                    key={p.label}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => p.terms.forEach(addTerm)}
                  >
                    + {p.label}
                  </Button>
                ))}
                {terms.length > 0 && (
                  <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setTerms([])}>
                    Limpar tudo
                  </Button>
                )}
              </div>
            </div>

            {/* UF + Município + Janela + País */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">UF</label>
                <Select value={uf || "__none__"} onValueChange={(v) => setUf(v === "__none__" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    <SelectItem value="__none__">Todas as UFs</SelectItem>
                    {UFS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Município</label>
                <Input
                  value={municipio}
                  onChange={(e) => setMunicipio(e.target.value)}
                  placeholder="Ex.: Campo Grande"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Janela</label>
                <Select value={timespan} onValueChange={setTimespan}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="24h">Últimas 24h</SelectItem>
                    <SelectItem value="3d">3 dias</SelectItem>
                    <SelectItem value="7d">7 dias</SelectItem>
                    <SelectItem value="14d">14 dias</SelectItem>
                    <SelectItem value="30d">30 dias</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">País fonte</label>
                <Select value={country} onValueChange={setCountry}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BR">🇧🇷 Brasil</SelectItem>
                    <SelectItem value="US">🇺🇸 EUA</SelectItem>
                    <SelectItem value="PT">🇵🇹 Portugal</SelectItem>
                    <SelectItem value="all">🌎 Mundo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 flex-wrap">
              <p className="text-xs text-muted-foreground">
                {terms.length === 0 && !municipio && !uf
                  ? "Adicione pelo menos uma palavra-chave ou município."
                  : <>Consulta gerada: <code className="bg-muted px-1.5 py-0.5 rounded text-[11px]">{buildQuery(terms, municipio.trim(), uf.trim()) || "(vazia)"}</code></>}
              </p>
              <Button type="submit" disabled={terms.length === 0 && !municipio.trim() && !uf.trim()}>
                <Search className="w-4 h-4 mr-1.5" /> Buscar mídia
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Estados */}
      {!submitted && !isLoading && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Globe2 className="w-12 h-12 mx-auto mb-3 opacity-40" />
            <p className="text-sm">Configure os filtros acima e clique em <strong>Buscar mídia</strong> para começar.</p>
          </CardContent>
        </Card>
      )}

      {error && (
        <Card className="border-destructive/40">
          <CardContent className="py-4 text-sm text-destructive">{(error as Error).message}</CardContent>
        </Card>
      )}

      {isLoading && (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      )}

      {data && !isLoading && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-1.5"><Newspaper className="w-3.5 h-3.5" /> Matérias encontradas</CardDescription>
                <CardTitle className="text-3xl">{data.total_articles.toLocaleString("pt-BR")}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-1.5">
                  {data.tone_summary.avg != null && data.tone_summary.avg >= 1.5 ? <TrendingUp className="w-3.5 h-3.5 text-emerald-500" /> :
                    data.tone_summary.avg != null && data.tone_summary.avg <= -1.5 ? <TrendingDown className="w-3.5 h-3.5 text-rose-500" /> :
                    <Minus className="w-3.5 h-3.5" />}
                  Tom médio
                </CardDescription>
                <CardTitle className="text-3xl">{data.tone_summary.avg != null ? data.tone_summary.avg.toFixed(2) : "—"}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Negativas / Positivas</CardDescription>
                <CardTitle className="text-3xl">
                  <span className="text-rose-500">{data.tone_summary.negatives}</span>
                  <span className="text-muted-foreground mx-1.5 text-xl">/</span>
                  <span className="text-emerald-500">{data.tone_summary.positives}</span>
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Fontes únicas</CardDescription>
                <CardTitle className="text-3xl">{data.top_sources.length}</CardTitle>
              </CardHeader>
            </Card>
          </div>

          {/* Gráficos */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Tendência de cobertura</CardTitle>
                <CardDescription>Volume de matérias ao longo do tempo</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={260}>
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="vol2" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.5} />
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="date" fontSize={11} />
                    <YAxis fontSize={11} />
                    <RTooltip />
                    <Area type="monotone" dataKey="volume" stroke="hsl(var(--primary))" fill="url(#vol2)" name="Volume" />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Distribuição de tom</CardTitle>
                <CardDescription>Polarização das matérias</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={sentimentBars}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="label" fontSize={11} />
                    <YAxis fontSize={11} />
                    <RTooltip />
                    <Bar dataKey="value" fill="hsl(var(--primary))" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Tom ao longo do tempo, se disponível */}
          {chartData.some((p) => p.tone !== 0) && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Evolução do tom médio</CardTitle>
                <CardDescription>Polarização da cobertura ao longo do tempo (-10 muito negativo, +10 muito positivo)</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="date" fontSize={11} />
                    <YAxis fontSize={11} domain={[-10, 10]} />
                    <RTooltip />
                    <Legend />
                    <Line type="monotone" dataKey="tone" stroke="hsl(346 77% 50%)" name="Tom médio" dot={false} strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Top fontes */}
          {data.top_sources.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-1.5"><Globe2 className="w-4 h-4" /> Principais fontes</CardTitle>
                <CardDescription>Veículos com mais matérias no período</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-1.5">
                  {data.top_sources.map((s) => (
                    <Badge key={s.domain} variant="secondary" className="font-mono text-xs">
                      {s.domain} · {s.count}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Lista de notícias */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Notícias ({data.articles.length})</CardTitle>
              <CardDescription>Ordenadas pelas mais recentes. Clique para abrir a fonte original.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-[600px] overflow-y-auto divide-y">
                {data.articles.length === 0 && (
                  <div className="p-8 text-sm text-muted-foreground text-center">Nenhum artigo encontrado para esta combinação de filtros.</div>
                )}
                {data.articles.map((a, i) => (
                  <a
                    key={`${a.url}-${i}`}
                    href={a.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-start gap-3 p-3 hover:bg-muted/50 transition-colors group"
                  >
                    <Badge variant="outline" className={`shrink-0 text-[10px] ${toneColor(a.tone)}`}>
                      {toneLabel(a.tone)}
                      {a.tone != null && <span className="ml-1 opacity-70">{a.tone.toFixed(1)}</span>}
                    </Badge>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium leading-snug group-hover:text-primary line-clamp-2">
                        {a.title || "(sem título)"}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
                        <span className="font-mono">{a.domain}</span>
                        <span>·</span>
                        <span>{fmtDate(a.seendate)}</span>
                        {a.sourcecountry && <><span>·</span><span>{a.sourcecountry}</span></>}
                        {a.language && <><span>·</span><span className="uppercase">{a.language}</span></>}
                      </div>
                    </div>
                    <ExternalLink className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-1 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </a>
                ))}
              </div>
            </CardContent>
          </Card>

          <p className="text-[11px] text-muted-foreground italic text-center">
            Fonte: GDELT Project · Atualizado {new Date(data.generated_at).toLocaleString("pt-BR")} ·
            Dados meramente informativos. Não use como base para disparos automatizados.
          </p>
        </>
      )}
    </div>
  );
};

export default MidiaPage;