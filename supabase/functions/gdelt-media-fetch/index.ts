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
 *       &domains=g1.globo.com,folha.uol.com.br
 *       &exclude=opinião,coluna
 *       &language=por
 *       &start=20260420000000&end=20260427235959   (opcional — sobrepõe timespan)
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

function key(parts: Record<string, string>) {
  // Chave determinística para o cache, independente da ordem dos parâmetros
  const ordered = Object.keys(parts).sort().map((k) => `${k}=${parts[k]}`).join("|");
  return `gdelt:${ordered.toLowerCase()}`;
}

/** Parse "20251020T123000Z" → "2025-10-20" */
function parseGdeltDate(s: string): string {
  if (!s || s.length < 8) return s;
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

/** Constrói os parâmetros temporais (timespan vs janela personalizada). */
function buildTimeParams(opts: { timespan: string; start?: string; end?: string }): string {
  if (opts.start && opts.end) {
    return `&startdatetime=${opts.start}&enddatetime=${opts.end}`;
  }
  return `&timespan=${encodeURIComponent(opts.timespan)}`;
}

type FetchOpts = {
  query: string;
  timespan: string;
  country: string;
  start?: string;
  end?: string;
  language?: string;
};

/** Aplica filtros do GDELT à query final (country/language). */
function decorateQuery(opts: FetchOpts): string {
  let q = opts.query;
  if (opts.country && opts.country !== "all") q += ` sourcecountry:${opts.country}`;
  if (opts.language) q += ` sourcelang:${opts.language}`;
  return q;
}

async function fetchArticles(opts: FetchOpts, maxrecords: number): Promise<Article[]> {
  const q = decorateQuery(opts);
  const url = `${GDELT_BASE}?query=${encodeURIComponent(q)}&mode=ArtList&format=json&maxrecords=${maxrecords}${buildTimeParams(opts)}&sort=DateDesc`;
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

async function fetchTimeline(opts: FetchOpts): Promise<Timeline[]> {
  const q = decorateQuery(opts);
  // TimelineVolInfo dá volume + tom médio em janelas
  const url = `${GDELT_BASE}?query=${encodeURIComponent(q)}&mode=TimelineVolInfo&format=json${buildTimeParams(opts)}`;
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
    const language = (url.searchParams.get("language") || "").trim();
    const start = (url.searchParams.get("start") || "").trim();
    const end = (url.searchParams.get("end") || "").trim();
    const domainsRaw = (url.searchParams.get("domains") || "").trim();
    const excludeRaw = (url.searchParams.get("exclude") || "").trim();

    if (!query || query.length < 2) {
      return new Response(
        JSON.stringify({ error: "Informe ?query=tema (mínimo 2 caracteres)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const hasCustomRange = !!(start && end);
    if (!hasCustomRange && !/^\d+(d|h|min)$/.test(timespan)) {
      return new Response(
        JSON.stringify({ error: "timespan inválido. Use ex: 60min, 24h, 3d, 7d, 14d, 30d" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (hasCustomRange && (!/^\d{14}$/.test(start) || !/^\d{14}$/.test(end))) {
      return new Response(
        JSON.stringify({ error: "start/end devem estar no formato YYYYMMDDHHMMSS (14 dígitos)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (language && !/^[a-z]{2,4}$/.test(language)) {
      return new Response(
        JSON.stringify({ error: "language inválido. Use código GDELT minúsculo (ex: por, eng, spa)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Domínios: aceita lista separada por vírgula. Cada domínio vira "domain:..."
    const domains = domainsRaw
      .split(",")
      .map((d) => d.trim().toLowerCase())
      .filter((d) => /^[a-z0-9.\-]+\.[a-z]{2,}$/.test(d))
      .slice(0, 10);

    // Termos a excluir (vira -"termo" no GDELT)
    const excludes = excludeRaw
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t.length >= 2 && t.length <= 50)
      .slice(0, 10);

    // Monta a query expandida (com domínios e exclusões)
    let finalQuery = query;
    if (domains.length === 1) {
      finalQuery += ` domain:${domains[0]}`;
    } else if (domains.length > 1) {
      finalQuery += ` (${domains.map((d) => `domain:${d}`).join(" OR ")})`;
    }
    for (const ex of excludes) {
      const wrapped = ex.includes(" ") ? `"${ex}"` : ex;
      finalQuery += ` -${wrapped}`;
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
    const cacheK = key({
      q: finalQuery,
      ts: hasCustomRange ? `${start}-${end}` : timespan,
      c: country,
      lang: language || "",
      mr: String(maxrecords),
    });

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
    const fetchOpts: FetchOpts = {
      query: finalQuery,
      timespan,
      country,
      start: hasCustomRange ? start : undefined,
      end: hasCustomRange ? end : undefined,
      language: language || undefined,
    };
    try {
      const [a, t] = await Promise.all([
        fetchArticles(fetchOpts, maxrecords),
        fetchTimeline(fetchOpts),
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
      query: finalQuery,
      raw_query: query,
      timespan,
      start: hasCustomRange ? start : null,
      end: hasCustomRange ? end : null,
      country,
      language: language || null,
      domains,
      excludes,
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