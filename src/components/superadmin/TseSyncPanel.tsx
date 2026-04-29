import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, RefreshCw, Download, MapPin, AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

type ZonaRow = { uf: string; ano: number; registros: number; zonas: number; municipios: number };
type LocalRow = { uf: string; ano: number; locais: number; com_bairro: number; municipios: number };

const ANOS_ESPERADOS = [2018, 2020, 2022, 2024];

export default function TseSyncPanel() {
  const [loading, setLoading] = useState(true);
  const [zonas, setZonas] = useState<ZonaRow[]>([]);
  const [locais, setLocais] = useState<LocalRow[]>([]);
  const [importing, setImporting] = useState<string | null>(null);
  const [geocoding, setGeocoding] = useState(false);
  const [importingLocais, setImportingLocais] = useState(false);
  const [municipio, setMunicipio] = useState("");
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [uploadingZip, setUploadingZip] = useState(false);
  const [uploadedPath, setUploadedPath] = useState<string | null>(null);
  const [uf, setUf] = useState("MS");
  const [ano, setAno] = useState<number>(2024);

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
        body: { uf, ano },
      });
      if (error) throw error;
      toast.success(`TSE ${uf}/${ano} importado`, { description: `${(data as any)?.inseridos ?? "?"} linhas processadas` });
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
    if (!uploadedPath) {
      toast.error("Envie o ZIP do TSE primeiro", { description: "Selecione e faça upload do arquivo abaixo." });
      return;
    }
    setImportingLocais(true);
    try {
      const { data, error } = await supabase.functions.invoke("import-tse-locais", {
        body: { uf, ano, municipio: municipio.trim() || undefined, storage_path: uploadedPath },
      });
      if (error) throw error;
      const d = data as any;
      toast.success(`Locais TSE importados`, {
        description: `${d?.inserted ?? "?"} locais (${d?.unique ?? "?"} únicos) — ${municipio || "todos os municípios"}/${uf}`,
      });
      await load();
    } catch (e: any) {
      toast.error("Falha ao importar locais", { description: e?.message || String(e) });
    } finally {
      setImportingLocais(false);
    }
  };

  const uploadZip = async () => {
    if (!zipFile) return;
    setUploadingZip(true);
    try {
      const path = `eleitorado_local_votacao_${ano}_${Date.now()}.zip`;
      const { error } = await supabase.storage
        .from("tse-imports")
        .upload(path, zipFile, { upsert: true, contentType: "application/zip" });
      if (error) throw error;
      setUploadedPath(path);
      toast.success("ZIP enviado", { description: `${(zipFile.size / 1024 / 1024).toFixed(1)} MB — pronto para importar.` });
    } catch (e: any) {
      toast.error("Falha ao enviar ZIP", { description: e?.message || String(e) });
    } finally {
      setUploadingZip(false);
    }
  };

  return (
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
            Baixa os resultados oficiais por zona do TSE. Pode demorar alguns minutos. Após importar zonas de 2024, rode o geocoding abaixo para vincular cada local a um bairro real.
          </p>

          <div className="border-t border-slate-700 pt-3 mt-3 space-y-2">
            <h5 className="text-white text-xs font-semibold flex items-center gap-2">
              <MapPin className="w-3.5 h-3.5" /> Importar locais de votação (escolas/endereços)
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
                onChange={(e) => { setZipFile(e.target.files?.[0] || null); setUploadedPath(null); }}
                className="bg-slate-800 border-slate-600 text-white file:bg-slate-700 file:text-white file:border-0 file:mr-2 file:rounded"
              />
              <Button onClick={uploadZip} disabled={!zipFile || uploadingZip} variant="secondary">
                {uploadingZip ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2 rotate-180" />}
                Enviar ZIP
              </Button>
            </div>
            {uploadedPath && (
              <p className="text-[11px] text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> ZIP pronto: {uploadedPath}
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
              <Button onClick={importLocais} disabled={importingLocais || !uploadedPath} variant="secondary">
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
  );
}
