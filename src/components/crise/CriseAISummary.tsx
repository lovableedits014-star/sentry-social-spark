import { useState } from "react";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Brain, RefreshCw, Sparkles } from "lucide-react";
import ReactMarkdown from "react-markdown";
import type { CrisisAlert } from "./CriseAlertCard";

type GeneralStats = {
  totalComments: number;
  negativeTotal: number;
  negativeNow: number;
  negativePrev: number;
  generalGrowth: number | null;
};

interface Props {
  alerts: CrisisAlert[];
  stats: GeneralStats;
  hoursWindow: number;
}

export default function CriseAISummary({ alerts, stats, hoursWindow }: Props) {
  const [summary, setSummary] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const generate = async () => {
    setLoading(true);
    try {
      // Resolve clientId for the current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");
      let clientId: string | null = null;
      const { data: client } = await supabase
        .from("clients").select("id").eq("user_id", user.id).maybeSingle();
      if (client) clientId = client.id;
      if (!clientId) {
        const { data: tm } = await supabase
          .from("team_members").select("client_id").eq("user_id", user.id).maybeSingle();
        if (tm) clientId = tm.client_id;
      }
      if (!clientId) throw new Error("Cliente não encontrado");

      const payload = {
        stats: {
          totalComments: stats.totalComments,
          negativeTotal: stats.negativeTotal,
          negativeNow: stats.negativeNow,
          negativePrev: stats.negativePrev,
          generalGrowth: stats.generalGrowth,
          hoursWindow,
        },
        alerts: alerts.map((a) => ({
          theme: a.label,
          severity: a.severity,
          growthPct: a.growthPct,
          negativeNow: a.negativeNow,
          negativePrev: a.negativePrev,
          negativeRatio: a.negativeRatio,
          topKeywords: a.topKeywords.slice(0, 5),
          exampleComments: a.exampleComments.slice(0, 2),
        })),
        clientId,
      };

      const { data, error } = await supabase.functions.invoke("analyze-crisis", {
        body: payload,
      });

      if (error) throw error;
      setSummary(data?.summary || "Não foi possível gerar o resumo.");
    } catch (e) {
      console.error("AI summary error:", e);
      setSummary("Erro ao gerar resumo. Tente novamente em alguns instantes.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Brain className="w-5 h-5 text-primary" />
            <CardTitle className="text-base">Resumo Executivo com IA</CardTitle>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={generate}
            disabled={loading}
          >
            {loading ? (
              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4 mr-2" />
            )}
            {summary ? "Regenerar" : "Gerar Análise"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          A IA analisa os dados de sentimento, identifica padrões e gera recomendações 
          práticas de resposta. Baseado nos alertas e palavras-chave detectados.
        </p>
      </CardHeader>
      <CardContent>
        {loading && (
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-4/6" />
            <Skeleton className="h-4 w-full" />
          </div>
        )}
        {!loading && summary && (
          <div className="prose prose-sm max-w-none text-foreground dark:prose-invert">
            <ReactMarkdown>{summary}</ReactMarkdown>
          </div>
        )}
        {!loading && !summary && (
          <div className="text-center py-6 text-sm text-muted-foreground">
            <Sparkles className="w-8 h-8 mx-auto mb-2 text-primary/40" />
            Clique em "Gerar Análise" para receber um resumo executivo com recomendações de ação.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
