import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  AlertTriangle, ShieldAlert, RefreshCw, CheckCircle2, Info,
} from "lucide-react";
import { THEME_DEFINITIONS, STOPWORDS, normalizeText, matchesTheme } from "@/lib/theme-definitions";
import CriseStatsCards from "@/components/crise/CriseStatsCards";
import CriseAlertCard, { type CrisisAlert } from "@/components/crise/CriseAlertCard";
import CriseAISummary from "@/components/crise/CriseAISummary";

/* ── TYPES ── */
type GeneralStats = {
  totalComments: number;
  negativeTotal: number;
  negativeNow: number;
  negativePrev: number;
  generalGrowth: number | null;
};

type Comment = {
  text: string;
  sentiment: string | null;
  comment_created_time: string | null;
  created_at: string | null;
};

/* ── ANALYSIS ── */
function detectCrises(
  comments: Comment[],
  hoursWindow: number = 6
): { alerts: CrisisAlert[]; stats: GeneralStats } {
  const now = Date.now();
  const windowMs = hoursWindow * 60 * 60 * 1000;

  let negativeTotal = 0;
  let negativeNow = 0;
  let negativePrev = 0;

  for (const c of comments) {
    if (c.sentiment === "negative") {
      negativeTotal++;
      const ts = new Date(c.comment_created_time || c.created_at || "").getTime();
      if (now - ts <= windowMs) negativeNow++;
      else if (now - ts <= 2 * windowMs) negativePrev++;
    }
  }

  const generalGrowth =
    negativePrev > 0 ? Math.round(((negativeNow - negativePrev) / negativePrev) * 100)
    : negativeNow > 0 ? 100
    : null;

  const stats: GeneralStats = { totalComments: comments.length, negativeTotal, negativeNow, negativePrev, generalGrowth };

  const alerts: CrisisAlert[] = [];

  for (const [key, def] of Object.entries(THEME_DEFINITIONS)) {
    let negNow = 0;
    let negPrev = 0;
    let totalNow = 0;
    const negComments: Comment[] = [];
    const wordFreq: Record<string, number> = {};
    const hourBuckets: Record<number, number> = {};

    for (const c of comments) {
      const words = normalizeText(c.text);
      if (!matchesTheme(c.text, words, def.keywords)) continue;

      const ts = new Date(c.comment_created_time || c.created_at || "").getTime();
      const isNow = now - ts <= windowMs;
      const isPrev = now - ts > windowMs && now - ts <= 2 * windowMs;

      if (isNow) {
        totalNow++;
        if (c.sentiment === "negative") {
          negNow++;
          negComments.push(c);
          // Count words
          for (const w of words) {
            if (w.length > 3 && !def.keywords.includes(w)) {
              wordFreq[w] = (wordFreq[w] || 0) + 1;
            }
          }
          // Hourly bucket
          const hoursAgo = Math.floor((now - ts) / (60 * 60 * 1000));
          hourBuckets[hoursAgo] = (hourBuckets[hoursAgo] || 0) + 1;
        }
      }
      if (isPrev && c.sentiment === "negative") negPrev++;
    }

    if (negNow === 0 && negPrev === 0) continue;

    const growthPct = negPrev > 0
      ? Math.round(((negNow - negPrev) / negPrev) * 100)
      : negNow > 0 ? 100 : 0;

    const negativeRatio = totalNow > 0 ? Math.round((negNow / totalNow) * 100) : 0;

    let severity: CrisisAlert["severity"] = "watch";
    if (growthPct >= 200) severity = "critical";
    else if (growthPct >= 100 || negativeRatio >= 60) severity = "warning";
    else if (growthPct >= 50 || negativeRatio >= 40) severity = "watch";
    else continue;

    // Top keywords
    const topKeywords = Object.entries(wordFreq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([w]) => w);

    // Example comments (up to 3)
    const exampleComments = negComments
      .slice(0, 3)
      .map((c) => c.text)
      .filter((t) => t && t !== "__post_stub__");

    // Hourly data for sparkline
    const hourlyData = Array.from({ length: hoursWindow }, (_, i) => ({
      hour: `${hoursWindow - i}`,
      count: hourBuckets[hoursWindow - 1 - i] || 0,
    }));

    alerts.push({
      key, label: def.label, severity, negativeNow: negNow, negativePrev: negPrev,
      growthPct, totalNow, negativeRatio,
      period: `últimas ${hoursWindow}h`,
      topKeywords, exampleComments, hourlyData,
    });
  }

  alerts.sort((a, b) => {
    const order = { critical: 0, warning: 1, watch: 2 };
    if (order[a.severity] !== order[b.severity]) return order[a.severity] - order[b.severity];
    return b.growthPct - a.growthPct;
  });

  return { alerts, stats };
}

/* ── PAGE ── */
export default function DetectorCrise() {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [hoursWindow, setHoursWindow] = useState(6);

  const fetchComments = async () => {
    setLoading(true);
    const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setLoading(false); return; }

    let clientId: string | null = null;
    const { data: client } = await supabase.from("clients").select("id").eq("user_id", session.user.id).maybeSingle();
    if (client) { clientId = client.id; } else {
      const { data: tm } = await supabase.from("team_members").select("client_id").eq("user_id", session.user.id).eq("status", "active").maybeSingle();
      if (tm) clientId = tm.client_id;
    }
    if (!clientId) { setLoading(false); return; }

    let all: Comment[] = [];
    let from = 0;
    const pageSize = 1000;
    while (true) {
      const { data } = await supabase
        .from("comments")
        .select("text, sentiment, comment_created_time, created_at")
        .eq("client_id", clientId).eq("is_page_owner", false)
        .gte("created_at", twoDaysAgo).neq("text", "__post_stub__")
        .range(from, from + pageSize - 1);
      if (data && data.length > 0) { all = all.concat(data); from += pageSize; if (data.length < pageSize) break; } else break;
    }
    setComments(all);
    setLoading(false);
  };

  useEffect(() => { fetchComments(); }, []);

  const { alerts, stats } = useMemo(() => detectCrises(comments, hoursWindow), [comments, hoursWindow]);
  const hasCritical = alerts.some((a) => a.severity === "critical");

  return (
    <div className="p-4 md:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${hasCritical ? "bg-destructive/10" : "bg-primary/10"}`}>
            <ShieldAlert className={`w-5 h-5 ${hasCritical ? "text-destructive" : "text-primary"}`} />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Detector de Crise</h1>
            <p className="text-sm text-muted-foreground">
              Monitoramento de sentimento negativo · {stats.totalComments.toLocaleString()} comentários
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-muted rounded-lg p-0.5">
            {[6, 12, 24].map((h) => (
              <button key={h} onClick={() => setHoursWindow(h)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${hoursWindow === h ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                {h}h
              </button>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={fetchComments} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Atualizar
          </Button>
        </div>
      </div>

      {/* How it works */}
      <Card className="border-primary/10 bg-primary/5">
        <CardContent className="p-4 flex gap-3">
          <Info className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
          <div className="text-xs text-muted-foreground space-y-1">
            <p className="font-medium text-foreground">Como funciona o Detector de Crise?</p>
            <p>O sistema analisa todos os comentários das suas redes sociais nas últimas 48 horas, classifica o sentimento (positivo, neutro ou negativo) e agrupa por temas como Saúde, Segurança, Educação, etc.</p>
            <p>Quando um tema apresenta <strong>crescimento anormal de negatividade</strong> comparado ao período anterior, um alerta é gerado automaticamente com nível de severidade proporcional ao risco.</p>
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      {!loading && <CriseStatsCards stats={stats} hoursWindow={hoursWindow} />}

      {/* Loading */}
      {loading && (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}><CardContent className="p-6 space-y-3">
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-10 w-48" />
              <Skeleton className="h-4 w-64" />
            </CardContent></Card>
          ))}
        </div>
      )}

      {/* No alerts */}
      {!loading && alerts.length === 0 && (
        <Card className="border-emerald-500/30 bg-emerald-500/5">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center gap-3">
            <CheckCircle2 className="w-12 h-12 text-emerald-500" />
            <p className="text-lg font-semibold">Nenhuma crise detectada</p>
            <p className="text-sm text-muted-foreground max-w-md">
              O sentimento negativo está dentro dos níveis normais nas últimas {hoursWindow} horas.
              O sistema monitora automaticamente as variações por tema.
            </p>
            <div className="text-xs text-muted-foreground max-w-lg mt-2 space-y-1">
              <p>ℹ️ <strong>Critérios de alerta:</strong></p>
              <p>• <strong>Crítico:</strong> crescimento ≥200% de negativos vs período anterior</p>
              <p>• <strong>Atenção:</strong> crescimento ≥100% ou ≥60% do tema é negativo</p>
              <p>• <strong>Observação:</strong> crescimento ≥50% ou ≥40% do tema é negativo</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* AI Summary */}
      {!loading && (
        <CriseAISummary alerts={alerts} stats={stats} hoursWindow={hoursWindow} />
      )}

      {/* Alert cards */}
      {!loading && alerts.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-destructive" />
            Alertas de Crise ({alerts.length})
          </h2>
          <p className="text-xs text-muted-foreground -mt-2">
            Cada card abaixo representa um tema onde o sentimento negativo ultrapassou os limites normais.
            Expanda os detalhes para ver palavras-chave e comentários de exemplo.
          </p>
          {alerts.map((alert) => (
            <CriseAlertCard key={alert.key} alert={alert} />
          ))}
        </div>
      )}
    </div>
  );
}
