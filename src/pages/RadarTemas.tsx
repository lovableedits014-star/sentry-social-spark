import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Radar, RefreshCw, AlertTriangle, Sparkles, Info, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { SentimentHeatmap } from "@/components/radar/SentimentHeatmap";
import { EmergingThemes, type EmergingTheme } from "@/components/radar/EmergingThemes";
import { THEME_DEFINITIONS } from "@/lib/theme-definitions";

type AITheme = {
  theme: string;
  description: string;
  total: number;
  sentimentCounts: { positive: number; neutral: number; negative: number };
  sources: { comment: number; telemarketing: number; crm: number };
  examples: string[];
};

type AIAnalysis = {
  themes: AITheme[];
  emerging: EmergingTheme[];
  totalAnalyzed: number;
  totalAvailable: number;
  provider: string;
  model: string;
};

const THEME_LABELS: Record<string, string> = Object.fromEntries(
  Object.entries(THEME_DEFINITIONS).map(([k, v]) => [k, v.label])
);

const labelFor = (key: string) => THEME_LABELS[key] ?? key;

export default function RadarTemas() {
  const [loading, setLoading] = useState(true);
  const [clientId, setClientId] = useState<string | null>(null);
  const [aiAnalysis, setAiAnalysis] = useState<AIAnalysis | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [extraSourceStats, setExtraSourceStats] = useState({
    comments: 0,
    telemarketing: 0,
    crm: 0,
  });

  const runAnalysis = useCallback(async (cId: string) => {
    setLoading(true);
    setAiError(null);
    try {
      const knownThemes = Object.entries(THEME_DEFINITIONS).map(([key, def]) => ({
        key,
        label: def.label,
      }));
      const { data, error } = await supabase.functions.invoke("analyze-themes-ai", {
        body: { clientId: cId, knownThemes },
      });
      // Try to extract a structured error message from the function response body
      let payload: any = data;
      if (error && (error as any).context?.json) {
        try { payload = await (error as any).context.json(); } catch { /* ignore */ }
      } else if (error && (error as any).context?.text) {
        try {
          const txt = await (error as any).context.text();
          payload = JSON.parse(txt);
        } catch { /* ignore */ }
      }
      if (payload?.error) {
        setAiError(payload.error);
        setAiAnalysis(null);
        return;
      }
      if (error) throw error;
      setAiAnalysis(data);
      if (data?.partial && data?.partialReason) {
        toast.warning(`Análise parcial: ${data.partialReason.slice(0, 120)}`);
      } else if (data?.totalAnalyzed > 0) {
        toast.success(
          `IA analisou ${data.totalAnalyzed} mensagens · ${data.themes.length} temas conhecidos · ${data.emerging.length} emergentes`
        );
      }
    } catch (e: any) {
      const msg = e?.message || "Falha na análise por IA";
      setAiError(msg);
      setAiAnalysis(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const init = useCallback(async () => {
    setLoading(true);
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

    const sevenDaysAgoTs = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const [cmtRes, telRes, crmRes] = await Promise.all([
      supabase.from("comments").select("id", { count: "exact", head: true })
        .eq("client_id", cId).eq("is_page_owner", false)
        .neq("text", "__post_stub__").gte("created_at", sevenDaysAgoTs),
      supabase.from("contratado_indicados").select("id", { count: "exact", head: true })
        .eq("client_id", cId).gte("created_at", sevenDaysAgoTs),
      supabase.from("interacoes_pessoa").select("id", { count: "exact", head: true })
        .eq("client_id", cId).gte("criado_em", sevenDaysAgoTs),
    ]);
    setExtraSourceStats({
      comments: cmtRes.count || 0,
      telemarketing: telRes.count || 0,
      crm: crmRes.count || 0,
    });

    await runAnalysis(cId);
  }, [runAnalysis]);

  useEffect(() => { init(); }, [init]);

  // Adapt AI themes -> SentimentHeatmap shape (only fields it reads)
  const heatmapRows = (aiAnalysis?.themes || []).map((t) => ({
    key: t.theme,
    label: labelFor(t.theme),
    total: t.total,
    last24h: 0,
    prev24h: 0,
    growthPct: null,
    sentimentCounts: t.sentimentCounts,
    dailyData: [],
    topKeywords: [],
    matchedComments: [],
  })) as any;

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
              Classificação 100% semântica via IA dos últimos 7 dias — combina comentários, telemarketing e CRM. Sem palavras-chave (que geravam falsos positivos como "parabéns pelo trabalho" virando "Emprego").
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {extraSourceStats.comments.toLocaleString()} comentários · {extraSourceStats.telemarketing} ligações · {extraSourceStats.crm} interações CRM
              {aiAnalysis && ` · ${aiAnalysis.themes.length + aiAnalysis.emerging.length} temas pela IA (${aiAnalysis.provider})`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => clientId && runAnalysis(clientId)} disabled={loading || !clientId}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Reanalisar
          </Button>
        </div>
      </div>

      {/* AI not configured */}
      {!loading && aiError && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardContent className="py-4 flex items-start gap-3">
            <Settings className="w-5 h-5 mt-0.5 shrink-0 text-amber-600" />
            <div className="space-y-2 text-sm">
              <p className="font-semibold text-foreground">Configuração de IA necessária</p>
              <p className="text-muted-foreground">{aiError}</p>
              <Link to="/integrations">
                <Button variant="outline" size="sm" className="mt-1">
                  Ir para Integrações
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Loading */}
      {loading && (
        <Card>
          <CardContent className="py-8 flex flex-col items-center gap-3 text-center">
            <Sparkles className="w-8 h-8 text-primary animate-pulse" />
            <p className="text-sm font-medium">IA classificando mensagens semanticamente…</p>
            <p className="text-xs text-muted-foreground">
              Pode levar 10-30 segundos dependendo do provedor configurado.
            </p>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3 w-full mt-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-24 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* No data at all */}
      {!loading && !aiError && aiAnalysis && aiAnalysis.totalAnalyzed === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center gap-3">
            <AlertTriangle className="w-10 h-10 text-muted-foreground/50" />
            <p className="text-muted-foreground">Nenhuma mensagem encontrada nos últimos 7 dias.</p>
            <p className="text-xs text-muted-foreground/70">
              Sincronize comentários, registre ligações de telemarketing ou interações de CRM.
            </p>
          </CardContent>
        </Card>
      )}

      {/* No themes detected */}
      {!loading && !aiError && aiAnalysis && aiAnalysis.totalAnalyzed > 0 && aiAnalysis.themes.length === 0 && aiAnalysis.emerging.length === 0 && (
        <Card>
          <CardContent className="py-8 flex items-start gap-3">
            <Info className="w-5 h-5 mt-0.5 text-primary" />
            <div className="text-sm">
              <p className="font-medium">A IA não identificou temas relevantes nas {aiAnalysis.totalAnalyzed} mensagens analisadas.</p>
              <p className="text-xs text-muted-foreground mt-1">
                Provavelmente são saudações, elogios genéricos ou spam sem assunto definido.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Emerging themes */}
      {aiAnalysis && aiAnalysis.emerging.length > 0 && (
        <EmergingThemes
          themes={aiAnalysis.emerging}
          provider={aiAnalysis.provider}
          totalAnalyzed={aiAnalysis.totalAnalyzed}
        />
      )}

      {/* Heatmap */}
      {!loading && aiAnalysis && aiAnalysis.themes.length > 0 && (
        <SentimentHeatmap themes={heatmapRows} />
      )}

      {/* Known theme cards */}
      {!loading && aiAnalysis && aiAnalysis.themes.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {aiAnalysis.themes
            .sort((a, b) => b.total - a.total)
            .map((t) => (
              <Card key={t.theme}>
                <CardContent className="p-5 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-semibold text-base">{labelFor(t.theme)}</h3>
                      {t.description && (
                        <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{t.description}</p>
                      )}
                    </div>
                    <span className="text-2xl font-bold">{t.total}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="text-emerald-600">😊 {t.sentimentCounts.positive}</span>
                    <span className="text-muted-foreground">😐 {t.sentimentCounts.neutral}</span>
                    <span className="text-red-600">😠 {t.sentimentCounts.negative}</span>
                  </div>
                  <div className="flex items-center gap-3 text-[10px] text-muted-foreground border-t pt-2">
                    {t.sources.comment > 0 && <span>💬 {t.sources.comment} comentários</span>}
                    {t.sources.telemarketing > 0 && <span>📞 {t.sources.telemarketing} ligações</span>}
                    {t.sources.crm > 0 && <span>👥 {t.sources.crm} CRM</span>}
                  </div>
                  {t.examples[0] && (
                    <blockquote className="text-xs italic text-muted-foreground border-l-2 border-primary/30 pl-2 line-clamp-3">
                      "{t.examples[0]}"
                    </blockquote>
                  )}
                </CardContent>
              </Card>
            ))}
        </div>
      )}
    </div>
  );
}
