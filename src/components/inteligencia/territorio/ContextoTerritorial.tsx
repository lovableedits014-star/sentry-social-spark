import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import {
  RefreshCw, Info, MapPin, Users, DollarSign, Heart, GraduationCap, Search,
} from "lucide-react";

const fmtNum = (n: number | null | undefined) => n == null ? "—" : n.toLocaleString("pt-BR");
const fmtMoney = (n: number | null | undefined) => n == null ? "—" : `R$ ${n.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;

export default function ContextoTerritorial() {
  const qc = useQueryClient();
  const [busca, setBusca] = useState("");
  const [ufFiltro, setUfFiltro] = useState("");

  const { data: municipios, isLoading } = useQuery({
    queryKey: ["municipios-indicadores", ufFiltro, busca],
    staleTime: 60_000,
    queryFn: async () => {
      let q = supabase
        .from("municipios_indicadores" as any)
        .select("*")
        .order("populacao", { ascending: false, nullsFirst: false })
        .limit(100);
      if (ufFiltro) q = q.eq("uf", ufFiltro.toUpperCase());
      if (busca) q = q.ilike("nome", `%${busca}%`);
      const { data, error } = await q;
      if (error) throw error;
      return (data as any[]) || [];
    },
  });

  const { data: ultimoLog } = useQuery({
    queryKey: ["municipios-sync-log-last"],
    refetchInterval: 5000,
    queryFn: async () => {
      const { data } = await supabase
        .from("municipios_sync_log" as any)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data as any;
    },
  });

  const syncUf = useMutation({
    mutationFn: async (uf: string) => {
      const { data, error } = await supabase.functions.invoke("municipios-indicadores-sync", {
        body: { uf },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      toast.success(`${data.processados} municípios sincronizados`);
      qc.invalidateQueries({ queryKey: ["municipios-indicadores"] });
    },
    onError: (e: any) => toast.error(`Erro: ${e.message}`),
  });

  return (
    <div className="space-y-6">
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription className="text-xs">
          <strong>Cruze território + dados socioeconômicos.</strong> Use estes indicadores oficiais (IBGE/DataSUS/INEP)
          para identificar pautas estratégicas: <em>"este bairro tem renda baixa + IDEB caindo = vetor educação"</em>.
          Combine com o mapa de votos do TSE para encontrar oportunidades reais de crescimento.
        </AlertDescription>
      </Alert>

      {/* Coleta */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Coletar dados de uma UF</CardTitle>
          <CardDescription className="text-xs">
            Busca todos os municípios da UF na API do IBGE e atualiza população, PIB e PIB per capita.
            Pode levar até 1 minuto para estados grandes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              placeholder="UF (ex: MS, SP, RJ)"
              maxLength={2}
              className="max-w-[140px]"
              id="uf-coleta"
            />
            <Button
              onClick={() => {
                const el = document.getElementById("uf-coleta") as HTMLInputElement;
                const uf = el?.value?.toUpperCase().trim();
                if (!uf || uf.length !== 2) {
                  toast.error("Informe uma UF válida (ex: MS)");
                  return;
                }
                syncUf.mutate(uf);
              }}
              disabled={syncUf.isPending}
              className="gap-1.5"
            >
              <RefreshCw className={`w-4 h-4 ${syncUf.isPending ? "animate-spin" : ""}`} />
              {syncUf.isPending ? "Coletando..." : "Coletar"}
            </Button>
          </div>
          {ultimoLog && (
            <p className="text-xs text-muted-foreground mt-3">
              Última coleta: {new Date(ultimoLog.created_at).toLocaleString("pt-BR")} · {ultimoLog.fonte} ·{" "}
              <span className={
                ultimoLog.status === "success" ? "text-green-600" :
                ultimoLog.status === "partial" ? "text-amber-600" : "text-destructive"
              }>
                {ultimoLog.status} ({ultimoLog.municipios_processados} municípios em {Math.round((ultimoLog.duracao_ms || 0) / 1000)}s)
              </span>
            </p>
          )}
        </CardContent>
      </Card>

      {/* Filtros */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar município..."
            className="pl-8"
          />
        </div>
        <Input
          value={ufFiltro}
          onChange={(e) => setUfFiltro(e.target.value.toUpperCase())}
          placeholder="UF"
          maxLength={2}
          className="max-w-[100px]"
        />
      </div>

      {/* Lista */}
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : municipios?.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <MapPin className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>Nenhum município indexado ainda.</p>
            <p className="text-xs mt-2">Use o coletor acima para puxar uma UF.</p>
          </CardContent>
        </Card>
      ) : (
        <TooltipProvider>
          <div className="grid gap-3 md:grid-cols-2">
            {municipios?.map((m: any) => <MunicipioCard key={m.id} m={m} />)}
          </div>
        </TooltipProvider>
      )}
    </div>
  );
}

function MunicipioCard({ m }: { m: any }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <MapPin className="w-4 h-4 text-primary" />
          {m.nome} <span className="text-xs text-muted-foreground font-normal">/ {m.uf}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-3 text-sm">
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-2 cursor-help">
              <Users className="w-3.5 h-3.5 text-muted-foreground" />
              <div>
                <p className="text-[11px] text-muted-foreground">População</p>
                <p className="font-medium">{fmtNum(m.populacao)}</p>
              </div>
            </div>
          </TooltipTrigger>
          <TooltipContent>Estimativa IBGE {m.populacao_ano || "—"}</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-2 cursor-help">
              <DollarSign className="w-3.5 h-3.5 text-muted-foreground" />
              <div>
                <p className="text-[11px] text-muted-foreground">PIB per capita</p>
                <p className="font-medium">{fmtMoney(m.pib_per_capita)}</p>
              </div>
            </div>
          </TooltipTrigger>
          <TooltipContent>PIB IBGE {m.pib_ano || "—"}</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-2 cursor-help">
              <Heart className="w-3.5 h-3.5 text-muted-foreground" />
              <div>
                <p className="text-[11px] text-muted-foreground">Mort. infantil</p>
                <p className="font-medium">{m.mortalidade_infantil ?? "—"}</p>
              </div>
            </div>
          </TooltipTrigger>
          <TooltipContent>Por 1.000 nascidos vivos (DataSUS — em breve)</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-2 cursor-help">
              <GraduationCap className="w-3.5 h-3.5 text-muted-foreground" />
              <div>
                <p className="text-[11px] text-muted-foreground">IDEB</p>
                <p className="font-medium">{m.ideb_anos_iniciais ?? "—"}</p>
              </div>
            </div>
          </TooltipTrigger>
          <TooltipContent>IDEB anos iniciais (INEP — em breve)</TooltipContent>
        </Tooltip>
      </CardContent>
    </Card>
  );
}