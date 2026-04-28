import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * narrativa-analise
 * Lê o `dados_brutos` de um dossiê e calcula:
 *  - pain_score por área (saúde, educação, segurança, infra) — 0..100
 *  - classificação de cada dor (Explosiva / Latente / Silenciosa)
 *  - oportunidade política (Pain x força do gestor)
 *  - bairros inferidos (a partir de zonas TSE — placeholder até onda 2)
 *
 * Esta primeira versão usa heurísticas determinísticas em cima dos dados
 * brutos (sem LLM ainda). O `narrativa-gerar` é quem chama a IA depois.
 *
 * Body: { dossie_id }
 */

const SUPA_URL = Deno.env.get("SUPABASE_URL")!;
const SUPA_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function classifyPain(score: number): "explosiva" | "latente" | "silenciosa" {
  if (score >= 70) return "explosiva";
  if (score >= 40) return "latente";
  return "silenciosa";
}

function clamp(n: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, n));
}

/**
 * Heurísticas iniciais — refinadas conforme adicionarmos DataSUS/INEP/SNIS na onda 2.
 * Por enquanto usamos sinais indiretos:
 *  - tom médio do GDELT (negativo = mais dor)
 *  - menções de palavras-chave em manchetes
 *  - densidade populacional (super densa = pressão urbana)
 */
function calcularDores(dadosBrutos: any) {
  const artigos = dadosBrutos?.midia_gdelt?.artigos || [];
  const tomMedio = dadosBrutos?.midia_gdelt?.tom_medio ?? 0;

  const titulos = artigos.map((a: any) => (a.titulo || "").toLowerCase()).join(" | ");

  const counts = {
    saude: 0, educacao: 0, seguranca: 0, infra: 0, economia: 0,
  };
  const kw: Record<keyof typeof counts, string[]> = {
    saude: ["saúde", "ubs", "hospital", "vacina", "fila", "remédio", "ambulância"],
    educacao: ["escola", "educação", "aluno", "professor", "creche", "ensino"],
    seguranca: ["violência", "homicídio", "assalto", "roubo", "tráfico", "polícia", "segurança"],
    infra: ["buraco", "asfalto", "rua", "esgoto", "água", "iluminação", "transporte", "ônibus"],
    economia: ["desemprego", "emprego", "crise", "fechou", "comércio", "imposto"],
  };
  for (const [area, words] of Object.entries(kw)) {
    for (const w of words) {
      const re = new RegExp(`\\b${w}`, "gi");
      const matches = titulos.match(re);
      if (matches) (counts as any)[area] += matches.length;
    }
  }

  // Boost por tom muito negativo
  const negBoost = tomMedio < -3 ? 25 : tomMedio < -1 ? 12 : 0;

  const dores = (Object.keys(counts) as (keyof typeof counts)[]).map((area) => {
    const raw = counts[area];
    // 0 menções => pain baixo (~10), 1=>30, 2=>50, 3+=>70+
    let score = 10 + raw * 20 + negBoost;
    score = clamp(score);
    return {
      area,
      pain_score: score,
      classificacao: classifyPain(score),
      mencoes_midia: raw,
    };
  });

  // Ordena por dor decrescente
  dores.sort((a, b) => b.pain_score - a.pain_score);
  return { dores, tom_medio_midia: tomMedio };
}

function calcularOportunidade(dores: any[], dadosBrutos: any) {
  // Identifica a "força" do prefeito atual a partir de candidatos top 2024 cargo prefeito
  const tse = dadosBrutos?.tse_local;
  let forca_gestor: number | null = null;
  if (tse && !tse.vazio) {
    const prefeito2024 = (tse.top_por_cargo_ano || []).find(
      (b: any) => b.ano === 2024 && /prefeito/i.test(b.cargo),
    );
    if (prefeito2024 && prefeito2024.top.length > 0) {
      const eleito = prefeito2024.top[0];
      const total = prefeito2024.top.reduce((s: number, c: any) => s + c.votos, 0);
      forca_gestor = total > 0 ? Math.round((eleito.votos / total) * 100) : null;
    }
  }

  // Maior oportunidade = dor alta + gestor fraco
  const dorMax = dores[0]?.pain_score ?? 0;
  const gestorScore = forca_gestor ?? 50;
  const oportunidade_score = clamp(Math.round(dorMax * 0.7 + (100 - gestorScore) * 0.3));
  let nivel: "alta" | "media" | "baixa" = "media";
  if (oportunidade_score >= 70) nivel = "alta";
  else if (oportunidade_score < 40) nivel = "baixa";

  return {
    oportunidade_score,
    nivel,
    forca_gestor_atual: forca_gestor,
    dor_principal: dores[0]?.area ?? null,
  };
}

function inferirBairros(dadosBrutos: any) {
  // Onda 1: extrai zonas únicas do TSE como proxy de bairro
  const tse = dadosBrutos?.tse_local;
  if (!tse || tse.vazio) return [];
  // A função tse_local atual não traz zonas; placeholder simples
  return [];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { dossie_id } = await req.json();
    if (!dossie_id) {
      return new Response(JSON.stringify({ error: "dossie_id obrigatório" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supa = createClient(SUPA_URL, SUPA_KEY);

    const { data: dossie, error: getErr } = await supa
      .from("narrativa_dossies")
      .select("*")
      .eq("id", dossie_id)
      .maybeSingle();
    if (getErr || !dossie) throw new Error("Dossiê não encontrado");

    await supa.from("narrativa_dossies").update({ status: "analisando" }).eq("id", dossie_id);

    const { dores, tom_medio_midia } = calcularDores(dossie.dados_brutos);
    const oportunidade = calcularOportunidade(dores, dossie.dados_brutos);
    const bairros_inferidos = inferirBairros(dossie.dados_brutos);

    const analise = {
      dores,
      mapa_dor: dores.reduce((acc: any, d) => { acc[d.area] = d; return acc; }, {}),
      oportunidade,
      tom_medio_midia,
      bairros_inferidos,
      gerado_em: new Date().toISOString(),
    };

    await supa
      .from("narrativa_dossies")
      .update({
        analise,
        status: "analisado",
        analyzed_at: new Date().toISOString(),
      })
      .eq("id", dossie_id);

    return new Response(JSON.stringify({ dossie_id, analise }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "erro desconhecido";
    console.error("narrativa-analise error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});