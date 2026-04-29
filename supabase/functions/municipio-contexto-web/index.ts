import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * municipio-contexto-web
 * Busca em tempo real (sem persistência) contexto recente sobre um município.
 * Fontes 100% gratuitas e sem API key:
 *  - Wikipedia REST API (resumo enciclopédico)
 *  - Google News RSS (notícias dos últimos ~90 dias)
 *  - Bing News RSS (fallback / cobertura adicional)
 *  - Google News RSS filtrado por site:gov.br (decretos / portais oficiais)
 *
 * Body: { municipio: string, uf: string, max_news?: number }
 * Retorna: { wiki, noticias, oficiais, gerado_em }
 */

const NOW = () => new Date();
const MS_DAY = 86_400_000;

function decodeEntities(s: string): string {
  return String(s || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/<[^>]+>/g, "")
    .trim();
}

function parseRssItems(xml: string, max = 8): Array<{ titulo: string; link: string; fonte: string; data: string; resumo: string }> {
  const items: Array<any> = [];
  const blockRe = /<item[\s\S]*?<\/item>/gi;
  const blocks = xml.match(blockRe) || [];
  for (const b of blocks.slice(0, max * 2)) {
    const title = (b.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || "").replace(/<!\[CDATA\[|\]\]>/g, "");
    const link = (b.match(/<link>([\s\S]*?)<\/link>/i)?.[1] || "").replace(/<!\[CDATA\[|\]\]>/g, "").trim();
    const pubDate = (b.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)?.[1] || "").trim();
    const description = (b.match(/<description>([\s\S]*?)<\/description>/i)?.[1] || "").replace(/<!\[CDATA\[|\]\]>/g, "");
    const source = (b.match(/<source[^>]*>([\s\S]*?)<\/source>/i)?.[1] || "").replace(/<!\[CDATA\[|\]\]>/g, "");

    // Filtro de idade (últimos 120 dias para garantir margem)
    let ageMs = 0;
    if (pubDate) {
      const t = Date.parse(pubDate);
      if (!Number.isFinite(t)) continue;
      ageMs = Date.now() - t;
      if (ageMs > 120 * MS_DAY) continue;
    }

    items.push({
      titulo: decodeEntities(title),
      link: link,
      fonte: decodeEntities(source) || (() => {
        try { return new URL(link).hostname.replace(/^www\./, ""); } catch { return ""; }
      })(),
      data: pubDate ? new Date(pubDate).toISOString().slice(0, 10) : "",
      resumo: decodeEntities(description).slice(0, 280),
    });
    if (items.length >= max) break;
  }
  return items;
}

async function fetchWikipediaResumo(municipio: string, uf: string): Promise<{ extrato: string; url: string } | null> {
  // Tenta variações de título — preferência por desambiguação com UF
  const candidatos = [
    `${municipio} (${uf})`,
    `${municipio}, ${uf}`,
    `${municipio}`,
  ];
  for (const titulo of candidatos) {
    try {
      const url = `https://pt.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(titulo)}`;
      const r = await fetch(url, {
        headers: { "User-Agent": "LovableAI-NarrativaPolitica/1.0 (contato@lovable.dev)" },
      });
      if (!r.ok) continue;
      const j = await r.json();
      if (j?.type === "disambiguation") continue;
      if (!j?.extract) continue;
      return {
        extrato: String(j.extract).slice(0, 800),
        url: j?.content_urls?.desktop?.page || `https://pt.wikipedia.org/wiki/${encodeURIComponent(titulo)}`,
      };
    } catch { /* tenta próximo */ }
  }
  return null;
}

/**
 * Busca seções específicas da página Wikipedia (História, Cultura, Economia, etc.)
 */
async function fetchWikipediaSecoes(municipio: string, uf: string): Promise<{
  titulo_pagina: string;
  url: string;
  secoes: Record<string, string>;
} | null> {
  const candidatos = [`${municipio} (${uf})`, `${municipio}, ${uf}`, `${municipio}`];
  const SECOES_INTERESSE = [
    "História", "Historia", "Geografia", "Cultura", "Economia",
    "Turismo", "Gastronomia", "Festas", "Festas populares", "Eventos",
    "Personalidades", "Filhos ilustres", "Etimologia", "Toponímia",
    "Toponimia", "Demografia", "Esportes", "Esporte",
    "Patrimônio", "Patrimonio", "Pontos turísticos", "Religião", "Religiao",
  ];
  for (const titulo of candidatos) {
    try {
      const secUrl = `https://pt.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(titulo)}&prop=sections&format=json&origin=*`;
      const secRes = await fetch(secUrl, { headers: { "User-Agent": "LovableAI-NarrativaPolitica/1.0" } });
      if (!secRes.ok) continue;
      const secJson = await secRes.json();
      const sections = secJson?.parse?.sections;
      const tituloReal = secJson?.parse?.title || titulo;
      if (!Array.isArray(sections) || sections.length === 0) continue;
      const out: Record<string, string> = {};
      const alvos = sections.filter((s: any) =>
        (s.toclevel === 1 || s.toclevel === 2) &&
        SECOES_INTERESSE.some((nome) => String(s.line || "").toLowerCase().includes(nome.toLowerCase())),
      ).slice(0, 8);
      const fetches = alvos.map(async (s: any) => {
        try {
          const cUrl = `https://pt.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(titulo)}&section=${s.index}&prop=wikitext&format=json&origin=*`;
          const cRes = await fetch(cUrl, { headers: { "User-Agent": "LovableAI-NarrativaPolitica/1.0" } });
          if (!cRes.ok) return;
          const cJson = await cRes.json();
          const wikitext: string = cJson?.parse?.wikitext?.["*"] || "";
          const limpo = limparWikitext(wikitext).slice(0, 1200);
          if (limpo.length > 80) out[s.line] = limpo;
        } catch { /* ignora seção */ }
      });
      await Promise.all(fetches);
      if (Object.keys(out).length === 0) continue;
      return {
        titulo_pagina: tituloReal,
        url: `https://pt.wikipedia.org/wiki/${encodeURIComponent(String(tituloReal).replace(/ /g, "_"))}`,
        secoes: out,
      };
    } catch { /* tenta próximo */ }
  }
  return null;
}

function limparWikitext(wt: string): string {
  let t = wt;
  for (let i = 0; i < 6; i++) {
    const before = t.length;
    t = t.replace(/\{\{[^{}]*\}\}/g, "");
    if (t.length === before) break;
  }
  t = t.replace(/\{\|[\s\S]*?\|\}/g, "");
  t = t.replace(/<ref[^>]*\/>/gi, "");
  t = t.replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, "");
  t = t.replace(/<!--[\s\S]*?-->/g, "");
  t = t.replace(/<[^>]+>/g, "");
  t = t.replace(/\[\[(?:Ficheiro|Arquivo|File|Imagem|Image):[^\]]*\]\]/gi, "");
  t = t.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2");
  t = t.replace(/\[\[([^\]]+)\]\]/g, "$1");
  t = t.replace(/\[https?:\/\/\S+\s+([^\]]+)\]/g, "$1");
  t = t.replace(/\[https?:\/\/\S+\]/g, "");
  t = t.replace(/'{2,5}/g, "");
  t = t.replace(/^={2,}\s*([^=]+?)\s*={2,}\s*$/gm, "$1.");
  t = t.replace(/^[*#:;]+\s*/gm, "• ");
  t = t.replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  return t;
}

async function fetchGoogleNews(query: string, max: number): Promise<any[]> {
  // Restringe a últimos 90 dias via parâmetro `when:90d`
  const q = `${query} when:90d`;
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=pt-BR&gl=BR&ceid=BR:pt-419`;
  try {
    const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 LovableNarrativa/1.0" } });
    if (!r.ok) return [];
    const xml = await r.text();
    return parseRssItems(xml, max);
  } catch (e) {
    console.warn("Google News falhou:", (e as Error).message);
    return [];
  }
}

async function fetchBingNews(query: string, max: number): Promise<any[]> {
  const url = `https://www.bing.com/news/search?q=${encodeURIComponent(query)}&format=rss&setlang=pt-br`;
  try {
    const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 LovableNarrativa/1.0" } });
    if (!r.ok) return [];
    const xml = await r.text();
    return parseRssItems(xml, max);
  } catch (e) {
    console.warn("Bing News falhou:", (e as Error).message);
    return [];
  }
}

function dedupNoticias(arr: any[], max: number): any[] {
  const seen = new Set<string>();
  const out: any[] = [];
  for (const it of arr) {
    const key = (it.titulo || "").toLowerCase().slice(0, 80);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(it);
    if (out.length >= max) break;
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { municipio, uf, max_news = 8 } = await req.json();
    if (!municipio || !uf) {
      return new Response(JSON.stringify({ error: "municipio e uf obrigatórios" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const queryNoticias = `"${municipio}" ${uf} (prefeitura OR câmara OR vereador OR prefeito OR obra OR decreto OR investigação)`;
    const queryOficiais = `${municipio} ${uf} site:gov.br`;

    // Busca em paralelo — todas independentes
    const [wiki, wikiSecoes, googleNews, bingNews, oficiais] = await Promise.all([
      fetchWikipediaResumo(municipio, uf),
      fetchWikipediaSecoes(municipio, uf),
      fetchGoogleNews(queryNoticias, max_news),
      fetchBingNews(`${municipio} ${uf} prefeitura`, Math.ceil(max_news / 2)),
      fetchGoogleNews(queryOficiais, 5),
    ]);

    const noticias = dedupNoticias([...googleNews, ...bingNews], max_news);
    // Google News encapsula a URL real; .gov.br aparece no título/fonte/resumo.
    const oficiaisFiltrados = oficiais
      .filter((n) => /\.gov\.br/i.test(`${n.link} ${n.fonte} ${n.titulo} ${n.resumo}`))
      .slice(0, 5);

    return new Response(JSON.stringify({
      municipio,
      uf,
      gerado_em: NOW().toISOString(),
      wiki,
      wiki_secoes: wikiSecoes,
      noticias,
      oficiais: oficiaisFiltrados,
      _stats: {
        wiki: wiki ? 1 : 0,
        wiki_secoes: wikiSecoes ? Object.keys(wikiSecoes.secoes).length : 0,
        noticias: noticias.length,
        oficiais: oficiaisFiltrados.length,
      },
    }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "erro desconhecido";
    console.error("municipio-contexto-web error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});