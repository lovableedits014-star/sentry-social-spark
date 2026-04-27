import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const NAGER_BASE = "https://date.nager.at/api/v3/PublicHolidays";
const TTL_DAYS = 365; // feriados oficiais não mudam dentro do ano

type Holiday = {
  date: string;          // YYYY-MM-DD
  localName: string;
  name: string;
  countryCode: string;
  fixed?: boolean;
  global?: boolean;
  counties?: string[] | null;
  launchYear?: number | null;
  types?: string[];
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    let year = Number(url.searchParams.get("year"));
    let country = (url.searchParams.get("country") || "BR").toUpperCase();

    if (req.method === "POST") {
      try {
        const body = await req.json();
        if (body?.year) year = Number(body.year);
        if (body?.country) country = String(body.country).toUpperCase();
      } catch (_) { /* sem body json é ok */ }
    }

    const currentYear = new Date().getFullYear();
    if (!year || isNaN(year)) year = currentYear;
    if (year < 2000 || year > currentYear + 5) {
      return jsonResponse({ error: "year fora do intervalo permitido" }, 400);
    }
    if (!/^[A-Z]{2}$/.test(country)) {
      return jsonResponse({ error: "country deve ser ISO-3166 alpha-2 (ex: BR)" }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    const cacheKey = `nager:${country}:${year}`;

    // 1) tenta cache
    const { data: cached } = await admin
      .from("api_cache")
      .select("payload, fetched_at, expires_at")
      .eq("endpoint_key", cacheKey)
      .maybeSingle();

    const now = Date.now();
    if (cached && new Date(cached.expires_at).getTime() > now) {
      return jsonResponse({
        country,
        year,
        source: "cache",
        fetched_at: cached.fetched_at,
        holidays: cached.payload,
      });
    }

    // 2) fetch externo
    let holidays: Holiday[] = [];
    let stale = false;
    try {
      const resp = await fetch(`${NAGER_BASE}/${year}/${country}`, {
        headers: { Accept: "application/json" },
      });
      if (!resp.ok) {
        throw new Error(`Nager.Date HTTP ${resp.status}`);
      }
      holidays = (await resp.json()) as Holiday[];
      if (!Array.isArray(holidays)) throw new Error("Resposta Nager.Date inválida");
    } catch (err) {
      console.error("holidays-fetch upstream error:", err);
      // fallback: se temos cache mesmo expirado, devolvemos com flag stale
      if (cached?.payload) {
        return jsonResponse({
          country,
          year,
          source: "cache-stale",
          stale: true,
          fetched_at: cached.fetched_at,
          holidays: cached.payload,
        });
      }
      return jsonResponse({ error: "Falha ao consultar Nager.Date e sem cache disponível" }, 502);
    }

    // 3) grava cache
    const expiresAt = new Date(now + TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const { error: upsertErr } = await admin
      .from("api_cache")
      .upsert({
        endpoint_key: cacheKey,
        source: "nager.date",
        payload: holidays as unknown as Record<string, unknown>,
        fetched_at: new Date(now).toISOString(),
        expires_at: expiresAt,
      }, { onConflict: "endpoint_key" });
    if (upsertErr) console.error("holidays-fetch cache upsert error:", upsertErr);

    return jsonResponse({
      country,
      year,
      source: "fresh",
      fetched_at: new Date(now).toISOString(),
      holidays,
      stale,
    });
  } catch (err) {
    console.error("holidays-fetch error:", err);
    return jsonResponse({ error: "internal" }, 500);
  }
});
