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

export function normBairro(s: string): string {
  return String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function buildContextoWebBlock(ctx: any): string {
  if (!ctx) return "";
  const linhas: string[] = [];
  linhas.push("CONTEXTO RECENTE DA WEB (busca em tempo real — Wikipedia, Google News, sites .gov.br):");
  if (ctx.wiki?.extrato) {
    linhas.push(`📖 Wikipedia: ${ctx.wiki.extrato}`);
  }
  // Seções ricas da Wikipedia (História, Cultura, Economia, Personalidades, etc.)
  const secoes = ctx?.wiki_secoes?.secoes;
  if (secoes && typeof secoes === "object") {
    const entradas = Object.entries(secoes).slice(0, 8);
    if (entradas.length) {
      linhas.push(`\n📚 Páginas de conhecimento local (Wikipedia — ${ctx.wiki_secoes.titulo_pagina}):`);
      for (const [titulo, conteudo] of entradas) {
        linhas.push(`\n  ▸ ${titulo}:\n  ${String(conteudo).slice(0, 700)}`);
      }
    }
  }
  const noticias = Array.isArray(ctx.noticias) ? ctx.noticias : [];
  if (noticias.length) {
    linhas.push(`\n📰 Notícias recentes (${noticias.length}, últimos 90 dias):`);
    for (const n of noticias.slice(0, 8)) {
      linhas.push(`  - [${n.data || "?"}] "${n.titulo}" (${n.fonte})${n.resumo ? ` — ${n.resumo.slice(0, 160)}` : ""}`);
    }
  }
  const oficiais = Array.isArray(ctx.oficiais) ? ctx.oficiais : [];
  if (oficiais.length) {
    linhas.push(`\n🏛️ Fontes oficiais (.gov.br):`);
    for (const o of oficiais.slice(0, 5)) {
      linhas.push(`  - [${o.data || "?"}] "${o.titulo}" (${o.fonte})`);
    }
  }
  if (linhas.length === 1) return ""; // só o cabeçalho — sem conteúdo útil
  linhas.push("\nUSE este contexto para citar acontecimentos REAIS e RECENTES da cidade nos discursos e ataques, e para gerar CURIOSIDADES & CULTURA LOCAL com base nos textos da Wikipedia acima. Não invente fatos — só use o que está aqui ou nos indicadores numéricos acima.\n");
  return linhas.join("\n") + "\n";
}

/**
 * Sanitiza o roteiro estratégico retornado pela IA:
 *  - descarta paradas sem bairro
 *  - descarta paradas cujo "bairro" bate com nome de político (lista TSE)
 *  - descarta paradas com bairro fora da lista de bairros válidos
 *  - renumera o campo `ordem` sequencialmente (1..N) nas paradas remanescentes
 *
 * `bairrosValidos` e `nomesPoliticos` devem conter strings já normalizadas
 * via `normBairro`.
 */
export function sanitizeRoteiro(
  roteiro: any[],
  bairrosValidos: Set<string>,
  nomesPoliticos: Set<string>,
): { paradas: any[]; descartadas: number; total: number } {
  const total = Array.isArray(roteiro) ? roteiro.length : 0;
  if (!Array.isArray(roteiro)) return { paradas: [], descartadas: 0, total: 0 };

  const filtradas = roteiro.filter((p: any) => {
    const b = normBairro(p?.bairro || "");
    if (!b) return false;
    if (nomesPoliticos.has(b)) return false;
    for (const valido of bairrosValidos) {
      if (!valido) continue;
      if (b === valido || b.includes(valido) || valido.includes(b)) return true;
    }
    return false;
  });

  const paradas = filtradas.map((p: any, i: number) => ({ ...p, ordem: i + 1 }));
  return { paradas, descartadas: total - paradas.length, total };
}

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

function buildUserPrompt(dossie: any, ranking?: Record<string, any>, contextoWeb?: any) {
  const meta = dossie.dados_brutos?.meta || {};
  const ibge = dossie.dados_brutos?.ibge || {};
  const tse = dossie.dados_brutos?.tse_local || {};
  const midia = dossie.dados_brutos?.midia_gdelt || {};
  const analise = dossie.analise || {};
  const indicadores = ibge?.indicadores || {};
  const indicadoresEstado = ibge?.indicadores_estado || {};

  // Lista compacta de indicadores reais com comparação ao estado
  // FILTRO: descarta dados com mais de 3 anos — narrativa só usa material fresco.
  const ANO_LIMITE = new Date().getFullYear() - 3;
  const indicadoresIgnorados: string[] = [];
  const linhasIndicadores: string[] = [];
  for (const [id, data] of Object.entries(indicadores)) {
    const d: any = data;
    if (!d) continue;
    // Pula indicadores antigos demais (Censo 2010, IDH 2010, etc.)
    if (d.ano && d.ano < ANO_LIMITE) {
      indicadoresIgnorados.push(`${d.label} (${d.ano})`);
      continue;
    }
    // Comparativo estadual via RPC tem prioridade (ranking + percentil)
    const r: any = ranking?.[id];
    const e: any = indicadoresEstado[id];
    const partes = [`- ${d.label}: ${d.valor} ${d.unidade} (${d.ano}, ${d.fonte})`];
    if (r && Number.isFinite(Number(r.media_uf))) {
      const sinal = r.delta_pct > 0 ? "+" : "";
      const qual = r.higher_is_worse ? "1º = pior" : "1º = melhor";
      partes.push(
        `  → média ${meta.uf}: ${r.media_uf} | min ${r.min_uf} / máx ${r.max_uf} | posição ${r.posicao}º de ${r.total_uf} (${qual}) | ${sinal}${r.delta_pct}% vs média`,
      );
    } else if (e && Number.isFinite(e.valor)) {
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

INDICADORES MUNICIPAIS RECENTES (≤3 anos, com comparação ao estado de ${meta.uf}):
${linhasIndicadores.join("\n") || "(sem dados IBGE)"}
${indicadoresIgnorados.length ? `\n(Descartados por serem antigos demais: ${indicadoresIgnorados.join(", ")})` : ""}

${buildContextoWebBlock(contextoWeb)}
EVIDÊNCIAS NUMÉRICAS DAS DORES (use ESTES números nos discursos):
${evidenciasDores || "(sem evidências numéricas — use TSE e mídia)"}

TOP CANDIDATOS LOCAIS — APENAS CONTEXTO POLÍTICO (NÃO USAR COMO BAIRRO!):
Esta lista contém NOMES DE POLÍTICOS (pessoas) que ganharam eleições na cidade — serve só como referência de quem está no jogo. NUNCA, em hipótese alguma, use esses nomes no campo "bairro" do roteiro estratégico — bairro é um LUGAR, não uma pessoa.
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
- SEMPRE cite o ano do dado entre parênteses (ex: "PIB per capita R$ 35.000 em 2021")
- PROIBIDO mencionar dados de censos antigos (2010 ou anteriores) — eles foram filtrados desta lista de propósito
- Se um indicador NÃO tiver dado recente, NÃO invente — fale do que tem
- Os "ataques 3-camadas" devem usar números específicos da cidade
- Se o "CONTEXTO RECENTE DA WEB" trouxer notícias dos últimos 90 dias, AMARRE pelo menos 1 ataque ou 1 discurso a um acontecimento real citado lá (ex: "a obra que parou no bairro X", "o decreto da prefeitura sobre Y").
- NUNCA invente notícia ou cite fonte que não esteja na lista do contexto web acima.

========================================
BAIRROS REAIS DISPONÍVEIS PARA O ROTEIRO
========================================
ÚNICA fonte permitida para o campo "bairro" do roteiro estratégico. Cada item abaixo é um BAIRRO/LOCAL geográfico (não pessoa):
${topLocais || "(sem dados zonais)"}

Bairros adicionais válidos (use também): ${bairrosReais || "(nenhum)"}

REGRAS RÍGIDAS PARA O CAMPO "bairro":
1. Use APENAS nomes da lista de bairros acima — copie exatamente como está escrito.
2. PROIBIDO usar nome de pessoa (político, candidato) como bairro.
3. PROIBIDO inventar bairro que não está na lista.
4. Bairro = lugar geográfico (ex: "Coronel Antonino", "Centro", "Vila Nasser"). Pessoa = NÃO é bairro.

ROTEIRO ESTRATÉGICO (obrigatório):
- Gere de 4 a 6 paradas REAIS de campanha.
- Cada parada DEVE usar um dos bairros da lista "BAIRROS REAIS DISPONÍVEIS" acima — NUNCA invente, NUNCA use nome de político.
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
        curiosidades_locais: {
          type: "array",
          minItems: 5,
          maxItems: 10,
          description: "Resumo cultural, histórico e curiosidades da cidade para o candidato chegar conhecendo o lugar. Baseado nos textos da Wikipedia (seções História, Cultura, Economia, Personalidades, Gastronomia, etc.) presentes em CONTEXTO RECENTE DA WEB.",
          items: {
            type: "object",
            properties: {
              categoria: {
                type: "string",
                enum: ["historia", "cultura", "economia", "geografia", "personalidades", "gastronomia", "religiao", "esporte", "curiosidade", "etimologia"],
                description: "Categoria do fato.",
              },
              titulo: { type: "string", description: "Título curto da curiosidade (max 80 chars)." },
              fato: { type: "string", description: "1-3 frases descrevendo o fato real (sempre baseado em fonte do contexto web). Max 400 chars." },
              uso_politico: { type: "string", description: "UMA dica curta de como o candidato pode mencionar isso em fala/conversa para mostrar que conhece a cidade. Max 200 chars." },
            },
            required: ["categoria", "titulo", "fato", "uso_politico"],
            additionalProperties: false,
          },
        },
      },
      required: ["discursos", "ataques_3_camadas", "manchetes_reels", "curiosidades_locais"],
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

    // Validação prévia: precisa de bairros reais para gerar roteiro estratégico
    const analise = dossie.analise || {};
    const topLocais: any[] = Array.isArray(analise?.top_locais_criticos) ? analise.top_locais_criticos : [];
    const bairrosInfer: string[] = Array.isArray(analise?.bairros_inferidos) ? analise.bairros_inferidos : [];
    const bairrosValidos = new Set<string>();
    for (const l of topLocais) {
      if (l?.bairro && typeof l.bairro === "string") bairrosValidos.add(normBairro(l.bairro));
    }
    for (const b of bairrosInfer) {
      if (typeof b === "string") bairrosValidos.add(normBairro(b));
    }
    if (bairrosValidos.size === 0) {
      const msg = "Sem dados zonais TSE para esta cidade — não é possível gerar o roteiro estratégico. Sincronize os resultados TSE 2024 (zonas eleitorais) antes de regerar o dossiê.";
      await supa.from("narrativa_dossies").update({ status: "erro", erro_msg: msg }).eq("id", dossie_id);
      return new Response(JSON.stringify({ error: msg, code: "missing_zonal_data" }), {
        status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Lista de nomes de políticos que aparecem na lista TSE — proibido usar como bairro
    const nomesPoliticos = new Set<string>();
    const tseTop = dossie.dados_brutos?.tse_local?.top_por_cargo_ano || [];
    for (const bloco of tseTop) {
      for (const c of (bloco?.top || [])) {
        if (c?.nome && typeof c.nome === "string") nomesPoliticos.add(normBairro(c.nome));
      }
    }

    await supa.from("narrativa_dossies").update({ status: "gerando" }).eq("id", dossie_id);

    // Busca ranking estadual (Atlas/INEP/DATASUS/SNIS) para o município do dossiê
    let rankingMap: Record<string, any> = {};
    try {
      const meta: any = dossie.dados_brutos?.meta || {};
      const codigoIbge = meta?.codigo_ibge ?? meta?.codigoIbge;
      if (codigoIbge) {
        const { data: rk } = await supa.rpc("municipio_ranking", {
          p_codigo_ibge: Number(codigoIbge),
        });
        for (const row of (rk as any[]) || []) {
          rankingMap[String(row.indicador_id)] = row;
        }
      }
    } catch (rkErr) {
      console.warn("ranking RPC falhou, seguindo sem comparativo estadual:", rkErr);
    }

    // Busca contexto web em tempo real (Wikipedia + Google News + sites .gov.br)
    // Sem persistência — apenas em memória para enriquecer este prompt.
    let contextoWeb: any = null;
    try {
      const meta: any = dossie.dados_brutos?.meta || {};
      if (meta?.municipio && meta?.uf) {
        const webRes = await fetch(`${SUPA_URL}/functions/v1/municipio-contexto-web`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${SUPA_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ municipio: meta.municipio, uf: meta.uf, max_news: 8 }),
        });
        if (webRes.ok) {
          contextoWeb = await webRes.json();
          console.log("contexto web ok:", contextoWeb?._stats);
        } else {
          console.warn("contexto web falhou:", webRes.status);
        }
      }
    } catch (webErr) {
      console.warn("contexto web erro (seguindo sem):", (webErr as Error).message);
    }

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
          { role: "user", content: buildUserPrompt(dossie, rankingMap, contextoWeb) },
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

    // Sanitização pós-IA: remove paradas que usaram nome de político como bairro
    // ou bairro fora da lista permitida.
    if (Array.isArray(conteudos.roteiro_estrategico)) {
      const { paradas, descartadas, total: original } = sanitizeRoteiro(
        conteudos.roteiro_estrategico,
        bairrosValidos,
        nomesPoliticos,
      );
      conteudos.roteiro_estrategico = paradas;

      if (paradas.length === 0) {
        // IA só retornou lixo — bloqueia salvando aviso, mantém demais conteúdos
        conteudos._roteiro_warning = `IA gerou ${original} parada(s) com bairros inválidos (nomes de políticos ou inexistentes). Roteiro descartado — sincronize dados zonais TSE e regere.`;
      } else if (descartadas > 0) {
        conteudos._roteiro_warning = `${descartadas} parada(s) descartada(s) por usar bairro inválido.`;
      }
    }

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