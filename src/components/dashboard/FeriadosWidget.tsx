import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CalendarDays, Sparkles, Loader2 } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Holiday = {
  date: string; // YYYY-MM-DD
  localName: string;
  name: string;
  types?: string[];
  global?: boolean;
  year?: number;
};

/**
 * Sugestões temáticas por feriado conhecido — foco em apoio à decisão visual.
 * Match feito por substring case-insensitive no localName/name.
 */
const SUGESTOES: { match: RegExp; tema: string; emoji: string }[] = [
  { match: /confraterniza/i, tema: "Mensagem de virada de ano e balanço", emoji: "🎆" },
  { match: /carnaval/i, tema: "Comunicado de pausa de campanha + segurança", emoji: "🎭" },
  { match: /sexta.*santa|paix[ãa]o/i, tema: "Tom respeitoso, foco em fé e família", emoji: "✝️" },
  { match: /p[áa]scoa/i, tema: "Mensagem de esperança e renovação", emoji: "🐣" },
  { match: /tiradentes/i, tema: "Patriotismo, história e justiça", emoji: "⚖️" },
  { match: /trabalhador|trabalho/i, tema: "Atos com sindicatos e categorias profissionais", emoji: "🛠️" },
  { match: /corpus christi/i, tema: "Tom religioso, evitar disparos massivos", emoji: "🕊️" },
  { match: /independ[êe]ncia/i, tema: "Patriotismo, atos cívicos, desfile", emoji: "🇧🇷" },
  { match: /aparecida|padroeira|crian[çc]a/i, tema: "Família, infância e fé — duplo apelo", emoji: "👶" },
  { match: /finados/i, tema: "Tom respeitoso, evitar tom comemorativo", emoji: "🕯️" },
  { match: /proclama[çc][ãa]o.*rep[úu]blica/i, tema: "Patriotismo e democracia", emoji: "🏛️" },
  { match: /consci[êe]ncia negra/i, tema: "Pauta racial, lideranças negras, Zumbi", emoji: "✊🏿" },
  { match: /natal/i, tema: "Mensagem de paz, família e gratidão", emoji: "🎄" },
];

function getSugestao(h: Holiday): { tema: string; emoji: string } | null {
  const text = `${h.localName} ${h.name}`;
  for (const s of SUGESTOES) {
    if (s.match.test(text)) return { tema: s.tema, emoji: s.emoji };
  }
  return null;
}

function diasAte(dateStr: string): number {
  // dateStr é YYYY-MM-DD (data local sem fuso) — comparar em UTC pra evitar drift
  const today = new Date();
  const todayUTC = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const [y, m, d] = dateStr.split("-").map(Number);
  const targetUTC = Date.UTC(y, m - 1, d);
  return Math.round((targetUTC - todayUTC) / (1000 * 60 * 60 * 24));
}

function formatarData(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });
}

function diasLabel(dias: number): { label: string; tone: "soon" | "near" | "future" } {
  if (dias === 0) return { label: "Hoje", tone: "soon" };
  if (dias === 1) return { label: "Amanhã", tone: "soon" };
  if (dias <= 7) return { label: `Em ${dias} dias`, tone: "soon" };
  if (dias <= 30) return { label: `Em ${dias} dias`, tone: "near" };
  return { label: `Em ${dias} dias`, tone: "future" };
}

export function FeriadosWidget() {
  const currentYear = new Date().getFullYear();
  const yearOptions = useMemo(
    () => [currentYear, currentYear + 1, currentYear + 2],
    [currentYear],
  );
  // "proximos" = a partir de hoje, atravessando anos. Caso contrário, ano específico.
  const [yearFilter, setYearFilter] = useState<"proximos" | string>("proximos");

  const { data, isLoading, error } = useQuery({
    queryKey: ["holidays", "BR", yearOptions.join(",")],
    queryFn: async () => {
      const qs = `years=${yearOptions.join(",")}`;
      const { data, error } = await supabase.functions.invoke(
        `holidays-fetch?${qs}`,
        { body: null, method: "GET" },
      );
      if (error) throw error;
      return data as { holidays: Holiday[] };
    },
    staleTime: 1000 * 60 * 60 * 12, // 12h no client (no servidor já tem cache de 1 ano)
    refetchOnWindowFocus: false,
  });

  const proximos = useMemo(() => {
    const list = data?.holidays ?? [];
    // 1) só nacionais (global=true; tolera ausência do flag)
    let filtered = list.filter((h) => h.global !== false);

    if (yearFilter === "proximos") {
      // Modo padrão: a partir de hoje, qualquer ano (atravessa virada de ano)
      filtered = filtered.filter((h) => diasAte(h.date) >= 0);
    } else {
      // Ano específico: pega o ano todo (inclui passados do ano selecionado)
      const y = parseInt(yearFilter, 10);
      filtered = filtered.filter((h) => h.date.startsWith(`${y}-`));
      // Se for o ano corrente, prioriza os a partir de hoje quando houver
      if (y === currentYear) {
        const futuros = filtered.filter((h) => diasAte(h.date) >= 0);
        if (futuros.length > 0) filtered = futuros;
      }
    }

    return filtered
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 5);
  }, [data, yearFilter, currentYear]);

  return (
    <TooltipProvider>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-primary" />
              <CardTitle className="text-base">Próximos feriados nacionais</CardTitle>
            </div>
            <div className="flex items-center gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="outline" className="text-xs hidden sm:inline-flex">
                    Apoio à agenda
                  </Badge>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  Lista visual dos feriados nacionais para ajudar a planejar agenda de campanha,
                  eventos presenciais e tom dos comunicados. Não dispara mensagens automaticamente.
                </TooltipContent>
              </Tooltip>
              <Select value={yearFilter} onValueChange={(v) => setYearFilter(v as typeof yearFilter)}>
                <SelectTrigger className="h-8 w-[140px] text-xs">
                  <SelectValue placeholder="Período" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="proximos">Próximos (todos)</SelectItem>
                  {yearOptions.map((y) => (
                    <SelectItem key={y} value={String(y)}>
                      Ano de {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <CardDescription>
            Use para evitar agendar atos em feriados, planejar atos cívicos e definir o tom da comunicação.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando feriados...
            </div>
          )}
          {error && (
            <p className="text-sm text-muted-foreground py-2">
              Não foi possível carregar os feriados agora. Tentaremos novamente.
            </p>
          )}
          {!isLoading && !error && proximos.length === 0 && (
            <p className="text-sm text-muted-foreground py-2">
              Nenhum feriado nacional à frente nesta janela.
            </p>
          )}
          {proximos.length > 0 && (
            <ul className="space-y-2">
              {proximos.map((h) => {
                const dias = diasAte(h.date);
                const tag = diasLabel(dias);
                const sug = getSugestao(h);
                return (
                  <li
                    key={`${h.date}-${h.name}`}
                    className="flex items-start justify-between gap-3 rounded-lg border bg-card/50 p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">
                          {sug?.emoji ?? "📅"} {h.localName}
                        </span>
                        <Badge
                          variant={tag.tone === "soon" ? "default" : tag.tone === "near" ? "secondary" : "outline"}
                          className="text-[10px] px-1.5 py-0"
                        >
                          {tag.label}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 capitalize">
                        {formatarData(h.date)}
                      </p>
                      {sug && (
                        <p className="text-xs text-muted-foreground mt-1 flex items-start gap-1">
                          <Sparkles className="h-3 w-3 mt-0.5 shrink-0 text-primary/70" />
                          <span><span className="font-medium">Sugestão:</span> {sug.tema}</span>
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}