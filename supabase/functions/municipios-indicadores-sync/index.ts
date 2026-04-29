// Edge Function: municipios-indicadores-sync
// Coleta indicadores socioeconômicos dos municípios usando APIs públicas:
// - IBGE (Servidor de Mapas/Cidades) para PIB, população
// - DataSUS via TabNet/Ministério (mortalidade infantil, cobertura SUS)
// - INEP (IDEB) - planilhas oficiais
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const IBGE_BASE = "https://servicodados.ibge.gov.br/api/v1";
const IBGE_NOMES = "https://servicodados.ibge.gov.br/api/v1/localidades/municipios";
const IBGE_AGREGADOS = "https://servicodados.ibge.gov.br/api/v3/agregados";

const MAX_RUNTIME_MS = 55_000;
const startedAt = Date.now();
const timeLeft = () => MAX_RUNTIME_MS - (Date.now() - startedAt);

async function fetchJson(url: string): Promise<any> {
  const r = await fetch(url, { headers: { Accept: "application/json" } });
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${url}`);
  return r.json();
}

/**
 * Busca metadados básicos de um município (nome, UF) pelo código IBGE.
 */
async function getMunicipioBasico(codigoIbge: number): Promise<{ nome: string; uf: string } | null> {
  try {
    const data = await fetchJson(`${IBGE_NOMES}/${codigoIbge}`);
    return {
      nome: data.nome,
      uf: data.microrregiao?.mesorregiao?.UF?.sigla ?? data["regiao-imediata"]?.["regiao-intermediaria"]?.UF?.sigla ?? "",
    };
  } catch {
    return null;
  }
}

/**
 * Busca população estimada (agregado 6579 — Estimativas Populacionais).
 */
async function getPopulacao(codigoIbge: number): Promise<{ populacao: number; ano: number } | null> {
  try {
    const url = `${IBGE_AGREGADOS}/6579/periodos/-1/variaveis/9324?localidades=N6[${codigoIbge}]`;
    const data = await fetchJson(url);
    const serie = data?.[0]?.resultados?.[0]?.series?.[0]?.serie;
    if (!serie) return null;
    const ano = parseInt(Object.keys(serie)[0], 10);
    const populacao = parseInt(serie[ano] as string, 10);
    if (isNaN(populacao)) return null;
    return { populacao, ano };
  } catch {
    return null;
  }
}

/**
 * PIB municipal — agregado 5938 (PIB dos Municípios).
 * Variável 37 = PIB a preços correntes (mil R$); variável 6575 = PIB per capita (R$).
 */
async function getPib(codigoIbge: number): Promise<{ pibTotal: number | null; pibPerCapita: number | null; ano: number | null }> {
  try {
    const url = `${IBGE_AGREGADOS}/5938/periodos/-1/variaveis/37|6575?localidades=N6[${codigoIbge}]`;
    const data = await fetchJson(url);
    let pibTotal: number | null = null;
    let pibPerCapita: number | null = null;
    let ano: number | null = null;
    for (const v of data || []) {
      const serie = v?.resultados?.[0]?.series?.[0]?.serie;
      if (!serie) continue;
      const k = Object.keys(serie)[0];
      ano = parseInt(k, 10);
      const val = parseFloat(serie[k]);
      if (v.variavel?.toLowerCase().includes("per capita")) pibPerCapita = val;
      else pibTotal = val * 1000; // vem em mil R$
    }
    return { pibTotal, pibPerCapita, ano };
  } catch {
    return { pibTotal: null, pibPerCapita: null, ano: null };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const body = await req.json().catch(() => ({}));
    const { codigos_ibge, uf } = body as { codigos_ibge?: number[]; uf?: string };

    let alvos: number[] = [];
    if (codigos_ibge?.length) {
      alvos = codigos_ibge;
    } else if (uf) {
      // Pega todos os municípios da UF
      const data = await fetchJson(`${IBGE_NOMES}?providers=&UF=${uf}`);
      // fallback: a API certa é /estados/{UF}/municipios
      const data2 = await fetchJson(
        `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf}/municipios`,
      );
      alvos = (data2 || []).map((m: any) => m.id);
    } else {
      return new Response(JSON.stringify({ error: "informe codigos_ibge[] ou uf" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let processados = 0;
    const erros: string[] = [];
    const t0 = Date.now();

    for (const codigo of alvos) {
      if (timeLeft() < 4000) {
        erros.push(`timeout após ${processados} municípios`);
        break;
      }
      try {
        const basico = await getMunicipioBasico(codigo);
        if (!basico) continue;
        const [pop, pib] = await Promise.all([getPopulacao(codigo), getPib(codigo)]);

        const row: any = {
          codigo_ibge: codigo,
          nome: basico.nome,
          uf: basico.uf,
          populacao: pop?.populacao ?? null,
          populacao_ano: pop?.ano ?? null,
          pib_total: pib.pibTotal,
          pib_per_capita: pib.pibPerCapita,
          pib_ano: pib.ano,
          ultima_atualizacao: new Date().toISOString(),
        };

        const { error } = await supabase
          .from("municipios_indicadores")
          .upsert(row, { onConflict: "codigo_ibge" });
        if (error) throw error;
        processados++;
      } catch (e) {
        erros.push(`${codigo}: ${e instanceof Error ? e.message : e}`);
      }
    }

    await supabase.from("municipios_sync_log").insert({
      fonte: "ibge",
      municipios_processados: processados,
      status: erros.length > 0 ? (processados > 0 ? "partial" : "error") : "success",
      erro_mensagem: erros.length > 0 ? erros.slice(0, 5).join(" | ") : null,
      duracao_ms: Date.now() - t0,
    });

    return new Response(JSON.stringify({ ok: true, processados, total_alvos: alvos.length, erros: erros.slice(0, 10) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("municipios-indicadores-sync error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});