import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * narrativa-gerar
 * A partir do dossiê (dados_brutos + analise) e do perfil do candidato,
 * usa Lovable AI para gerar:
 *  - 3 versões de discurso (popular / técnico / emocional)
 *  - 3 ataques 3-camadas (Tema -> Falha do gestor -> Solução do candidato)
 *  - 3 manchetes para reels/cards
 *  - 1 roteiro de visita estratégica (foco emocional + bairro sugerido) — legado
 *  - roteiro_estrategico: 4–6 paradas reais (local, objetivo, emoção, fala, imagem)
 *
 * Body: { dossie_id }
 */

const SUPA_URL = Deno.env.get("SUPABASE_URL")!;
const SUPA_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-2.5-flash";

function buildSystemPrompt(perfil: any) {
  const bandeiras = Array.isArray(perfil?.bandeiras) ? perfil.bandeiras.join(", ") : "";
  return `Você é um estrategista político brasileiro especializado em discursos de campanha territorial.

CANDIDATO:
- Nome: ${perfil?.nome_candidato || "—"}
- Cargo pretendido: ${perfil?.cargo_pretendido || "—"}
- Partido: ${perfil?.partido || "—"}
- Bandeiras: ${bandeiras || "—"}
- Tom de voz preferido: ${perfil?.tom_voz || "popular"}
- Estilo: ${perfil?.estilo_discurso || "—"}
- Proposta central: ${perfil?.proposta_central || "—"}

REGRAS OBRIGATÓRIAS:
- Fale SEMPRE em português brasileiro coloquial.
- Use os DADOS REAIS do dossiê — nunca invente números nem nomes.
- Quando citar uma dor, conecte-a EMOCIONALMENTE com a vida cotidiana do morador.
- O candidato é alguém que VEM DE BAIXO, conhece a realidade, fala direto.
- Nunca seja genérico. Sempre mencione o NOME da cidade.
- Saída deve ser estritamente um JSON válido seguindo o schema do tool.`;
}

function buildUserPrompt(dossie: any) {
  const meta = dossie.dados_brutos?.meta || {};
  const ibge = dossie.dados_brutos?.ibge || {};
  const tse = dossie.dados_brutos?.tse_local || {};
  const midia = dossie.dados_brutos?.midia_gdelt || {};
  const analise = dossie.analise || {};
  const indicadores = ibge?.indicadores || {};
  const indicadoresEstado = ibge?.indicadores_estado || {};

  // Lista compacta de indicadores reais com comparação ao estado
  const linhasIndicadores: string[] = [];
  for (const [id, data] of Object.entries(indicadores)) {
    const d: any = data;
    if (!d) continue;
    const e: any = indicadoresEstado[id];
    const partes = [`- ${d.label}: ${d.valor} ${d.unidade} (${d.ano}, ${d.fonte})`];
    if (e && Number.isFinite(e.valor)) {
      const diff = d.valor - e.valor;
      const sinal = diff > 0 ? "+" : "";
      partes.push(`  → média ${meta.uf}: ${e.valor} (${sinal}${diff.toFixed(2)})`);
    }
    linhasIndicadores.push(partes.join("\n"));
  }

  // Evidências numéricas das dores (já agregadas pela narrativa-analise)
  const evidenciasDores = (analise?.dores || [])
    .filter((d: any) => d.tem_dados && d.evidencias?.length)
    .map((d: any) => {
      const evs = d.evidencias.map((e: any) => {
        const cmp = e.valor_estado != null
          ? ` vs ${e.valor_estado.toFixed(2)} (média ${meta.uf}, delta ${e.delta_pct?.toFixed(1)}%)`
          : "";
        return `   • ${e.titulo}: ${e.valor_cidade} ${e.unidade}${cmp} [${e.fonte}, ${e.ano}]`;
      }).join("\n");
      return `${d.area.toUpperCase()} — ${d.classificacao} (score ${d.pain_score}):\n${evs}`;
    }).join("\n\n");

  const bairrosReais = (analise?.bairros_inferidos || []).join(", ");
  const topLocaisLista = (analise?.top_locais_criticos || []).slice(0, 8);
  const topLocais = topLocaisLista
    .map((l: any) => `   - ${l.bairro}${l.nome_local ? ` (${l.nome_local})` : ""} | zona ${l.zona} | eleito teve ${l.pct_eleito_zona ?? "?"}%`)
    .join("\n");
  const doresPrioritarias = (analise?.dores || [])
    .filter((d: any) => ["explosiva", "latente"].includes(String(d.classificacao || "").toLowerCase()))
    .slice(0, 4)
    .map((d: any) => `${d.area}: ${d.classificacao} (score ${d.pain_score})`)
    .join(" | ");

  return `DOSSIÊ DA CIDADE
Cidade: ${meta.municipio} / ${meta.uf}
Região: ${ibge?.base?.regiao ?? "—"}
Microrregião: ${ibge?.base?.microrregiao ?? "—"}

INDICADORES MUNICIPAIS REAIS (com comparação ao estado de ${meta.uf}):
${linhasIndicadores.join("\n") || "(sem dados IBGE)"}

EVIDÊNCIAS NUMÉRICAS DAS DORES (use ESTES números nos discursos):
${evidenciasDores || "(sem evidências numéricas — use TSE e mídia)"}

TOP CANDIDATOS LOCAIS (TSE):
${(tse?.top_por_cargo_ano || []).slice(0, 4).map((b: any) =>
  `- ${b.ano} ${b.cargo}: ${b.top.slice(0, 3).map((c: any) => `${c.nome} (${c.partido}) ${c.votos} votos`).join(" | ")}`,
).join("\n") || "(sem dados)"}

PARTIDOS DOMINANTES:
${(tse?.partidos_dominantes || []).slice(0, 5).map((p: any) => `${p.partido}: ${p.votos}`).join(", ") || "—"}

MÍDIA RECENTE (últimos 30 dias, ${midia?.total ?? 0} artigos, tom médio ${midia?.tom_medio?.toFixed?.(2) ?? "—"}):
${(midia?.artigos || []).slice(0, 8).map((a: any) => `- "${a.titulo}" (${a.fonte})`).join("\n") || "(sem cobertura)"}

Oportunidade política: ${analise?.oportunidade?.nivel} (score ${analise?.oportunidade?.oportunidade_score}). Dor principal: ${analise?.oportunidade?.dor_principal}. Força do gestor atual: ${analise?.oportunidade?.forca_gestor_atual ?? "—"}%.

INSTRUÇÕES CRÍTICAS:
- USE OS NÚMEROS REAIS acima nos discursos (ex: "esgoto chega a só 58% das casas, contra 70% da média do estado")
- Quando houver delta vs estado, EXPLORE o contraste — é arma política poderosa
- Cite o ano dos dados quando recente (não cite anos de 2010 ou anteriores como se fossem atuais)
- Se um indicador NÃO tiver dado, NÃO invente — fale do que tem
- Os "ataques 3-camadas" devem usar números específicos da cidade
- BAIRROS REAIS onde o prefeito atual foi mais fraco em 2024 (use estes nomes EXATOS no roteiro):
${topLocais || "(sem dados zonais)"}
- Bairros candidatos para o roteiro_visita.bairro_sugerido: ${bairrosReais || "(use região genérica como 'periferia')"}
- NUNCA invente nome de bairro. Se a lista acima estiver vazia, use "região periférica" genericamente.

ROTEIRO ESTRATÉGICO (obrigatório):
- Gere de 4 a 6 paradas REAIS de campanha.
- Cada parada DEVE usar um dos bairros/locais da lista "TOP CANDIDATOS LOCAIS" acima — NUNCA invente.
- Cada parada cruza um local crítico com UMA dor prioritária (${doresPrioritarias || "use as dores disponíveis"}).
- Distribua as paradas entre dores diferentes (não todas saúde, não todas educação).
- "imagem_sugerida" deve ser concreta e fotografável (ex: "candidato sentado no meio-fio conversando com idoso na fila do posto", não "símbolo da esperança").
- "fala_chave" é UMA frase curta (max 25 palavras) que o candidato fala olhando no olho.
- "duracao_min" entre 30 e 90 minutos por parada.

Gere o pacote completo de munição política para esta cidade.`;
}

const TOOL_SCHEMA = {
  type: "function",
  function: {
    name: "gerar_pacote_narrativa",
    description: "Gera o pacote completo de discurso, ataques, manchetes e roteiro de visita.",
    parameters: {
      type: "object",
      properties: {
        discursos: {
          type: "object",
          properties: {
            popular: { type: "string", description: "Discurso linguagem do povo, 200-300 palavras." },
            tecnico: { type: "string", description: "Discurso com dados, propostas claras, 200-300 palavras." },
            emocional: { type: "string", description: "Discurso visceral, conta uma história, 200-300 palavras." },
          },
          required: ["popular", "tecnico", "emocional"],
          additionalProperties: false,
        },
        ataques_3_camadas: {
          type: "array",
          minItems: 3,
          maxItems: 3,
          items: {
            type: "object",
            properties: {
              tema: { type: "string" },
              falha_do_gestor: { type: "string" },
              solucao_proposta: { type: "string" },
            },
            required: ["tema", "falha_do_gestor", "solucao_proposta"],
            additionalProperties: false,
          },
        },
        manchetes_reels: {
          type: "array",
          minItems: 3,
          maxItems: 5,
          items: { type: "string", description: "Frase curta tipo manchete (max 80 chars)." },
        },
        roteiro_visita: {
          type: "object",
          properties: {
            foco: { type: "string", description: "Tema central da visita." },
            emocao_alvo: { type: "string", description: "Emoção que queremos despertar." },
            bairro_sugerido: { type: "string", description: "Bairro/região onde a dor é mais forte." },
            primeira_frase: { type: "string", description: "Como o candidato deve abrir a fala." },
            mensagem_central: { type: "string" },
            chamada_acao: { type: "string" },
          },
          required: ["foco", "emocao_alvo", "bairro_sugerido", "primeira_frase", "mensagem_central", "chamada_acao"],
          additionalProperties: false,
        },
        roteiro_estrategico: {
          type: "array",
          minItems: 4,
          maxItems: 6,
          description: "Agenda real de paradas de campanha — cada parada cruza um local crítico com uma dor.",
          items: {
            type: "object",
            properties: {
              ordem: { type: "number", description: "1, 2, 3..." },
              bairro: { type: "string", description: "Bairro REAL da lista de top locais críticos." },
              local: { type: "string", description: "Local concreto da parada (escola, UBS, praça, comércio)." },
              area_dor: { type: "string", enum: ["saude", "educacao", "seguranca", "infra", "economia", "social"] },
              objetivo: { type: "string", description: "O que o candidato vai conquistar nessa parada (uma frase)." },
              emocao: { type: "string", description: "Emoção alvo: indignação, esperança, acolhimento, urgência, etc." },
              fala_chave: { type: "string", description: "UMA frase curta (max 25 palavras) que o candidato vai dizer." },
              imagem_sugerida: { type: "string", description: "Cena fotografável concreta para reels/foto." },
              duracao_min: { type: "number", description: "Duração estimada da parada em minutos (30-90)." },
            },
            required: ["ordem", "bairro", "local", "area_dor", "objetivo", "emocao", "fala_chave", "imagem_sugerida", "duracao_min"],
            additionalProperties: false,
          },
        },
      },
      required: ["discursos", "ataques_3_camadas", "manchetes_reels", "roteiro_visita", "roteiro_estrategico"],
      additionalProperties: false,
    },
  },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY ausente");
    const { dossie_id } = await req.json();
    if (!dossie_id) {
      return new Response(JSON.stringify({ error: "dossie_id obrigatório" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supa = createClient(SUPA_URL, SUPA_KEY);

    const { data: dossie, error: dErr } = await supa
      .from("narrativa_dossies")
      .select("*")
      .eq("id", dossie_id)
      .maybeSingle();
    if (dErr || !dossie) throw new Error("Dossiê não encontrado");

    const { data: perfil } = await supa
      .from("narrativa_perfil_candidato")
      .select("*")
      .eq("client_id", dossie.client_id)
      .maybeSingle();

    await supa.from("narrativa_dossies").update({ status: "gerando" }).eq("id", dossie_id);

    const aiRes = await fetch(AI_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: buildSystemPrompt(perfil) },
          { role: "user", content: buildUserPrompt(dossie) },
        ],
        tools: [TOOL_SCHEMA],
        tool_choice: { type: "function", function: { name: "gerar_pacote_narrativa" } },
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      if (aiRes.status === 429) {
        await supa.from("narrativa_dossies").update({ status: "erro", erro_msg: "Limite de requisições atingido. Tente novamente em alguns instantes." }).eq("id", dossie_id);
        return new Response(JSON.stringify({ error: "Limite de requisições da IA. Aguarde e tente de novo." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiRes.status === 402) {
        await supa.from("narrativa_dossies").update({ status: "erro", erro_msg: "Créditos da IA esgotados." }).eq("id", dossie_id);
        return new Response(JSON.stringify({ error: "Créditos da IA esgotados. Adicione créditos no workspace." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI gateway: ${aiRes.status} ${errText}`);
    }

    const aiJson = await aiRes.json();
    const tcArgs = aiJson?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!tcArgs) throw new Error("IA não retornou tool_call estruturada");
    const conteudos = JSON.parse(tcArgs);

    await supa
      .from("narrativa_dossies")
      .update({
        conteudos,
        status: "pronto",
        generated_at: new Date().toISOString(),
      })
      .eq("id", dossie_id);

    return new Response(JSON.stringify({ dossie_id, conteudos }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "erro desconhecido";
    console.error("narrativa-gerar error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});