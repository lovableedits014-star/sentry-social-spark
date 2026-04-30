import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { callLLM, getClientLLMConfig } from "../_shared/llm-router.ts";
import { corsHeaders, errorResponse, jsonResponse } from "../_shared/ic-utils.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface BoletimRequest {
  clientId: string;
  since?: string; // ISO date — default = hoje - 7 dias
  until?: string; // ISO date — default = hoje
  tema?: string;
  incluir?: { posts?: boolean; acoes?: boolean; visitas?: boolean };
  providerOverride?: string;
  modelOverride?: string;
  apiKeyOverride?: string;
  reprocessMateriaId?: string;
  briefing?: string; // orientação extra (usada na reescrita)
}

function startOfDay(iso: string) {
  const d = new Date(iso);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}
function endOfDay(iso: string) {
  const d = new Date(iso);
  d.setUTCHours(23, 59, 59, 999);
  return d.toISOString();
}
function fmtBR(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = (await req.json()) as BoletimRequest;
    const {
      clientId,
      since,
      until,
      tema,
      incluir = { posts: true, acoes: true, visitas: true },
      providerOverride,
      modelOverride,
      apiKeyOverride,
      reprocessMateriaId,
      briefing,
    } = body || ({} as BoletimRequest);

    if (!clientId) return errorResponse("clientId é obrigatório", 400);

    const today = new Date();
    const sevenAgo = new Date(today.getTime() - 7 * 86400000);
    const sinceIso = startOfDay(since || sevenAgo.toISOString());
    const untilIso = endOfDay(until || today.toISOString());

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: client } = await admin
      .from("clients")
      .select("nome_candidato, cargo_pretendido, partido, regiao_atuacao")
      .eq("id", clientId)
      .maybeSingle();

    // === COLETA: Posts (agregando por post_id na tabela comments) ===
    let postsAgg: any[] = [];
    if (incluir.posts !== false) {
      const { data: rows } = await admin
        .from("comments")
        .select("post_id, post_message, post_permalink_url, post_full_picture, platform, comment_created_time, sentiment")
        .eq("client_id", clientId)
        .not("post_id", "is", null)
        .gte("comment_created_time", sinceIso)
        .lte("comment_created_time", untilIso)
        .limit(5000);
      const map = new Map<string, any>();
      for (const r of rows || []) {
        if (!r.post_id) continue;
        let p = map.get(r.post_id);
        if (!p) {
          p = {
            post_id: r.post_id,
            message: r.post_message || "",
            url: r.post_permalink_url || null,
            picture: r.post_full_picture || null,
            platform: r.platform || null,
            first_seen: r.comment_created_time,
            total: 0, pos: 0, neg: 0, neu: 0,
          };
          map.set(r.post_id, p);
        }
        if (r.post_message && (!p.message || p.message.length < r.post_message.length)) p.message = r.post_message;
        if (r.post_permalink_url) p.url = r.post_permalink_url;
        if (r.post_full_picture) p.picture = r.post_full_picture;
        if (r.comment_created_time && (!p.first_seen || r.comment_created_time < p.first_seen)) p.first_seen = r.comment_created_time;
        p.total += 1;
        if (r.sentiment === "positive") p.pos += 1;
        else if (r.sentiment === "negative") p.neg += 1;
        else if (r.sentiment === "neutral") p.neu += 1;
      }
      postsAgg = Array.from(map.values()).sort((a, b) =>
        (a.first_seen || "").localeCompare(b.first_seen || ""),
      );
    }

    // === COLETA: Ações externas / agenda ===
    let acoes: any[] = [];
    if (incluir.acoes !== false) {
      const { data } = await admin
        .from("acoes_externas")
        .select("id, titulo, descricao, local, data_inicio, data_fim, cadastros_coletados, meta_cadastros, status, tag_nome")
        .eq("client_id", clientId)
        .gte("data_inicio", sinceIso)
        .lte("data_inicio", untilIso)
        .order("data_inicio", { ascending: true });
      acoes = data || [];
    }

    // === COLETA: Visitas registradas ===
    let visitas: any[] = [];
    if (incluir.visitas !== false) {
      const { data } = await admin
        .from("narrativa_visitas_realizadas")
        .select("id, uf, municipio, data_visita, temas_abordados, bairros_visitados, observacoes, resultado_percebido")
        .eq("client_id", clientId)
        .gte("data_visita", sinceIso.slice(0, 10))
        .lte("data_visita", untilIso.slice(0, 10))
        .order("data_visita", { ascending: true });
      visitas = data || [];
    }

    if (postsAgg.length === 0 && acoes.length === 0 && visitas.length === 0) {
      return errorResponse(
        `Sem postagens, ações ou visitas registradas entre ${fmtBR(sinceIso)} e ${fmtBR(untilIso)}. Ajuste o período ou registre atividades antes de gerar o boletim.`,
        400,
      );
    }

    // === Estatísticas ===
    const totalComments = postsAgg.reduce((s, p) => s + p.total, 0);
    const totalPos = postsAgg.reduce((s, p) => s + p.pos, 0);
    const totalNeg = postsAgg.reduce((s, p) => s + p.neg, 0);
    const stats = {
      posts: postsAgg.length,
      comentarios: totalComments,
      sentimento_positivo: totalPos,
      sentimento_negativo: totalNeg,
      acoes: acoes.length,
      visitas: visitas.length,
    };

    // === Material bruto para a IA ===
    // Trim defensivo: garante que não estoure TPM mesmo com semana cheia.
    const MAX_POSTS = 25;
    const postsTrim = postsAgg.slice(-MAX_POSTS);
    const postsTxt = postsTrim
      .map((p, i) => {
        const data = p.first_seen ? fmtBR(p.first_seen) : "?";
        const sent = p.total > 0 ? `(${p.pos}👍 ${p.neg}👎 de ${p.total} comentários)` : "";
        return `[P${i + 1}] ${data} · ${p.platform || "?"} · ${sent}\n"${(p.message || "(sem texto)").slice(0, 350)}"${p.url ? `\nURL: ${p.url}` : ""}`;
      })
      .join("\n\n");

    const acoesTxt = acoes
      .map((a, i) => {
        const data = a.data_inicio ? fmtBR(a.data_inicio) : "?";
        const meta = a.meta_cadastros ? ` (meta: ${a.cadastros_coletados || 0}/${a.meta_cadastros} cadastros)` : "";
        return `[A${i + 1}] ${data} · ${a.titulo}${a.local ? ` em ${a.local}` : ""}${meta}${a.descricao ? ` — ${String(a.descricao).slice(0, 200)}` : ""}`;
      })
      .join("\n");

    const visitasTxt = visitas
      .map((v, i) => {
        const temas = Array.isArray(v.temas_abordados) ? v.temas_abordados.join(", ") : "";
        const bairros = Array.isArray(v.bairros_visitados) ? v.bairros_visitados.join(", ") : "";
        return `[V${i + 1}] ${v.data_visita} · ${v.municipio || "?"}/${v.uf || "?"}${bairros ? ` · bairros: ${bairros}` : ""}${temas ? ` · temas: ${temas}` : ""}${v.observacoes ? ` — ${String(v.observacoes).slice(0, 200)}` : ""}`;
      })
      .join("\n");

    const candidato = client?.nome_candidato || "o candidato";
    const cargo = client?.cargo_pretendido || "candidato";
    const periodoLabel = `${fmtBR(sinceIso)} a ${fmtBR(untilIso)}`;

    const systemPrompt = `Você é um redator político brasileiro experiente. Escreva um BOLETIM SEMANAL de ${candidato} (${cargo}) cobrindo o período de ${periodoLabel}.

REGRAS DE CONTEÚDO:
- USE APENAS o material da semana fornecido abaixo (postagens, ações, visitas). NÃO invente nada.
- NÃO use clichês como "agradeceu", "reafirmou compromisso", "destacou a importância". Só fatos concretos: o que foi feito, onde, com quem, quanto.
- Se um post não tem fato concreto (foi só agradecimento), não inclua.

ESTRUTURA OBRIGATÓRIA EM MARKDOWN:
1. Abra com 1 parágrafo curto: "**${periodoLabel}** — Resumo da semana de ${candidato}..." apresentando os 2 ou 3 destaques.
2. Bloco "## Em números" com bullets: total de postagens, comentários recebidos, ações de rua, visitas. Use os números reais fornecidos.
3. Seções por TEMA detectado nos posts/ações (ex: "## Saúde", "## Mobilidade", "## Educação", "## Agenda nas comunidades"). Em cada uma, 2 a 4 bullets curtos com fato + local/data + link entre parênteses quando houver URL (formato: "[ver post](URL)"). Cada bullet começa em letra maiúscula.
4. Encerre com "## Próxima semana" listando 1 a 3 ações ou compromissos derivados do material (visita marcada, evento, etc) — ou frase neutra se não houver.

FORMATAÇÃO:
- Use markdown completo: '## ' para seções, '- ' para bullets, '**negrito**' para datas-chave, '[texto](url)' para links.
- Linha em branco entre blocos.
- Português do Brasil.

Retorne JSON ESTRITO:
{
  "titulo": "Boletim semanal — ${periodoLabel}",
  "subtitulo": "1 frase resumindo a semana",
  "corpo": "markdown completo do boletim",
  "destaques": ["3 a 5 frases curtas com os principais fatos"],
  "avisos": "string vazia ou observação relevante"
}
Sem markdown ao redor do JSON, sem comentários extras.`;

    const userPrompt = `PERÍODO: ${periodoLabel}
CANDIDATO: ${candidato} — ${cargo}${client?.partido ? " (" + client.partido + ")" : ""}
REGIÃO: ${client?.regiao_atuacao || "não informada"}
${tema ? `\nTEMA/FOCO ESPECÍFICO: ${tema}\n` : ""}${
      reprocessMateriaId && briefing && briefing.trim().length >= 5
        ? `\n============ ORIENTAÇÃO DE CORREÇÃO (PRIORIDADE MÁXIMA) ============\n"""${briefing.trim()}"""\n`
        : ""
    }
============ ESTATÍSTICAS DA SEMANA ============
- Postagens: ${stats.posts}
- Comentários recebidos: ${stats.comentarios} (👍${stats.sentimento_positivo} / 👎${stats.sentimento_negativo})
- Ações externas: ${stats.acoes}
- Visitas registradas: ${stats.visitas}

============ POSTAGENS DA SEMANA ============
${postsTxt || "(nenhuma postagem registrada no período)"}

============ AÇÕES EXTERNAS / AGENDA ============
${acoesTxt || "(nenhuma ação registrada)"}

============ VISITAS REALIZADAS ============
${visitasTxt || "(nenhuma visita registrada)"}`;

    const baseConfig = await getClientLLMConfig(admin, clientId);
    const llmConfig: any = providerOverride
      ? { provider: providerOverride, model: modelOverride || undefined, apiKey: apiKeyOverride || baseConfig.apiKey }
      : { ...baseConfig, model: modelOverride || baseConfig.model };
    if (!llmConfig.model) llmConfig.model = baseConfig.model;
    // Auto-upgrade Groq: o default `llama-3.1-8b-instant` tem TPM de 6000 e estoura
    // facilmente com payloads de boletim. Sobe para 70b-versatile (12k TPM).
    if (llmConfig.provider === "groq" && !modelOverride && (!llmConfig.model || llmConfig.model.includes("8b-instant"))) {
      llmConfig.model = "llama-3.3-70b-versatile";
    }

    const resp = await callLLM(llmConfig, {
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      maxTokens: 3500,
      temperature: 0.45,
    });

    // Parse defensivo
    let parsed: any;
    try {
      const cleaned = resp.content.replace(/```json\s*/gi, "").replace(/```/g, "").trim();
      const start = cleaned.indexOf("{");
      const end = cleaned.lastIndexOf("}");
      const slice = cleaned.slice(start, end + 1);
      const sanitize = (raw: string) => {
        let out = ""; let inStr = false; let esc = false;
        for (let i = 0; i < raw.length; i++) {
          const ch = raw[i];
          if (esc) { out += ch; esc = false; continue; }
          if (ch === "\\") { out += ch; esc = true; continue; }
          if (ch === '"') { inStr = !inStr; out += ch; continue; }
          if (inStr) {
            if (ch === "\n") { out += "\\n"; continue; }
            if (ch === "\r") { out += "\\r"; continue; }
            if (ch === "\t") { out += "\\t"; continue; }
            const c = ch.charCodeAt(0);
            if (c < 0x20) { out += "\\u" + c.toString(16).padStart(4, "0"); continue; }
          }
          out += ch;
        }
        return out;
      };
      try { parsed = JSON.parse(slice); } catch { parsed = JSON.parse(sanitize(slice)); }
    } catch (e) {
      console.error("[ic-write-boletim] parse error:", e, resp.content?.slice(0, 400));
      return errorResponse("LLM retornou formato inválido", 500);
    }

    const fontesPayload = {
      tipo: "boletim",
      periodo: { since: sinceIso, until: untilIso },
      stats,
      posts_referenciados: postsAgg.map((p, i) => ({
        label: `P${i + 1}`,
        post_id: p.post_id,
        platform: p.platform,
        url: p.url,
        picture: p.picture,
        message: (p.message || "").slice(0, 280),
        first_seen: p.first_seen,
        total: p.total, pos: p.pos, neg: p.neg, neu: p.neu,
      })),
      acoes_referenciadas: acoes.map((a) => ({
        id: a.id, titulo: a.titulo, local: a.local, data_inicio: a.data_inicio,
        cadastros: a.cadastros_coletados, meta: a.meta_cadastros,
      })),
      visitas_referenciadas: visitas.map((v) => ({
        id: v.id, municipio: v.municipio, uf: v.uf, data_visita: v.data_visita,
        bairros: v.bairros_visitados, temas: v.temas_abordados,
      })),
    };

    const metadataPayload = {
      avisos: parsed.avisos || "",
      destaques: Array.isArray(parsed.destaques) ? parsed.destaques : [],
      provider: resp.provider,
      model: resp.model,
      reprocessed_from: reprocessMateriaId || null,
    };

    let saved: any = null;
    if (reprocessMateriaId) {
      const { data: current } = await admin
        .from("materias_geradas")
        .select("*").eq("id", reprocessMateriaId).eq("client_id", clientId).maybeSingle();
      if (!current) return errorResponse("Boletim a reprocessar não encontrado", 404);
      const currentVersao = current.versao || 1;
      await admin.from("materias_versions").insert({
        materia_id: current.id,
        client_id: clientId,
        versao: currentVersao,
        provider: current.provider || current.metadata?.provider || null,
        model: current.model || current.metadata?.model || null,
        titulo: current.titulo,
        subtitulo: current.subtitulo,
        corpo: current.corpo,
        fontes: current.fontes || {},
        prompt_input: current.prompt_input,
        metadata: current.metadata || {},
      });
      const { data } = await admin
        .from("materias_geradas")
        .update({
          tipo: "boletim",
          tom: current.tom || "jornalistico",
          tema: tema ?? current.tema ?? null,
          titulo: (parsed.titulo || `Boletim ${periodoLabel}`).slice(0, 300),
          subtitulo: parsed.subtitulo ? String(parsed.subtitulo).slice(0, 500) : null,
          corpo: parsed.corpo || "",
          fontes: fontesPayload,
          status: "rascunho",
          prompt_input: briefing || `Boletim semanal ${periodoLabel}`,
          metadata: metadataPayload,
          versao: currentVersao + 1,
          provider: resp.provider,
          model: resp.model,
          updated_at: new Date().toISOString(),
        })
        .eq("id", reprocessMateriaId)
        .select("*").maybeSingle();
      saved = data;
    } else {
      const { data, error } = await admin
        .from("materias_geradas")
        .insert({
          client_id: clientId,
          tipo: "boletim",
          tom: "jornalistico",
          tema: tema ?? null,
          titulo: (parsed.titulo || `Boletim ${periodoLabel}`).slice(0, 300),
          subtitulo: parsed.subtitulo ? String(parsed.subtitulo).slice(0, 500) : null,
          corpo: parsed.corpo || "",
          fontes: fontesPayload,
          status: "rascunho",
          prompt_input: `Boletim semanal ${periodoLabel}`,
          metadata: metadataPayload,
          provider: resp.provider,
          model: resp.model,
          versao: 1,
        })
        .select("*").maybeSingle();
      if (error) console.error("[ic-write-boletim] save error:", error);
      saved = data;
    }

    return jsonResponse({
      boletim: parsed,
      saved,
      provider: resp.provider,
      model: resp.model,
      stats,
      periodo: { since: sinceIso, until: untilIso },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("ic-write-boletim error:", msg);
    return errorResponse(msg);
  }
});