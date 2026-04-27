import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * gdelt-media-fetch
 * Monitora cobertura de mídia (volume + tom) sobre temas/figuras políticas via GDELT DOC 2.0 (API pública sem chave).
 *
 * Endpoint:
 *   GET ?query=...&timespan=7d&country=BR&maxrecords=50
 *
 * Retorna:
 *   - timeline: pontos diários (volume + tom médio)
 *   - articles: lista de artigos recentes (título, fonte, url, data, tom, idioma, país)
 *   - tone_summary: { avg, positives, neutrals, negatives }
 *   - top_sources: top fontes por volume
 *
 * Cache: public.api_cache, TTL 30min (cobertura de mídia muda rápido).
 */

const TTL_SECONDS = 30 * 60;
const SOURCE = "gdelt";
const GDELT_BASE = "https://api.gdeltproject.org/api/v2/doc/doc";

type Article = {
  title: string;
  url: string;
  domain: string;
  seendate: string; // ISO
  language: string;
  sourcecountry: string;
  tone: number | null;
};

type Timeline = { date: string; volume: number; tone: number | null };

function key(query: string, timespan: string, country: string) {
  return `gdelt:${country}:${timespan}:${query.toLowerCase().trim()}`;
}

/** Parse "20251020T123000Z" → "2025-10-20" */
function parseGdeltDate(s: string): string {
  if (!s || s.length < 8) return s;
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

async function fetchArticles(query: string, timespan: string, country: string, maxrecords: number): Promise<Article[]> {
  const q = country && country !== "all" ? `${query} sourcecountry:${country}` : query;
  const url = `${GDELT_BASE}?query=${encodeURIComponent(q)}&mode=ArtList&format=json&maxrecords=${maxrecords}&timespan=${encodeURIComponent(timespan)}&sort=DateDesc`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`GDELT ArtList ${res.status}`);
  const text = await res.text();
  if (!text || text.trim().length === 0) return [];
  let json: any;
  try { json = JSON.parse(text); } catch { return []; }
  const arts = Array.isArray(json?.articles) ? json.articles : [];
  return arts.map((a: any) => ({
    title: a.title ?? "",
    url: a.url ?? "",
    domain: a.domain ?? "",
    seendate: a.seendate ?? "",
    language: a.language ?? "",
    sourcecountry: a.sourcecountry ?? "",
    tone: typeof a.tone === "number" ? a.tone : (a.tone != null ? Number(a.tone) : null),
  }));
}

async function fetchTimeline(query: string, timespan: string, country: string): Promise<Timeline[]> {
  const q = country && country !== "all" ? `${query} sourcecountry:${country}` : query;
  // TimelineVolInfo dá volume + tom médio em janelas
  const url = `${GDELT_BASE}?query=${encodeURIComponent(q)}&mode=TimelineVolInfo&format=json&timespan=${encodeURIComponent(timespan)}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) return [];
  const text = await res.text();
  if (!text) return [];
  let json: any;
  try { json = JSON.parse(text); } catch { return []; }
  const series = Array.isArray(json?.timeline) ? json.timeline : [];
  // Cada série tem .data: [{ date, value, ... }]
  const volSeries = series.find((s: any) => /vol/i.test(s.seriesname || s.series || "")) ?? series[0];
  const points: any[] = Array.isArray(volSeries?.data) ? volSeries.data : [];
  return points.map((p: any) => ({
    date: parseGdeltDate(String(p.date ?? "")),
    volume: Number(p.value ?? 0),
    tone: typeof p.tone === "number" ? p.tone : (p.tone != null ? Number(p.tone) : null),
  }));
}

function summarize(articles: Article[], timeline: Timeline[]) {
  // GDELT ArtList raramente devolve tom por artigo; usar timeline como fallback
  const articleTones = articles.map((a) => a.tone).filter((t): t is number => typeof t === "number" && !Number.isNaN(t));
  const timelineTones = timeline.map((p) => p.tone).filter((t): t is number => typeof t === "number" && !Number.isNaN(t));
  const tones = articleTones.length > 0 ? articleTones : timelineTones;
  const avg = tones.length ? tones.reduce((s, v) => s + v, 0) / tones.length : null;
  let pos = 0, neg = 0, neu = 0;
  for (const t of tones) {
    if (t >= 1.5) pos++;
    else if (t <= -1.5) neg++;
    else neu++;
  }
  const sourceCount = new Map<string, number>();
  for (const a of articles) {
    if (!a.domain) continue;
    sourceCount.set(a.domain, (sourceCount.get(a.domain) ?? 0) + 1);
  }
  const top_sources = [...sourceCount.entries()]
    .map(([domain, count]) => ({ domain, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
  return {
    tone_summary: { avg, positives: pos, neutrals: neu, negatives: neg, total: tones.length },
    top_sources,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const query = (url.searchParams.get("query") || "").trim();
    const timespan = (url.searchParams.get("timespan") || "7d").trim();
    const country = (url.searchParams.get("country") || "BR").trim();
    const maxrecords = Math.min(Math.max(parseInt(url.searchParams.get("maxrecords") || "50", 10) || 50, 5), 100);
    const force = url.searchParams.get("force") === "1";

    if (!query || query.length < 2) {
      return new Response(
        JSON.stringify({ error: "Informe ?query=tema (mínimo 2 caracteres)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (!/^\d+(d|h)$/.test(timespan)) {
      return new Response(
        JSON.stringify({ error: "timespan inválido. Use ex: 24h, 3d, 7d, 14d, 30d" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supaUrl = Deno.env.get("SUPABASE_URL");
    const supaKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supaUrl || !supaKey) {
      return new Response(
        JSON.stringify({ error: "Configuração de servidor ausente" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const supa = createClient(supaUrl, supaKey);
    const cacheK = key(query, timespan, country);

    if (!force) {
      const { data: row } = await supa
        .from("api_cache")
        .select("payload, expires_at")
        .eq("endpoint_key", cacheK)
        .maybeSingle();
      if (row && new Date(row.expires_at).getTime() > Date.now()) {
        return new Response(
          JSON.stringify({ data: row.payload, cached: true, source: SOURCE }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    let articles: Article[] = [];
    let timeline: Timeline[] = [];
    try {
      const [a, t] = await Promise.all([
        fetchArticles(query, timespan, country, maxrecords),
        fetchTimeline(query, timespan, country),
      ]);
      articles = a;
      timeline = t;
    } catch (err) {
      const { data: row } = await supa
        .from("api_cache")
        .select("payload")
        .eq("endpoint_key", cacheK)
        .maybeSingle();
      if (row) {
        return new Response(
          JSON.stringify({ data: row.payload, cached: true, stale: true, source: SOURCE, warning: String((err as Error).message) }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      throw err;
    }

    const { tone_summary, top_sources } = summarize(articles, timeline);
    const data = {
      query,
      timespan,
      country,
      total_articles: articles.length,
      tone_summary,
      top_sources,
      timeline,
      articles: articles.slice(0, maxrecords),
      generated_at: new Date().toISOString(),
    };

    await supa.from("api_cache").upsert({
      endpoint_key: cacheK,
      source: SOURCE,
      payload: data as any,
      fetched_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + TTL_SECONDS * 1000).toISOString(),
    });

    return new Response(
      JSON.stringify({ data, cached: false, source: SOURCE }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "erro desconhecido";
    console.error("gdelt-media-fetch error:", msg);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});