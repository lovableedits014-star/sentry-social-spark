import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle, Flame, Clock, ChevronDown, ChevronUp, Quote, Hash,
} from "lucide-react";
import { useState } from "react";
import { Area, AreaChart, ResponsiveContainer, XAxis, YAxis, Tooltip as RTooltip } from "recharts";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";

export type CrisisAlert = {
  key: string;
  label: string;
  severity: "critical" | "warning" | "watch";
  negativeNow: number;
  negativePrev: number;
  growthPct: number;
  totalNow: number;
  negativeRatio: number;
  period: string;
  topKeywords: string[];
  exampleComments: string[];
  hourlyData: { hour: string; count: number }[];
};

const SEVERITY_CONFIG = {
  critical: {
    label: "ALERTA CRÍTICO",
    icon: Flame,
    badgeClass: "bg-destructive text-destructive-foreground",
    cardClass: "border-destructive/60 bg-destructive/5 shadow-lg",
    iconClass: "text-destructive",
    chartColor: "hsl(var(--destructive))",
    description: "Crescimento explosivo de negatividade. Risco alto de viralização negativa. Ação imediata recomendada.",
  },
  warning: {
    label: "ATENÇÃO",
    icon: AlertTriangle,
    badgeClass: "bg-amber-500 text-white",
    cardClass: "border-amber-500/40 bg-amber-500/5",
    iconClass: "text-amber-500",
    chartColor: "#f59e0b",
    description: "Sentimento negativo em crescimento significativo. Monitore de perto e prepare respostas.",
  },
  watch: {
    label: "OBSERVAÇÃO",
    icon: Clock,
    badgeClass: "bg-muted text-muted-foreground",
    cardClass: "border-muted",
    iconClass: "text-muted-foreground",
    chartColor: "hsl(var(--muted-foreground))",
    description: "Negatividade acima do normal, mas ainda controlável. Fique atento a variações.",
  },
};

interface Props {
  alert: CrisisAlert;
}

export default function CriseAlertCard({ alert }: Props) {
  const [expanded, setExpanded] = useState(false);
  const config = SEVERITY_CONFIG[alert.severity];
  const SevIcon = config.icon;

  return (
    <Card className={config.cardClass}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <SevIcon className={`w-5 h-5 ${config.iconClass}`} />
            <CardTitle className="text-base">{alert.label}</CardTitle>
          </div>
          <Badge className={config.badgeClass}>{config.label}</Badge>
        </div>
        <p className="text-xs text-muted-foreground mt-1">{config.description}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Main metric + sparkline */}
        <div className="flex flex-col sm:flex-row sm:items-end gap-4">
          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold">+{alert.growthPct}%</span>
              <span className="text-sm text-muted-foreground">sentimento negativo</span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              Variação comparando as {alert.period} atuais com o mesmo período anterior.
              Quanto maior, mais rápido a crise está se formando.
            </p>
          </div>

          {/* Sparkline */}
          {alert.hourlyData.length > 1 && (
            <div className="w-full sm:w-48 h-16 flex-shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={alert.hourlyData}>
                  <defs>
                    <linearGradient id={`grad-${alert.key}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={config.chartColor} stopOpacity={0.3} />
                      <stop offset="100%" stopColor={config.chartColor} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="hour" hide />
                  <YAxis hide />
                  <RTooltip
                    contentStyle={{ fontSize: 11, borderRadius: 8, padding: '4px 8px' }}
                    formatter={(val: number) => [`${val} negativos`, '']}
                    labelFormatter={(l) => `${l}h`}
                  />
                  <Area
                    type="monotone"
                    dataKey="count"
                    stroke={config.chartColor}
                    strokeWidth={2}
                    fill={`url(#grad-${alert.key})`}
                  />
                </AreaChart>
              </ResponsiveContainer>
              <p className="text-[9px] text-center text-muted-foreground -mt-1">Evolução por hora</p>
            </div>
          )}
        </div>

        {/* Detail grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div>
            <p className="text-muted-foreground text-xs">Negativos agora</p>
            <p className="font-semibold">{alert.negativeNow}</p>
            <p className="text-[10px] text-muted-foreground">no período atual</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Período anterior</p>
            <p className="font-semibold">{alert.negativePrev}</p>
            <p className="text-[10px] text-muted-foreground">base de comparação</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Total no período</p>
            <p className="font-semibold">{alert.totalNow}</p>
            <p className="text-[10px] text-muted-foreground">positivos + negativos</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">% negativos</p>
            <p className="font-semibold">{alert.negativeRatio}%</p>
            <p className="text-[10px] text-muted-foreground">proporção do tema</p>
          </div>
        </div>

        {/* Negative ratio bar */}
        <div className="space-y-1">
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-destructive transition-all"
              style={{ width: `${Math.min(100, alert.negativeRatio)}%` }}
            />
          </div>
          <p className="text-[10px] text-muted-foreground">
            {alert.negativeRatio}% dos comentários sobre {alert.label.toLowerCase()} são negativos nas {alert.period}
          </p>
        </div>

        {/* Expandable section: keywords + examples */}
        <Collapsible open={expanded} onOpenChange={setExpanded}>
          <CollapsibleTrigger className="flex items-center gap-1 text-xs font-medium text-primary hover:underline cursor-pointer w-full">
            {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            {expanded ? "Ocultar detalhes" : "Ver palavras-chave e exemplos"}
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-3 space-y-4">
            {/* Top Keywords */}
            {alert.topKeywords.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <Hash className="w-3.5 h-3.5 text-muted-foreground" />
                  <p className="text-xs font-medium">Palavras mais recorrentes nos negativos</p>
                </div>
                <p className="text-[10px] text-muted-foreground mb-2">
                  Termos que mais aparecem nos comentários negativos sobre este tema. Use como referência para monitorar menções e preparar respostas.
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {alert.topKeywords.map((kw) => (
                    <Badge key={kw} variant="outline" className="text-[11px] font-normal">
                      {kw}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Example comments */}
            {alert.exampleComments.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <Quote className="w-3.5 h-3.5 text-muted-foreground" />
                  <p className="text-xs font-medium">Exemplos de comentários negativos</p>
                </div>
                <p className="text-[10px] text-muted-foreground mb-2">
                  Amostras reais dos comentários classificados como negativos neste tema. Ajudam a entender o tom e o conteúdo das reclamações.
                </p>
                <div className="space-y-2">
                  {alert.exampleComments.map((c, i) => (
                    <div key={i} className="bg-muted/50 rounded-md px-3 py-2 text-xs text-foreground/80 italic border-l-2 border-destructive/40">
                      "{c.length > 200 ? c.slice(0, 200) + "…" : c}"
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}
