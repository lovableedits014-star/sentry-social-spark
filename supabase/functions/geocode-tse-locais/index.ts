// Preenche o campo `bairro` dos locais TSE usando Lovable AI (Gemini).
// Processa em lotes — endereços são de Campo Grande/MS, então o modelo infere o bairro a partir da rua + número.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const BATCH_SIZE = 30;
const MAX_RUNTIME_MS = 50_000;

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

  if (!LOVABLE_API_KEY) {
    return new Response(JSON.stringify({ error: "LOVABLE_API_KEY não configurada" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const url = new URL(req.url);
  const retry = url.searchParams.get("retry") === "1";

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // padrão: pega só os ainda não processados (bairro IS NULL)
  // retry: pega os que falharam antes (bairro = '') para tentar via NOME do local
  const baseQuery = supabase
    .from("tse_votacao_local")
    .select("zona, nr_local, endereco, nome_local")
    .not("endereco", "is", null)
    .limit(2000);

  const { data: locais, error } = retry
    ? await baseQuery.eq("bairro", "")
    : await baseQuery.is("bairro", null);

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

  let updated = 0;
  let failed = 0;
  const start = Date.now();

  // processa em lotes via IA
  for (let i = 0; i < unique.length; i += BATCH_SIZE) {
    if (Date.now() - start > MAX_RUNTIME_MS) break;
    const batch = unique.slice(i, i + BATCH_SIZE);
    const items = batch.map((l, k) => ({ idx: k, endereco: l.endereco, nome_local: l.nome_local }));

    let resultados: Record<number, string> = {};
    try {
      resultados = await inferBairrosBatch(items, retry ? "por_nome" : "padrao");
    } catch (e) {
      console.error("Erro no lote", e);
      failed += batch.length;
      continue;
    }

    // aplica updates
    for (let k = 0; k < batch.length; k++) {
      const l = batch[k];
      const bairro = resultados[k] ?? "";
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
        failed++;
      }
    }
  }

  return new Response(
    JSON.stringify({ processed: updated + failed, updated, failed, remaining: unique.length - updated - failed }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});