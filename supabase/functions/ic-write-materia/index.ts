import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { callLLM, getClientLLMConfig } from "../_shared/llm-router.ts";
import { corsHeaders, errorResponse, jsonResponse } from "../_shared/ic-utils.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type Tipo = "press_release" | "blog" | "nota_oficial" | "boletim";
type Tom = "formal" | "jornalistico" | "popular" | "tecnico";

interface WriteRequest {
  clientId: string;
  tipo?: Tipo;
  tom?: Tom;
  tema?: string;
  briefing: string; // o que o usuário quer escrever
  incluirMemoriaUltimosDias?: number; // default 30
  salvarComo?: "rascunho" | null; // se "rascunho", salva no histórico
  transcriptionId?: string; // se informado, usa a transcrição INTEIRA como fonte primária
}

const TIPO_DESC: Record<Tipo, string> = {
  press_release:
    "Press release de imprensa: lead com 5W, 2 a 4 parágrafos curtos, citação do candidato entre aspas no meio.",
  blog:
    "Post de blog autoral, primeira pessoa, tom mais opinativo, 4 a 6 parágrafos, com subtítulos curtos se ajudar.",
  nota_oficial:
    "Nota oficial do gabinete/mandato, 1 a 3 parágrafos, tom formal e institucional, posicionamento claro.",
  boletim:
    "Boletim semanal de prestação de contas, lista de 4 a 8 ações com bullets curtos + pequena introdução e fechamento.",
};

const TOM_DESC: Record<Tom, string> = {
  formal: "formal, institucional, sem gírias",
  jornalistico: "jornalístico, neutro, com lead em terceira pessoa",
  popular: "popular, próximo, com palavras simples",
  tecnico: "técnico, com dados e referências quando houver",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = (await req.json()) as WriteRequest;
    const {
      clientId,
      tipo = "press_release",
      tom = "jornalistico",
      tema,
      briefing,
      incluirMemoriaUltimosDias = 60,
      salvarComo = "rascunho",
      transcriptionId,
    } = body || ({} as WriteRequest);

    if (!clientId) return errorResponse("clientId é obrigatório", 400);
    if ((!briefing || briefing.trim().length < 10) && !transcriptionId)
      return errorResponse(
        "Informe um briefing OU selecione uma transcrição-fonte.",
        400
      );

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Carrega contexto do cliente
    const { data: client } = await admin
      .from("clients")
      .select("nome_candidato, cargo_pretendido, partido, regiao_atuacao")
      .eq("id", clientId)
      .maybeSingle();

    // Transcrição-fonte (INTEIRA) — fonte prioritária quando informada
    let transcricaoFonte: any = null;
    if (transcriptionId) {
      const { data: tr } = await admin
        .from("ic_transcriptions")
        .select("id, full_text, filename, created_at, segments")
        .eq("id", transcriptionId)
        .eq("client_id", clientId)
        .maybeSingle();
      if (tr) {
        const fromSegs = Array.isArray(tr.segments)
          ? tr.segments.map((s: any) => s?.text ?? "").join(" ").trim()
          : "";
        transcricaoFonte = {
          ...tr,
          full_text: tr.full_text || fromSegs,
        };
      }
    }

    // Memória relevante (últimos N dias) — filtra por tema se fornecido
    const sinceIso = new Date(Date.now() - incluirMemoriaUltimosDias * 86400000).toISOString();
    let memQuery = admin
      .from("candidate_knowledge")
      .select("id, tipo, tema, texto, contexto, entidades, source_type, source_date, created_at")
      .eq("client_id", clientId)
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false })
      .limit(40);
    if (tema) memQuery = memQuery.ilike("tema", `%${tema.toLowerCase()}%`);
    const { data: memoria } = await memQuery;

    // Últimas transcrições (apenas como contexto secundário, se NÃO houver fonte específica)
    const { data: transcricoes } = transcricaoFonte
      ? { data: [] as any[] }
      : await admin
          .from("ic_transcriptions")
          .select("id, full_text, created_at, filename")
          .eq("client_id", clientId)
          .order("created_at", { ascending: false })
          .limit(5);

    // Posts recentes (resumo)
    const { data: posts } = await admin
      .from("posts")
      .select("id, message, posted_at")
      .eq("client_id", clientId)
      .not("message", "is", null)
      .order("posted_at", { ascending: false })
      .limit(8);

    const memoriaTxt = (memoria || [])
      .slice(0, 30)
      .map((m: any) => `- [${m.tipo}${m.tema ? "/" + m.tema : ""}] ${m.texto}`)
      .join("\n");
    const transcrTxt = (transcricoes || [])
      .map((t: any, i: number) => `# Transcrição ${i + 1} (${t.created_at?.slice(0, 10)})\n${(t.full_text || "").slice(0, 800)}`)
      .join("\n\n");
    // Transcrição-fonte é incluída INTEIRA (até 30k chars) sem fragmentar
    const fonteTxt = transcricaoFonte
      ? `# TRANSCRIÇÃO-FONTE (INTEIRA — ${transcricaoFonte.filename || "sem nome"} — ${transcricaoFonte.created_at?.slice(0, 10)})\n${(transcricaoFonte.full_text || "").slice(0, 30000)}`
      : "";
    const postsTxt = (posts || [])
      .map((p: any) => `- ${(p.message || "").slice(0, 220)}`)
      .join("\n");

    const candidato = client?.nome_candidato || "o candidato";
    const cargo = client?.cargo_pretendido || "candidato";

    const systemPrompt = `Você é um redator político brasileiro experiente. Vai escrever uma matéria sobre ${candidato} (${cargo}).

REGRAS:
- NUNCA invente fatos, números ou nomes que não estejam no contexto fornecido.
- Use APENAS o que está na TRANSCRIÇÃO-FONTE (quando houver), MEMÓRIA, TRANSCRIÇÕES e POSTS abaixo.
${transcricaoFonte ? "- A TRANSCRIÇÃO-FONTE é a base PRINCIPAL da matéria. Trate-a como o discurso/entrevista que originou esta matéria — preserve o contexto completo, não recorte ideias soltas. Memória e posts são apenas contexto complementar.\n" : ""}
- Se o briefing pedir algo que não está no contexto, diga isso no campo "avisos".
- Português do Brasil.
- Formato pedido: ${TIPO_DESC[tipo]}
- Tom: ${TOM_DESC[tom]}

Retorne JSON ESTRITO no formato:
{
  "titulo": "...",
  "subtitulo": "...",
  "corpo": "texto completo da matéria, com quebras de parágrafo \\n\\n",
  "fontes_usadas": ["id_memoria_1", ...],
  "avisos": "se faltou alguma informação, descreva aqui — senão string vazia"
}

Sem markdown, sem comentários fora do JSON.`;

    const briefingFinal =
      briefing && briefing.trim().length >= 10
        ? briefing.trim()
        : transcricaoFonte
        ? "Escreva uma matéria a partir da TRANSCRIÇÃO-FONTE abaixo. Identifique o tema central, a mensagem principal e os fatos relevantes — e construa a matéria em torno disso."
        : "";

    const userPrompt = `BRIEFING DO USUÁRIO:
"""
${briefingFinal}
"""

CANDIDATO: ${candidato} — ${cargo}${client?.partido ? " (" + client.partido + ")" : ""}
REGIÃO: ${client?.regiao_atuacao || "não informada"}

${fonteTxt ? "============ TRANSCRIÇÃO-FONTE (BASE PRINCIPAL — USE INTEGRALMENTE) ============\n" + fonteTxt + "\n\n" : ""}
============ MEMÓRIA ESTRUTURADA (fatos extraídos de falas/posts/comentários) ============
${memoriaTxt || "(memória vazia)"}

============ TRANSCRIÇÕES RECENTES ============
${transcrTxt || "(nenhuma)"}

============ POSTS RECENTES ============
${postsTxt || "(nenhum)"}`;

    const llmConfig = await getClientLLMConfig(admin, clientId);
    const resp = await callLLM(llmConfig, {
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      maxTokens: 2800,
      temperature: 0.5,
    });

    let parsed: any;
    try {
      const cleaned = resp.content.replace(/```json\s*/gi, "").replace(/```/g, "").trim();
      const start = cleaned.indexOf("{");
      const end = cleaned.lastIndexOf("}");
      parsed = JSON.parse(cleaned.slice(start, end + 1));
    } catch (e) {
      console.error("[ic-write-materia] parse error:", e, resp.content?.slice(0, 400));
      return errorResponse("LLM retornou formato inválido", 500);
    }

    let saved: any = null;
    if (salvarComo === "rascunho") {
      const { data, error } = await admin
        .from("materias_geradas")
        .insert({
          client_id: clientId,
          tipo,
          tom,
          tema: tema ?? null,
          titulo: (parsed.titulo || "Sem título").slice(0, 300),
          subtitulo: parsed.subtitulo ? String(parsed.subtitulo).slice(0, 500) : null,
          corpo: parsed.corpo || "",
          fontes: {
            memoria_ids: parsed.fontes_usadas || [],
            transcription_id: transcricaoFonte?.id ?? null,
          },
          transcription_id: transcricaoFonte?.id ?? null,
          status: "rascunho",
          prompt_input: briefingFinal,
          metadata: { avisos: parsed.avisos || "", provider: resp.provider, model: resp.model },
        })
        .select("*")
        .maybeSingle();
      if (error) console.error("[ic-write-materia] save error:", error);
      saved = data;
    }

    return jsonResponse({
      materia: parsed,
      saved,
      provider: resp.provider,
      contexto_usado: {
        memoria: memoria?.length || 0,
        transcricoes: transcricoes?.length || 0,
        posts: posts?.length || 0,
        transcricao_fonte: transcricaoFonte ? { id: transcricaoFonte.id, filename: transcricaoFonte.filename } : null,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("ic-write-materia error:", msg);
    return errorResponse(msg);
  }
});