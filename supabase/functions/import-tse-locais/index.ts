// deno-lint-ignore-file no-explicit-any
// Importa o cadastro oficial de LOCAIS DE VOTAÇÃO (escolas + endereços) do TSE
// para um município/UF, populando public.tse_votacao_local sem votos (votos=0).
// Os votos por local vêm de outras fontes; aqui o objetivo é ter o universo de
// locais para o geocoding de bairros funcionar em qualquer cidade.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { HttpReader, ZipReader, Uint8ArrayWriter, configure } from "https://deno.land/x/zipjs@v2.7.45/index.js";

configure({ useWebWorkers: false });

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPER_ADMIN_EMAIL = "lovableedits014@gmail.com";

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = ""; let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ';' && !inQuotes) { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

const decodeLatin1 = (b: Uint8Array) => new TextDecoder("iso-8859-1").decode(b);
const norm = (s: string) => (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Não autenticado" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "Sessão inválida" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if ((userData.user.email || "").toLowerCase() !== SUPER_ADMIN_EMAIL) {
      return new Response(JSON.stringify({ error: "Apenas o Super-Admin pode importar locais TSE." }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { ano = 2024, uf = "MS", municipio } = await req.json().catch(() => ({}));
    const anoNum = Number(ano);
    const ufStr = String(uf).toUpperCase();
    const munFiltro = municipio ? norm(String(municipio)) : null;
    if (![2018, 2020, 2022, 2024].includes(anoNum)) {
      return new Response(JSON.stringify({ error: "Ano inválido" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const zipUrl = `https://cdn.tse.jus.br/estatistica/sead/odsele/eleitorado_locais_votacao/eleitorado_local_votacao_${anoNum}.zip`;
    console.log("Abrindo ZIP:", zipUrl);

    const reader = new ZipReader(new HttpReader(zipUrl, { useRangeHeader: true, preventHeadRequest: false }));
    const entries = await reader.getEntries();
    const target = entries.find((e: any) => e.filename.toUpperCase().includes(`_${ufStr}.CSV`));
    if (!target) {
      await reader.close();
      return new Response(JSON.stringify({ error: `CSV da UF ${ufStr} não encontrado`, files: entries.map((e: any) => e.filename) }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    console.log("Extraindo:", target.filename, target.uncompressedSize, "bytes");
    const buf: Uint8Array = await target.getData!(new Uint8ArrayWriter());
    await reader.close();
    const text = decodeLatin1(buf);

    const lines = text.split(/\r?\n/);
    if (lines.length < 2) {
      return new Response(JSON.stringify({ error: "CSV vazio" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const header = parseCsvLine(lines[0]).map((h) => h.trim().toUpperCase().replace(/^"|"$/g, ""));
    const idx = (n: string) => header.indexOf(n);
    const I = {
      UF: idx("SG_UF"),
      COD_MUN: idx("CD_MUNICIPIO"),
      MUN: idx("NM_MUNICIPIO"),
      ZONA: idx("NR_ZONA"),
      LOCAL: idx("NR_LOCAL_VOTACAO"),
      NOME: idx("NM_LOCAL_VOTACAO"),
      END: idx("DS_ENDERECO"),
      BAIRRO: idx("NM_BAIRRO"),
    };
    const missing = Object.entries(I).filter(([_, v]) => v === -1).map(([k]) => k);
    if (missing.length) {
      return new Response(JSON.stringify({ error: `Colunas ausentes: ${missing.join(", ")}`, header }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    type Row = { ano: number; turno: number; cargo: string; cod_municipio: number; municipio: string; uf: string; zona: number; nr_local: number; nome_local: string | null; endereco: string | null; numero: number; nome_candidato: string | null; votos: number; bairro: string | null };
    const map = new Map<string, Row>();
    let scanned = 0; let matched = 0;
    for (const line of lines.slice(1)) {
      if (!line.trim()) continue;
      scanned++;
      const cols = parseCsvLine(line);
      const munNome = (cols[I.MUN] || "").replace(/"/g, "").trim();
      if (munFiltro && norm(munNome) !== munFiltro) continue;
      const cod_mun = parseInt((cols[I.COD_MUN] || "0").replace(/"/g, ""), 10);
      const zona = parseInt((cols[I.ZONA] || "0").replace(/"/g, ""), 10);
      const nr_local = parseInt((cols[I.LOCAL] || "0").replace(/"/g, ""), 10);
      if (!cod_mun || !zona || !nr_local) continue;
      // Marcador: importamos como "cadastro" — cargo='CADASTRO', turno=0, numero=0, votos=0.
      // Isso garante uniqueness sem colidir com linhas de votação reais (cargo='Prefeito' etc).
      const key = `${cod_mun}|${zona}|${nr_local}`;
      if (map.has(key)) continue;
      const bairroRaw = (cols[I.BAIRRO] || "").replace(/"/g, "").trim();
      // Padroniza placeholders TSE como vazios
      const bairroNorm = !bairroRaw || /^(SEM INFORMA|NAO INFORMA|N\/?I|N\/?D)/i.test(bairroRaw) ? null : bairroRaw;
      map.set(key, {
        ano: anoNum,
        turno: 0,
        cargo: "CADASTRO",
        cod_municipio: cod_mun,
        municipio: munNome,
        uf: (cols[I.UF] || ufStr).replace(/"/g, "").trim(),
        zona,
        nr_local,
        nome_local: (cols[I.NOME] || "").replace(/"/g, "").trim() || null,
        endereco: (cols[I.END] || "").replace(/"/g, "").trim() || null,
        numero: 0,
        nome_candidato: null,
        votos: 0,
        bairro: bairroNorm,
      });
      matched++;
    }
    console.log(`scanned=${scanned} matched=${matched} unique=${map.size}`);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const all = Array.from(map.values());
    const BATCH = 1000; let inserted = 0; let failed = 0;
    for (let i = 0; i < all.length; i += BATCH) {
      const slice = all.slice(i, i + BATCH);
      const { error } = await admin
        .from("tse_votacao_local")
        .upsert(slice, { onConflict: "ano,turno,cargo,cod_municipio,zona,nr_local,numero" });
      if (error) { console.error("Erro lote", i, error.message); failed += slice.length; }
      else inserted += slice.length;
    }

    return new Response(JSON.stringify({ ok: true, ano: anoNum, uf: ufStr, municipio: municipio || null, scanned, matched, unique: map.size, inserted, failed }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("Erro fatal:", err);
    return new Response(JSON.stringify({ error: String((err as any)?.message || err) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});