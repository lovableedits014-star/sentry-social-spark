// Geocodifica endereços dos locais TSE via Nominatim (OpenStreetMap) e preenche o campo `bairro`.
// Roda em background; respeita rate limit (~1 req/s).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // pega locais distintos sem bairro
  const { data: locais, error } = await supabase
    .from("tse_votacao_local")
    .select("zona, nr_local, endereco, nome_local")
    .is("bairro", null)
    .not("endereco", "is", null)
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

  let updated = 0;
  let failed = 0;
  const MAX_RUNTIME_MS = 50_000;
  const start = Date.now();

  for (const l of unique) {
    if (Date.now() - start > MAX_RUNTIME_MS) break;
    const query = `${l.endereco}, Campo Grande, MS, Brasil`;
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=1&q=${encodeURIComponent(query)}`;
      const r = await fetch(url, { headers: { "User-Agent": "Sentinelle-TSE-Geocoder/1.0" } });
      if (!r.ok) {
        failed++;
      } else {
        const json = await r.json();
        const addr = json?.[0]?.address || {};
        const bairro = addr.suburb || addr.neighbourhood || addr.city_district || addr.quarter || addr.residential || null;
        if (bairro) {
          await supabase
            .from("tse_votacao_local")
            .update({ bairro })
            .eq("zona", l.zona)
            .eq("nr_local", l.nr_local);
          updated++;
        } else {
          // marca como tentado para não reprocessar (string vazia)
          await supabase
            .from("tse_votacao_local")
            .update({ bairro: "" })
            .eq("zona", l.zona)
            .eq("nr_local", l.nr_local);
          failed++;
        }
      }
    } catch (_e) {
      failed++;
    }
    // rate limit Nominatim: ~1 req/s
    await new Promise((r) => setTimeout(r, 1100));
  }

  return new Response(
    JSON.stringify({ processed: updated + failed, updated, failed, remaining: unique.length - updated - failed }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});