import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Loader2,
  Megaphone,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getSugestaoFeriado, getTemasMes } from "@/lib/sugestoes-tema";
import { useEstilosTema } from "@/hooks/useEstilosTema";
import { EstilosTemaSelector } from "@/components/calendario/EstilosTemaSelector";
import { diasAteCampanha, todayCampaignYMD } from "@/lib/calendario-datas";
import { PromptArteButton } from "@/components/calendario/PromptArteButton";

type Holiday = {
  date: string; // YYYY-MM-DD
  localName: string;
  name: string;
  global?: boolean;
  year?: number;
};

const diasAte = diasAteCampanha;

function ymd(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

const NOMES_MES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];
const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export default function CalendarioPolitico() {
  // "hoje" sempre no fuso da campanha (America/Sao_Paulo) para evitar drift entre fusos
  const todayYMD = todayCampaignYMD();
  const [tY, tM, tD] = todayYMD.split("-").map(Number);
  const todayParts = { year: tY, month: tM - 1, day: tD };
  const [cursor, setCursor] = useState({ year: todayParts.year, month: todayParts.month });
  const { ativos: estilosAtivos } = useEstilosTema();

  // Buscamos 3 anos para que navegação prev/next nos limites não quebre
  const yearsToLoad = useMemo(() => {
    const base = cursor.year;
    return [base - 1, base, base + 1];
  }, [cursor.year]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["calendario-politico-holidays", yearsToLoad.join(",")],
    queryFn: async () => {
      const qs = `years=${yearsToLoad.join(",")}`;
      const { data, error } = await supabase.functions.invoke(`holidays-fetch?${qs}`, {
        body: null,
        method: "GET",
      });
      if (error) throw error;
      return data as { holidays: Holiday[] };
    },
    staleTime: 1000 * 60 * 60 * 12,
    refetchOnWindowFocus: false,
  });

  const allHolidays = useMemo(() => (data?.holidays ?? []).filter((h) => h.global !== false), [data]);

  // Map data->feriado(s) para lookup O(1) na grade
  const holidaysByDate = useMemo(() => {
    const m = new Map<string, Holiday[]>();
    for (const h of allHolidays) {
      const arr = m.get(h.date) ?? [];
      arr.push(h);
      m.set(h.date, arr);
    }
    return m;
  }, [allHolidays]);

  const holidaysDoMes = useMemo(() => {
    const prefix = `${cursor.year}-${String(cursor.month + 1).padStart(2, "0")}-`;
    return allHolidays
      .filter((h) => h.date.startsWith(prefix))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [allHolidays, cursor]);

  const temasMes = useMemo(
    () => getTemasMes(cursor.month, estilosAtivos),
    [cursor.month, estilosAtivos],
  );

  // Construção da grade: 6 linhas x 7 colunas
  const grid = useMemo(() => {
    const firstDay = new Date(cursor.year, cursor.month, 1);
    const startWeekday = firstDay.getDay(); // 0 = domingo
    const daysInMonth = new Date(cursor.year, cursor.month + 1, 0).getDate();
    const daysInPrev = new Date(cursor.year, cursor.month, 0).getDate();

    const cells: { date: string; day: number; inMonth: boolean; isToday: boolean }[] = [];
    const todayStr = todayYMD;

    // Dias do mês anterior pra preencher
    for (let i = startWeekday - 1; i >= 0; i--) {
      const d = daysInPrev - i;
      const prevMonth = cursor.month === 0 ? 11 : cursor.month - 1;
      const prevYear = cursor.month === 0 ? cursor.year - 1 : cursor.year;
      const ds = ymd(prevYear, prevMonth, d);
      cells.push({ date: ds, day: d, inMonth: false, isToday: ds === todayStr });
    }
    // Dias do mês corrente
    for (let d = 1; d <= daysInMonth; d++) {
      const ds = ymd(cursor.year, cursor.month, d);
      cells.push({ date: ds, day: d, inMonth: true, isToday: ds === todayStr });
    }
    // Completa até múltiplo de 7 (mínimo 6 semanas = 42 células pra altura estável)
    let next = 1;
    while (cells.length < 42) {
      const nextMonth = cursor.month === 11 ? 0 : cursor.month + 1;
      const nextYear = cursor.month === 11 ? cursor.year + 1 : cursor.year;
      const ds = ymd(nextYear, nextMonth, next);
      cells.push({ date: ds, day: next, inMonth: false, isToday: ds === todayStr });
      next++;
    }
    return cells;
  }, [cursor, todayYMD]);

  const goPrev = () =>
    setCursor((c) => (c.month === 0 ? { year: c.year - 1, month: 11 } : { year: c.year, month: c.month - 1 }));
  const goNext = () =>
    setCursor((c) => (c.month === 11 ? { year: c.year + 1, month: 0 } : { year: c.year, month: c.month + 1 }));
  const goToday = () => setCursor({ year: todayParts.year, month: todayParts.month });

  return (
    <TooltipProvider>
      <div className="space-y-4">
        {/* Cabeçalho instrucional */}
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-primary/10 p-2.5">
            <CalendarDays className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Calendário Político</h1>
            <p className="text-sm text-muted-foreground">
              Grade mensal com feriados nacionais destacados e sugestão de tema do mês para orientar a agenda da campanha.
              Apenas visualização — nenhum disparo é feito automaticamente.
            </p>
          </div>
          <div className="ml-auto">
            <EstilosTemaSelector />
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          {/* Grade mensal */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <CardTitle className="text-lg capitalize">
                    {NOMES_MES[cursor.month]} de {cursor.year}
                  </CardTitle>
                  <CardDescription>
                    {holidaysDoMes.length} feriado(s) nacional(is) neste mês
                  </CardDescription>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="icon" onClick={goPrev} aria-label="Mês anterior">
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="sm" onClick={goToday}>
                    Hoje
                  </Button>
                  <Button variant="outline" size="icon" onClick={goNext} aria-label="Próximo mês">
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {isLoading && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Carregando feriados...
                </div>
              )}
              {error && (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  Não foi possível carregar os feriados agora.
                </p>
              )}
              {!isLoading && (
                <>
                  {/* Cabeçalho dos dias da semana */}
                  <div className="grid grid-cols-7 gap-1 mb-1">
                    {DIAS_SEMANA.map((d) => (
                      <div key={d} className="text-[11px] font-semibold text-muted-foreground text-center py-1">
                        {d}
                      </div>
                    ))}
                  </div>
                  {/* Células */}
                  <div className="grid grid-cols-7 gap-1">
                    {grid.map((cell) => {
                      const fers = holidaysByDate.get(cell.date) ?? [];
                      const sug = fers.length > 0 ? getSugestaoFeriado(fers[0], estilosAtivos) : null;
                      const isHoliday = fers.length > 0;
                      return (
                        <Tooltip key={cell.date} delayDuration={150}>
                          <TooltipTrigger asChild>
                            <div
                              className={cn(
                                "min-h-[72px] rounded-md border p-1.5 text-left transition-colors",
                                "flex flex-col gap-1",
                                cell.inMonth ? "bg-card" : "bg-muted/30",
                                cell.isToday && "ring-2 ring-primary",
                                isHoliday && cell.inMonth && "bg-primary/5 border-primary/40",
                                isHoliday && !cell.inMonth && "bg-primary/5 border-primary/20",
                              )}
                            >
                              <div className="flex items-center justify-between">
                                <span
                                  className={cn(
                                    "text-xs font-semibold",
                                    cell.inMonth ? "text-foreground" : "text-muted-foreground/60",
                                    cell.isToday && "text-primary",
                                  )}
                                >
                                  {cell.day}
                                </span>
                                {isHoliday && (
                                  <span className="text-xs leading-none">{sug?.emoji ?? "📅"}</span>
                                )}
                              </div>
                              {isHoliday && (
                                <p
                                  className={cn(
                                    "text-[10px] leading-tight line-clamp-2 font-medium",
                                    cell.inMonth ? "text-primary" : "text-primary/60",
                                  )}
                                >
                                  {fers[0].localName}
                                </p>
                              )}
                            </div>
                          </TooltipTrigger>
                          {isHoliday && (
                            <TooltipContent side="top" className="max-w-xs">
                              <p className="font-semibold text-sm">{fers.map((f) => f.localName).join(" + ")}</p>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {new Date(cell.date + "T12:00:00").toLocaleDateString("pt-BR", {
                                  weekday: "long", day: "2-digit", month: "long", year: "numeric",
                                })}
                              </p>
                              {sug && (
                                <p className="text-xs mt-1.5 flex items-start gap-1">
                                  <Sparkles className="h-3 w-3 mt-0.5 shrink-0 text-primary" />
                                  <span><span className="font-semibold">Sugestão:</span> {sug.tema}</span>
                                </p>
                              )}
                            </TooltipContent>
                          )}
                        </Tooltip>
                      );
                    })}
                  </div>
                  {/* Legenda */}
                  <div className="flex items-center gap-4 mt-3 text-[11px] text-muted-foreground flex-wrap">
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block h-3 w-3 rounded border-2 border-primary" /> Hoje
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block h-3 w-3 rounded bg-primary/10 border border-primary/40" /> Feriado nacional
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block h-3 w-3 rounded bg-muted/30 border" /> Outro mês
                    </span>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Painel lateral */}
          <div className="space-y-4">
            {/* Tema político do mês */}
            <Card className="border-primary/40 bg-primary/5">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <Megaphone className="h-4 w-4 text-primary" />
                  <CardTitle className="text-sm">Tema político do mês</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {temasMes.map((tm, i) => (
                  <div key={`${tm.estilo}-${i}`} className={i > 0 ? "pt-3 border-t border-primary/20" : ""}>
                    <p className="text-2xl mb-1">{tm.emoji}</p>
                    <p className="font-semibold text-sm">{tm.titulo}</p>
                    <p className="text-xs text-muted-foreground mt-1">{tm.descricao}</p>
                    <div className="mt-2">
                      <PromptArteButton
                        tipo="tema-mes"
                        tema={{ titulo: tm.titulo, descricao: tm.descricao, emoji: tm.emoji }}
                        size="sm"
                        variant="outline"
                        label="Prompt de arte"
                      />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Agenda do mês */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Feriados de {NOMES_MES[cursor.month]}</CardTitle>
                <CardDescription className="text-xs">
                  Use para evitar agendar atos e definir o tom da comunicação.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {holidaysDoMes.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-4 text-center">
                    Nenhum feriado nacional neste mês.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {holidaysDoMes.map((h) => {
                      const sug = getSugestaoFeriado(h, estilosAtivos);
                      const dias = diasAte(h.date);
                      const dt = new Date(h.date + "T12:00:00");
                      return (
                        <li key={`${h.date}-${h.name}`} className="rounded-md border bg-card/50 p-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-semibold">
                              {sug?.emoji ?? "📅"} {h.localName}
                            </span>
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                              {String(dt.getDate()).padStart(2, "0")}/{String(dt.getMonth() + 1).padStart(2, "0")}
                            </Badge>
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-0.5 capitalize">
                            {dt.toLocaleDateString("pt-BR", { weekday: "long" })}
                            {dias === 0 && " · hoje"}
                            {dias > 0 && dias <= 30 && ` · em ${dias} dias`}
                            {dias < 0 && ` · há ${Math.abs(dias)} dias`}
                          </p>
                          {sug && (
                            <p className="text-[11px] text-muted-foreground mt-1 flex items-start gap-1">
                              <Sparkles className="h-3 w-3 mt-0.5 shrink-0 text-primary/70" />
                              <span>{sug.tema}</span>
                            </p>
                          )}
                          <div className="mt-2">
                            <PromptArteButton
                              tipo="feriado"
                              feriado={{ localName: h.localName, name: h.name, date: h.date }}
                              size="sm"
                              variant="outline"
                              label="Prompt de arte"
                            />
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}