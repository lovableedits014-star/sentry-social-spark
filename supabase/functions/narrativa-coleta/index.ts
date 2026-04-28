import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * narrativa-coleta
 * Coleta paralela de dados REAIS sobre uma cidade brasileira para alimentar
 * o gerador de narrativa política. Usa apenas APIs públicas sem chave:
 *  - IBGE Cidades (Painel do Município) — 15+ indicadores reais
 *  - IBGE Cidades (média estadual) — para gerar contraste numérico
 *  - TSE local (banco interno)
 *  - GDELT (mídia recente)
 *
 * Body JSON: { client_id, uf, municipio, ibge_code? }
 * Resposta: { dossie_id, dados_brutos }
 */

const SUPA_URL = Deno.env.get("SUPABASE_URL")!;
const SUPA_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Mapa de UF -> código IBGE do estado (N3)
const UF_TO_CODE: Record<string, number> = {
  AC: 12, AL: 27, AP: 16, AM: 13, BA: 29, CE: 23, DF: 53, ES: 32, GO: 52,
  MA: 21, MT: 51, MS: 50, MG: 31, PA: 15, PB: 25, PR: 41, PE: 26, PI: 22,
  RJ: 33, RN: 24, RS: 43, RO: 11, RR: 14, SC: 42, SP: 35, SE: 28, TO: 17,
};

/**
 * Indicadores políticos do Painel do Município (IBGE Cidades).
 * Cada um tem: id IBGE, label, área temática, unidade, e direção
 * (higher_is_worse: se valor mais alto significa MAIS dor).
 */
type IndicadorMeta = {
  id: number;
  label: string;
  area: "saude" | "educacao" | "infra" | "economia" | "social" | "demografia";
  unidade: string;
  higher_is_worse: boolean;
  fonte: string;
};

const INDICADORES: IndicadorMeta[] = [
  { id: 29167, label: "Área territorial",        area: "demografia", unidade: "km²",                        higher_is_worse: false, fonte: "IBGE 2025" },
  { id: 29168, label: "Densidade demográfica",   area: "demografia", unidade: "hab/km²",                    higher_is_worse: false, fonte: "Censo 2010" },
  { id: 29171, label: "População estimada",      area: "demografia", unidade: "pessoas",                    higher_is_worse: false, fonte: "IBGE 2025" },
  { id: 30255, label: "IDH-M",                   area: "social",     unidade: "índice 0-1",                 higher_is_worse: false, fonte: "Atlas Brasil 2010" },
  { id: 30246, label: "Incidência da pobreza",   area: "social",     unidade: "%",                          higher_is_worse: true,  fonte: "IBGE 2003" },
  { id: 30252, label: "Índice de Gini",          area: "social",     unidade: "índice 0-1",                 higher_is_worse: true,  fonte: "IBGE 2003" },
  { id: 30279, label: "Mortalidade infantil",    area: "saude",      unidade: "óbitos/1000 nasc.",          higher_is_worse: true,  fonte: "DataSUS via IBGE" },
  { id: 60022, label: "Mortalidade infantil 2",  area: "saude",      unidade: "óbitos/1000 nasc.",          higher_is_worse: true,  fonte: "DataSUS" },
  { id: 60030, label: "Esgoto adequado",         area: "infra",      unidade: "%",                          higher_is_worse: false, fonte: "Censo 2022" },
  { id: 60029, label: "Arborização vias",        area: "infra",      unidade: "%",                          higher_is_worse: false, fonte: "Censo 2010" },
  { id: 60031, label: "Urbanização vias",        area: "infra",      unidade: "%",                          higher_is_worse: false, fonte: "Censo 2010" },
  { id: 60041, label: "IDEB anos iniciais",      area: "educacao",   unidade: "índice 0-10",                higher_is_worse: false, fonte: "INEP 2023" },
  { id: 60042, label: "IDEB anos finais",        area: "educacao",   unidade: "índice 0-10",                higher_is_worse: false, fonte: "INEP 2023" },
  { id: 60045, label: "Escolarização 6-14 anos", area: "educacao",   unidade: "%",                          higher_is_worse: false, fonte: "Censo 2022" },
  { id: 60038, label: "Salário médio mensal",    area: "economia",   unidade: "salários mínimos",           higher_is_worse: false, fonte: "IBGE 2022" },
  { id: 60036, label: "População ocupada",       area: "economia",   unidade: "%",                          higher_is_worse: false, fonte: "IBGE 2022" },
  { id: 60047, label: "PIB per capita",          area: "economia",   unidade: "R$",                         higher_is_worse: false, fonte: "IBGE 2022" },
  { id: 60048, label: "% receita de transferências federais", area: "economia", unidade: "%",               higher_is_worse: true,  fonte: "Tesouro 2024" },
];

const IND_IDS = INDICADORES.map((i) => i.id).join("|");

function normalize(s: string) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

async function safeFetchJson(url: string, timeoutMs = 8000) {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeoutMs);
    const res = await fetch(url, { headers: { Accept: "application/json" }, signal: ctl.signal });
    clearTimeout(t);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/* ----------------- IBGE ----------------- */
async function resolveIbgeCode(nome: string, uf: string): Promise<number | null> {
  const list = await safeFetchJson(
    `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf.toUpperCase()}/municipios`,
  );
  if (!Array.isArray(list)) return null;
  const target = normalize(nome);
  const hit = list.find((m: any) => normalize(m.nome) === target);
  return hit?.id ? Number(hit.id) : null;
}

async function fetchIbgeBase(codigo: number) {
  const m: any = await safeFetchJson(
    `https://servicodados.ibge.gov.br/api/v1/localidades/municipios/${codigo}`,
  );
  if (!m) return null;
  return {
    codigo,
    nome: m.nome,
    uf: m.microrregiao?.mesorregiao?.UF?.sigla ?? "",
    uf_nome: m.microrregiao?.mesorregiao?.UF?.nome ?? "",
    regiao: m.microrregiao?.mesorregiao?.UF?.regiao?.nome ?? "",
    microrregiao: m.microrregiao?.nome ?? null,
    mesorregiao: m.microrregiao?.mesorregiao?.nome ?? null,
  };
}

/**
 * Busca o conjunto completo de indicadores políticos para um localidade
 * (município OU estado). Retorna o valor mais recente de cada indicador.
 */
async function fetchPainelIndicadores(localidadeCode: number | string) {
  // O endpoint do IBGE Cidades aceita o código com o dígito verificador OU sem.
  // Para municípios usamos o código de 7 dígitos (ex: 5002704); o IBGE devolve
  // a série indexada pelo código de 6 dígitos (ex: 500270) — isso não importa
  // pra gente, só lemos o objeto `res`.
  const url = `https://servicodados.ibge.gov.br/api/v1/pesquisas/indicadores/${IND_IDS}/resultados/${localidadeCode}`;
  const json: any = await safeFetchJson(url, 12000);
  if (!Array.isArray(json)) return {};

  const out: Record<string, { id: number; label: string; area: string; unidade: string; fonte: string; ano: number; valor: number; higher_is_worse: boolean } | null> = {};

  for (const meta of INDICADORES) {
    const found = json.find((x: any) => Number(x?.id) === meta.id);
    if (!found) { out[String(meta.id)] = null; continue; }
    // Pega a série mais recente com valor numérico válido
    const res = found.res?.[0]?.res || {};
    const entries = Object.entries(res)
      .map(([ano, v]: [string, any]) => ({ ano: Number(ano), v: typeof v === "string" && v !== "-" ? Number(v) : (v as number) }))
      .filter((e) => Number.isFinite(e.v) && !Number.isNaN(e.v))
      .sort((a, b) => b.ano - a.ano);
    if (!entries.length) { out[String(meta.id)] = null; continue; }
    out[String(meta.id)] = {
      id: meta.id,
      label: meta.label,
      area: meta.area,
      unidade: meta.unidade,
      fonte: meta.fonte,
      ano: entries[0].ano,
      valor: entries[0].v,
      higher_is_worse: meta.higher_is_worse,
    };
  }
  return out;
}

/**
 * Calcula a média estadual de cada indicador a partir de TODOS os municípios
 * da UF (versão MVP: pega só o nível estadual N3 do IBGE Cidades, que já é
 * agregado e gratuito). Cache em memória para não martelar o IBGE.
 */
const MEDIA_ESTADO_CACHE = new Map<string, any>();
async function fetchMediaEstadual(uf: string) {
  const cached = MEDIA_ESTADO_CACHE.get(uf);
  if (cached) return cached;
  const code = UF_TO_CODE[uf.toUpperCase()];
  if (!code) return {};
  const data = await fetchPainelIndicadores(code);
  MEDIA_ESTADO_CACHE.set(uf, data);
  return data;
}

/* ----------------- TSE local (do nosso banco) ----------------- */
async function fetchTseLocal(supa: any, uf: string, municipio: string) {
  // Usa as views/funções já existentes
  const { data: zonaRows } = await supa
    .from("tse_votacao_zona")
    .select("ano,cargo,partido,nome_completo,nome_urna,votos,zona,municipio,uf")
    .eq("uf", uf)
    .eq("municipio", municipio)
    .in("ano", [2022, 2024])
    .limit(2000);

  if (!zonaRows || zonaRows.length === 0) {
    return { vazio: true };
  }

  // Top candidatos por ano
  const byCargoAno: Record<string, any[]> = {};
  for (const r of zonaRows) {
    const k = `${r.ano}|${r.cargo}`;
    if (!byCargoAno[k]) byCargoAno[k] = [];
    byCargoAno[k].push(r);
  }
  const top: any[] = [];
  for (const [k, list] of Object.entries(byCargoAno)) {
    const [ano, cargo] = k.split("|");
    const agg = new Map<string, { nome: string; partido: string; votos: number }>();
    for (const r of list as any[]) {
      const nome = r.nome_completo || r.nome_urna || "—";
      const key = `${nome}|${r.partido || ""}`;
      const cur = agg.get(key) || { nome, partido: r.partido || "", votos: 0 };
      cur.votos += Number(r.votos || 0);
      agg.set(key, cur);
    }
    const sorted = Array.from(agg.values()).sort((a, b) => b.votos - a.votos).slice(0, 5);
    top.push({ ano: Number(ano), cargo, top: sorted });
  }

  // Partidos dominantes
  const partidoTotal = new Map<string, number>();
  for (const r of zonaRows as any[]) {
    if (!r.partido) continue;
    partidoTotal.set(r.partido, (partidoTotal.get(r.partido) || 0) + Number(r.votos || 0));
  }
  const partidosOrdenados = Array.from(partidoTotal.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([partido, votos]) => ({ partido, votos }));

  return {
    vazio: false,
    total_registros: zonaRows.length,
    top_por_cargo_ano: top,
    partidos_dominantes: partidosOrdenados,
  };
}

/* ----------------- GDELT (mídia) ----------------- */
async function fetchGdelt(municipio: string) {
  // Articles em PT, últimos 30 dias, max 25
  const q = encodeURIComponent(`"${municipio}"`);
  const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${q}%20sourcecountry:BR&mode=ArtList&maxrecords=25&format=json&timespan=30d&sort=hybridrel`;
  const json: any = await safeFetchJson(url, 10000);
  if (!json?.articles) return { vazio: true, artigos: [] };
  const artigos = (json.articles || []).map((a: any) => ({
    titulo: a.title,
    fonte: a.domain,
    url: a.url,
    data: a.seendate,
    tom: a.tone != null ? Number(a.tone) : null,
    lingua: a.language,
  }));
  // Tom médio
  const tons = artigos.map((a: any) => a.tom).filter((v: any) => v != null);
  const tomMedio = tons.length ? tons.reduce((s: number, v: number) => s + v, 0) / tons.length : null;
  return { vazio: artigos.length === 0, artigos, tom_medio: tomMedio, total: artigos.length };
}

/* ----------------- Handler ----------------- */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    const { client_id, uf, municipio } = body || {};
    let { ibge_code } = body || {};

    if (!client_id || !uf || !municipio) {
      return new Response(JSON.stringify({ error: "client_id, uf e municipio são obrigatórios" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supa = createClient(SUPA_URL, SUPA_KEY);

    // Cria/atualiza dossie em status 'coletando'
    const { data: dossie, error: insErr } = await supa
      .from("narrativa_dossies")
      .insert({
        client_id, uf, municipio,
        ibge_code: ibge_code ? String(ibge_code) : null,
        status: "coletando",
      })
      .select()
      .single();
    if (insErr) throw new Error(`Falha ao criar dossiê: ${insErr.message}`);

    // Resolve código IBGE se ausente
    if (!ibge_code) {
      ibge_code = await resolveIbgeCode(municipio, uf);
    }

    // Coleta paralela: indicadores municipais + indicadores do estado + base + TSE + mídia
    const [base, indicadores, indicadoresEstado, tse, gdelt] = await Promise.all([
      ibge_code ? fetchIbgeBase(Number(ibge_code)) : Promise.resolve(null),
      ibge_code ? fetchPainelIndicadores(Number(ibge_code)) : Promise.resolve({}),
      fetchMediaEstadual(uf),
      fetchTseLocal(supa, uf, municipio),
      fetchGdelt(municipio),
    ]);

    const dadosBrutos = {
      meta: { uf, municipio, ibge_code, coletado_em: new Date().toISOString() },
      ibge: {
        base,
        // Mantém os campos legados que o front já consome
        populacao: indicadores["29171"] ? { ano: indicadores["29171"]!.ano, val: indicadores["29171"]!.valor } : null,
        area_km2: indicadores["29167"]?.valor ?? null,
        pib_per_capita: indicadores["60047"] ? { ano: indicadores["60047"]!.ano, val: indicadores["60047"]!.valor } : null,
        // NOVO: catálogo completo de indicadores reais com fonte e ano
        indicadores,
        indicadores_estado: indicadoresEstado,
      },
      tse_local: tse,
      midia_gdelt: gdelt,
    };

    await supa
      .from("narrativa_dossies")
      .update({
        dados_brutos: dadosBrutos,
        ibge_code: ibge_code ? String(ibge_code) : null,
        status: "coletado",
        collected_at: new Date().toISOString(),
      })
      .eq("id", dossie.id);

    return new Response(
      JSON.stringify({ dossie_id: dossie.id, dados_brutos: dadosBrutos }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "erro desconhecido";
    console.error("narrativa-coleta error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});