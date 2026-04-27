import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Vote, TrendingUp, MapPin, Trophy, ChevronDown, ChevronRight, Search, Building2, User } from "lucide-react";

type Row = {
  id: number;
  ano: number;
  turno: number;
  cargo: string;
  cod_municipio: number;
  municipio: string;
  uf: string;
  zona: number;
  numero: number | null;
  nome_urna: string | null;
  nome_completo: string | null;
  partido: string | null;
  situacao: string | null;
  votos: number;
};

type LocalRow = {
  id: number;
  turno: number;
  cargo: string;
  zona: number;
  nr_local: number;
  nome_local: string | null;
  endereco: string | null;
  numero: number;
  nome_candidato: string | null;
  votos: number;
};

const InteligenciaEleitoral = () => {
  const [cargo, setCargo] = useState<string>("Prefeito");
  const [turno, setTurno] = useState<string>("1");
  const [openZonas, setOpenZonas] = useState<Record<number, boolean>>({});
  const [zonaSearch, setZonaSearch] = useState<Record<number, string>>({});
  const [localMode, setLocalMode] = useState<"candidato" | "local">("candidato");
  const [selectedCandidato, setSelectedCandidato] = useState<number | null>(null);
  const [selectedLocal, setSelectedLocal] = useState<string | null>(null); // "zona-nr_local"
  const [candidatoSearch, setCandidatoSearch] = useState("");
  const [localSearch, setLocalSearch] = useState("");

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["tse-votacao", cargo, turno],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tse_votacao_zona" as any)
        .select("*")
        .eq("cargo", cargo)
        .eq("turno", Number(turno))
        .order("votos", { ascending: false })
        .limit(5000);
      if (error) throw error;
      return (data || []) as unknown as Row[];
    },
  });

  // Buscar todos os locais distintos (uma vez por cargo/turno) — só metadados leves
  const { data: locaisMeta = [] } = useQuery({
    queryKey: ["tse-locais-meta", cargo, turno],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_tse_locais_summary" as any, {
        p_cargo: cargo,
        p_turno: Number(turno),
      });
      if (error) throw error;
      return ((data || []) as any[]).map((r) => ({
        zona: r.zona,
        nr_local: r.nr_local,
        nome_local: r.nome_local || "",
        endereco: r.endereco || "",
        total: Number(r.total_votos || 0),
      }));
    },
  });

  // Quando candidato selecionado: buscar votos dele em todos os locais
  const { data: votosPorLocalCand = [], isLoading: loadingCand } = useQuery({
    queryKey: ["tse-cand-locais", cargo, turno, selectedCandidato],
    enabled: !!selectedCandidato,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tse_votacao_local" as any)
        .select("*")
        .eq("cargo", cargo)
        .eq("turno", Number(turno))
        .eq("numero", selectedCandidato!)
        .order("votos", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data || []) as unknown as LocalRow[];
    },
  });

  // Quando local selecionado: buscar ranking de candidatos nele
  const { data: rankingDoLocal = [], isLoading: loadingLocal } = useQuery({
    queryKey: ["tse-local-ranking", cargo, turno, selectedLocal],
    enabled: !!selectedLocal,
    queryFn: async () => {
      const [zona, nr_local] = selectedLocal!.split("-").map(Number);
      const { data, error } = await supabase
        .from("tse_votacao_local" as any)
        .select("*")
        .eq("cargo", cargo)
        .eq("turno", Number(turno))
        .eq("zona", zona)
        .eq("nr_local", nr_local)
        .order("votos", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return (data || []) as unknown as LocalRow[];
    },
  });

  // Aggregate by candidate
  const ranking = useMemo(() => {
    const map = new Map<number, { numero: number; nome: string; partido: string; situacao: string; total: number; zonas: number }>();
    for (const r of rows) {
      if (!r.numero) continue;
      const cur = map.get(r.numero) || {
        numero: r.numero,
        nome: r.nome_urna || r.nome_completo || `#${r.numero}`,
        partido: r.partido || "—",
        situacao: r.situacao || "—",
        total: 0,
        zonas: 0,
      };
      cur.total += r.votos;
      cur.zonas += 1;
      map.set(r.numero, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [rows]);

  const totalVotos = ranking.reduce((s, c) => s + c.total, 0);
  const top10 = ranking.slice(0, 10);

  // Zonas únicas ordenadas
  const zonas = useMemo(() => {
    const set = new Set<number>();
    rows.forEach((r) => set.add(r.zona));
    return Array.from(set).sort((a, b) => a - b);
  }, [rows]);

  // Ranking completo por zona
  const rankingPorZona = useMemo(() => {
    const byZona: Record<number, Row[]> = {};
    for (const r of rows) {
      if (!r.numero) continue;
      (byZona[r.zona] = byZona[r.zona] || []).push(r);
    }
    return Object.entries(byZona)
      .map(([zona, arr]) => ({
        zona: Number(zona),
        ranking: arr.sort((a, b) => b.votos - a.votos),
        totalZona: arr.reduce((s, r) => s + r.votos, 0),
      }))
      .sort((a, b) => a.zona - b.zona);
  }, [rows]);

  const toggleZona = (z: number) => setOpenZonas((prev) => ({ ...prev, [z]: !prev[z] }));
  const expandAll = () => setOpenZonas(Object.fromEntries(rankingPorZona.map((z) => [z.zona, true])));
  const collapseAll = () => setOpenZonas({});

  const candidatosFiltrados = useMemo(() => {
    const s = candidatoSearch.toLowerCase().trim();
    if (!s) return ranking.slice(0, 50);
    return ranking.filter(
      (c) => c.nome.toLowerCase().includes(s) || String(c.numero).includes(s) || c.partido.toLowerCase().includes(s),
    ).slice(0, 80);
  }, [ranking, candidatoSearch]);

  const locaisFiltrados = useMemo(() => {
    const s = localSearch.toLowerCase().trim();
    if (!s) return locaisMeta.slice(0, 50);
    return locaisMeta.filter(
      (l) => (l.nome_local || "").toLowerCase().includes(s) || (l.endereco || "").toLowerCase().includes(s) || String(l.zona).includes(s),
    ).slice(0, 80);
  }, [locaisMeta, localSearch]);

  const totalVotosCand = votosPorLocalCand.reduce((s, r) => s + r.votos, 0);
  const totalVotosLocal = rankingDoLocal.reduce((s, r) => s + r.votos, 0);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Vote className="w-7 h-7 text-primary" />
          Inteligência Eleitoral
        </h1>
        <p className="text-muted-foreground mt-1">
          Resultados oficiais TSE 2024 — <strong>Campo Grande/MS</strong>. Veja desempenho de candidatos e ranking por zona eleitoral.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Cargo</label>
          <Select value={cargo} onValueChange={setCargo}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Prefeito">Prefeito</SelectItem>
              <SelectItem value="Vereador">Vereador</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Turno</label>
          <Select value={turno} onValueChange={setTurno}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="1">1º turno</SelectItem>
              <SelectItem value="2">2º turno</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2"><Trophy className="w-4 h-4" /> Total de votos</CardDescription>
            <CardTitle className="text-2xl">{totalVotos.toLocaleString("pt-BR")}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2"><TrendingUp className="w-4 h-4" /> Candidatos</CardDescription>
            <CardTitle className="text-2xl">{ranking.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2"><MapPin className="w-4 h-4" /> Zonas eleitorais</CardDescription>
            <CardTitle className="text-2xl">{zonas.length}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Tabs defaultValue="ranking" className="w-full">
        <TabsList>
          <TabsTrigger value="ranking">Ranking geral</TabsTrigger>
          <TabsTrigger value="por-zona">Por zona eleitoral</TabsTrigger>
          <TabsTrigger value="por-local">Por local de votação</TabsTrigger>
        </TabsList>

        <TabsContent value="ranking" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Top 10 — {cargo} ({turno}º turno)</CardTitle>
              <CardDescription>Soma de votos em todas as zonas eleitorais de Campo Grande/MS.</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <p className="text-muted-foreground">Carregando…</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead>Candidato</TableHead>
                      <TableHead>Partido</TableHead>
                      <TableHead>Nº</TableHead>
                      <TableHead>Situação</TableHead>
                      <TableHead className="text-right">Votos</TableHead>
                      <TableHead className="text-right">% válidos</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {top10.map((c, i) => (
                      <TableRow key={c.numero}>
                        <TableCell className="font-bold">{i + 1}</TableCell>
                        <TableCell className="font-medium">{c.nome}</TableCell>
                        <TableCell><Badge variant="outline">{c.partido}</Badge></TableCell>
                        <TableCell>{c.numero}</TableCell>
                        <TableCell>
                          <span className={`text-xs ${c.situacao.startsWith("ELEITO") ? "text-green-600 font-semibold" : "text-muted-foreground"}`}>
                            {c.situacao}
                          </span>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{c.total.toLocaleString("pt-BR")}</TableCell>
                        <TableCell className="text-right tabular-nums">{totalVotos > 0 ? ((c.total / totalVotos) * 100).toFixed(1) : "0.0"}%</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="por-zona" className="mt-4">
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div>
                  <CardTitle>Ranking completo por zona eleitoral</CardTitle>
                  <CardDescription>
                    Veja o pódio de cada zona e expanda para conferir a colocação de todos os candidatos. Ideal para mapear redutos e descobrir onde cada vereador foi mais forte.
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <button onClick={expandAll} className="text-xs px-3 py-1 rounded border hover:bg-muted">Expandir todas</button>
                  <button onClick={collapseAll} className="text-xs px-3 py-1 rounded border hover:bg-muted">Recolher todas</button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <p className="text-muted-foreground">Carregando…</p>
              ) : (
                <div className="space-y-3">
                  {rankingPorZona.map(({ zona, ranking: rk, totalZona }) => {
                    const isOpen = !!openZonas[zona];
                    const top3 = rk.slice(0, 3);
                    const search = (zonaSearch[zona] || "").toLowerCase().trim();
                    const filtered = search
                      ? rk.filter(
                          (c) =>
                            (c.nome_urna || "").toLowerCase().includes(search) ||
                            (c.partido || "").toLowerCase().includes(search) ||
                            String(c.numero || "").includes(search),
                        )
                      : rk;
                    return (
                      <Collapsible key={zona} open={isOpen} onOpenChange={() => toggleZona(zona)}>
                        <div className="border rounded-lg overflow-hidden">
                          <CollapsibleTrigger className="w-full p-4 flex items-center justify-between hover:bg-muted/30 transition">
                            <div className="flex items-center gap-3">
                              {isOpen ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                              <MapPin className="w-4 h-4 text-primary" />
                              <h3 className="font-bold text-left">Zona {zona}</h3>
                              <span className="text-xs text-muted-foreground tabular-nums">
                                · {rk.length} candidatos · {totalZona.toLocaleString("pt-BR")} votos
                              </span>
                            </div>
                            <div className="hidden md:flex items-center gap-2 text-xs">
                              {top3.map((c, i) => (
                                <span key={`${c.numero}-${i}`} className="px-2 py-1 rounded bg-muted/50">
                                  <strong className="text-primary">{i + 1}º</strong> {c.nome_urna} <span className="text-muted-foreground">({c.votos.toLocaleString("pt-BR")})</span>
                                </span>
                              ))}
                            </div>
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <div className="border-t p-4 space-y-3">
                              <div className="relative">
                                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                                <Input
                                  placeholder="Buscar candidato, partido ou número…"
                                  value={zonaSearch[zona] || ""}
                                  onChange={(e) => setZonaSearch((p) => ({ ...p, [zona]: e.target.value }))}
                                  className="pl-9 h-8 text-sm"
                                />
                              </div>
                              <div className="max-h-[480px] overflow-y-auto rounded border">
                                <Table>
                                  <TableHeader className="sticky top-0 bg-background z-10">
                                    <TableRow>
                                      <TableHead className="w-14">Pos.</TableHead>
                                      <TableHead>Candidato</TableHead>
                                      <TableHead>Partido</TableHead>
                                      <TableHead>Nº</TableHead>
                                      <TableHead className="text-right">Votos</TableHead>
                                      <TableHead className="text-right">% zona</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {filtered.map((c) => {
                                      const pos = rk.findIndex((x) => x.numero === c.numero) + 1;
                                      return (
                                        <TableRow key={`${zona}-${c.numero}`}>
                                          <TableCell className={`font-bold tabular-nums ${pos <= 3 ? "text-primary" : ""}`}>{pos}º</TableCell>
                                          <TableCell className="font-medium">{c.nome_urna}</TableCell>
                                          <TableCell><Badge variant="outline">{c.partido}</Badge></TableCell>
                                          <TableCell className="tabular-nums">{c.numero}</TableCell>
                                          <TableCell className="text-right tabular-nums">{c.votos.toLocaleString("pt-BR")}</TableCell>
                                          <TableCell className="text-right tabular-nums">
                                            {totalZona > 0 ? ((c.votos / totalZona) * 100).toFixed(2) : "0.00"}%
                                          </TableCell>
                                        </TableRow>
                                      );
                                    })}
                                    {filtered.length === 0 && (
                                      <TableRow>
                                        <TableCell colSpan={6} className="text-center text-muted-foreground text-sm py-6">
                                          Nenhum candidato encontrado.
                                        </TableCell>
                                      </TableRow>
                                    )}
                                  </TableBody>
                                </Table>
                              </div>
                            </div>
                          </CollapsibleContent>
                        </div>
                      </Collapsible>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="por-local" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Análise por local de votação</CardTitle>
              <CardDescription>
                Granularidade máxima: descubra onde cada candidato fez votos (escola/colégio + endereço) ou veja o ranking dentro de um local específico. Ideal para mapear redutos no nível de bairro.
              </CardDescription>
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => { setLocalMode("candidato"); setSelectedLocal(null); }}
                  className={`text-xs px-3 py-1.5 rounded border flex items-center gap-1.5 ${localMode === "candidato" ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"}`}
                >
                  <User className="w-3.5 h-3.5" /> Buscar por candidato
                </button>
                <button
                  onClick={() => { setLocalMode("local"); setSelectedCandidato(null); }}
                  className={`text-xs px-3 py-1.5 rounded border flex items-center gap-1.5 ${localMode === "local" ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"}`}
                >
                  <Building2 className="w-3.5 h-3.5" /> Buscar por local
                </button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-[320px_1fr] gap-4">
                {/* Coluna esquerda — lista para selecionar */}
                <div className="border rounded-lg p-3 space-y-2 max-h-[640px] overflow-y-auto">
                  {localMode === "candidato" ? (
                    <>
                      <div className="relative">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          placeholder="Buscar candidato…"
                          value={candidatoSearch}
                          onChange={(e) => setCandidatoSearch(e.target.value)}
                          className="pl-9 h-8 text-sm"
                        />
                      </div>
                      {candidatosFiltrados.map((c) => (
                        <button
                          key={c.numero}
                          onClick={() => setSelectedCandidato(c.numero)}
                          className={`w-full text-left p-2 rounded text-sm hover:bg-muted transition ${selectedCandidato === c.numero ? "bg-muted border border-primary" : ""}`}
                        >
                          <div className="font-medium truncate">{c.nome}</div>
                          <div className="text-xs text-muted-foreground">
                            {c.partido} · #{c.numero} · {c.total.toLocaleString("pt-BR")} votos
                          </div>
                        </button>
                      ))}
                    </>
                  ) : (
                    <>
                      <div className="relative">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          placeholder="Buscar escola, endereço ou zona…"
                          value={localSearch}
                          onChange={(e) => setLocalSearch(e.target.value)}
                          className="pl-9 h-8 text-sm"
                        />
                      </div>
                      {locaisFiltrados.map((l) => {
                        const k = `${l.zona}-${l.nr_local}`;
                        return (
                          <button
                            key={k}
                            onClick={() => setSelectedLocal(k)}
                            className={`w-full text-left p-2 rounded text-sm hover:bg-muted transition ${selectedLocal === k ? "bg-muted border border-primary" : ""}`}
                          >
                            <div className="font-medium text-xs leading-tight truncate">{l.nome_local}</div>
                            <div className="text-xs text-muted-foreground truncate">{l.endereco}</div>
                            <div className="text-xs text-muted-foreground">
                              Zona {l.zona} · {l.total.toLocaleString("pt-BR")} votos
                            </div>
                          </button>
                        );
                      })}
                    </>
                  )}
                </div>

                {/* Coluna direita — detalhes */}
                <div>
                  {localMode === "candidato" && !selectedCandidato && (
                    <div className="text-sm text-muted-foreground p-8 text-center border rounded-lg">
                      Selecione um candidato à esquerda para ver onde ele fez votos.
                    </div>
                  )}
                  {localMode === "local" && !selectedLocal && (
                    <div className="text-sm text-muted-foreground p-8 text-center border rounded-lg">
                      Selecione um local de votação para ver o ranking de candidatos nele.
                    </div>
                  )}
                  {localMode === "candidato" && selectedCandidato && (
                    <div className="space-y-3">
                      <div className="border rounded-lg p-3 bg-muted/20">
                        <div className="text-sm text-muted-foreground">Candidato</div>
                        <div className="font-bold text-lg">{ranking.find((c) => c.numero === selectedCandidato)?.nome}</div>
                        <div className="text-sm">
                          {totalVotosCand.toLocaleString("pt-BR")} votos em {votosPorLocalCand.length} locais
                        </div>
                      </div>
                      {loadingCand ? (
                        <p className="text-sm text-muted-foreground">Carregando…</p>
                      ) : (
                        <div className="max-h-[520px] overflow-y-auto rounded border">
                          <Table>
                            <TableHeader className="sticky top-0 bg-background z-10">
                              <TableRow>
                                <TableHead className="w-12">Pos.</TableHead>
                                <TableHead>Local de votação</TableHead>
                                <TableHead>Endereço</TableHead>
                                <TableHead>Zona</TableHead>
                                <TableHead className="text-right">Votos</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {votosPorLocalCand.map((r, i) => (
                                <TableRow key={r.id}>
                                  <TableCell className={`font-bold ${i < 3 ? "text-primary" : ""}`}>{i + 1}º</TableCell>
                                  <TableCell className="font-medium text-sm">{r.nome_local}</TableCell>
                                  <TableCell className="text-xs text-muted-foreground">{r.endereco}</TableCell>
                                  <TableCell className="tabular-nums">{r.zona}</TableCell>
                                  <TableCell className="text-right tabular-nums font-semibold">{r.votos.toLocaleString("pt-BR")}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </div>
                  )}
                  {localMode === "local" && selectedLocal && (
                    <div className="space-y-3">
                      {(() => {
                        const l = locaisMeta.find((x) => `${x.zona}-${x.nr_local}` === selectedLocal);
                        return l ? (
                          <div className="border rounded-lg p-3 bg-muted/20">
                            <div className="text-sm text-muted-foreground">Local de votação · Zona {l.zona}</div>
                            <div className="font-bold">{l.nome_local}</div>
                            <div className="text-xs text-muted-foreground">{l.endereco}</div>
                            <div className="text-sm mt-1">
                              {totalVotosLocal.toLocaleString("pt-BR")} votos · {rankingDoLocal.length} candidatos
                            </div>
                          </div>
                        ) : null;
                      })()}
                      {loadingLocal ? (
                        <p className="text-sm text-muted-foreground">Carregando…</p>
                      ) : (
                        <div className="max-h-[520px] overflow-y-auto rounded border">
                          <Table>
                            <TableHeader className="sticky top-0 bg-background z-10">
                              <TableRow>
                                <TableHead className="w-12">Pos.</TableHead>
                                <TableHead>Candidato</TableHead>
                                <TableHead>Nº</TableHead>
                                <TableHead className="text-right">Votos</TableHead>
                                <TableHead className="text-right">% local</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {rankingDoLocal.map((r, i) => (
                                <TableRow key={r.id}>
                                  <TableCell className={`font-bold ${i < 3 ? "text-primary" : ""}`}>{i + 1}º</TableCell>
                                  <TableCell className="font-medium">{r.nome_candidato}</TableCell>
                                  <TableCell className="tabular-nums">{r.numero}</TableCell>
                                  <TableCell className="text-right tabular-nums font-semibold">{r.votos.toLocaleString("pt-BR")}</TableCell>
                                  <TableCell className="text-right tabular-nums">
                                    {totalVotosLocal > 0 ? ((r.votos / totalVotosLocal) * 100).toFixed(2) : "0.00"}%
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <p className="text-xs text-muted-foreground text-center">
        Fonte: TSE — Tribunal Superior Eleitoral. Eleições 2024.
      </p>
    </div>
  );
};

export default InteligenciaEleitoral;