import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Cell, Tooltip } from "recharts";
import { MapPin, Users, TrendingUp, TrendingDown, AlertTriangle, Search, UserPlus, CalendarDays, BarChart3, Clock, Loader2 } from "lucide-react";
import { useState, useMemo } from "react";
import { format, subDays, startOfDay, isAfter, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

interface LocationGroup {
  key: string;
  city: string;
  neighborhood: string | null;
  state: string | null;
  count: number;
}

interface PessoaRow {
  id: string;
  nome: string;
  cidade: string | null;
  bairro: string | null;
  telefone: string | null;
  tipo_pessoa: string;
  origem_contato: string;
  created_at: string;
}

function MetricCard({ icon: Icon, label, value, accent, description }: { icon: any; label: string; value: number; accent?: boolean; description?: string }) {
  return (
    <Card className={accent ? "border-primary/30 bg-primary/5" : ""}>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-1">
          <Icon className={`w-4 h-4 ${accent ? "text-primary" : "text-muted-foreground"}`} />
          <span className="text-xs text-muted-foreground">{label}</span>
        </div>
        <p className={`text-2xl font-bold ${accent ? "text-primary" : ""}`}>{value.toLocaleString("pt-BR")}</p>
        {description && <p className="text-[10px] text-muted-foreground mt-0.5">{description}</p>}
      </CardContent>
    </Card>
  );
}

function DistributionRow({ label, count, total, color = "bg-primary" }: { label: string; count: number; total: number; color?: string }) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="truncate font-medium">{label}</span>
        <span className="text-muted-foreground shrink-0 ml-2">{count} ({pct.toFixed(0)}%)</span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.max(pct, 1)}%` }} />
      </div>
    </div>
  );
}

export default function Territorial() {
  const [search, setSearch] = useState("");

  const { data: client } = useQuery({
    queryKey: ["client"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");
      const { data } = await supabase.from("clients").select("id").eq("user_id", user.id).maybeSingle();
      return data;
    },
  });

  // ── Supporter accounts (territorial) ──
  const { data: supporters } = useQuery({
    queryKey: ["territorial-supporters", client?.id],
    queryFn: async () => {
      if (!client?.id) return [];
      const { data } = await supabase.from("supporter_accounts").select("id, name, city, neighborhood, state, created_at").eq("client_id", client.id);
      return (data || []) as Array<{ id: string; name: string; city: string | null; neighborhood: string | null; state: string | null; created_at: string }>;
    },
    enabled: !!client?.id,
  });

  const { data: confirmedIndicados } = useQuery({
    queryKey: ["territorial-indicados", client?.id],
    queryFn: async () => {
      if (!client?.id) return [];
      const { data } = await supabase.from("contratado_indicados").select("id, nome, cidade, bairro, created_at").eq("client_id", client.id).eq("status", "confirmado");
      return (data || []) as Array<{ id: string; nome: string; cidade: string | null; bairro: string | null; created_at: string }>;
    },
    enabled: !!client?.id,
  });

  // ── All pessoas (recruitment) ──
  const { data: allPessoas, isLoading: pessoasLoading } = useQuery({
    queryKey: ["recruitment-pessoas", client?.id],
    queryFn: async () => {
      if (!client?.id) return [];
      const PAGE = 1000;
      const result: PessoaRow[] = [];
      let from = 0;
      while (true) {
        const { data } = await supabase.from("pessoas").select("id, nome, cidade, bairro, telefone, tipo_pessoa, origem_contato, created_at").eq("client_id", client.id).order("created_at", { ascending: false }).range(from, from + PAGE - 1);
        if (!data || data.length === 0) break;
        result.push(...data);
        if (data.length < PAGE) break;
        from += PAGE;
      }
      return result;
    },
    enabled: !!client?.id,
  });

  const { data: contratadoRows } = useQuery({
    queryKey: ["recruitment-contratados", client?.id],
    queryFn: async () => {
      if (!client?.id) return [];
      const PAGE = 1000;
      const result: PessoaRow[] = [];
      let from = 0;
      while (true) {
        const { data } = await supabase.from("contratados").select("id, nome, cidade, bairro, telefone, is_lider, created_at").eq("client_id", client.id).order("created_at", { ascending: false }).range(from, from + PAGE - 1);
        if (!data || data.length === 0) break;
        for (const c of data) {
          result.push({ id: c.id, nome: c.nome, cidade: c.cidade, bairro: c.bairro, telefone: c.telefone, tipo_pessoa: c.is_lider ? "lider" : "contratado", origem_contato: "formulario", created_at: c.created_at });
        }
        if (data.length < PAGE) break;
        from += PAGE;
      }
      return result;
    },
    enabled: !!client?.id,
  });

  const { data: indicadoRows } = useQuery({
    queryKey: ["recruitment-indicados", client?.id],
    queryFn: async () => {
      if (!client?.id) return [];
      const PAGE = 1000;
      const result: PessoaRow[] = [];
      let from = 0;
      while (true) {
        const { data } = await supabase.from("contratado_indicados").select("id, nome, cidade, bairro, telefone, created_at").eq("client_id", client.id).order("created_at", { ascending: false }).range(from, from + PAGE - 1);
        if (!data || data.length === 0) break;
        for (const ind of data) {
          result.push({ id: ind.id, nome: ind.nome, cidade: ind.cidade, bairro: ind.bairro, telefone: ind.telefone, tipo_pessoa: "indicado", origem_contato: "formulario", created_at: ind.created_at });
        }
        if (data.length < PAGE) break;
        from += PAGE;
      }
      return result;
    },
    enabled: !!client?.id,
  });

  // ═══════════════════════════════════════
  // TERRITORIAL computed
  // ═══════════════════════════════════════
  const { groups, totalWithLocation, totalWithout } = useMemo(() => {
    if (!supporters) return { groups: [], totalWithLocation: 0, totalWithout: 0 };
    const allEntries = [
      ...supporters.map(s => ({ city: s.city, neighborhood: s.neighborhood, state: s.state, created_at: s.created_at })),
      ...(confirmedIndicados || []).map(i => ({ city: i.cidade, neighborhood: i.bairro, state: null, created_at: i.created_at })),
    ];
    const withLoc = allEntries.filter(s => s.city || s.neighborhood);
    const withoutLoc = allEntries.filter(s => !s.city && !s.neighborhood);
    const map: Record<string, LocationGroup> = {};
    for (const s of withLoc) {
      const city = s.city?.trim() || "Sem cidade";
      const neighborhood = s.neighborhood?.trim() || null;
      const state = s.state?.trim() || null;
      const key = `${city}||${neighborhood || ""}`;
      if (!map[key]) map[key] = { key, city, neighborhood, state, count: 0 };
      map[key].count++;
    }
    return { groups: Object.values(map).sort((a, b) => b.count - a.count), totalWithLocation: withLoc.length, totalWithout: withoutLoc.length };
  }, [supporters, confirmedIndicados]);

  const growthStats = useMemo(() => {
    if (!supporters) return null;
    const now = Date.now();
    const d30 = 30 * 24 * 60 * 60 * 1000;
    const allEntries = [
      ...supporters.map(s => ({ city: s.city, neighborhood: s.neighborhood, created_at: s.created_at })),
      ...(confirmedIndicados || []).map(i => ({ city: i.cidade, neighborhood: i.bairro, created_at: i.created_at })),
    ];
    const withLoc = allEntries.filter(s => s.city || s.neighborhood);
    const last30 = withLoc.filter(s => now - new Date(s.created_at).getTime() < d30).length;
    const prev30 = withLoc.filter(s => { const diff = now - new Date(s.created_at).getTime(); return diff >= d30 && diff < d30 * 2; }).length;
    const change = prev30 > 0 ? Math.round(((last30 - prev30) / prev30) * 100) : last30 > 0 ? 100 : 0;
    return { last30, prev30, change };
  }, [supporters, confirmedIndicados]);

  const maxCount = groups.length > 0 ? groups[0].count : 1;

  const geoChartData = useMemo(() => {
    return groups.slice(0, 15).map(g => ({
      name: g.neighborhood ? `${g.neighborhood}` : g.city,
      fullName: g.neighborhood ? `${g.neighborhood}, ${g.city}` : g.city,
      count: g.count,
      ratio: g.count / maxCount,
    }));
  }, [groups, maxCount]);

  const filtered = search
    ? groups.filter(g => g.city.toLowerCase().includes(search.toLowerCase()) || (g.neighborhood?.toLowerCase().includes(search.toLowerCase())))
    : groups;

  const getHeatColor = (count: number) => { const r = count / maxCount; return r >= 0.7 ? "bg-primary" : r >= 0.4 ? "bg-accent-foreground/50" : "bg-destructive"; };
  const getHeatLabel = (count: number) => { const r = count / maxCount; return r >= 0.7 ? "Zona Quente" : r >= 0.4 ? "Zona Morna" : "Zona Fria"; };
  const getHeatBadge = (count: number): "default" | "secondary" | "destructive" => { const r = count / maxCount; return r >= 0.7 ? "default" : r >= 0.4 ? "secondary" : "destructive"; };

  // ═══════════════════════════════════════
  // RECRUITMENT computed
  // ═══════════════════════════════════════
  const mergedPessoas = useMemo(() => {
    const seenNames = new Set<string>();
    const dedup = (list: PessoaRow[]): PessoaRow[] => {
      const result: PessoaRow[] = [];
      for (const p of list) {
        const key = p.nome.trim().toLowerCase();
        if (!seenNames.has(key)) { seenNames.add(key); result.push(p); }
      }
      return result;
    };
    const merged = [...dedup(allPessoas || []), ...dedup(contratadoRows || []), ...dedup(indicadoRows || [])];
    merged.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return merged;
  }, [allPessoas, contratadoRows, indicadoRows]);

  const now = useMemo(() => new Date(), []);
  const todayStart = useMemo(() => startOfDay(now), [now]);
  const weekAgo = useMemo(() => subDays(todayStart, 7), [todayStart]);
  const monthAgo = useMemo(() => subDays(todayStart, 30), [todayStart]);

  const recruitMetrics = useMemo(() => {
    const total = mergedPessoas.length;
    const today = mergedPessoas.filter(p => isAfter(parseISO(p.created_at), todayStart)).length;
    const week = mergedPessoas.filter(p => isAfter(parseISO(p.created_at), weekAgo)).length;
    const month = mergedPessoas.filter(p => isAfter(parseISO(p.created_at), monthAgo)).length;
    return { total, today, week, month };
  }, [mergedPessoas, todayStart, weekAgo, monthAgo]);

  const dailyChartData = useMemo(() => {
    const days: { date: string; label: string; count: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = subDays(todayStart, i);
      days.push({ date: format(d, "yyyy-MM-dd"), label: format(d, "dd/MM"), count: 0 });
    }
    mergedPessoas.forEach(p => {
      const key = format(parseISO(p.created_at), "yyyy-MM-dd");
      const day = days.find(d => d.date === key);
      if (day) day.count++;
    });
    return days;
  }, [mergedPessoas, todayStart]);

  const origemData = useMemo(() => {
    const map: Record<string, number> = {};
    mergedPessoas.forEach(p => { map[p.origem_contato] = (map[p.origem_contato] || 0) + 1; });
    const labels: Record<string, string> = { formulario: "Formulário Público", manual: "Cadastro Manual", rede_social: "Rede Social", evento: "Evento", importacao: "Importação" };
    return Object.entries(map).map(([key, count]) => ({ name: labels[key] || key, count })).sort((a, b) => b.count - a.count);
  }, [mergedPessoas]);

  const recentPessoas = useMemo(() => mergedPessoas.slice(0, 20), [mergedPessoas]);
  const maxDailyChart = Math.max(...dailyChartData.map(d => d.count), 1);

  const tipoLabels: Record<string, string> = {
    eleitor: "Eleitor", apoiador: "Apoiador", lideranca: "Liderança", voluntario: "Voluntário",
    cidadao: "Cidadão", jornalista: "Jornalista", influenciador: "Influenciador", adversario: "Adversário",
    lider: "Líder", contratado: "Contratado", indicado: "Indicado", liderado: "Liderado",
  };

  const coldZones = groups.filter(g => g.count / maxCount < 0.4).length;

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
          <MapPin className="w-7 h-7 text-primary" />
          Base & Território
        </h1>
        <p className="text-sm text-muted-foreground max-w-2xl mt-1">
          Visão unificada de <strong>quantas pessoas você tem</strong> (crescimento) e <strong>onde elas estão</strong> (geografia). 
          Consolida dados de Pessoas, Contratados, Líderes, Indicados e Apoiadores do Portal.
        </p>
      </div>

      {/* ═══════════════════════════════════════ */}
      {/* CRESCIMENTO DA BASE                    */}
      {/* ═══════════════════════════════════════ */}
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-primary" />
            Crescimento da Base
          </h2>
          <p className="text-xs text-muted-foreground">
            Quantos cadastros novos você está recebendo? Acompanhe a evolução diária e identifique quais canais estão trazendo mais pessoas.
          </p>
        </div>

        {pessoasLoading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <MetricCard icon={Users} label="Total de cadastros" value={recruitMetrics.total} description="Todas as pessoas no sistema" />
              <MetricCard icon={UserPlus} label="Hoje" value={recruitMetrics.today} accent description="Cadastros feitos hoje" />
              <MetricCard icon={CalendarDays} label="Últimos 7 dias" value={recruitMetrics.week} description="Novos na última semana" />
              <MetricCard icon={TrendingUp} label="Últimos 30 dias" value={recruitMetrics.month} description="Novos no último mês" />
            </div>

            {/* Daily chart */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2"><BarChart3 className="w-5 h-5 text-primary" />Cadastros por Dia</CardTitle>
                <CardDescription className="text-xs">Últimos 30 dias — cada barra mostra quantas pessoas foram cadastradas naquele dia, de qualquer origem.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-64 md:h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dailyChartData} margin={{ top: 5, right: 5, bottom: 20, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={typeof window !== "undefined" && window.innerWidth < 768 ? 3 : 1} angle={-45} textAnchor="end" height={50} className="fill-muted-foreground" />
                      <YAxis tick={{ fontSize: 11 }} allowDecimals={false} className="fill-muted-foreground" />
                      <Tooltip contentStyle={{ borderRadius: 8, fontSize: 13, border: "1px solid hsl(var(--border))", background: "hsl(var(--popover))", color: "hsl(var(--popover-foreground))" }} labelFormatter={(l) => `Dia ${l}`} formatter={(v: number) => [`${v} cadastros`, "Cadastros"]} />
                      <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={28}>
                        {dailyChartData.map((entry, i) => (
                          <Cell key={i} fill={entry.count === 0 ? "hsl(var(--muted))" : entry.count >= maxDailyChart * 0.7 ? "hsl(var(--primary))" : "hsl(var(--primary) / 0.6)"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Origem */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2"><BarChart3 className="w-4 h-4 text-primary" />De onde vêm os cadastros?</CardTitle>
                <CardDescription className="text-xs">Distribuição por canal de origem — mostra se as pessoas estão chegando por formulário público, cadastro manual, redes sociais, etc.</CardDescription>
              </CardHeader>
              <CardContent>
                {origemData.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Nenhum dado</p>
                ) : (
                  <div className="space-y-2">
                    {origemData.map((o) => <DistributionRow key={o.name} label={o.name} count={o.count} total={recruitMetrics.total} />)}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Divider */}
      <div className="border-t" />

      {/* ═══════════════════════════════════════ */}
      {/* MAPA TERRITORIAL                       */}
      {/* ═══════════════════════════════════════ */}
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <MapPin className="w-5 h-5 text-primary" />
            Mapa de Influência
          </h2>
          <p className="text-xs text-muted-foreground">
            Onde seus apoiadores estão? Este mapa mostra a concentração geográfica com zonas de calor: 
            <strong className="text-primary"> verde</strong> = alta densidade, 
            <strong className="text-accent-foreground"> amarelo</strong> = média, 
            <strong className="text-destructive"> vermelho</strong> = poucos apoiadores (oportunidade de crescer).
          </p>
        </div>

        {/* Territorial stats */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <Card><CardContent className="pt-4 pb-3 px-4"><p className="text-xs text-muted-foreground">Apoiadores</p><p className="text-2xl font-bold">{supporters?.length || 0}</p><p className="text-[10px] text-muted-foreground">Total do portal</p></CardContent></Card>
          <Card><CardContent className="pt-4 pb-3 px-4"><p className="text-xs text-muted-foreground">Com localização</p><p className="text-2xl font-bold text-primary">{totalWithLocation}</p><p className="text-[10px] text-muted-foreground">Informaram cidade/bairro</p></CardContent></Card>
          <Card><CardContent className="pt-4 pb-3 px-4"><p className="text-xs text-muted-foreground">Sem localização</p><p className="text-2xl font-bold text-muted-foreground">{totalWithout}</p><p className="text-[10px] text-muted-foreground">Não preencheram</p></CardContent></Card>
          <Card><CardContent className="pt-4 pb-3 px-4"><p className="text-xs text-muted-foreground">Regiões</p><p className="text-2xl font-bold">{groups.length}</p><p className="text-[10px] text-muted-foreground">Cidades/bairros distintos</p></CardContent></Card>
          <Card className="col-span-2 sm:col-span-1">
            <CardContent className="pt-4 pb-3 px-4">
              <p className="text-xs text-muted-foreground">Crescimento 30d</p>
              <div className="flex items-center gap-1">
                <p className="text-2xl font-bold">{growthStats?.last30 || 0}</p>
                {growthStats && growthStats.change !== 0 && (
                  <Badge variant={growthStats.change > 0 ? "default" : "destructive"} className="text-[10px] px-1.5 h-5">
                    {growthStats.change > 0 ? <TrendingUp className="w-3 h-3 mr-0.5" /> : <TrendingDown className="w-3 h-3 mr-0.5" />}
                    {growthStats.change > 0 ? "+" : ""}{growthStats.change}%
                  </Badge>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground">vs {growthStats?.prev30 || 0} mês anterior</p>
            </CardContent>
          </Card>
        </div>

        {/* Geo chart */}
        {geoChartData.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2"><MapPin className="w-4 h-4 text-primary" />Top Regiões</CardTitle>
              <CardDescription className="text-xs">As {geoChartData.length} regiões com mais apoiadores. A cor indica a intensidade relativa à região mais forte.</CardDescription>
            </CardHeader>
            <CardContent>
              <ChartContainer config={{ count: { label: "Apoiadores", color: "hsl(var(--primary))" } }} className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={geoChartData} layout="vertical" margin={{ left: 0, right: 16, top: 8, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                    <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                    <YAxis type="category" dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={11} width={120} tick={{ fill: "hsl(var(--foreground))" }} />
                    <ChartTooltip content={<ChartTooltipContent />} formatter={(value: number, _name: string, props: any) => [`${value} apoiadores`, props.payload.fullName]} />
                    <Bar dataKey="count" name="Apoiadores" radius={[0, 4, 4, 0]}>
                      {geoChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.ratio >= 0.7 ? "hsl(var(--primary))" : entry.ratio >= 0.4 ? "hsl(38, 92%, 50%)" : "hsl(var(--destructive))"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartContainer>
            </CardContent>
          </Card>
        )}

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar por cidade ou bairro..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
        </div>

        {/* Cold zones alert */}
        {coldZones > 0 && (
          <Card className="border-destructive/30 bg-destructive/5">
            <CardContent className="pt-4 pb-3 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-sm">Zonas frias identificadas</p>
                <p className="text-xs text-muted-foreground">{coldZones} regiões com poucos apoiadores — são oportunidades de expansão para ações de campo</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Territory cards */}
        {filtered.length === 0 ? (
          <Card><CardContent className="py-12 text-center text-muted-foreground"><MapPin className="w-10 h-10 mx-auto mb-3 opacity-30" /><p className="font-medium">Nenhum dado territorial disponível</p><p className="text-xs mt-1">Os apoiadores precisam informar cidade/bairro no cadastro do portal</p></CardContent></Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((g) => (
              <Card key={g.key} className="overflow-hidden">
                <CardContent className="pt-4 pb-3 px-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold text-sm">{g.neighborhood || g.city}</p>
                      {g.neighborhood && <p className="text-xs text-muted-foreground">{g.city}{g.state ? ` - ${g.state}` : ""}</p>}
                      {!g.neighborhood && g.state && <p className="text-xs text-muted-foreground">{g.state}</p>}
                    </div>
                    <Badge variant={getHeatBadge(g.count)} className="text-xs shrink-0">{getHeatLabel(g.count)}</Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <Users className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-sm font-bold">{g.count}</span>
                    <span className="text-xs text-muted-foreground">apoiadores</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div className={`h-full rounded-full transition-all duration-500 ${getHeatColor(g.count)}`} style={{ width: `${(g.count / maxCount) * 100}%` }} />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Divider */}
      <div className="border-t" />

      {/* ═══════════════════════════════════════ */}
      {/* ÚLTIMOS CADASTROS                      */}
      {/* ═══════════════════════════════════════ */}
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Clock className="w-5 h-5 text-primary" />
            Últimos Cadastros
          </h2>
          <p className="text-xs text-muted-foreground">
            As 20 pessoas mais recentes registradas no sistema, independente da origem (formulário, manual, contratado, indicado).
          </p>
        </div>

        <Card>
          <CardContent className="pt-4">
            {recentPessoas.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Nenhum cadastro encontrado.</p>
            ) : (
              <div className="overflow-x-auto -mx-6">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="pb-2 pl-6 font-medium text-muted-foreground">Nome</th>
                      <th className="pb-2 font-medium text-muted-foreground hidden sm:table-cell">Cidade</th>
                      <th className="pb-2 font-medium text-muted-foreground hidden md:table-cell">Telefone</th>
                      <th className="pb-2 font-medium text-muted-foreground hidden md:table-cell">Tipo</th>
                      <th className="pb-2 pr-6 font-medium text-muted-foreground text-right">Data</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentPessoas.map((p) => (
                      <tr key={p.id} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                        <td className="py-2.5 pl-6 font-medium">{p.nome}</td>
                        <td className="py-2.5 text-muted-foreground hidden sm:table-cell">{p.cidade || "—"}</td>
                        <td className="py-2.5 text-muted-foreground hidden md:table-cell font-mono text-xs">{p.telefone || "—"}</td>
                        <td className="py-2.5 hidden md:table-cell">
                          <Badge variant="secondary" className="text-xs">{tipoLabels[p.tipo_pessoa] || p.tipo_pessoa}</Badge>
                        </td>
                        <td className="py-2.5 pr-6 text-right text-muted-foreground text-xs">
                          {format(parseISO(p.created_at), "dd/MM/yy HH:mm", { locale: ptBR })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
