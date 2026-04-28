import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * narrativa-coleta
 * Coleta paralela de dados públicos sobre uma cidade brasileira para alimentar
 * o gerador de narrativa política. Usa apenas APIs sem chave (IBGE, TSE local,
 * GDELT) e devolve um payload bruto que será analisado por `narrativa-analise`.
 *
 * Body JSON: { client_id, uf, municipio, ibge_code? }
 * Resposta: { dossie_id, dados_brutos }
 */

const SUPA_URL = Deno.env.get("SUPABASE_URL")!;
const SUPA_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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

async function fetchIbgeAgregado(agregado: number, variavel: number, codigo: number) {
  const json: any = await safeFetchJson(
    `https://servicodados.ibge.gov.br/api/v3/agregados/${agregado}/periodos/all/variaveis/${variavel}?localidades=N6[${codigo}]`,
  );
  const series = json?.[0]?.resultados?.[0]?.series?.[0]?.serie;
  if (!series || typeof series !== "object") return null;
  const entries = Object.entries(series)
    .map(([ano, val]) => ({ ano: Number(ano), val: val == null ? null : Number(val) }))
    .filter((e) => e.val != null && !Number.isNaN(e.val))
    .sort((a, b) => b.ano - a.ano);
  if (!entries.length) return null;
  return entries[0]; // mais recente
}

async function fetchIbgeDossie(codigo: number) {
  const [base, pop, area, pib, idhPlaceholder] = await Promise.all([
    fetchIbgeBase(codigo),
    fetchIbgeAgregado(6579, 9324, codigo), // estimativa população
    fetchIbgeAgregado(1301, 6318, codigo), // área km2
    fetchIbgeAgregado(5938, 37, codigo),   // PIB per capita
    Promise.resolve(null),
  ]);
  return {
    base,
    populacao: pop,
    area_km2: area?.val ?? null,
    pib_per_capita: pib,
    idhPlaceholder,
  };
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

    // Coleta paralela
    const [ibge, tse, gdelt] = await Promise.all([
      ibge_code ? fetchIbgeDossie(Number(ibge_code)) : Promise.resolve(null),
      fetchTseLocal(supa, uf, municipio),
      fetchGdelt(municipio),
    ]);

    const dadosBrutos = {
      meta: { uf, municipio, ibge_code, coletado_em: new Date().toISOString() },
      ibge,
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