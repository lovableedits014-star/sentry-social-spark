// deno-lint-ignore-file no-explicit-any
// Importa o cadastro oficial de LOCAIS DE VOTAÇÃO (escolas + endereços) do TSE
// para um município/UF, populando public.tse_votacao_local sem votos (votos=0).
// Os votos por local vêm de outras fontes; aqui o objetivo é ter o universo de
// locais para o geocoding de bairros funcionar em qualquer cidade.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { Unzip, UnzipInflate } from "https://esm.sh/fflate@0.8.2";

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

const MAX_RUNTIME_MS = 50_000; // dentro do limite da edge function

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const startedAt = Date.now();
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

    const { ano = 2024, uf = "MS", municipio, storage_path, resume_after } = await req.json().catch(() => ({}));
    const anoNum = Number(ano);
    const ufStr = String(uf).toUpperCase();
    const munFiltro = municipio ? norm(String(municipio)) : null;
    const resumeAfter = typeof resume_after === "number" ? resume_after : 0;
    if (![2018, 2020, 2022, 2024].includes(anoNum)) {
      return new Response(JSON.stringify({ error: "Ano inválido" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!storage_path || typeof storage_path !== "string") {
      return new Response(JSON.stringify({ error: "Faltou 'storage_path' (caminho do ZIP no bucket tse-imports)." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    console.log("Baixando do Storage:", storage_path);
    const { data: fileBlob, error: dlErr } = await admin.storage.from("tse-imports").download(storage_path);
    if (dlErr || !fileBlob) {
      return new Response(JSON.stringify({ error: `Falha ao ler ZIP do Storage: ${dlErr?.message || "arquivo não encontrado"}` }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    console.log("ZIP carregado:", fileBlob.size, "bytes");

    // ===== STREAMING via fflate =====
    // O zip.js carrega buffers gigantes mesmo em modo "stream" — fflate.Unzip processa
    // chunks brutos do ZIP (incluindo deflate) sem materializar nada grande na RAM.
    const decoder = new TextDecoder("iso-8859-1");
    let lineBuffer = "";
    const lines: string[] = [];
    let producerDone = false;
    let producerError: Error | null = null;
    let targetFilename: string | null = null;

    const unzipper = new Unzip((file) => {
      // Só processamos o CSV da UF — ignora outros arquivos
      if (!file.name.toUpperCase().includes(`_${ufStr}.CSV`)) return;
      targetFilename = file.name;
      console.log("Extraindo:", file.name, "(stream fflate)");
      file.ondata = (err, chunk, final) => {
        if (err) { producerError = err; producerDone = true; return; }
        if (chunk && chunk.length) {
          lineBuffer += decoder.decode(chunk, { stream: !final });
          let nl: number;
          while ((nl = lineBuffer.indexOf("\n")) !== -1) {
            lines.push(lineBuffer.substring(0, nl).replace(/\r$/, ""));
            lineBuffer = lineBuffer.substring(nl + 1);
          }
        }
        if (final) {
          if (lineBuffer.length) {
            lines.push(lineBuffer.replace(/\r$/, ""));
            lineBuffer = "";
          }
          producerDone = true;
        }
      };
      file.start();
    });
    unzipper.register(UnzipInflate);

    // Alimenta o unzipper com chunks do blob (8MB por vez) — não materializa o ZIP inteiro
    const CHUNK = 8 * 1024 * 1024;
    const blobStream = fileBlob.stream();
    const reader = blobStream.getReader();
    let zipDone = false;
    const feedZip = async () => {
      try {
        // Acumula em buffer próprio para passar pedaços controlados ao Unzip
        let pending = new Uint8Array(0);
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          // Concatena com pendente
          const merged = new Uint8Array(pending.length + value.length);
          merged.set(pending, 0);
          merged.set(value, pending.length);
          pending = merged;
          while (pending.length >= CHUNK) {
            unzipper.push(pending.subarray(0, CHUNK), false);
            pending = pending.slice(CHUNK);
            // cede o event loop para o consumidor de linhas processar
            await new Promise((r) => setTimeout(r, 0));
          }
        }
        if (pending.length) unzipper.push(pending, true);
        else unzipper.push(new Uint8Array(0), true);
      } catch (e) {
        producerError = e as Error;
      } finally {
        zipDone = true;
        // se nenhum file callback marcou done, força
        if (!targetFilename) producerDone = true;
      }
    };
    const extractionPromise = feedZip();

    // Aguarda chegar pelo menos a primeira linha (header)
    while (lines.length === 0 && !producerDone && !producerError) {
      await new Promise((r) => setTimeout(r, 10));
    }
    if (producerError) {
      return new Response(JSON.stringify({ error: `Erro ao descomprimir ZIP: ${producerError.message}` }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!targetFilename && producerDone) {
      return new Response(JSON.stringify({ error: `CSV da UF ${ufStr} não encontrado no ZIP` }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let lineNum = 0;
    let headerCols: string[] | null = null;
    const headerLine = lines.shift();
    if (!headerLine) {
      await extractionPromise.catch(() => {});
      return new Response(JSON.stringify({ error: "CSV vazio" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    headerCols = parseCsvLine(headerLine).map((h) => h.trim().toUpperCase().replace(/^"|"$/g, ""));
    const header = headerCols;
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
    let inserted = 0; let failed = 0;
    let timedOut = false;
    const BATCH = 500;

    const flush = async () => {
      if (map.size === 0) return;
      const slice = Array.from(map.values());
      map.clear();
      const { error } = await admin
        .from("tse_votacao_local")
        .upsert(slice, { onConflict: "ano,turno,cargo,cod_municipio,zona,nr_local,numero" });
      if (error) { console.error("Erro lote", error.message); failed += slice.length; }
      else inserted += slice.length;
    };

    // Consome linhas conforme chegam do stream de descompressão
    while (true) {
      if (lines.length === 0) {
        if (producerDone) break;
        if (producerError) break;
        await new Promise((r) => setTimeout(r, 10));
        continue;
      }
      const line = lines.shift()!;
      lineNum++;
      if (lineNum <= resumeAfter) continue;
      if (!line.trim()) continue;
      scanned++;

      // Checa timeout periodicamente (a cada 2000 linhas pra não pesar)
      if (scanned % 2000 === 0) {
        if (Date.now() - startedAt > MAX_RUNTIME_MS) {
          timedOut = true;
          break;
        }
        if (scanned % 20000 === 0) {
          console.log(`progresso: scanned=${scanned} matched=${matched} inserted=${inserted} buffer=${lines.length}`);
        }
      }

      const cols = parseCsvLine(line);
      const munNome = (cols[I.MUN] || "").replace(/"/g, "").trim();
      if (munFiltro && norm(munNome) !== munFiltro) continue;
      const cod_mun = parseInt((cols[I.COD_MUN] || "0").replace(/"/g, ""), 10);
      const zona = parseInt((cols[I.ZONA] || "0").replace(/"/g, ""), 10);
      const nr_local = parseInt((cols[I.LOCAL] || "0").replace(/"/g, ""), 10);
      if (!cod_mun || !zona || !nr_local) continue;
      const key = `${cod_mun}|${zona}|${nr_local}`;
      if (map.has(key)) continue;
      const bairroRaw = (cols[I.BAIRRO] || "").replace(/"/g, "").trim();
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

      // Flush incremental para liberar memória
      if (map.size >= BATCH) {
        await flush();
      }
    }

    // Flush final
    await flush();
    // Garante que o stream finalizou (ou capturamos erro de descompressão)
    try { await extractionPromise; } catch (e) { console.error("Erro descompressão:", (e as any)?.message); }
    try { reader.cancel(); } catch { /* ignore */ }
    console.log(`scanned=${scanned} matched=${matched} inserted=${inserted} timedOut=${timedOut} lastLine=${lineNum}`);

    return new Response(JSON.stringify({
      ok: true, ano: anoNum, uf: ufStr, municipio: municipio || null,
      scanned, matched, inserted, failed,
      timed_out: timedOut,
      last_line: lineNum,
      hint: timedOut ? `Lote parcial — chame novamente com resume_after=${lineNum} para continuar.` : "Importação concluída.",
    }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("Erro fatal:", err);
    return new Response(JSON.stringify({ error: String((err as any)?.message || err) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});