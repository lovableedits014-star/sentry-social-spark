import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Vote, TrendingUp, MapPin, Trophy } from "lucide-react";

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

const InteligenciaEleitoral = () => {
  const [cargo, setCargo] = useState<string>("Prefeito");
  const [turno, setTurno] = useState<string>("1");

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

  // Top 3 candidatos por zona
  const top3PorZona = useMemo(() => {
    const byZona: Record<number, Row[]> = {};
    for (const r of rows) {
      if (!r.numero) continue;
      (byZona[r.zona] = byZona[r.zona] || []).push(r);
    }
    return Object.entries(byZona)
      .map(([zona, arr]) => ({
        zona: Number(zona),
        top: arr.sort((a, b) => b.votos - a.votos).slice(0, 3),
        totalZona: arr.reduce((s, r) => s + r.votos, 0),
      }))
      .sort((a, b) => a.zona - b.zona);
  }, [rows]);

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
              <CardTitle>Top 3 por zona eleitoral</CardTitle>
              <CardDescription>Onde cada candidato foi mais forte. Útil para mapear bases de apoio territorial.</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <p className="text-muted-foreground">Carregando…</p>
              ) : (
                <div className="space-y-4">
                  {top3PorZona.map(({ zona, top, totalZona }) => (
                    <div key={zona} className="border rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="font-bold flex items-center gap-2">
                          <MapPin className="w-4 h-4 text-primary" />
                          Zona {zona}
                        </h3>
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {totalZona.toLocaleString("pt-BR")} votos
                        </span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                        {top.map((c, i) => (
                          <div key={`${c.numero}-${i}`} className="bg-muted/40 rounded p-3">
                            <div className="flex items-baseline gap-2">
                              <span className="text-lg font-bold text-primary">{i + 1}º</span>
                              <span className="font-medium truncate">{c.nome_urna}</span>
                            </div>
                            <div className="text-xs text-muted-foreground mt-1">
                              {c.partido} · {c.numero}
                            </div>
                            <div className="text-sm font-semibold mt-1 tabular-nums">
                              {c.votos.toLocaleString("pt-BR")} votos
                              <span className="text-xs text-muted-foreground ml-1">
                                ({totalZona > 0 ? ((c.votos / totalZona) * 100).toFixed(1) : "0"}%)
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
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