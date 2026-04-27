// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { HttpReader, ZipReader, Uint8ArrayWriter, configure } from "https://deno.land/x/zipjs@v2.7.45/index.js";

// Desliga workers (não funcionam bem em edge functions Deno)
configure({ useWebWorkers: false });

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPER_ADMIN_EMAIL = "lovableedits014@gmail.com";

// Cabeçalhos esperados (variam um pouco entre anos do TSE; mapeamos o que é estável)
// Layout do votacao_candidato_munzona desde 2018:
// 0:DT_GERACAO  1:HH_GERACAO  2:ANO_ELEICAO  3:CD_TIPO_ELEICAO  4:NM_TIPO_ELEICAO
// 5:NR_TURNO    6:CD_ELEICAO  7:DS_ELEICAO   8:DT_ELEICAO       9:TP_ABRANGENCIA
// 10:SG_UF      11:SG_UE      12:NM_UE       13:CD_MUNICIPIO    14:NM_MUNICIPIO
// 15:NR_ZONA    16:CD_CARGO   17:DS_CARGO    18:SQ_CANDIDATO    19:NR_CANDIDATO
// 20:NM_CANDIDATO 21:NM_URNA_CANDIDATO 22:NM_SOCIAL_CANDIDATO 23:CD_SITUACAO_CANDIDATURA
// 24:DS_SITUACAO_CANDIDATURA 25:CD_DETALHE_SITUACAO_CAND 26:DS_DETALHE_SITUACAO_CAND
// 27:TP_AGREMIACAO 28:NR_PARTIDO 29:SG_PARTIDO 30:NM_PARTIDO
// 31:SQ_COLIGACAO 32:NM_COLIGACAO 33:DS_COMPOSICAO_COLIGACAO
// 34:CD_FEDERACAO 35:NM_FEDERACAO 36:SG_FEDERACAO 37:DS_COMPOSICAO_FEDERACAO
// 38:SG_UE_SUPERIOR 39:NM_UE_SUPERIOR 40:CD_SIT_TOT_TURNO 41:DS_SIT_TOT_TURNO
// 42:ST_VOTO_EM_TRANSITO 43:QT_VOTOS_NOMINAIS 44:NM_TIPO_DESTINACAO_VOTOS 45:QT_VOTOS_NOMINAIS_VALIDOS

const COL = {
  ANO: 2,
  TURNO: 5,
  UF: 10,
  COD_MUN: 13,
  MUN: 14,
  ZONA: 15,
  CARGO: 17,
  NUMERO: 19,
  NOME_COMPLETO: 20,
  NOME_URNA: 21,
  SITUACAO: 41,
  PARTIDO: 29,
  VOTOS: 43,
  VOTOS_VALIDOS: 45,
};

function parseCsvLine(line: string): string[] {
  // CSV do TSE: separador ';' e campos entre aspas duplas
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ';' && !inQuotes) {
      out.push(cur); cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function decodeLatin1(buf: Uint8Array): string {
  // Os CSVs do TSE são em ISO-8859-1
  return new TextDecoder("iso-8859-1").decode(buf);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Não autenticado" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Cliente com token do usuário p/ validar identidade
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "Sessão inválida" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if ((userData.user.email || "").toLowerCase() !== SUPER_ADMIN_EMAIL) {
      return new Response(JSON.stringify({ error: "Apenas o Super-Admin pode importar dados do TSE." }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { ano = 2022, uf = "MS" } = await req.json().catch(() => ({}));
    const anoNum = Number(ano);
    const ufStr = String(uf).toUpperCase();
    if (![2018, 2020, 2022, 2024].includes(anoNum)) {
      return new Response(JSON.stringify({ error: "Ano inválido" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const zipUrl = `https://cdn.tse.jus.br/estatistica/sead/odsele/votacao_candidato_munzona/votacao_candidato_munzona_${anoNum}.zip`;
    console.log("Abrindo ZIP via HTTP range:", zipUrl);

    // HttpReader usa requisições Range para ler o ZIP sem baixar tudo em memória
    const reader = new ZipReader(new HttpReader(zipUrl, { useRangeHeader: true, preventHeadRequest: false }));
    const entries = await reader.getEntries();
    console.log("Entries no ZIP:", entries.length);
    const target = entries.find((e: any) => e.filename.toUpperCase().includes(`_${ufStr}.CSV`));
    if (!target) {
      await reader.close();
      return new Response(JSON.stringify({ error: `CSV da UF ${ufStr} não encontrado no ZIP` }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    console.log("Extraindo apenas:", target.filename, "(", target.uncompressedSize, "bytes )");

    // Extrai SOMENTE o CSV da UF — muito menor que o ZIP completo
    const buf: Uint8Array = await target.getData!(new Uint8ArrayWriter());
    await reader.close();
    const text = decodeLatin1(buf);
    console.log("CSV decodificado:", text.length, "chars");

    const lines = text.split(/\r?\n/);
    const dataLines = lines.slice(1).filter((l) => l && l.trim().length > 0); // pula cabeçalho
    console.log("Linhas a processar:", dataLines.length);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Agrega votos por (cargo, cod_mun, zona, numero) — o CSV tem 1 linha por cargo total/transito; somamos
    type Row = {
      ano: number; turno: number; cargo: string; cod_municipio: number; municipio: string;
      uf: string; zona: number; numero: number; nome_urna: string; nome_completo: string;
      partido: string; situacao: string; votos: number;
    };
    const agg = new Map<string, Row>();

    for (const line of dataLines) {
      const cols = parseCsvLine(line);
      if (cols.length < 44) continue;
      const cargoTxt = cols[COL.CARGO]?.trim() || "";
      // Normalizar nomes de cargos
      const cargo = cargoTxt
        .replace(/^DEPUTADO ESTADUAL$/i, "Deputado Estadual")
        .replace(/^DEPUTADO FEDERAL$/i, "Deputado Federal")
        .replace(/^DEPUTADO DISTRITAL$/i, "Deputado Distrital")
        .replace(/^GOVERNADOR$/i, "Governador")
        .replace(/^SENADOR$/i, "Senador")
        .replace(/^PRESIDENTE$/i, "Presidente")
        .replace(/^VEREADOR$/i, "Vereador")
        .replace(/^PREFEITO$/i, "Prefeito");
      if (!cargo) continue;
      const numero = parseInt(cols[COL.NUMERO] || "0", 10);
      if (!numero) continue;
      const cod_mun = parseInt(cols[COL.COD_MUN] || "0", 10);
      const zona = parseInt(cols[COL.ZONA] || "0", 10);
      const turno = parseInt(cols[COL.TURNO] || "1", 10);
      const votos = parseInt(cols[COL.VOTOS] || "0", 10) || 0;
      const key = `${turno}|${cargo}|${cod_mun}|${zona}|${numero}`;
      const existing = agg.get(key);
      if (existing) {
        existing.votos += votos;
      } else {
        agg.set(key, {
          ano: anoNum,
          turno,
          cargo,
          cod_municipio: cod_mun,
          municipio: cols[COL.MUN]?.trim() || "",
          uf: cols[COL.UF]?.trim() || ufStr,
          zona,
          numero,
          nome_urna: cols[COL.NOME_URNA]?.trim() || null as any,
          nome_completo: cols[COL.NOME_COMPLETO]?.trim() || null as any,
          partido: cols[COL.PARTIDO]?.trim() || null as any,
          situacao: cols[COL.SITUACAO]?.trim() || null as any,
          votos,
        });
      }
    }

    const all = Array.from(agg.values());
    console.log("Linhas agregadas:", all.length);

    // Insere em lotes
    const BATCH = 1000;
    let inserted = 0;
    let failed = 0;
    for (let i = 0; i < all.length; i += BATCH) {
      const slice = all.slice(i, i + BATCH);
      const { error } = await admin
        .from("tse_votacao_zona")
        .upsert(slice, { onConflict: "ano,turno,cargo,cod_municipio,zona,numero" });
      if (error) {
        console.error("Erro no lote", i, error.message);
        failed += slice.length;
      } else {
        inserted += slice.length;
      }
    }

    return new Response(
      JSON.stringify({ ok: true, ano: anoNum, uf: ufStr, total: all.length, inserted, failed }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("Erro fatal:", err);
    return new Response(JSON.stringify({ error: String(err?.message || err) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});