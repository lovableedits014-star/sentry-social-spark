import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const { themes, commentSamples } = await req.json();

    if (!themes || themes.length === 0) {
      return new Response(
        JSON.stringify({ suggestions: [] }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const themeSummary = themes
      .map((t: any) => `- ${t.label}: ${t.total} menções, crescimento ${t.growthPct ?? 0}%`)
      .join("\n");

    const sampleText = (commentSamples || [])
      .slice(0, 20)
      .map((c: string) => `"${c}"`)
      .join("\n");

    const systemPrompt = `Você é um estrategista político digital brasileiro. 
Sua tarefa é sugerir missões de engajamento para apoiadores nas redes sociais.

Uma "missão" é uma ação simples que apoiadores podem fazer, como:
- Comentar em um post específico com uma mensagem positiva
- Compartilhar um conteúdo nas redes
- Reagir/curtir uma publicação
- Criar conteúdo sobre um tema

As sugestões devem ser:
- Práticas e fáceis de executar
- Relacionadas aos temas políticos em alta
- Com linguagem motivacional e clara
- Focadas em mobilização digital positiva

Retorne EXATAMENTE 3-5 sugestões usando a ferramenta fornecida.`;

    const userPrompt = `Analise os temas políticos em alta e sugira missões de engajamento:

TEMAS EM ALTA:
${themeSummary}

${sampleText ? `EXEMPLOS DE COMENTÁRIOS RECENTES:\n${sampleText}` : ""}

Crie missões de engajamento relevantes para esses temas.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "suggest_missions",
              description: "Return 3-5 mission suggestions for political engagement.",
              parameters: {
                type: "object",
                properties: {
                  suggestions: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        title: { type: "string", description: "Título curto da missão" },
                        description: { type: "string", description: "Descrição detalhada do que o apoiador deve fazer" },
                        theme: { type: "string", description: "Tema político relacionado" },
                        platform: { type: "string", enum: ["facebook", "instagram", "ambos"], description: "Plataforma ideal" },
                        priority: { type: "string", enum: ["alta", "media", "baixa"], description: "Prioridade baseada na tendência" },
                      },
                      required: ["title", "description", "theme", "platform", "priority"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["suggestions"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "suggest_missions" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Limite de requisições excedido. Tente novamente em alguns minutos." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Créditos insuficientes para IA. Adicione créditos ao workspace." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall?.function?.arguments) {
      throw new Error("No tool call response from AI");
    }

    const parsed = JSON.parse(toolCall.function.arguments);

    return new Response(
      JSON.stringify({ suggestions: parsed.suggestions || [] }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("suggest-missions error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
