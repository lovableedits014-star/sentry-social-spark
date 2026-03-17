import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Radar, RefreshCw, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { THEME_DEFINITIONS, STOPWORDS, normalizeText, matchesTheme } from "@/lib/theme-definitions";
import { RadarThemeCard, type ThemeResult, type ThemeComment } from "@/components/radar/RadarThemeCard";
import { CustomThemeDialog } from "@/components/radar/CustomThemeDialog";

type RawComment = {
  text: string;
  author_name: string | null;
  sentiment: string | null;
  comment_created_time: string | null;
  created_at: string | null;
  platform: string | null;
};

type CustomTheme = { id: string; label: string; keywords: string[] };

function analyzeThemes(
  comments: RawComment[],
  allThemes: Record<string, { label: string; keywords: string[]; isCustom?: boolean }>
): ThemeResult[] {
  const now = Date.now();
  const h24 = 24 * 60 * 60 * 1000;
  const results: ThemeResult[] = [];

  for (const [key, def] of Object.entries(allThemes)) {
    let total = 0, last24h = 0, prev24h = 0;
    const sentimentCounts = { positive: 0, neutral: 0, negative: 0 };
    const dayBuckets: Record<string, number> = {};
    const wordFreq: Record<string, number> = {};
    const matchedComments: ThemeComment[] = [];

    for (const c of comments) {
      const words = normalizeText(c.text);
      if (!matchesTheme(c.text, words, def.keywords)) continue;

      total++;
      matchedComments.push(c);

      // Sentiment
      if (c.sentiment === "positive") sentimentCounts.positive++;
      else if (c.sentiment === "negative") sentimentCounts.negative++;
      else sentimentCounts.neutral++;

      const ts = new Date(c.comment_created_time || c.created_at || "").getTime();
      if (now - ts <= h24) last24h++;
      else if (now - ts <= 2 * h24) prev24h++;

      // Daily bucket
      const dayKey = new Date(c.comment_created_time || c.created_at || "")
        .toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
      dayBuckets[dayKey] = (dayBuckets[dayKey] || 0) + 1;

      // Word frequency (exclude theme keywords and stopwords)
      for (const w of words) {
        if (w.length > 3 && !def.keywords.includes(w) && !STOPWORDS.has(w)) {
          wordFreq[w] = (wordFreq[w] || 0) + 1;
        }
      }
    }

    if (total === 0) continue;

    const growthPct =
      prev24h > 0 ? Math.round(((last24h - prev24h) / prev24h) * 100)
      : last24h > 0 ? 100
      : null;

    // Build daily data sorted chronologically
    const dailyData = Object.entries(dayBuckets)
      .map(([day, count]) => ({ day, count }))
      .sort((a, b) => {
        const [da, ma] = a.day.split("/").map(Number);
        const [db, mb] = b.day.split("/").map(Number);
        return ma !== mb ? ma - mb : da - db;
      });

    const topKeywords = Object.entries(wordFreq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([word, count]) => ({ word, count }));

    // Sort matched comments by date desc
    matchedComments.sort((a, b) =>
      (b.comment_created_time || b.created_at || "").localeCompare(
        a.comment_created_time || a.created_at || ""
      )
    );

    results.push({
      key, label: def.label, total, last24h, prev24h, growthPct,
      sentimentCounts, dailyData, topKeywords, matchedComments,
      isCustom: def.isCustom,
    });
  }

  return results.sort((a, b) => {
    const ga = a.growthPct ?? -Infinity;
    const gb = b.growthPct ?? -Infinity;
    return gb - ga;
  });
}

export default function RadarTemas() {
  const [comments, setComments] = useState<RawComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [clientId, setClientId] = useState<string | null>(null);
  const [customThemes, setCustomThemes] = useState<CustomTheme[]>([]);

  const fetchComments = useCallback(async () => {
    setLoading(true);
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setLoading(false); return; }

    let cId: string | null = null;
    const { data: client } = await supabase.from("clients").select("id").eq("user_id", session.user.id).maybeSingle();
    if (client) { cId = client.id; } else {
      const { data: tm } = await supabase.from("team_members").select("client_id").eq("user_id", session.user.id).eq("status", "active").maybeSingle();
      if (tm) cId = tm.client_id;
    }
    if (!cId) { setLoading(false); return; }
    setClientId(cId);

    // Fetch custom themes
    const { data: ct } = await supabase.from("custom_themes").select("id, label, keywords").eq("client_id", cId);
    setCustomThemes(ct || []);

    // Fetch comments (paginated)
    let all: RawComment[] = [];
    let from = 0;
    const pageSize = 1000;
    while (true) {
      const { data } = await supabase
        .from("comments")
        .select("text, author_name, sentiment, comment_created_time, created_at, platform")
        .eq("client_id", cId)
        .eq("is_page_owner", false)
        .gte("created_at", sevenDaysAgo)
        .neq("text", "__post_stub__")
        .range(from, from + pageSize - 1);
      if (data && data.length > 0) { all = all.concat(data); from += pageSize; if (data.length < pageSize) break; } else break;
    }
    setComments(all);
    setLoading(false);
  }, []);

  useEffect(() => { fetchComments(); }, [fetchComments]);

  // Merge built-in + custom themes
  const allThemes = useMemo(() => {
    const merged: Record<string, { label: string; keywords: string[]; isCustom?: boolean }> = {};
    for (const [k, v] of Object.entries(THEME_DEFINITIONS)) {
      merged[k] = { ...v };
    }
    for (const ct of customThemes) {
      merged[`custom_${ct.id}`] = { label: ct.label, keywords: ct.keywords, isCustom: true };
    }
    return merged;
  }, [customThemes]);

  const themes = useMemo(() => analyzeThemes(comments, allThemes), [comments, allThemes]);
  const totalComments = comments.length;

  const handleSaveCustomTheme = async (label: string, keywords: string[]) => {
    if (!clientId) throw new Error("Cliente não encontrado");
    const { error } = await supabase.from("custom_themes").insert({
      client_id: clientId,
      label,
      keywords,
    });
    if (error) throw error;
    await fetchComments(); // reload
  };

  const handleDeleteCustomTheme = async (key: string) => {
    const id = key.replace("custom_", "");
    const { error } = await supabase.from("custom_themes").delete().eq("id", id);
    if (error) { toast.error("Erro ao remover tema"); return; }
    toast.success("Tema removido");
    setCustomThemes(customThemes.filter((ct) => ct.id !== id));
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
              Últimos 7 dias · {totalComments.toLocaleString()} comentários · {themes.length} temas detectados
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <CustomThemeDialog onSave={handleSaveCustomTheme} />
          <Button variant="outline" size="sm" onClick={fetchComments} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}><CardContent className="p-6 space-y-3">
              <Skeleton className="h-5 w-40" /><Skeleton className="h-8 w-20" /><Skeleton className="h-4 w-32" />
            </CardContent></Card>
          ))}
        </div>
      )}

      {/* Empty */}
      {!loading && themes.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center gap-3">
            <AlertTriangle className="w-10 h-10 text-muted-foreground/50" />
            <p className="text-muted-foreground">
              Nenhum tema detectado nos comentários dos últimos 7 dias.
            </p>
            <p className="text-xs text-muted-foreground/70">
              Sincronize comentários na aba de Comentários e volte aqui, ou crie um tema customizado.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Theme cards */}
      {!loading && themes.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {themes.map((t, idx) => (
            <RadarThemeCard
              key={t.key}
              theme={t}
              totalComments={totalComments}
              rank={idx}
              onDelete={t.isCustom ? handleDeleteCustomTheme : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}
