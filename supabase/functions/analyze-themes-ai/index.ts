import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getClientLLMConfig, callLLM } from "../_shared/llm-router.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface TextSnippet {
  source: "comment" | "telemarketing" | "crm";
  text: string;
  sentiment?: string | null;
  date?: string | null;
}

interface ThemeClassification {
  theme: string;
  is_emerging: boolean;
  description?: string;
  snippet_indexes: number[];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const clientId: string = body.clientId;
    const knownThemes: { key: string; label: string }[] = body.knownThemes || [];
    if (!clientId) {
      return new Response(JSON.stringify({ error: "clientId required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate user belongs to client
    const { data: ownerCheck } = await supabase
      .from("clients")
      .select("id")
      .eq("id", clientId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!ownerCheck) {
      const { data: tm } = await supabase
        .from("team_members")
        .select("id")
        .eq("client_id", clientId)
        .eq("user_id", user.id)
        .eq("status", "active")
        .maybeSingle();
      if (!tm) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // 1) Collect snippets from 3 sources
    const snippets: TextSnippet[] = [];

    const { data: comments } = await supabase
      .from("comments")
      .select("text, sentiment, comment_created_time, created_at")
      .eq("client_id", clientId)
      .eq("is_page_owner", false)
      .gte("created_at", sevenDaysAgo)
      .neq("text", "__post_stub__")
      .limit(800);
    for (const c of comments || []) {
      if (c.text && c.text.trim().length > 5) {
        snippets.push({
          source: "comment",
          text: c.text.slice(0, 400),
          sentiment: c.sentiment,
          date: c.comment_created_time || c.created_at,
        });
      }
    }

    const { data: indicados } = await supabase
      .from("contratado_indicados")
      .select("vota_candidato, candidato_alternativo, ligacao_status, created_at")
      .eq("client_id", clientId)
      .gte("created_at", sevenDaysAgo)
      .limit(400);
    for (const i of indicados || []) {
      const parts: string[] = [];
      if (i.vota_candidato) parts.push(`Vota em: ${i.vota_candidato}`);
      if (i.candidato_alternativo) parts.push(`Alternativo: ${i.candidato_alternativo}`);
      if (i.ligacao_status) parts.push(`Status ligação: ${i.ligacao_status}`);
      if (parts.length > 0) {
        snippets.push({ source: "telemarketing", text: parts.join(" | "), date: i.created_at });
      }
    }

    const { data: interacoes } = await supabase
      .from("interacoes_pessoa")
      .select("descricao, tipo_interacao, criado_em")
      .eq("client_id", clientId)
      .gte("criado_em", sevenDaysAgo)
      .limit(400);
    for (const it of interacoes || []) {
      if (it.descricao && it.descricao.trim().length > 5) {
        snippets.push({
          source: "crm",
          text: `[${it.tipo_interacao || "interação"}] ${it.descricao.slice(0, 400)}`,
          date: it.criado_em,
        });
      }
    }

    if (snippets.length === 0) {
      return new Response(
        JSON.stringify({ themes: [], emerging: [], totalAnalyzed: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2) Sample if too many (cap at 200 to keep total bounded)
    const MAX_SNIPPETS = 200;
    const sampled = snippets.length > MAX_SNIPPETS
      ? snippets.sort(() => Math.random() - 0.5).slice(0, MAX_SNIPPETS)
      : snippets;

    // 3) Get client LLM config (NEVER fall back to Lovable AI per user request)
    let llmConfig;
    try {
      llmConfig = await getClientLLMConfig(supabase, clientId);
      if (llmConfig.provider === "lovable") {
        return new Response(
          JSON.stringify({
            error: "Configure um provedor de IA próprio em Configurações → Integrações para usar a análise por IA. A IA da Lovable não pode ser usada aqui.",
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } catch (e) {
      return new Response(
        JSON.stringify({ error: "IA não configurada. Vá em Configurações → Integrações." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4) Build prompt template
    const knownLabels = knownThemes.map((t) => `- "${t.key}": ${t.label}`).join("\n");

    const systemPrompt = `Você é um analista político especializado em mineração de texto. Sua tarefa é classificar mensagens (comentários de redes sociais, notas de telemarketing e interações de CRM) em temas relevantes para uma campanha política brasileira.

REGRAS:
1. Use a lista de TEMAS CONHECIDOS quando o conteúdo se encaixar claramente em algum deles.
2. Quando você detectar um assunto recorrente que NÃO está na lista (ex: nome de obra local, escândalo específico, projeto, adversário citado), classifique como TEMA EMERGENTE com um label descritivo curto (máx 4 palavras).
3. Ignore mensagens vazias, spam, saudações genéricas e elogios/críticas sem assunto definido.
4. Um snippet pode pertencer a mais de um tema; nesse caso, inclua o índice em ambos.
5. Responda APENAS com JSON válido, sem markdown, sem explicações.

FORMATO DE SAÍDA:
{
  "themes": [
    { "theme": "<key do tema conhecido OU label curto se emergente>", "is_emerging": false, "description": "<descrição curta>", "snippet_indexes": [0, 3, 5] }
  ]
}`;

    // Process in small batches to respect TPM rate limits (e.g. Groq free tier = 6k TPM)
    const BATCH_SIZE = 40;
    const allThemes: ThemeClassification[] = [];
    let totalUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
    let lastError: string | null = null;

    for (let batchStart = 0; batchStart < sampled.length; batchStart += BATCH_SIZE) {
      const batch = sampled.slice(batchStart, batchStart + BATCH_SIZE);
      const indexedSnippets = batch
        .map((s, idx) => `[${batchStart + idx}] (${s.source}${s.sentiment ? `, ${s.sentiment}` : ""}) ${s.text}`)
        .join("\n");

      const userPrompt = `TEMAS CONHECIDOS:
${knownLabels || "(nenhum)"}

MENSAGENS PARA CLASSIFICAR:
${indexedSnippets}

Retorne o JSON.`;

      try {
        const llmResponse = await callLLM(llmConfig, {
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          maxTokens: 1500,
          temperature: 0.2,
        });

        if (llmResponse.usage) {
          totalUsage.prompt_tokens += llmResponse.usage.prompt_tokens || 0;
          totalUsage.completion_tokens += llmResponse.usage.completion_tokens || 0;
          totalUsage.total_tokens += llmResponse.usage.total_tokens || 0;
        }

        const cleaned = llmResponse.content
          .replace(/```json\s*/gi, "")
          .replace(/```\s*/g, "")
          .trim();
        const jsonStart = cleaned.indexOf("{");
        const jsonEnd = cleaned.lastIndexOf("}");
        const batchParsed: { themes: ThemeClassification[] } = JSON.parse(
          cleaned.slice(jsonStart, jsonEnd + 1)
        );
        for (const t of batchParsed.themes || []) {
          allThemes.push(t);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`Batch ${batchStart} failed:`, msg);
        lastError = msg;
        // If it's a rate limit (429/413/TPM), stop early but keep partial results
        if (/rate.?limit|429|413|tokens per minute|TPM/i.test(msg)) {
          break;
        }
      }

      // Pause between batches to respect TPM limits
      if (batchStart + BATCH_SIZE < sampled.length) {
        await new Promise((r) => setTimeout(r, 1500));
      }
    }

    if (allThemes.length === 0 && lastError) {
      const friendly = /rate.?limit|429|413|tokens per minute|TPM/i.test(lastError)
        ? "Seu provedor de IA atingiu o limite de tokens por minuto. Tente novamente em alguns minutos ou use um modelo com cota maior nas Configurações."
        : `Falha na análise por IA: ${lastError}`;
      return new Response(
        JSON.stringify({ error: friendly }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const parsed = { themes: allThemes };

    // 6) Aggregate results
    const known = new Set(knownThemes.map((t) => t.key));
    const aggregated: Record<string, {
      theme: string;
      is_emerging: boolean;
      description: string;
      total: number;
      sentimentCounts: { positive: number; neutral: number; negative: number };
      sources: { comment: number; telemarketing: number; crm: number };
      examples: string[];
    }> = {};

    for (const t of parsed.themes || []) {
      const isEmerging = t.is_emerging || !known.has(t.theme);
      const key = t.theme;
      if (!aggregated[key]) {
        aggregated[key] = {
          theme: key,
          is_emerging: isEmerging,
          description: t.description || "",
          total: 0,
          sentimentCounts: { positive: 0, neutral: 0, negative: 0 },
          sources: { comment: 0, telemarketing: 0, crm: 0 },
          examples: [],
        };
      }
      for (const idx of t.snippet_indexes || []) {
        const s = sampled[idx];
        if (!s) continue;
        aggregated[key].total++;
        aggregated[key].sources[s.source]++;
        if (s.sentiment === "positive") aggregated[key].sentimentCounts.positive++;
        else if (s.sentiment === "negative") aggregated[key].sentimentCounts.negative++;
        else aggregated[key].sentimentCounts.neutral++;
        if (aggregated[key].examples.length < 5) {
          aggregated[key].examples.push(s.text);
        }
      }
    }

    const themes = Object.values(aggregated).filter((t) => !t.is_emerging);
    const emerging = Object.values(aggregated).filter((t) => t.is_emerging);

    return new Response(
      JSON.stringify({
        themes,
        emerging,
        totalAnalyzed: sampled.length,
        totalAvailable: snippets.length,
        provider: llmConfig.provider,
        model: llmConfig.model,
        usage: totalUsage,
        partial: lastError ? true : false,
        partialReason: lastError,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("analyze-themes-ai error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});