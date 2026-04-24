import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { callLLM, getClientLLMConfig } from "../_shared/llm-router.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { stats, alerts, clientId } = await req.json();

    if (!clientId) {
      return new Response(
        JSON.stringify({ error: "clientId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const llmConfig = await getClientLLMConfig(supabase, clientId);

    const alertsSummary = (alerts || [])
      .map(
        (a: any) =>
          `- **${a.theme}** (${a.severity}): crescimento de ${a.growthPct}%, ${a.negativeNow} negativos agora, ${a.negativeRatio}% ratio. Palavras-chave: ${(a.topKeywords || []).join(", ")}. Exemplos: ${(a.exampleComments || []).map((c: string) => `"${c.slice(0, 100)}"`).join("; ")}`
      )
      .join("\n");

    const userPrompt = `Dados do Detector de Crise:
- Total de comentários (48h): ${stats.totalComments}
- Negativos totais: ${stats.negativeTotal}
- Negativos no período atual (${stats.hoursWindow}h): ${stats.negativeNow}
- Negativos no período anterior: ${stats.negativePrev}
- Tendência geral: ${stats.generalGrowth !== null ? stats.generalGrowth + "%" : "sem dados"}

Alertas temáticos:
${alertsSummary || "Nenhum alerta temático detectado."}

Gere um resumo executivo em português brasileiro com:
1. **Diagnóstico**: Qual a situação atual? Há crise real ou apenas oscilação normal?
2. **Temas críticos**: Quais temas precisam de atenção imediata e por quê?
3. **Padrões identificados**: Há correlações ou tendências preocupantes?
4. **Recomendações**: 3-5 ações práticas e específicas para o gestor/assessoria.
5. **Prioridade**: Classifique a urgência geral (baixa, média, alta, crítica).

Seja direto, prático e use linguagem adequada para assessoria política/comunicação.`;

    const response = await callLLM(llmConfig, {
      messages: [
        {
          role: "system",
          content:
            "Você é um analista de comunicação política e gestão de crises. Analise dados de sentimento de comentários em redes sociais e gere resumos executivos concisos e acionáveis. Responda sempre em português brasileiro. Use formatação Markdown.",
        },
        { role: "user", content: userPrompt },
      ],
      maxTokens: 1500,
      temperature: 0.7,
    });

    return new Response(
      JSON.stringify({ summary: response.content, provider: response.provider, usage: response.usage }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("analyze-crisis error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
