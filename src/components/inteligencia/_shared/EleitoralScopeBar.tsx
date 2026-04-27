import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronRight, MapPin, Calendar, Briefcase, Filter, RotateCcw } from "lucide-react";
import { useEleitoralFilters, AnoMode } from "./EleitoralFiltersContext";

type Row = { uf: string; municipio: string | null; cargo: string | null };

export default function EleitoralScopeBar() {
  const f = useEleitoralFilters();

  const { data: dim } = useQuery({
    queryKey: ["eleitoral-dim"],
    staleTime: Infinity,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tse_votacao_zona" as any)
        .select("uf,municipio,cargo")
        .limit(50000);
      if (error) throw error;
      const ufs = new Set<string>();
      const cargos = new Set<string>();
      const muniByUf = new Map<string, Set<string>>();
      ((data as any) as Row[] || []).forEach((r) => {
        if (r.uf) ufs.add(r.uf);
        if (r.cargo) cargos.add(r.cargo);
        if (r.uf && r.municipio) {
          if (!muniByUf.has(r.uf)) muniByUf.set(r.uf, new Set());
          muniByUf.get(r.uf)!.add(r.municipio);
        }
      });
      return {
        ufs: Array.from(ufs).sort(),
        cargos: Array.from(cargos).sort(),
        muniByUf: Object.fromEntries(
          Array.from(muniByUf.entries()).map(([uf, set]) => [uf, Array.from(set).sort()]),
        ),
      };
    },
  });

  const municipios = useMemo(() => (dim?.muniByUf?.[f.uf] || []), [dim, f.uf]);

  const breadcrumb: { label: string; tone?: "muted" | "primary" }[] = [
    { label: f.uf === "__all__" ? "Brasil" : f.uf, tone: "primary" },
    ...(f.municipio !== "__all__" ? [{ label: f.municipio, tone: "primary" as const }] : []),
    { label: f.cargo === "__all__" ? "Todos cargos" : f.cargo },
    { label: f.anoMode === "ambos" ? "2022 + 2024" : f.anoMode },
  ];

  return (
    <div className="rounded-lg border bg-card/50 p-3 space-y-3">
      {/* Breadcrumb de escopo */}
      <div className="flex items-center gap-1.5 flex-wrap text-sm">
        <Filter className="w-4 h-4 text-muted-foreground" />
        <span className="text-muted-foreground">Escopo atual:</span>
        {breadcrumb.map((b, i) => (
          <span key={i} className="flex items-center gap-1.5">
            {i > 0 && <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/50" />}
            <Badge variant={b.tone === "primary" ? "default" : "secondary"} className="font-medium">
              {b.label}
            </Badge>
          </span>
        ))}
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto h-7 text-xs gap-1"
          onClick={f.reset}
        >
          <RotateCcw className="w-3 h-3" /> Limpar
        </Button>
      </div>

      {/* Seletores */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <FilterField icon={<MapPin className="w-3.5 h-3.5" />} label="UF">
          <Select value={f.uf} onValueChange={f.setUf}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent className="max-h-72">
              <SelectItem value="__all__">Todas as UFs</SelectItem>
              {(dim?.ufs || []).map((u) => (
                <SelectItem key={u} value={u}>{u}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>

        <FilterField icon={<MapPin className="w-3.5 h-3.5" />} label="Município">
          <Select value={f.municipio} onValueChange={f.setMunicipio} disabled={f.uf === "__all__"}>
            <SelectTrigger>
              <SelectValue placeholder={f.uf === "__all__" ? "Selecione UF" : "Todos"} />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              <SelectItem value="__all__">Todos os municípios</SelectItem>
              {municipios.map((m) => (
                <SelectItem key={m} value={m}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>

        <FilterField icon={<Briefcase className="w-3.5 h-3.5" />} label="Cargo">
          <Select value={f.cargo} onValueChange={f.setCargo}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent className="max-h-72">
              <SelectItem value="__all__">Todos cargos</SelectItem>
              {(dim?.cargos || []).map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>

        <FilterField icon={<Calendar className="w-3.5 h-3.5" />} label="Ano">
          <Select value={f.anoMode} onValueChange={(v) => f.setAnoMode(v as AnoMode)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ambos">2022 + 2024</SelectItem>
              <SelectItem value="2022">Só 2022</SelectItem>
              <SelectItem value="2024">Só 2024</SelectItem>
            </SelectContent>
          </Select>
        </FilterField>
      </div>
    </div>
  );
}

function FilterField({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs text-muted-foreground flex items-center gap-1.5">
        {icon} {label}
      </label>
      {children}
    </div>
  );
}