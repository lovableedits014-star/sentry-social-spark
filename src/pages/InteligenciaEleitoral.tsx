import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Vote, BarChart3, Users, LayoutGrid, Map as MapIcon, GitCompare,
  Building2, Trophy, MapPin, Database, FlaskConical, Network, Target,
} from "lucide-react";
import ComposicaoChapa from "@/components/inteligencia/ComposicaoChapa";
import CompararCandidatos from "@/components/inteligencia/CompararCandidatos";
import EvolucaoPartidos from "@/components/inteligencia/EvolucaoPartidos";
import MapaCalorMunicipios from "@/components/inteligencia/MapaCalorMunicipios";
import SimuladorChapa from "@/components/inteligencia/SimuladorChapa";
import CampoGrandeAnalise from "@/components/inteligencia/cg/CampoGrandeAnalise";
import { EleitoralFiltersProvider, useEleitoralFilters } from "@/components/inteligencia/_shared/EleitoralFiltersContext";
import EleitoralScopeBar from "@/components/inteligencia/_shared/EleitoralScopeBar";
import MunicipioContextoIBGE from "@/components/ibge/MunicipioContextoIBGE";

type CoverageRow = {
  ano: number;
  ufs: number;
  municipios: number;
  candidatos: number;
  votos: number;
};

const fmt = (n: number) => n.toLocaleString("pt-BR");

const InteligenciaEleitoralInner = () => {
  const f = useEleitoralFilters();

  // KPIs contextuais — cobertura global do dataset TSE
  const { data: coverage } = useQuery<CoverageRow[]>({
    queryKey: ["tse-coverage-global", f.uf, f.municipio, f.anoMode, f.cargo],
    staleTime: Infinity,
    queryFn: async () => {
      let q: any = supabase
        .from("tse_votacao_zona" as any)
        .select("ano,uf,cod_municipio,numero,partido,votos,cargo,municipio");
      if (f.uf !== "__all__") q = q.eq("uf", f.uf);
      if (f.municipio !== "__all__") q = q.eq("municipio", f.municipio);
      if (f.cargo !== "__all__") q = q.eq("cargo", f.cargo);
      if (f.anoMode !== "ambos") q = q.eq("ano", Number(f.anoMode));
      const { data, error } = await q;
      if (error) throw error;
      const byAno = new Map<number, { ufs: Set<string>; munis: Set<number>; cands: Set<string>; votos: number }>();
      (data as any[] || []).forEach((r) => {
        if (!byAno.has(r.ano)) byAno.set(r.ano, { ufs: new Set(), munis: new Set(), cands: new Set(), votos: 0 });
        const b = byAno.get(r.ano)!;
        if (r.uf) b.ufs.add(r.uf);
        if (r.cod_municipio) b.munis.add(r.cod_municipio);
        if (r.numero) b.cands.add(`${r.numero}-${r.partido || ""}`);
        b.votos += Number(r.votos || 0);
      });
      return Array.from(byAno.entries())
        .map(([ano, b]) => ({ ano, ufs: b.ufs.size, municipios: b.munis.size, candidatos: b.cands.size, votos: b.votos }))
        .sort((a, b) => a.ano - b.ano);
    },
  });

  const totalVotos = (coverage || []).reduce((s, r) => s + r.votos, 0);
  const totalMunicipios = Math.max(0, ...(coverage || []).map((r) => r.municipios));
  const totalCandidatos = (coverage || []).reduce((s, r) => s + r.candidatos, 0);
  const anosCobertos = (coverage || []).map((r) => r.ano);

  const escopoLabel = useMemo(() => {
    const partes: string[] = [];
    partes.push(f.uf === "__all__" ? "Brasil" : f.uf);
    if (f.municipio !== "__all__") partes.push(f.municipio);
    partes.push(f.cargo === "__all__" ? "todos cargos" : f.cargo);
    partes.push(f.anoMode === "ambos" ? "2022+2024" : f.anoMode);
    return partes.join(" · ");
  }, [f]);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Vote className="w-7 h-7 text-primary" />
            Inteligência Eleitoral
          </h1>
          <p className="text-muted-foreground mt-1 max-w-2xl">
            Analise resultados oficiais do TSE de qualquer município e cargo. Compare candidatos,
            mapeie partidos, monte chapas estratégicas e identifique oportunidades territoriais.
          </p>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <Badge variant="secondary" className="gap-1">
              <Database className="w-3 h-3" />
              Dataset TSE {anosCobertos.length > 0 ? anosCobertos.join(" + ") : "—"}
            </Badge>
            {coverage?.map((c) => (
              <Badge key={c.ano} variant="outline" className="text-xs">
                {c.ano}: {c.ufs} UF · {fmt(c.municipios)} municípios
              </Badge>
            ))}
          </div>
        </div>
      </div>

      {/* Barra de escopo global (filtros + breadcrumb) */}
      <EleitoralScopeBar />

      {/* Contexto socioeconômico IBGE — só quando UF + município específicos */}
      {f.uf !== "__all__" && f.municipio !== "__all__" && (
        <MunicipioContextoIBGE nome={f.municipio} uf={f.uf} />
      )}

      {/* KPIs contextuais — reagem ao escopo */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2"><Trophy className="w-4 h-4" /> Total de votos · {escopoLabel}</CardDescription>
            <CardTitle className="text-2xl">{fmt(totalVotos)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2"><Users className="w-4 h-4" /> Candidatos</CardDescription>
            <CardTitle className="text-2xl">{fmt(totalCandidatos)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2"><MapPin className="w-4 h-4" /> Municípios</CardDescription>
            <CardTitle className="text-2xl">{fmt(totalMunicipios)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2"><Database className="w-4 h-4" /> Anos cobertos</CardDescription>
            <CardTitle className="text-2xl">{anosCobertos.length}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Tabs principais — 3 grupos */}
      <Tabs defaultValue="panorama" className="w-full">
        <TabsList className="grid w-full grid-cols-1 md:grid-cols-4 h-auto">
          <TabsTrigger value="panorama" className="flex items-center gap-2 py-2.5">
            <BarChart3 className="w-4 h-4" />
            <span>Panorama</span>
          </TabsTrigger>
          <TabsTrigger value="candidatos" className="flex items-center gap-2 py-2.5">
            <Users className="w-4 h-4" />
            <span>Candidatos</span>
          </TabsTrigger>
          <TabsTrigger value="composicao" className="flex items-center gap-2 py-2.5">
            <FlaskConical className="w-4 h-4" />
            <span>Composição & Simulação</span>
          </TabsTrigger>
          <TabsTrigger value="hiperlocal" className="flex items-center gap-2 py-2.5">
            <Building2 className="w-4 h-4" />
            <span>Hiperlocal · CG/MS</span>
          </TabsTrigger>
        </TabsList>

        {/* PANORAMA — visão macro */}
        <TabsContent value="panorama" className="mt-4">
          <Card className="mb-4">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-primary" /> Panorama eleitoral
              </CardTitle>
              <CardDescription>
                Visão macro: como votos se distribuem por município, partido e ano. Use para entender o cenário antes de mergulhar em candidatos individuais.
              </CardDescription>
            </CardHeader>
          </Card>
          <Tabs defaultValue="mapa" className="w-full">
            <TabsList>
              <TabsTrigger value="mapa" className="gap-1.5"><MapIcon className="w-3.5 h-3.5" /> Mapa de calor por município</TabsTrigger>
              <TabsTrigger value="partidos" className="gap-1.5"><Network className="w-3.5 h-3.5" /> Partidos & migrações</TabsTrigger>
            </TabsList>
            <TabsContent value="mapa" className="mt-4"><MapaCalorMunicipios /></TabsContent>
            <TabsContent value="partidos" className="mt-4"><EvolucaoPartidos /></TabsContent>
          </Tabs>
        </TabsContent>

        {/* CANDIDATOS — visão individual */}
        <TabsContent value="candidatos" className="mt-4">
          <Card className="mb-4">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Users className="w-5 h-5 text-primary" /> Análise de candidatos
              </CardTitle>
              <CardDescription>
                Compare desempenho lado a lado entre dois ou mais candidatos, em qualquer cargo e ano disponível.
              </CardDescription>
            </CardHeader>
          </Card>
          <CompararCandidatos />
        </TabsContent>

        {/* COMPOSIÇÃO & SIMULAÇÃO — ferramentas estratégicas */}
        <TabsContent value="composicao" className="mt-4">
          <Card className="mb-4">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <FlaskConical className="w-5 h-5 text-primary" /> Composição & Simulação de chapa
              </CardTitle>
              <CardDescription>
                Ferramentas estratégicas: cruze candidatos entre 2022 e 2024 para identificar talentos, ou monte uma chapa hipotética e veja sua cobertura territorial.
              </CardDescription>
            </CardHeader>
          </Card>
          <Tabs defaultValue="composicao-chapa" className="w-full">
            <TabsList>
              <TabsTrigger value="composicao-chapa" className="gap-1.5"><LayoutGrid className="w-3.5 h-3.5" /> Composição (2022 + 2024)</TabsTrigger>
              <TabsTrigger value="simulador" className="gap-1.5"><Target className="w-3.5 h-3.5" /> Simulador de chapa</TabsTrigger>
            </TabsList>
            <TabsContent value="composicao-chapa" className="mt-4"><ComposicaoChapa /></TabsContent>
            <TabsContent value="simulador" className="mt-4"><SimuladorChapa /></TabsContent>
          </Tabs>
        </TabsContent>

        {/* HIPERLOCAL — Campo Grande only */}
        <TabsContent value="hiperlocal" className="mt-4">
          <Card className="mb-4">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Building2 className="w-5 h-5 text-primary" /> Análise hiperlocal
              </CardTitle>
              <CardDescription>
                Granularidade até zona eleitoral e local de votação (escola/bairro). Disponível apenas para Campo Grande/MS no dataset atual.
              </CardDescription>
            </CardHeader>
          </Card>
          <CampoGrandeAnalise />
        </TabsContent>
      </Tabs>

      <p className="text-xs text-muted-foreground text-center pt-4">
        Fonte: TSE — Tribunal Superior Eleitoral. Eleições 2022 e 2024.
      </p>
    </div>
  );
};

const InteligenciaEleitoral = () => (
  <EleitoralFiltersProvider>
    <InteligenciaEleitoralInner />
  </EleitoralFiltersProvider>
);

export default InteligenciaEleitoral;
