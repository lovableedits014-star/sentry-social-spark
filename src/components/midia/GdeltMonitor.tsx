import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Newspaper, Globe2, TrendingUp, TrendingDown, Minus, ExternalLink, RefreshCw, Info, Search } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis, CartesianGrid, BarChart, Bar } from "recharts";

/**
 * GDELT Media Monitor — Onda 2.7
 * Painel visual de cobertura de mídia (volume + tom) sobre temas/figuras políticas.
 * Fonte: GDELT DOC 2.0 (API pública). Apenas para apoio visual; sem disparos automatizados.
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

function fmtDate(iso: string) {
  if (!iso) return "";
  // GDELT seendate: "20251020T123000Z"
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

interface Props {
  /** Query inicial pré-preenchida (ex.: nome de figura política ou tema). Opcional. */
  defaultQuery?: string;
  defaultCountry?: string;
  defaultTimespan?: string;
}

const GdeltMonitor = ({ defaultQuery = "", defaultCountry = "BR", defaultTimespan = "7d" }: Props) => {
  const [query, setQuery] = useState(defaultQuery);
  const [submittedQuery, setSubmittedQuery] = useState(defaultQuery);
  const [country, setCountry] = useState(defaultCountry);
  const [timespan, setTimespan] = useState(defaultTimespan);

  const { data, isLoading, isFetching, refetch, error } = useQuery<GdeltData | null>({
    queryKey: ["gdelt-media", submittedQuery, country, timespan],
    enabled: submittedQuery.trim().length >= 2,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const params = new URLSearchParams({
        query: submittedQuery,
        country,
        timespan,
        maxrecords: "50",
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

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    setSubmittedQuery(query.trim());
  };

  const chartData = useMemo(() => {
    if (!data?.timeline) return [];
    return data.timeline.map((p) => ({ date: p.date, volume: p.volume, tone: p.tone ?? 0 }));
  }, [data]);

  const sentimentBars = useMemo(() => {
    if (!data) return [];
    return [
      { label: "Positivo", value: data.tone_summary.positives, fill: "hsl(142 71% 45%)" },
      { label: "Neutro", value: data.tone_summary.neutrals, fill: "hsl(48 96% 53%)" },
      { label: "Negativo", value: data.tone_summary.negatives, fill: "hsl(346 77% 50%)" },
    ];
  }, [data]);

  return (
    <Card className="border-2">
      <CardHeader>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Newspaper className="w-5 h-5 text-primary" />
              Monitor de Mídia · GDELT
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    Cobertura mundial de notícias indexadas pelo GDELT Project. Volume = nº de matérias.
                    Tom = polarização média (-10 muito negativo, +10 muito positivo). Atualizado em tempo quase real.
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </CardTitle>
            <CardDescription>
              Acompanhe como temas e figuras políticas estão sendo cobertos pela imprensa nas últimas horas/dias.
            </CardDescription>
          </div>
          {data && (
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isFetching ? "animate-spin" : ""}`} />
              Atualizar
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={submit} className="grid grid-cols-1 md:grid-cols-[1fr_140px_140px_auto] gap-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder='Ex: "Lula" OR "PT", "reforma tributária", "Campo Grande prefeito"'
            aria-label="Tema ou figura política"
          />
          <Select value={timespan} onValueChange={setTimespan}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="24h">Últimas 24h</SelectItem>
              <SelectItem value="3d">Últimos 3 dias</SelectItem>
              <SelectItem value="7d">Últimos 7 dias</SelectItem>
              <SelectItem value="14d">Últimos 14 dias</SelectItem>
              <SelectItem value="30d">Últimos 30 dias</SelectItem>
            </SelectContent>
          </Select>
          <Select value={country} onValueChange={setCountry}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="BR">🇧🇷 Brasil</SelectItem>
              <SelectItem value="US">🇺🇸 EUA</SelectItem>
              <SelectItem value="PT">🇵🇹 Portugal</SelectItem>
              <SelectItem value="all">🌎 Mundo</SelectItem>
            </SelectContent>
          </Select>
          <Button type="submit" disabled={query.trim().length < 2}>
            <Search className="w-4 h-4 mr-1.5" /> Monitorar
          </Button>
        </form>

        {!submittedQuery && (
          <div className="text-center py-12 text-muted-foreground">
            <Globe2 className="w-12 h-12 mx-auto mb-3 opacity-40" />
            <p className="text-sm">Digite um tema ou nome para começar o monitoramento.</p>
            <p className="text-xs mt-1 opacity-70">Dica: use aspas para frase exata e <code className="px-1 bg-muted rounded">OR</code> para alternativas.</p>
          </div>
        )}

        {error && (
          <div className="text-sm text-destructive border border-destructive/30 bg-destructive/5 rounded-md p-3">
            {(error as Error).message}
          </div>
        )}

        {isLoading && (
          <div className="space-y-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        )}

        {data && !isLoading && (
          <div className="space-y-4">
            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="rounded-lg border bg-card p-3">
                <div className="text-xs text-muted-foreground flex items-center gap-1"><Newspaper className="w-3 h-3" /> Matérias</div>
                <div className="text-2xl font-bold">{data.total_articles.toLocaleString("pt-BR")}</div>
              </div>
              <div className="rounded-lg border bg-card p-3">
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  {data.tone_summary.avg != null && data.tone_summary.avg >= 1.5 ? <TrendingUp className="w-3 h-3 text-emerald-500" /> :
                    data.tone_summary.avg != null && data.tone_summary.avg <= -1.5 ? <TrendingDown className="w-3 h-3 text-rose-500" /> :
                    <Minus className="w-3 h-3" />}
                  Tom médio
                </div>
                <div className="text-2xl font-bold">
                  {data.tone_summary.avg != null ? data.tone_summary.avg.toFixed(2) : "—"}
                </div>
              </div>
              <div className="rounded-lg border bg-card p-3">
                <div className="text-xs text-muted-foreground">Negativas / Positivas</div>
                <div className="text-2xl font-bold">
                  <span className="text-rose-500">{data.tone_summary.negatives}</span>
                  <span className="text-muted-foreground mx-1">/</span>
                  <span className="text-emerald-500">{data.tone_summary.positives}</span>
                </div>
              </div>
              <div className="rounded-lg border bg-card p-3">
                <div className="text-xs text-muted-foreground">Fontes únicas</div>
                <div className="text-2xl font-bold">{data.top_sources.length}</div>
              </div>
            </div>

            {/* Timeline + Sentimento */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2 rounded-lg border bg-card p-3">
                <div className="text-sm font-medium mb-2">Volume de cobertura ao longo do tempo</div>
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="vol" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="date" fontSize={11} />
                    <YAxis fontSize={11} />
                    <RTooltip />
                    <Area type="monotone" dataKey="volume" stroke="hsl(var(--primary))" fill="url(#vol)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="rounded-lg border bg-card p-3">
                <div className="text-sm font-medium mb-2">Distribuição de tom</div>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={sentimentBars}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="label" fontSize={11} />
                    <YAxis fontSize={11} />
                    <RTooltip />
                    <Bar dataKey="value" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Top fontes */}
            {data.top_sources.length > 0 && (
              <div className="rounded-lg border bg-card p-3">
                <div className="text-sm font-medium mb-2 flex items-center gap-1.5">
                  <Globe2 className="w-3.5 h-3.5" /> Principais fontes
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {data.top_sources.map((s) => (
                    <Badge key={s.domain} variant="secondary" className="font-mono text-xs">
                      {s.domain} · {s.count}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Lista de matérias */}
            <div className="rounded-lg border bg-card">
              <div className="px-3 py-2 border-b text-sm font-medium">
                Matérias recentes ({data.articles.length})
              </div>
              <div className="max-h-[420px] overflow-y-auto divide-y">
                {data.articles.length === 0 && (
                  <div className="p-4 text-sm text-muted-foreground text-center">Nenhum artigo encontrado.</div>
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
            </div>

            <p className="text-[11px] text-muted-foreground italic">
              Fonte: GDELT Project · Atualizado {new Date(data.generated_at).toLocaleString("pt-BR")} ·
              Dados meramente informativos. Não use como base para disparos automatizados.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default GdeltMonitor;