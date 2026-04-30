import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { callLLM, getClientLLMConfig } from "../_shared/llm-router.ts";
import { corsHeaders, errorResponse, jsonResponse, parseLooseJson, sample } from "../_shared/ic-utils.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { clientId, force = false } = await req.json();
    if (!clientId) return errorResponse("clientId é obrigatório", 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Cache do dia
    const today = new Date().toISOString().slice(0, 10);
    if (!force) {
      const { data: cached } = await supabase
        .from("content_radar_snapshots")
        .select("*")
        .eq("client_id", clientId)
        .eq("snapshot_date", today)
        .maybeSingle();
      if (cached) return jsonResponse({ snapshot: cached, cached: true });
    }

    // Pega comentários dos últimos 7 dias (de não-owners, não stub)
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: comments } = await supabase
      .from("comments")
      .select("comment_id, text, sentiment, author_name, platform, post_message, post_id, comment_created_time, status, platform_user_id")
      .eq("client_id", clientId)
      .eq("is_page_owner", false)
      .neq("text", "__post_stub__")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(800);

    if (!comments || comments.length === 0) {
      const empty = {
        client_id: clientId,
        snapshot_date: today,
        hot_topics: [],
        open_questions: [],
        hostile_narratives: [],
        mobilizing_pautas: [],
      };
      await supabase.from("content_radar_snapshots").upsert(empty, { onConflict: "client_id,snapshot_date" });
      return jsonResponse({ snapshot: empty, cached: false, empty: true });
    }

    // Pega militantes (badges) p/ correlação
    const { data: militants } = await supabase
      .from("social_militants")
      .select("platform, platform_user_id, current_badge, author_name")
      .eq("client_id", clientId);
    const militantMap = new Map<string, string>();
    for (const m of militants ?? []) {
      militantMap.set(`${m.platform}:${m.platform_user_id}`, m.current_badge ?? "observador");
    }

    // Anexa badge a cada comentário
    const enriched = comments.map((c: any) => ({
      ...c,
      badge: militantMap.get(`${c.platform}:${c.platform_user_id}`) ?? "observador",
    }));

    // Sample reduzida para caber no limite de TPM (Groq llama-3.1-8b: 6000 TPM)
    // ~40 comentários x 140 chars ≈ 1.5k tokens de input
    const sampleComments = sample(enriched, 40);
    const commentText = sampleComments
      .map((c: any, i: number) =>
        `[${i + 1}](${c.platform[0]}/${(c.sentiment ?? "?")[0]}/${c.badge[0]}) ${(c.text ?? "").replace(/\s+/g, " ").trim().slice(0, 140)}`
      )
      .join("\n");

    const llmConfig = await getClientLLMConfig(supabase, clientId);

    const systemPrompt = `Você é um analista político brasileiro especializado em escutar redes sociais.
A partir de comentários da audiência de um candidato, identifique sinais acionáveis para a comunicação.
Retorne APENAS JSON válido, sem markdown, no formato:
{
  "hot_topics": [{"tema": string, "volume": number, "sentimento_predominante": "positive"|"negative"|"neutral", "exemplos": [string]}],
  "open_questions": [{"pergunta": string, "frequencia": number, "exemplos": [string]}],
  "hostile_narratives": [{"narrativa": string, "autores_count": number, "exemplos": [string]}],
  "mobilizing_pautas": [{"pauta": string, "defensores_engajados": number, "exemplos": [string]}]
}
Cada lista deve ter no máximo 5 itens, ordenados por relevância. "exemplos" deve conter 1-2 trechos curtos REAIS dos comentários.`;

    const userPrompt = `Analise estes ${sampleComments.length} comentários (de ${comments.length} totais nos últimos 7 dias) e extraia o radar.

COMENTÁRIOS:
${commentText}

Identifique:
- TEMAS QUENTES: assuntos que mais aparecem (saúde, segurança, economia, etc.)
- PERGUNTAS EM ABERTO: dúvidas que aparecem várias vezes e ainda parecem sem resposta
- NARRATIVAS HOSTIS: ataques recorrentes (vindos principalmente de badges hater/critico)
- PAUTAS QUE MOBILIZAM: temas em que defensores (badges defensor/elite) reagem positivamente

Responda APENAS com o JSON.`;

    const resp = await callLLM(llmConfig, {
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      maxTokens: 1500,
      temperature: 0.5,
    });

    const parsed = parseLooseJson<any>(resp.content);

    const snapshot = {
      client_id: clientId,
      snapshot_date: today,
      hot_topics: parsed.hot_topics ?? [],
      open_questions: parsed.open_questions ?? [],
      hostile_narratives: parsed.hostile_narratives ?? [],
      mobilizing_pautas: parsed.mobilizing_pautas ?? [],
    };

    await supabase.from("content_radar_snapshots").upsert(snapshot, { onConflict: "client_id,snapshot_date" });

    return jsonResponse({ snapshot, cached: false, sample_size: sampleComments.length, total: comments.length });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("ic-radar error:", msg);
    return errorResponse(msg);
  }
});