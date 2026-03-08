import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, TrendingDown, Minus, Radar, RefreshCw, AlertTriangle, ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { THEME_DEFINITIONS, normalizeText, matchesTheme } from "@/lib/theme-definitions";

type ThemeResult = {
  key: string;
  label: string;
  total: number;
  last24h: number;
  prev24h: number;
  growthPct: number | null;
};

function analyzeThemes(
  comments: { text: string; comment_created_time: string | null; created_at: string | null }[]
): ThemeResult[] {
  const now = Date.now();
  const h24 = 24 * 60 * 60 * 1000;

  const results: ThemeResult[] = [];

  for (const [key, def] of Object.entries(THEME_DEFINITIONS)) {
    let total = 0;
    let last24h = 0;
    let prev24h = 0;

    for (const c of comments) {
      const words = normalizeText(c.text);
      const matched = def.keywords.some((kw) =>
        kw.includes(" ")
          ? c.text.toLowerCase().includes(kw)
          : words.includes(kw)
      );
      if (!matched) continue;

      total++;
      const ts = new Date(c.comment_created_time || c.created_at || "").getTime();
      if (now - ts <= h24) last24h++;
      else if (now - ts <= 2 * h24) prev24h++;
    }

    if (total === 0) continue;

    const growthPct =
      prev24h > 0
        ? Math.round(((last24h - prev24h) / prev24h) * 100)
        : last24h > 0
        ? 100
        : null;

    results.push({ key, label: def.label, total, last24h, prev24h, growthPct });
  }

  return results.sort((a, b) => {
    const ga = a.growthPct ?? -Infinity;
    const gb = b.growthPct ?? -Infinity;
    return gb - ga;
  });
}

/* ── PAGE ── */
export default function RadarTemas() {
  const [comments, setComments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchComments = async () => {
    setLoading(true);
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // Get client
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const { data: client } = await supabase
      .from("clients")
      .select("id")
      .eq("user_id", session.user.id)
      .maybeSingle();

    if (!client) {
      // try team member
      const { data: tm } = await supabase
        .from("team_members")
        .select("client_id")
        .eq("user_id", session.user.id)
        .eq("status", "active")
        .maybeSingle();
      if (!tm) { setLoading(false); return; }
      await loadComments(tm.client_id, sevenDaysAgo);
    } else {
      await loadComments(client.id, sevenDaysAgo);
    }
  };

  const loadComments = async (clientId: string, since: string) => {
    // Paginated fetch to bypass 1000-row limit
    let all: any[] = [];
    let from = 0;
    const pageSize = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data } = await supabase
        .from("comments")
        .select("text, comment_created_time, created_at")
        .eq("client_id", clientId)
        .eq("is_page_owner", false)
        .gte("created_at", since)
        .neq("text", "__post_stub__")
        .range(from, from + pageSize - 1);

      if (data && data.length > 0) {
        all = all.concat(data);
        from += pageSize;
        if (data.length < pageSize) hasMore = false;
      } else {
        hasMore = false;
      }
    }

    setComments(all);
    setLoading(false);
  };

  useEffect(() => { fetchComments(); }, []);

  const themes = useMemo(() => analyzeThemes(comments), [comments]);

  const totalComments = comments.length;

  const GrowthIndicator = ({ pct }: { pct: number | null }) => {
    if (pct === null) return <span className="text-xs text-muted-foreground">sem dados anteriores</span>;
    if (pct > 0)
      return (
        <span className="flex items-center gap-1 text-sm font-semibold text-emerald-500">
          <TrendingUp className="w-4 h-4" /> +{pct}%
        </span>
      );
    if (pct < 0)
      return (
        <span className="flex items-center gap-1 text-sm font-semibold text-red-500">
          <TrendingDown className="w-4 h-4" /> {pct}%
        </span>
      );
    return (
      <span className="flex items-center gap-1 text-sm text-muted-foreground">
        <Minus className="w-4 h-4" /> estável
      </span>
    );
  };

  return (
    <div className="p-4 md:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Radar className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Radar de Temas</h1>
            <p className="text-sm text-muted-foreground">
              Análise dos últimos 7 dias · {totalComments.toLocaleString()} comentários analisados
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => fetchComments()} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      {/* Loading */}
      {loading && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}><CardContent className="p-6 space-y-3"><Skeleton className="h-5 w-40" /><Skeleton className="h-8 w-20" /><Skeleton className="h-4 w-32" /></CardContent></Card>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && themes.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center gap-3">
            <AlertTriangle className="w-10 h-10 text-muted-foreground/50" />
            <p className="text-muted-foreground">
              Nenhum tema político detectado nos comentários dos últimos 7 dias.
            </p>
            <p className="text-xs text-muted-foreground/70">
              Sincronize comentários na aba de Comentários e volte aqui.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Theme cards */}
      {!loading && themes.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {themes.map((t, idx) => (
            <Card key={t.key} className={idx === 0 ? "border-primary/40 shadow-md" : ""}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-semibold">{t.label}</CardTitle>
                  {idx === 0 && (
                    <Badge variant="default" className="text-[10px]">
                      <ArrowUp className="w-3 h-3 mr-0.5" /> Top
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-bold">{t.total}</span>
                  <span className="text-sm text-muted-foreground">menções</span>
                </div>

                <div className="flex items-center justify-between">
                  <GrowthIndicator pct={t.growthPct} />
                  <span className="text-xs text-muted-foreground">últimas 24h</span>
                </div>

                {totalComments > 0 && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>participação</span>
                      <span>{Math.round((t.total / totalComments) * 100)}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${Math.min(100, Math.round((t.total / totalComments) * 100))}%` }}
                      />
                    </div>
                  </div>
                )}

                <div className="flex gap-3 pt-1 text-xs text-muted-foreground">
                  <span>{t.last24h} nas últimas 24h</span>
                  <span>{t.prev24h} nas 24h anteriores</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
