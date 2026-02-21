import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { MapPin, Users, TrendingUp, AlertTriangle, Search } from "lucide-react";
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
        .select("id, name, city, neighborhood, state")
        .eq("client_id", client.id);
      return (data || []) as Array<{ id: string; name: string; city: string | null; neighborhood: string | null; state: string | null }>;
    },
    enabled: !!client?.id,
  });

  const { groups, totalWithLocation, totalWithout } = useMemo(() => {
    if (!supporters) return { groups: [], totalWithLocation: 0, totalWithout: 0 };

    const withLoc = supporters.filter(s => s.city || s.neighborhood);
    const withoutLoc = supporters.filter(s => !s.city && !s.neighborhood);

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
  }, [supporters]);

  const maxCount = groups.length > 0 ? groups[0].count : 1;

  const filtered = search
    ? groups.filter(g =>
        g.city.toLowerCase().includes(search.toLowerCase()) ||
        (g.neighborhood?.toLowerCase().includes(search.toLowerCase()))
      )
    : groups;

  const getHeatColor = (count: number) => {
    const ratio = count / maxCount;
    if (ratio >= 0.7) return "bg-emerald-500";
    if (ratio >= 0.4) return "bg-amber-500";
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
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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
      </div>

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
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="pt-4 pb-3 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
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
