import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, RefreshCw, Download, MapPin, AlertTriangle, CheckCircle2, Activity, XCircle } from "lucide-react";
import { toast } from "sonner";

type ZonaRow = { uf: string; ano: number; registros: number; zonas: number; municipios: number };
type LocalRow = { uf: string; ano: number; locais: number; com_bairro: number; municipios: number };
type SourceHealth = {
  id: string; name: string; category: string; url: string;
  ok: boolean; status: number | null; latency_ms: number | null; message: string;
  last_update: string | null; records: number | null;
};
type LocalImportRow = {
  ano: number; turno: number; cargo: string; cod_municipio: number; municipio: string; uf: string;
  zona: number; nr_local: number; nome_local: string | null; endereco: string | null;
  numero: number; nome_candidato: string | null; votos: number; bairro: string | null;
};

const ANOS_ESPERADOS = [2018, 2020, 2022, 2024];
const CSV_LOCAL_BATCH = 500;

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ";" && !inQuotes) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

const cleanCsvValue = (value: string | undefined) => (value || "").replace(/^"|"$/g, "").trim();
const norm = (s: string) => (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();

export default function TseSyncPanel() {
  const [loading, setLoading] = useState(true);
  const [zonas, setZonas] = useState<ZonaRow[]>([]);
  const [locais, setLocais] = useState<LocalRow[]>([]);
  const [importing, setImporting] = useState<string | null>(null);
  const [geocoding, setGeocoding] = useState(false);
  const [importingLocais, setImportingLocais] = useState(false);
  const [municipio, setMunicipio] = useState("");
  // Upload — Locais
  const [zipFileLocais, setZipFileLocais] = useState<File | null>(null);
  const [uploadingLocais, setUploadingLocais] = useState(false);
  const [uploadedPathLocais, setUploadedPathLocais] = useState<string | null>(null);
  // Upload — Resultados (zonas)
  const [zipFileResultados, setZipFileResultados] = useState<File | null>(null);
  const [uploadingResultados, setUploadingResultados] = useState(false);
  const [uploadedPathResultados, setUploadedPathResultados] = useState<string | null>(null);
  const [uf, setUf] = useState("MS");
  const [ano, setAno] = useState<number>(2024);
  // Diagnóstico
  const [healthLoading, setHealthLoading] = useState(false);
  const [healthChecked, setHealthChecked] = useState<string | null>(null);
  const [healthSources, setHealthSources] = useState<SourceHealth[]>([]);

  const load = async () => {
    setLoading(true);
    try {
      // Agregação client-side (sem rpc) — busca paginada simples
      const { data: zd } = await supabase
        .from("tse_votacao_zona" as any)
        .select("uf, ano, zona, cod_municipio");
      const { data: ld } = await supabase
        .from("tse_votacao_local" as any)
        .select("uf, ano, bairro, cod_municipio");

      const zMap = new Map<string, ZonaRow>();
      for (const r of (zd as any[]) || []) {
        const k = `${r.uf}|${r.ano}`;
        const cur = zMap.get(k) || { uf: r.uf, ano: r.ano, registros: 0, zonas: 0, municipios: 0 };
        cur.registros += 1;
        zMap.set(k, cur);
      }
      // recontagem distinct — fazemos num segundo loop por chave composta
      const zSets = new Map<string, { z: Set<number>; m: Set<number> }>();
      for (const r of (zd as any[]) || []) {
        const k = `${r.uf}|${r.ano}`;
        const s = zSets.get(k) || { z: new Set<number>(), m: new Set<number>() };
        s.z.add(r.zona); s.m.add(r.cod_municipio);
        zSets.set(k, s);
      }
      for (const [k, s] of zSets) {
        const cur = zMap.get(k); if (cur) { cur.zonas = s.z.size; cur.municipios = s.m.size; }
      }
      setZonas([...zMap.values()].sort((a, b) => a.uf.localeCompare(b.uf) || a.ano - b.ano));

      const lMap = new Map<string, LocalRow>();
      const lSets = new Map<string, Set<number>>();
      for (const r of (ld as any[]) || []) {
        const k = `${r.uf}|${r.ano}`;
        const cur = lMap.get(k) || { uf: r.uf, ano: r.ano, locais: 0, com_bairro: 0, municipios: 0 };
        cur.locais += 1;
        if (r.bairro) cur.com_bairro += 1;
        lMap.set(k, cur);
        const ms = lSets.get(k) || new Set<number>();
        ms.add(r.cod_municipio); lSets.set(k, ms);
      }
      for (const [k, s] of lSets) { const cur = lMap.get(k); if (cur) cur.municipios = s.size; }
      setLocais([...lMap.values()].sort((a, b) => a.uf.localeCompare(b.uf) || a.ano - b.ano));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const importTse = async () => {
    const key = `${uf}-${ano}`;
    setImporting(key);
    try {
      const { data, error } = await supabase.functions.invoke("import-tse-results", {
        body: { uf, ano, storage_path: uploadedPathResultados || undefined },
      });
      if (error) throw error;
      const d = data as any;
      toast.success(`TSE ${uf}/${ano} importado`, { description: `${d?.inserted ?? d?.inseridos ?? "?"} linhas processadas` });
      await load();
    } catch (e: any) {
      toast.error("Falha ao importar TSE", { description: e?.message || String(e) });
    } finally {
      setImporting(null);
    }
  };

  const runGeocode = async (retryEmpty = false) => {
    setGeocoding(true);
    try {
      const { data, error } = await supabase.functions.invoke("geocode-tse-locais", {
        body: retryEmpty ? { retry_empty: true } : {},
      });
      if (error) throw error;
      toast.success("Geocoding executado", {
        description: `${(data as any)?.processados ?? "?"} locais processados`,
      });
      await load();
    } catch (e: any) {
      toast.error("Falha no geocoding", { description: e?.message || String(e) });
    } finally {
      setGeocoding(false);
    }
  };

  const importLocais = async () => {
    if (!uploadedPathLocais) {
      toast.error("Envie o ZIP do TSE primeiro", { description: "Selecione e faça upload do arquivo abaixo." });
      return;
    }
    setImportingLocais(true);
    try {
      let totalInserted = 0;
      let resumeAfter = 0;
      let lap = 0;
      // Loop de retomada automática enquanto a edge function indicar timeout
      // (cada chamada processa ~50s; o ZIP completo da UF pode exigir 2-3 leituras)
      while (true) {
        lap++;
        if (lap > 8) {
          toast.warning("Importação muito longa", { description: "Pare aqui e refine o filtro de município." });
          break;
        }
        toast.info(`Processando lote ${lap}...`, { description: resumeAfter > 0 ? `Retomando da linha ${resumeAfter.toLocaleString("pt-BR")}` : "Iniciando" });
        const { data, error } = await supabase.functions.invoke("import-tse-locais", {
          body: { uf, ano, municipio: municipio.trim() || undefined, storage_path: uploadedPathLocais, resume_after: resumeAfter },
        });
        if (error) throw error;
        const d = data as any;
        totalInserted += d?.inserted ?? 0;
        if (d?.timed_out && d?.last_line) {
          resumeAfter = d.last_line;
          continue;
        }
        toast.success(`Locais TSE importados`, {
          description: `${totalInserted.toLocaleString("pt-BR")} locais — ${municipio || "todos os municípios"}/${uf} (${lap} lote${lap > 1 ? "s" : ""})`,
        });
        break;
      }
      await load();
    } catch (e: any) {
      toast.error("Falha ao importar locais", { description: e?.message || String(e) });
    } finally {
      setImportingLocais(false);
    }
  };

  const uploadZipLocais = async () => {
    if (!zipFileLocais) return;
    setUploadingLocais(true);
    try {
      const path = `eleitorado_local_votacao_${ano}_${Date.now()}.zip`;
      const { error } = await supabase.storage
        .from("tse-imports")
        .upload(path, zipFileLocais, { upsert: true, contentType: "application/zip" });
      if (error) throw error;
      setUploadedPathLocais(path);
      toast.success("ZIP enviado", { description: `${(zipFileLocais.size / 1024 / 1024).toFixed(1)} MB — pronto para importar.` });
    } catch (e: any) {
      toast.error("Falha ao enviar ZIP", { description: e?.message || String(e) });
    } finally {
      setUploadingLocais(false);
    }
  };

  const uploadZipResultados = async () => {
    if (!zipFileResultados) return;
    setUploadingResultados(true);
    try {
      const path = `votacao_candidato_munzona_${ano}_${Date.now()}.zip`;
      const { error } = await supabase.storage
        .from("tse-imports")
        .upload(path, zipFileResultados, { upsert: true, contentType: "application/zip" });
      if (error) throw error;
      setUploadedPathResultados(path);
      toast.success("ZIP enviado", { description: `${(zipFileResultados.size / 1024 / 1024).toFixed(1)} MB — pronto para importar.` });
    } catch (e: any) {
      toast.error("Falha ao enviar ZIP", { description: e?.message || String(e) });
    } finally {
      setUploadingResultados(false);
    }
  };

  const runHealthCheck = async () => {
    setHealthLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("data-sources-health");
      if (error) throw error;
      const d = data as any;
      setHealthSources(d?.sources || []);
      setHealthChecked(d?.checked_at || new Date().toISOString());
      const offline = (d?.sources || []).filter((s: SourceHealth) => !s.ok).length;
      if (offline === 0) toast.success("Todas as fontes responderam OK");
      else toast.warning(`${offline} fonte(s) com problema`, { description: "Veja os detalhes no painel." });
    } catch (e: any) {
      toast.error("Falha no diagnóstico", { description: e?.message || String(e) });
    } finally {
      setHealthLoading(false);
    }
  };

  return (
    <div className="space-y-4">
    <Card className="bg-slate-800/60 border-slate-700">
      <CardHeader>
        <CardTitle className="text-white text-base flex items-center gap-2">
          <MapPin className="w-4 h-4" /> Sincronização TSE — Zonas e Bairros
        </CardTitle>
        <CardDescription className="text-slate-400">
          Status dos dados eleitorais que alimentam o Roteiro Estratégico. Sem zonas TSE de 2024 e bairros geocodados, o roteiro não consegue gerar paradas.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Painel de status */}
        <div className="grid md:grid-cols-2 gap-4">
          {/* ZONAS */}
          <div className="rounded-lg border border-slate-700 bg-slate-900/40 p-3">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-white text-sm font-semibold">Resultados por zona</h4>
              <Button size="icon" variant="ghost" className="h-7 w-7 text-slate-400" onClick={load} disabled={loading}>
                {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              </Button>
            </div>
            {zonas.length === 0 ? (
              <p className="text-slate-500 text-xs flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500" /> Nenhum dado importado.
              </p>
            ) : (
              <ul className="space-y-1.5 text-xs">
                {zonas.map((z) => (
                  <li key={`${z.uf}-${z.ano}`} className="flex items-center justify-between bg-slate-800/60 rounded px-2 py-1.5">
                    <span className="text-slate-300">
                      <Badge variant="outline" className="mr-2 border-slate-600 text-slate-300">{z.uf}/{z.ano}</Badge>
                      {z.registros.toLocaleString("pt-BR")} reg. · {z.zonas} zonas · {z.municipios} mun.
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-2 text-[11px] text-slate-500">
              Anos esperados: {ANOS_ESPERADOS.map(a => {
                const has = zonas.some(z => z.ano === a && z.uf === uf);
                return <span key={a} className={`mr-1.5 ${has ? "text-emerald-400" : "text-amber-400"}`}>{has ? "✓" : "✗"} {a}</span>;
              })}
            </div>
          </div>

          {/* LOCAIS / BAIRROS */}
          <div className="rounded-lg border border-slate-700 bg-slate-900/40 p-3">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-white text-sm font-semibold">Bairros geocodados (locais)</h4>
            </div>
            {locais.length === 0 ? (
              <p className="text-slate-500 text-xs flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500" /> Nenhum local importado.
              </p>
            ) : (
              <ul className="space-y-1.5 text-xs">
                {locais.map((l) => {
                  const pct = l.locais > 0 ? Math.round((l.com_bairro / l.locais) * 100) : 0;
                  const cor = pct >= 80 ? "text-emerald-400" : pct >= 40 ? "text-amber-400" : "text-red-400";
                  return (
                    <li key={`${l.uf}-${l.ano}`} className="flex items-center justify-between bg-slate-800/60 rounded px-2 py-1.5">
                      <span className="text-slate-300">
                        <Badge variant="outline" className="mr-2 border-slate-600 text-slate-300">{l.uf}/{l.ano}</Badge>
                        {l.locais.toLocaleString("pt-BR")} locais
                      </span>
                      <span className={`font-mono ${cor}`}>{pct}% c/ bairro</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {/* Ações */}
        <div className="rounded-lg border border-slate-700 bg-slate-900/40 p-3 space-y-3">
          <h4 className="text-white text-sm font-semibold flex items-center gap-2">
            <Download className="w-4 h-4" /> Reenviar sincronização
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-[100px_120px_1fr] gap-2 items-end">
            <div>
              <Label className="text-xs text-slate-400">UF</Label>
              <Input value={uf} onChange={(e) => setUf(e.target.value.toUpperCase().slice(0, 2))} className="bg-slate-800 border-slate-600 text-white" />
            </div>
            <div>
              <Label className="text-xs text-slate-400">Ano</Label>
              <select value={ano} onChange={(e) => setAno(Number(e.target.value))} className="w-full h-10 rounded-md bg-slate-800 border border-slate-600 text-white text-sm px-2">
                {ANOS_ESPERADOS.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <div className="flex gap-2">
              <Button onClick={importTse} disabled={!!importing} className="flex-1">
                {importing === `${uf}-${ano}` ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                Importar TSE {uf}/{ano}
              </Button>
            </div>
          </div>
          <p className="text-[11px] text-slate-500">
            Tenta primeiro baixar do CDN do TSE; se a CDN bloquear (comum), envie o ZIP de <strong>resultados</strong> abaixo e a importação usará seu arquivo automaticamente.
          </p>

          <div className="border-t border-slate-700 pt-3 mt-3 space-y-2">
            <h5 className="text-white text-xs font-semibold flex items-center gap-2">
              <Download className="w-3.5 h-3.5" /> Upload manual — Resultados por zona (votacao_candidato_munzona)
            </h5>
            <p className="text-[11px] text-amber-300/90 bg-amber-900/20 border border-amber-700/50 rounded px-2 py-1.5">
              ⚠️ Use quando o CDN do TSE bloquear nossa nuvem. Baixe no seu PC em{" "}
              <a className="underline" target="_blank" rel="noreferrer"
                 href={`https://cdn.tse.jus.br/estatistica/sead/odsele/votacao_candidato_munzona/votacao_candidato_munzona_${ano}.zip`}>
                cdn.tse.jus.br/.../votacao_candidato_munzona_{ano}.zip
              </a>{" "}
              e envie aqui:
            </p>
            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2 items-end">
              <Input
                type="file"
                accept=".zip,application/zip"
                onChange={(e) => { setZipFileResultados(e.target.files?.[0] || null); setUploadedPathResultados(null); }}
                className="bg-slate-800 border-slate-600 text-white file:bg-slate-700 file:text-white file:border-0 file:mr-2 file:rounded"
              />
              <Button onClick={uploadZipResultados} disabled={!zipFileResultados || uploadingResultados} variant="secondary">
                {uploadingResultados ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2 rotate-180" />}
                Enviar ZIP
              </Button>
            </div>
            {uploadedPathResultados && (
              <p className="text-[11px] text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> ZIP pronto: {uploadedPathResultados} — clique em "Importar TSE" acima.
              </p>
            )}
          </div>

          <div className="border-t border-slate-700 pt-3 mt-3 space-y-2">
            <h5 className="text-white text-xs font-semibold flex items-center gap-2">
              <MapPin className="w-3.5 h-3.5" /> Upload manual — Locais de votação (escolas/endereços)
            </h5>
            <p className="text-[11px] text-amber-300/90 bg-amber-900/20 border border-amber-700/50 rounded px-2 py-1.5">
              ⚠️ O CDN do TSE bloqueia downloads diretos da nossa nuvem. Baixe o ZIP no seu computador em{" "}
              <a className="underline" target="_blank" rel="noreferrer"
                 href={`https://cdn.tse.jus.br/estatistica/sead/odsele/eleitorado_locais_votacao/eleitorado_local_votacao_${ano}.zip`}>
                cdn.tse.jus.br/.../eleitorado_local_votacao_{ano}.zip
              </a>{" "}
              e envie aqui:
            </p>
            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2 items-end">
              <Input
                type="file"
                accept=".zip,application/zip"
                onChange={(e) => { setZipFileLocais(e.target.files?.[0] || null); setUploadedPathLocais(null); }}
                className="bg-slate-800 border-slate-600 text-white file:bg-slate-700 file:text-white file:border-0 file:mr-2 file:rounded"
              />
              <Button onClick={uploadZipLocais} disabled={!zipFileLocais || uploadingLocais} variant="secondary">
                {uploadingLocais ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2 rotate-180" />}
                Enviar ZIP
              </Button>
            </div>
            {uploadedPathLocais && (
              <p className="text-[11px] text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> ZIP pronto: {uploadedPathLocais}
              </p>
            )}
            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2 items-end">
              <div>
                <Label className="text-xs text-slate-400">Município (opcional — vazio = toda a UF)</Label>
                <Input
                  placeholder="Ex.: ANGÉLICA"
                  value={municipio}
                  onChange={(e) => setMunicipio(e.target.value)}
                  className="bg-slate-800 border-slate-600 text-white"
                />
              </div>
              <Button onClick={importLocais} disabled={importingLocais || !uploadedPathLocais} variant="secondary">
                {importingLocais ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                Importar locais {uf}/{ano}
              </Button>
            </div>
            <p className="text-[11px] text-slate-500">
              Sem locais cadastrados, o geocoding não tem o que processar. Rode esta etapa para qualquer cidade nova antes de "Geocodar bairros".
            </p>
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            <Button variant="secondary" onClick={() => runGeocode(false)} disabled={geocoding}>
              {geocoding ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <MapPin className="w-4 h-4 mr-2" />}
              Geocodar bairros (próximos pendentes)
            </Button>
            <Button variant="outline" onClick={() => runGeocode(true)} disabled={geocoding} className="border-slate-600 text-slate-300">
              <RefreshCw className="w-4 h-4 mr-2" /> Reprocessar bairros vazios
            </Button>
          </div>
          <p className="text-[11px] text-slate-500 flex items-center gap-1.5">
            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
            Cada execução processa um lote dentro do limite da edge function (~50s). Rode várias vezes até `% c/ bairro` chegar perto de 100%.
          </p>
        </div>
      </CardContent>
    </Card>

    {/* Painel de diagnóstico de fontes externas */}
    <Card className="bg-slate-800/60 border-slate-700">
      <CardHeader>
        <CardTitle className="text-white text-base flex items-center gap-2">
          <Activity className="w-4 h-4" /> Diagnóstico de Fontes de Dados
        </CardTitle>
        <CardDescription className="text-slate-400">
          Testa em tempo real se cada API/CDN externa está respondendo, e mostra a última atualização salva no banco. Use quando algo "não atualizar" para descobrir se o problema é nosso ou da fonte.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-[11px] text-slate-500">
            {healthChecked ? `Última verificação: ${new Date(healthChecked).toLocaleString("pt-BR")}` : "Nunca verificado nesta sessão."}
          </p>
          <Button onClick={runHealthCheck} disabled={healthLoading} size="sm" variant="secondary">
            {healthLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Activity className="w-4 h-4 mr-2" />}
            Rodar diagnóstico
          </Button>
        </div>

        {healthSources.length === 0 ? (
          <p className="text-slate-500 text-xs italic text-center py-4">
            Clique em "Rodar diagnóstico" para verificar todas as fontes externas.
          </p>
        ) : (
          <ul className="space-y-2">
            {healthSources.map((s) => (
              <li key={s.id} className="bg-slate-900/40 border border-slate-700 rounded p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2 flex-1 min-w-0">
                    {s.ok ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                    ) : (
                      <XCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-white text-sm font-medium">{s.name}</span>
                        <Badge variant="outline" className="text-[10px] border-slate-600 text-slate-400">{s.category}</Badge>
                      </div>
                      <p className="text-[11px] text-slate-500 truncate">{s.url}</p>
                      <p className={`text-[11px] mt-1 ${s.ok ? "text-emerald-400" : "text-red-400"}`}>
                        {s.message}
                        {s.latency_ms != null && <span className="text-slate-500 ml-2">({s.latency_ms}ms)</span>}
                      </p>
                    </div>
                  </div>
                  <div className="text-right text-[11px] shrink-0">
                    {s.records != null && (
                      <div className="text-slate-300 font-mono">{s.records.toLocaleString("pt-BR")} reg.</div>
                    )}
                    {s.last_update && (
                      <div className="text-slate-500" title={new Date(s.last_update).toLocaleString("pt-BR")}>
                        atualizado: {new Date(s.last_update).toLocaleDateString("pt-BR")}
                      </div>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="text-[11px] text-slate-500 bg-slate-900/40 border border-slate-700 rounded p-2 space-y-1">
          <p><strong className="text-slate-400">Como ler:</strong></p>
          <p>• <strong className="text-emerald-400">API automática</strong>: o sistema busca sozinho quando precisa. Se está OK, não precisa fazer nada.</p>
          <p>• <strong className="text-amber-400">Upload manual</strong>: o CDN do TSE bloqueia nossa nuvem — quando precisar atualizar, baixe o ZIP no seu PC e envie pelos campos acima.</p>
        </div>
      </CardContent>
    </Card>
    </div>
  );
}
