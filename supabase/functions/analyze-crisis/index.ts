import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { stats, alerts } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

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

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content:
              "Você é um analista de comunicação política e gestão de crises. Analise dados de sentimento de comentários em redes sociais e gere resumos executivos concisos e acionáveis. Responda sempre em português brasileiro. Use formatação Markdown.",
          },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);
      
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit excedido. Tente novamente em instantes." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos de IA insuficientes." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error("AI gateway error: " + response.status);
    }

    const aiData = await response.json();
    const summary = aiData.choices?.[0]?.message?.content || "Resumo indisponível.";

    return new Response(JSON.stringify({ summary }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("analyze-crisis error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
