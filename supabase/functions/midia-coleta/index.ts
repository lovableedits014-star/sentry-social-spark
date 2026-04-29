// supabase/functions/midia-coleta/index.ts
// Pulso da Mídia — coleta diária de portais via Firecrawl + análise IA

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FIRECRAWL_API = "https://api.firecrawl.dev/v2";
const LOVABLE_AI = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MAX_RUNTIME_MS = 55_000;
const MAX_NEW_PER_PORTAL = 8; // protege orçamento Firecrawl

type Portal = { id: string; nome: string; url: string; camada: string; ativo: boolean };
type Alvo = { termo: string; tipo: string };

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

function pickArticleUrls(links: string[], portalUrl: string, limit: number): string[] {
  try {
    const baseHost = new URL(portalUrl).hostname.replace(/^www\./, "");
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of links) {
      try {
        const u = new URL(raw, portalUrl);
        const host = u.hostname.replace(/^www\./, "");
        if (!host.endsWith(baseHost)) continue;
        const path = u.pathname;
        // heurística: matérias têm path > 30 chars OU contêm hífens (slug típico)
        if (path.length < 25) continue;
        if (!/[a-z0-9]-[a-z0-9]/i.test(path)) continue;
        // ignora paginações, tags, autor
        if (/\/(tag|tags|autor|author|categoria|category|page|pagina|busca|search)\//i.test(path)) continue;
        const clean = `${u.origin}${u.pathname}`;
        if (seen.has(clean)) continue;
        seen.add(clean);
        out.push(clean);
        if (out.length >= limit) break;
      } catch { /* skip */ }
    }
    return out;
  } catch {
    return [];
  }
}

async function firecrawlMap(url: string, apiKey: string): Promise<string[]> {
  const r = await fetch(`${FIRECRAWL_API}/map`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ url, limit: 100, includeSubdomains: false }),
  });
  if (!r.ok) throw new Error(`firecrawl /map ${r.status}: ${await r.text()}`);
  const data = await r.json();
  return Array.isArray(data?.links) ? data.links : Array.isArray(data?.data?.links) ? data.data.links : [];
}

async function firecrawlScrape(url: string, apiKey: string) {
  const r = await fetch(`${FIRECRAWL_API}/scrape`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      url,
      formats: ["markdown"],
      onlyMainContent: true,
      waitFor: 800,
    }),
  });
  if (!r.ok) throw new Error(`firecrawl /scrape ${r.status}: ${await r.text()}`);
  const data = await r.json();
  // SDK v2: campos no topo OU em data
  return {
    markdown: data?.markdown ?? data?.data?.markdown ?? "",
    metadata: data?.metadata ?? data?.data?.metadata ?? {},
  };
}

async function analyzeWithAI(
  titulo: string,
  conteudo: string,
  alvos: Alvo[],
  lovableKey: string,
) {
  const alvosTxt = alvos.length
    ? alvos.map((a) => `- "${a.termo}" (${a.tipo})`).join("\n")
    : "(nenhum alvo configurado)";
  const conteudoTrunc = conteudo.slice(0, 4000);

  const prompt = `Você é analista político brasileiro. Analise esta notícia e devolva APENAS um JSON válido.

ALVOS A RASTREAR:
${alvosTxt}

TÍTULO: ${titulo}

CONTEÚDO:
${conteudoTrunc}

Responda EXATAMENTE neste formato JSON (sem markdown, sem explicação):
{
  "sentimento": "positivo" | "neutro" | "negativo",
  "sentimento_score": número entre -1.0 e 1.0,
  "relevancia_politica": número 0-100 (quão politicamente importante para os alvos),
  "alvos_mencionados": [array com termos exatos da lista de alvos que aparecem na notícia],
  "tags_assunto": [array com 1-3 tags curtas em minúsculo: ex "saude","seguranca","educacao","obras","economia","corrupcao","eleicao"],
  "resumo_ia": "1 frase curta (máx 180 chars) do impacto político para os alvos",
  "alerta_critico": true se for menção negativa direta a algum alvo, senão false
}`;

  const r = await fetch(LOVABLE_AI, {
    method: "POST",
    headers: { Authorization: `Bearer ${lovableKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0.2,
    }),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`lovable-ai ${r.status}: ${t.slice(0, 200)}`);
  }
  const data = await r.json();
  const txt = data?.choices?.[0]?.message?.content ?? "{}";
  try {
    return JSON.parse(txt);
  } catch {
    return { sentimento: "neutro", sentimento_score: 0, relevancia_politica: 0, alvos_mencionados: [], tags_assunto: [], resumo_ia: "", alerta_critico: false };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const startedAt = Date.now();

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const FIRECRAWL_KEY = Deno.env.get("FIRECRAWL_API_KEY");
  const LOVABLE_KEY = Deno.env.get("LOVABLE_API_KEY");

  if (!FIRECRAWL_KEY) {
    return new Response(JSON.stringify({ error: "FIRECRAWL_API_KEY ausente" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  if (!LOVABLE_KEY) {
    return new Response(JSON.stringify({ error: "LOVABLE_API_KEY ausente" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  let body: any = {};
  try { body = await req.json(); } catch { /* GET ou vazio */ }

  const supa = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  // Resolver client_id (pelo body ou pelo JWT do usuário)
  let clientId: string | null = body?.client_id ?? null;
  if (!clientId) {
    const auth = req.headers.get("Authorization") || "";
    const token = auth.replace(/^Bearer\s+/i, "");
    if (token) {
      const { data: userData } = await supa.auth.getUser(token);
      const uid = userData?.user?.id;
      if (uid) {
        const { data: c } = await supa.from("clients").select("id").eq("user_id", uid).maybeSingle();
        if (c?.id) clientId = c.id;
        if (!clientId) {
          const { data: tm } = await supa.from("team_members").select("client_id").eq("user_id", uid).limit(1).maybeSingle();
          if (tm?.client_id) clientId = tm.client_id as string;
        }
      }
    }
  }

  if (!clientId) {
    return new Response(JSON.stringify({ error: "client_id não resolvido" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // Cria log
  const { data: logRow } = await supa
    .from("midia_coleta_log")
    .insert({ client_id: clientId, status: "rodando" })
    .select("id")
    .single();
  const logId = logRow?.id;

  let portaisProcessados = 0;
  let noticiasNovas = 0;
  let noticiasAnalisadas = 0;
  let creditos = 0;
  const erros: any[] = [];

  try {
    // 1. Carrega portais ativos + alvos do cliente
    const [{ data: portais }, { data: alvos }] = await Promise.all([
      supa.from("midia_portais").select("id,nome,url,camada,ativo").eq("ativo", true).order("ordem"),
      supa.from("midia_alvos_monitoramento").select("termo,tipo").eq("client_id", clientId).eq("ativo", true),
    ]);

    const alvosArr: Alvo[] = (alvos || []) as Alvo[];
    const portaisArr: Portal[] = (portais || []) as Portal[];

    for (const p of portaisArr) {
      if (Date.now() - startedAt > MAX_RUNTIME_MS) {
        erros.push({ portal: p.nome, erro: "timeout - parado preventivamente" });
        break;
      }

      try {
        // /map descobre URLs do portal
        const links = await firecrawlMap(p.url, FIRECRAWL_KEY);
        creditos += 1;
        const candidatos = pickArticleUrls(links, p.url, 30);

        // Quais URLs ainda NÃO temos? (limita por MAX_NEW_PER_PORTAL)
        const { data: existentes } = await supa
          .from("midia_noticias")
          .select("url")
          .eq("client_id", clientId)
          .in("url", candidatos);
        const known = new Set((existentes || []).map((x: any) => x.url));
        const novosUrls = candidatos.filter((u) => !known.has(u)).slice(0, MAX_NEW_PER_PORTAL);

        portaisProcessados += 1;

        for (const url of novosUrls) {
          if (Date.now() - startedAt > MAX_RUNTIME_MS) break;
          try {
            const { markdown, metadata } = await firecrawlScrape(url, FIRECRAWL_KEY);
            creditos += 1;
            const titulo = (metadata?.title || metadata?.ogTitle || "Sem título").toString().slice(0, 500);
            const dataPub = metadata?.publishedTime || metadata?.articlePublishedTime || metadata?.modifiedTime || null;

            // Analisa com IA
            const analise = await analyzeWithAI(titulo, markdown || "", alvosArr, LOVABLE_KEY);
            noticiasAnalisadas += 1;

            // Insere
            const { error: insErr } = await supa.from("midia_noticias").insert({
              client_id: clientId,
              portal_id: p.id,
              portal_nome: p.nome,
              url,
              titulo,
              resumo: (markdown || "").slice(0, 500),
              conteudo_md: (markdown || "").slice(0, 8000),
              data_publicacao: dataPub,
              sentimento: analise.sentimento,
              sentimento_score: analise.sentimento_score,
              relevancia_politica: analise.relevancia_politica,
              alvos_mencionados: analise.alvos_mencionados || [],
              tags_assunto: analise.tags_assunto || [],
              resumo_ia: analise.resumo_ia,
              alerta_critico: !!analise.alerta_critico,
              raw_metadata: metadata || null,
            });
            if (!insErr) noticiasNovas += 1;
            else erros.push({ url, erro: insErr.message });
          } catch (e: any) {
            erros.push({ url, erro: String(e?.message || e).slice(0, 200) });
          }
        }
      } catch (e: any) {
        erros.push({ portal: p.nome, erro: String(e?.message || e).slice(0, 200) });
      }
    }

    if (logId) {
      await supa
        .from("midia_coleta_log")
        .update({
          finalizado_em: new Date().toISOString(),
          portais_processados: portaisProcessados,
          noticias_novas: noticiasNovas,
          noticias_analisadas: noticiasAnalisadas,
          creditos_firecrawl: creditos,
          erros: erros.length ? erros : null,
          status: "sucesso",
        })
        .eq("id", logId);
    }

    return new Response(
      JSON.stringify({
        ok: true,
        portais_processados: portaisProcessados,
        noticias_novas: noticiasNovas,
        noticias_analisadas: noticiasAnalisadas,
        creditos_firecrawl: creditos,
        erros,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    if (logId) {
      await supa
        .from("midia_coleta_log")
        .update({
          finalizado_em: new Date().toISOString(),
          status: "falhou",
          erros: [{ erro: String(e?.message || e) }],
        })
        .eq("id", logId);
    }
    return new Response(JSON.stringify({ ok: false, error: String(e?.message || e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});