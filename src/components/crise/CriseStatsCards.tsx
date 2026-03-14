import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Minus, MessageSquareWarning, BarChart3, Activity, Gauge } from "lucide-react";

type GeneralStats = {
  totalComments: number;
  negativeTotal: number;
  negativeNow: number;
  negativePrev: number;
  generalGrowth: number | null;
};

interface Props {
  stats: GeneralStats;
  hoursWindow: number;
}

export default function CriseStatsCards({ stats, hoursWindow }: Props) {
  const negPct = stats.totalComments > 0 ? Math.round((stats.negativeTotal / stats.totalComments) * 100) : 0;

  const cards = [
    {
      icon: BarChart3,
      iconClass: "text-primary",
      title: "Total de comentários",
      value: stats.totalComments.toLocaleString(),
      caption: "últimas 48h",
      description: "Número total de comentários coletados de todas as plataformas conectadas nas últimas 48 horas. Quanto maior o volume, mais relevante é a amostra de análise.",
    },
    {
      icon: MessageSquareWarning,
      iconClass: "text-destructive",
      title: "Negativos totais",
      value: stats.negativeTotal.toString(),
      caption: `${negPct}% do total`,
      description: `Comentários classificados como negativos pela IA. Representa ${negPct}% de todo o volume — acima de 25% indica atenção redobrada.`,
    },
    {
      icon: Activity,
      iconClass: "text-amber-500",
      title: `Negativos (${hoursWindow}h)`,
      value: stats.negativeNow.toString(),
      caption: "período atual",
      description: `Negativos apenas nas últimas ${hoursWindow} horas. Um pico aqui versus o período anterior sinaliza crise em formação.`,
    },
    {
      icon: Gauge,
      iconClass: stats.generalGrowth !== null && stats.generalGrowth > 0 ? "text-destructive" : "text-emerald-500",
      title: "Tendência geral",
      value: null,
      caption: null,
      description: `Compara negativos das últimas ${hoursWindow}h com as ${hoursWindow}h anteriores. Crescimento positivo = sentimento piorando; negativo = melhorando.`,
      trend: stats.generalGrowth,
    },
  ];

  return (
    <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card, i) => {
        const Icon = card.icon;
        return (
          <Card key={i} className="overflow-hidden">
            <CardContent className="p-4 space-y-2">
              <div className="flex items-center gap-2">
                <Icon className={`w-4 h-4 ${card.iconClass}`} />
                <p className="text-xs font-medium text-muted-foreground">{card.title}</p>
              </div>

              {card.value !== null ? (
                <p className="text-2xl font-bold">{card.value}</p>
              ) : (
                <div className="flex items-center gap-1">
                  {card.trend === null ? (
                    <span className="text-sm text-muted-foreground">sem dados comparativos</span>
                  ) : card.trend > 0 ? (
                    <span className="flex items-center gap-1 text-lg font-bold text-destructive">
                      <TrendingUp className="w-4 h-4" /> +{card.trend}%
                    </span>
                  ) : card.trend < 0 ? (
                    <span className="flex items-center gap-1 text-lg font-bold text-emerald-500">
                      <TrendingDown className="w-4 h-4" /> {card.trend}%
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-lg font-bold text-muted-foreground">
                      <Minus className="w-4 h-4" /> estável
                    </span>
                  )}
                </div>
              )}

              {card.caption && (
                <p className="text-[10px] text-muted-foreground">{card.caption}</p>
              )}

              <p className="text-[11px] leading-relaxed text-muted-foreground/80 border-t pt-2 mt-1">
                {card.description}
              </p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
