import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle, ShieldAlert, TrendingUp, TrendingDown,
  Minus, RefreshCw, CheckCircle2, Flame, Clock,
} from "lucide-react";
import { THEME_DEFINITIONS, STOPWORDS, normalizeText, matchesTheme } from "@/lib/theme-definitions";

/* ── TYPES ── */
type CrisisAlert = {
  key: string;
  label: string;
  severity: "critical" | "warning" | "watch";
  negativeNow: number;
  negativePrev: number;
  growthPct: number;
  totalNow: number;
  negativeRatio: number; // % of negatives in current period
  period: string;
};

type GeneralStats = {
  totalComments: number;
  negativeTotal: number;
  negativeNow: number;
  negativePrev: number;
  generalGrowth: number | null;
};

/* ── ANALYSIS ── */
function detectCrises(
  comments: { text: string; sentiment: string | null; comment_created_time: string | null; created_at: string | null }[],
  hoursWindow: number = 6
): { alerts: CrisisAlert[]; stats: GeneralStats } {
  const now = Date.now();
  const windowMs = hoursWindow * 60 * 60 * 1000;

  // General stats
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

  const stats: GeneralStats = {
    totalComments: comments.length,
    negativeTotal,
    negativeNow,
    negativePrev,
    generalGrowth,
  };

  // Per-theme analysis
  const alerts: CrisisAlert[] = [];

  for (const [key, def] of Object.entries(THEME_DEFINITIONS)) {
    let negNow = 0;
    let negPrev = 0;
    let totalNow = 0;

    for (const c of comments) {
      const words = normalizeText(c.text);
      if (!matchesTheme(c.text, words, def.keywords)) continue;

      const ts = new Date(c.comment_created_time || c.created_at || "").getTime();
      const isNow = now - ts <= windowMs;
      const isPrev = now - ts > windowMs && now - ts <= 2 * windowMs;

      if (isNow) {
        totalNow++;
        if (c.sentiment === "negative") negNow++;
      }
      if (isPrev && c.sentiment === "negative") negPrev++;
    }

    if (negNow === 0 && negPrev === 0) continue;

    const growthPct =
      negPrev > 0
        ? Math.round(((negNow - negPrev) / negPrev) * 100)
        : negNow > 0 ? 100 : 0;

    const negativeRatio = totalNow > 0 ? Math.round((negNow / totalNow) * 100) : 0;

    // Determine severity
    let severity: CrisisAlert["severity"] = "watch";
    if (growthPct >= 200) severity = "critical";
    else if (growthPct >= 100 || negativeRatio >= 60) severity = "warning";
    else if (growthPct >= 50 || negativeRatio >= 40) severity = "watch";
    else continue; // below threshold — skip

    alerts.push({
      key,
      label: def.label,
      severity,
      negativeNow: negNow,
      negativePrev: negPrev,
      growthPct,
      totalNow,
      negativeRatio,
      period: `últimas ${hoursWindow}h`,
    });
  }

  // Sort: critical first, then by growth
  alerts.sort((a, b) => {
    const order = { critical: 0, warning: 1, watch: 2 };
    if (order[a.severity] !== order[b.severity]) return order[a.severity] - order[b.severity];
    return b.growthPct - a.growthPct;
  });

  return { alerts, stats };
}

/* ── SEVERITY CONFIG ── */
const SEVERITY_CONFIG = {
  critical: {
    label: "ALERTA CRÍTICO",
    icon: Flame,
    badgeClass: "bg-destructive text-destructive-foreground",
    cardClass: "border-destructive/60 bg-destructive/5 shadow-lg",
    iconClass: "text-destructive",
  },
  warning: {
    label: "ATENÇÃO",
    icon: AlertTriangle,
    badgeClass: "bg-amber-500 text-white",
    cardClass: "border-amber-500/40 bg-amber-500/5",
    iconClass: "text-amber-500",
  },
  watch: {
    label: "OBSERVAÇÃO",
    icon: Clock,
    badgeClass: "bg-muted text-muted-foreground",
    cardClass: "border-muted",
    iconClass: "text-muted-foreground",
  },
};

/* ── PAGE ── */
export default function DetectorCrise() {
  const [comments, setComments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [hoursWindow, setHoursWindow] = useState(6);

  const fetchComments = async () => {
    setLoading(true);
    const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setLoading(false); return; }

    // Resolve clientId
    let clientId: string | null = null;
    const { data: client } = await supabase
      .from("clients")
      .select("id")
      .eq("user_id", session.user.id)
      .maybeSingle();

    if (client) {
      clientId = client.id;
    } else {
      const { data: tm } = await supabase
        .from("team_members")
        .select("client_id")
        .eq("user_id", session.user.id)
        .eq("status", "active")
        .maybeSingle();
      if (tm) clientId = tm.client_id;
    }

    if (!clientId) { setLoading(false); return; }

    // Paginated fetch
    let all: any[] = [];
    let from = 0;
    const pageSize = 1000;

    while (true) {
      const { data } = await supabase
        .from("comments")
        .select("text, sentiment, comment_created_time, created_at")
        .eq("client_id", clientId)
        .eq("is_page_owner", false)
        .gte("created_at", twoDaysAgo)
        .neq("text", "__post_stub__")
        .range(from, from + pageSize - 1);

      if (data && data.length > 0) {
        all = all.concat(data);
        from += pageSize;
        if (data.length < pageSize) break;
      } else break;
    }

    setComments(all);
    setLoading(false);
  };

  useEffect(() => { fetchComments(); }, []);

  const { alerts, stats } = useMemo(
    () => detectCrises(comments, hoursWindow),
    [comments, hoursWindow]
  );

  const hasCritical = alerts.some((a) => a.severity === "critical");

  return (
    <div className="p-4 md:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
            hasCritical ? "bg-destructive/10" : "bg-primary/10"
          }`}>
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
          {/* Window selector */}
          <div className="flex bg-muted rounded-lg p-0.5">
            {[6, 12, 24].map((h) => (
              <button
                key={h}
                onClick={() => setHoursWindow(h)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  hoursWindow === h
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {h}h
              </button>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={fetchComments} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </div>
      </div>

      {/* General sentiment overview */}
      {!loading && (
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground mb-1">Total de comentários</p>
              <p className="text-2xl font-bold">{stats.totalComments.toLocaleString()}</p>
              <p className="text-[10px] text-muted-foreground">últimas 48h</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground mb-1">Negativos totais</p>
              <p className="text-2xl font-bold">{stats.negativeTotal}</p>
              <p className="text-[10px] text-muted-foreground">
                {stats.totalComments > 0 ? Math.round((stats.negativeTotal / stats.totalComments) * 100) : 0}% do total
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground mb-1">Negativos ({hoursWindow}h)</p>
              <p className="text-2xl font-bold">{stats.negativeNow}</p>
              <p className="text-[10px] text-muted-foreground">período atual</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground mb-1">Tendência geral</p>
              <div className="flex items-center gap-1 mt-1">
                {stats.generalGrowth === null ? (
                  <span className="text-sm text-muted-foreground">sem dados</span>
                ) : stats.generalGrowth > 0 ? (
                  <span className="flex items-center gap-1 text-lg font-bold text-destructive">
                    <TrendingUp className="w-4 h-4" /> +{stats.generalGrowth}%
                  </span>
                ) : stats.generalGrowth < 0 ? (
                  <span className="flex items-center gap-1 text-lg font-bold text-emerald-500">
                    <TrendingDown className="w-4 h-4" /> {stats.generalGrowth}%
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-lg font-bold text-muted-foreground">
                    <Minus className="w-4 h-4" /> estável
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

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
              O sistema monitora automaticamente as variações.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Alert cards */}
      {!loading && alerts.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-destructive" />
            Alertas de Crise ({alerts.length})
          </h2>

          {alerts.map((alert) => {
            const config = SEVERITY_CONFIG[alert.severity];
            const SevIcon = config.icon;

            return (
              <Card key={alert.key} className={config.cardClass}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <SevIcon className={`w-5 h-5 ${config.iconClass}`} />
                      <CardTitle className="text-base">{alert.label}</CardTitle>
                    </div>
                    <Badge className={config.badgeClass}>{config.label}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* Main metric */}
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-bold">+{alert.growthPct}%</span>
                    <span className="text-sm text-muted-foreground">sentimento negativo</span>
                  </div>

                  {/* Details */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                    <div>
                      <p className="text-muted-foreground text-xs">Negativos agora</p>
                      <p className="font-semibold">{alert.negativeNow}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">Período anterior</p>
                      <p className="font-semibold">{alert.negativePrev}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">Total no período</p>
                      <p className="font-semibold">{alert.totalNow}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">% negativos</p>
                      <p className="font-semibold">{alert.negativeRatio}%</p>
                    </div>
                  </div>

                  {/* Negative ratio bar */}
                  <div className="space-y-1">
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-destructive transition-all"
                        style={{ width: `${Math.min(100, alert.negativeRatio)}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      {alert.negativeRatio}% dos comentários sobre {alert.label.toLowerCase()} são negativos nas {alert.period}
                    </p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
