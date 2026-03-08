import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Cell } from "recharts";
import { MapPin, Users, TrendingUp, TrendingDown, AlertTriangle, Search } from "lucide-react";
import { useState, useMemo } from "react";

interface LocationGroup {
  key: string;
  city: string;
  neighborhood: string | null;
  state: string | null;
  count: number;
}

export default function Territorial() {
  const [search, setSearch] = useState("");

  const { data: client } = useQuery({
    queryKey: ["client"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");
      const { data } = await supabase
        .from("clients")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();
      return data;
    },
  });

  const { data: supporters } = useQuery({
    queryKey: ["territorial-supporters", client?.id],
    queryFn: async () => {
      if (!client?.id) return [];
      const { data } = await supabase
        .from("supporter_accounts")
        .select("id, name, city, neighborhood, state, created_at")
        .eq("client_id", client.id);
      return (data || []) as Array<{ id: string; name: string; city: string | null; neighborhood: string | null; state: string | null; created_at: string }>;
    },
    enabled: !!client?.id,
  });

  // Also load confirmed indicados from contratados for territorial data
  const { data: confirmedIndicados } = useQuery({
    queryKey: ["territorial-indicados", client?.id],
    queryFn: async () => {
      if (!client?.id) return [];
      const { data } = await supabase
        .from("contratado_indicados")
        .select("id, nome, cidade, bairro, created_at")
        .eq("client_id", client.id)
        .eq("status", "confirmado");
      return (data || []) as Array<{ id: string; nome: string; cidade: string | null; bairro: string | null; created_at: string }>;
    },
    enabled: !!client?.id,
  });

  const { groups, totalWithLocation, totalWithout } = useMemo(() => {
    if (!supporters) return { groups: [], totalWithLocation: 0, totalWithout: 0 };

    // Combine supporter_accounts + confirmed indicados
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
      if (!map[key]) {
        map[key] = { key, city, neighborhood, state, count: 0 };
      }
      map[key].count++;
    }

    const sorted = Object.values(map).sort((a, b) => b.count - a.count);
    return { groups: sorted, totalWithLocation: withLoc.length, totalWithout: withoutLoc.length };
  }, [supporters, confirmedIndicados]);

  // Growth: compare supporters with location created in last 30 days vs previous 30 days
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
    const prev30 = withLoc.filter(s => {
      const diff = now - new Date(s.created_at).getTime();
      return diff >= d30 && diff < d30 * 2;
    }).length;
    const change = prev30 > 0 ? Math.round(((last30 - prev30) / prev30) * 100) : last30 > 0 ? 100 : 0;
    return { last30, prev30, change };
  }, [supporters, confirmedIndicados]);

  const maxCount = groups.length > 0 ? groups[0].count : 1;

  // Chart data: top 15 regions
  const chartData = useMemo(() => {
    return groups.slice(0, 15).map(g => ({
      name: g.neighborhood ? `${g.neighborhood}` : g.city,
      fullName: g.neighborhood ? `${g.neighborhood}, ${g.city}` : g.city,
      count: g.count,
      ratio: g.count / maxCount,
    }));
  }, [groups, maxCount]);

  const filtered = search
    ? groups.filter(g =>
        g.city.toLowerCase().includes(search.toLowerCase()) ||
        (g.neighborhood?.toLowerCase().includes(search.toLowerCase()))
      )
    : groups;

  const getHeatColor = (count: number) => {
    const ratio = count / maxCount;
    if (ratio >= 0.7) return "bg-primary";
    if (ratio >= 0.4) return "bg-accent-foreground/50";
    return "bg-destructive";
  };

  const getHeatLabel = (count: number) => {
    const ratio = count / maxCount;
    if (ratio >= 0.7) return "Zona Quente";
    if (ratio >= 0.4) return "Zona Morna";
    return "Zona Fria";
  };

  const getHeatBadge = (count: number): "default" | "secondary" | "destructive" => {
    const ratio = count / maxCount;
    if (ratio >= 0.7) return "default";
    if (ratio >= 0.4) return "secondary";
    return "destructive";
  };

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
          <MapPin className="w-7 h-7 text-primary" />
          Mapa Territorial
        </h1>
        <p className="text-sm text-muted-foreground">
          Distribuição geográfica dos apoiadores por cidade e bairro
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="text-2xl font-bold">{supporters?.length || 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <p className="text-xs text-muted-foreground">Com localização</p>
            <p className="text-2xl font-bold text-primary">{totalWithLocation}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <p className="text-xs text-muted-foreground">Sem localização</p>
            <p className="text-2xl font-bold text-muted-foreground">{totalWithout}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <p className="text-xs text-muted-foreground">Regiões</p>
            <p className="text-2xl font-bold">{groups.length}</p>
          </CardContent>
        </Card>
        <Card className="col-span-2 sm:col-span-1">
          <CardContent className="pt-4 pb-3 px-4">
            <p className="text-xs text-muted-foreground">Crescimento 30d</p>
            <div className="flex items-center gap-1">
              <p className="text-2xl font-bold">{growthStats?.last30 || 0}</p>
              {growthStats && growthStats.change !== 0 && (
                <Badge variant={growthStats.change > 0 ? "default" : "destructive"} className="text-[10px] px-1.5 h-5">
                  {growthStats.change > 0 ? (
                    <TrendingUp className="w-3 h-3 mr-0.5" />
                  ) : (
                    <TrendingDown className="w-3 h-3 mr-0.5" />
                  )}
                  {growthStats.change > 0 ? "+" : ""}{growthStats.change}%
                </Badge>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground">vs {growthStats?.prev30 || 0} mês anterior</p>
          </CardContent>
        </Card>
      </div>

      {/* Distribution Chart */}
      {chartData.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <MapPin className="w-4 h-4 text-primary" />
              Distribuição por Região
            </CardTitle>
            <CardDescription className="text-xs">
              Top {chartData.length} regiões com mais apoiadores. As cores indicam a intensidade: verde = zona quente, amarelo = zona morna, vermelho = zona fria.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer
              config={{
                count: { label: "Apoiadores", color: "hsl(var(--primary))" },
              }}
              className="h-[300px]"
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} layout="vertical" margin={{ left: 0, right: 16, top: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                  <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={11}
                    width={120}
                    tick={{ fill: "hsl(var(--foreground))" }}
                  />
                  <ChartTooltip
                    content={<ChartTooltipContent />}
                    formatter={(value: number, _name: string, props: any) => [
                      `${value} apoiadores`,
                      props.payload.fullName,
                    ]}
                  />
                  <Bar dataKey="count" name="Apoiadores" radius={[0, 4, 4, 0]}>
                    {chartData.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={
                          entry.ratio >= 0.7
                            ? "hsl(var(--primary))"
                            : entry.ratio >= 0.4
                            ? "hsl(38, 92%, 50%)"
                            : "hsl(var(--destructive))"
                        }
                      />
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
        <Input
          placeholder="Buscar por cidade ou bairro..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Cold zones alert */}
      {groups.filter(g => g.count / maxCount < 0.4).length > 0 && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="pt-4 pb-3 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-sm">Zonas frias identificadas</p>
              <p className="text-xs text-muted-foreground">
                {groups.filter(g => g.count / maxCount < 0.4).length} regiões com poucos apoiadores — oportunidades de expansão
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Territory cards */}
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <MapPin className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">Nenhum dado territorial disponível</p>
            <p className="text-xs mt-1">Os apoiadores precisam informar cidade/bairro no cadastro</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((g) => (
            <Card key={g.key} className="overflow-hidden">
              <CardContent className="pt-4 pb-3 px-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold text-sm">{g.neighborhood || g.city}</p>
                    {g.neighborhood && (
                      <p className="text-xs text-muted-foreground">{g.city}{g.state ? ` - ${g.state}` : ""}</p>
                    )}
                    {!g.neighborhood && g.state && (
                      <p className="text-xs text-muted-foreground">{g.state}</p>
                    )}
                  </div>
                  <Badge variant={getHeatBadge(g.count)} className="text-xs shrink-0">
                    {getHeatLabel(g.count)}
                  </Badge>
                </div>

                <div className="flex items-center gap-2">
                  <Users className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-sm font-bold">{g.count}</span>
                  <span className="text-xs text-muted-foreground">apoiadores</span>
                </div>

                {/* Progress bar */}
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${getHeatColor(g.count)}`}
                    style={{ width: `${(g.count / maxCount) * 100}%` }}
                  />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
