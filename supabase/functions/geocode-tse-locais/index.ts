// Preenche o campo `bairro` dos locais TSE usando GEOCODING REAL via Nominatim (OpenStreetMap).
// Estratégia autoritativa baseada em coordenadas geográficas reais — não inventa, não alucina.
// Para cada endereço: geocoda na OSM, pega lat/lon, faz reverse-geocode para extrair `suburb`/`neighbourhood`.
// Quando OSM não retorna, deixa NULL (para revisão manual) — NUNCA chuta um bairro.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Nominatim exige rate-limit de 1 req/s e User-Agent identificável.
const NOMINATIM_DELAY_MS = 1100;
const USER_AGENT = "SentrySocialSpark/1.0 (geocoding TSE locais; contact: lovableedits014@gmail.com)";
const MAX_RUNTIME_MS = 50_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function normalizeEndereco(endereco: string, cidade: string, uf: string): string {
  // Remove "N. 1095" → "1095"; padroniza para "<rua>, <numero>, <cidade>, <uf>, Brasil".
  let s = endereco.trim();
  s = s.replace(/\bN\.\s*/gi, "");
  s = s.replace(/\s+/g, " ");
  return `${s}, ${cidade}, ${uf}, Brasil`;
}

type GeoResult = { lat: number; lon: number; bairro: string | null; raw_addr?: any };

async function geocodeAddress(query: string): Promise<GeoResult | null> {
  // 1) Forward geocode → coordenadas
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("limit", "1");
  url.searchParams.set("countrycodes", "br");

  const resp = await fetch(url.toString(), {
    headers: { "User-Agent": USER_AGENT, "Accept-Language": "pt-BR" },
  });
  if (!resp.ok) {
    console.warn("Nominatim search status", resp.status, query);
    return null;
  }
  const arr = await resp.json();
  if (!Array.isArray(arr) || arr.length === 0) return null;

  const hit = arr[0];
  const lat = parseFloat(hit.lat);
  const lon = parseFloat(hit.lon);
  if (!isFinite(lat) || !isFinite(lon)) return null;

  const addr = hit.address || {};
  const bairro =
    addr.suburb ||
    addr.neighbourhood ||
    addr.city_district ||
    addr.quarter ||
    addr.residential ||
    null;

  // Se já veio bairro no forward, retorna direto.
  if (bairro) {
    return { lat, lon, bairro, raw_addr: addr };
  }

  // 2) Caso contrário, faz reverse-geocode (mais detalhado para coordenadas)
  await sleep(NOMINATIM_DELAY_MS);
  const rev = new URL("https://nominatim.openstreetmap.org/reverse");
  rev.searchParams.set("lat", String(lat));
  rev.searchParams.set("lon", String(lon));
  rev.searchParams.set("format", "jsonv2");
  rev.searchParams.set("addressdetails", "1");
  rev.searchParams.set("zoom", "17");

  const r2 = await fetch(rev.toString(), {
    headers: { "User-Agent": USER_AGENT, "Accept-Language": "pt-BR" },
  });
  if (!r2.ok) return { lat, lon, bairro: null };
  const j2 = await r2.json();
  const a2 = j2.address || {};
  const bairro2 =
    a2.suburb ||
    a2.neighbourhood ||
    a2.city_district ||
    a2.quarter ||
    a2.residential ||
    null;
  return { lat, lon, bairro: bairro2, raw_addr: a2 };
}

async function inferCidadeUf(
  supabase: any,
  zona: number,
): Promise<{ cidade: string; uf: string }> {
  // Por padrão, este sistema só carrega TSE para Campo Grande/MS hoje.
  // Mantemos um fallback configurável caso evolua.
  const { data } = await supabase
    .from("tse_votacao_zona")
    .select("municipio, uf")
    .eq("zona", zona)
    .limit(1)
    .maybeSingle();
  return {
    cidade: data?.municipio || "Campo Grande",
    uf: data?.uf || "MS",
  };
}

async function inferBairrosBatch(
  items: Array<{ idx: number; endereco: string; nome_local: string | null }>,
  modo: "padrao" | "por_nome" = "padrao",
): Promise<Record<number, string>> {
  const lista = items
    .map((it) =>
      modo === "por_nome"
        ? `${it.idx}. ${it.nome_local ?? "(sem nome)"} — Endereço: ${it.endereco}`
        : `${it.idx}. ${it.nome_local ? `[${it.nome_local}] ` : ""}${it.endereco}`,
    )
    .join("\n");

  const systemPrompt =
    modo === "por_nome"
      ? "Você é um especialista em escolas, instituições e equipamentos públicos de Campo Grande, MS, Brasil. " +
        "Cada item é um LOCAL DE VOTAÇÃO TSE (escola estadual/municipal, CEINF, igreja, sindicato, associação, faculdade etc.) em Campo Grande/MS. " +
        "Use o NOME da instituição como pista principal — escolas têm bairros conhecidos. Use o endereço apenas como confirmação. " +
        "Retorne o bairro oficial de Campo Grande/MS de cada local. " +
        "Se realmente não conhecer aquela instituição específica, retorne string vazia. " +
        "Nunca invente — prefira vazio a errar."
      : "Você é um especialista em geografia urbana de Campo Grande, MS, Brasil. " +
        "Dada uma lista de endereços (rua e número) e nomes de locais (escolas, igrejas, etc.) " +
        "todos localizados em Campo Grande/MS, retorne o nome do bairro de cada um. " +
        "Use seu conhecimento sobre as ruas, avenidas e instituições da cidade. " +
        "Se não tiver certeza razoável, retorne string vazia para aquele item. " +
        "Nunca invente um bairro — prefira vazio a errar.";

  const userPrompt =
    modo === "por_nome"
      ? `Identifique o bairro destes locais de votação em Campo Grande/MS usando principalmente o NOME da instituição:\n\n${lista}`
      : `Identifique o bairro de cada endereço em Campo Grande/MS:\n\n${lista}`;

  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "registrar_bairros",
            description: "Registra o bairro inferido para cada endereço da lista.",
            parameters: {
              type: "object",
              properties: {
                resultados: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      idx: { type: "number", description: "Índice do item na lista" },
                      bairro: {
                        type: "string",
                        description: "Nome do bairro em Campo Grande/MS, ou string vazia se incerto",
                      },
                    },
                    required: ["idx", "bairro"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["resultados"],
              additionalProperties: false,
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "registrar_bairros" } },
    }),
  });

  if (!resp.ok) {
    const txt = await resp.text();
    console.error("AI gateway error", resp.status, txt);
    throw new Error(`AI gateway ${resp.status}`);
  }

  const json = await resp.json();
  const call = json?.choices?.[0]?.message?.tool_calls?.[0];
  const args = call?.function?.arguments ? JSON.parse(call.function.arguments) : { resultados: [] };
  const out: Record<number, string> = {};
  for (const r of args.resultados || []) {
    if (typeof r.idx === "number" && typeof r.bairro === "string") {
      out[r.idx] = r.bairro.trim();
    }
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Pega locais ainda não processados (bairro IS NULL).
  const { data: locais, error } = await supabase
    .from("tse_votacao_local")
    .select("zona, nr_local, endereco, nome_local")
    .not("endereco", "is", null)
    .is("bairro", null)
    .limit(2000);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // dedup por (zona, nr_local)
  const seen = new Set<string>();
  const unique: Array<{ zona: number; nr_local: number; endereco: string; nome_local: string | null }> = [];
  for (const l of locais || []) {
    const k = `${l.zona}-${l.nr_local}`;
    if (seen.has(k)) continue;
    seen.add(k);
    unique.push(l as any);
  }

  // Cache cidade/uf por zona
  const cidadeCache = new Map<number, { cidade: string; uf: string }>();

  let updated = 0;
  let notFound = 0;
  let failed = 0;
  const start = Date.now();

  for (const l of unique) {
    if (Date.now() - start > MAX_RUNTIME_MS) break;

    let geo = cidadeCache.get(l.zona);
    if (!geo) {
      geo = await inferCidadeUf(supabase, l.zona);
      cidadeCache.set(l.zona, geo);
    }

    // Tentativa 1: endereço + número (mais preciso)
    let result: GeoResult | null = null;
    try {
      const q1 = normalizeEndereco(l.endereco, geo.cidade, geo.uf);
      result = await geocodeAddress(q1);
      await sleep(NOMINATIM_DELAY_MS);

      // Tentativa 2: nome do local (escola) + cidade — caso 1 falhe
      if ((!result || !result.bairro) && l.nome_local) {
        const q2 = `${l.nome_local}, ${geo.cidade}, ${geo.uf}, Brasil`;
        const r2 = await geocodeAddress(q2);
        await sleep(NOMINATIM_DELAY_MS);
        if (r2?.bairro) result = r2;
      }
    } catch (e) {
      console.error("Erro geocode", l.zona, l.nr_local, e);
      failed++;
      continue;
    }

    const bairro = result?.bairro || ""; // string vazia = tentou mas não achou (não confiável)

    const { error: upErr } = await supabase
      .from("tse_votacao_local")
      .update({ bairro })
      .eq("zona", l.zona)
      .eq("nr_local", l.nr_local);

    if (upErr) {
      failed++;
    } else if (bairro) {
      updated++;
    } else {
      notFound++;
    }
  }

  return new Response(
    JSON.stringify({
      strategy: "nominatim_osm",
      processed: updated + notFound + failed,
      updated,
      not_found: notFound,
      failed,
      remaining: unique.length - updated - notFound - failed,
      note: "Bairros vazios = OSM não encontrou — preferimos vazio a errar. Reexecute para continuar processando.",
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});