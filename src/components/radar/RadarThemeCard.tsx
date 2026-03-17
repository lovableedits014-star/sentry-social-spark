import { useState, memo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  TrendingUp, TrendingDown, Minus, ArrowUp, ChevronDown, ChevronUp,
  MessageSquare, ThumbsUp, MinusCircle, ThumbsDown,
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip,
} from "recharts";

export type ThemeComment = {
  text: string;
  author_name?: string | null;
  sentiment?: string | null;
  comment_created_time?: string | null;
  created_at?: string | null;
  platform?: string | null;
};

export type ThemeResult = {
  key: string;
  label: string;
  total: number;
  last24h: number;
  prev24h: number;
  growthPct: number | null;
  sentimentCounts: { positive: number; neutral: number; negative: number };
  dailyData: { day: string; count: number }[];
  topKeywords: { word: string; count: number }[];
  matchedComments: ThemeComment[];
  isCustom?: boolean;
};

interface RadarThemeCardProps {
  theme: ThemeResult;
  totalComments: number;
  rank: number;
  onDelete?: (key: string) => void;
}

const GrowthIndicator = ({ pct }: { pct: number | null }) => {
  if (pct === null) return <span className="text-xs text-muted-foreground">sem dados anteriores</span>;
  if (pct > 0)
    return (
      <span className="flex items-center gap-1 text-sm font-semibold text-emerald-500">
        <TrendingUp className="w-4 h-4" /> +{pct}%
      </span>
    );
  if (pct < 0)
    return (
      <span className="flex items-center gap-1 text-sm font-semibold text-red-500">
        <TrendingDown className="w-4 h-4" /> {pct}%
      </span>
    );
  return (
    <span className="flex items-center gap-1 text-sm text-muted-foreground">
      <Minus className="w-4 h-4" /> estável
    </span>
  );
};

function formatDate(dateStr: string | null | undefined) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function sentimentIcon(s: string | null | undefined) {
  if (s === "positive") return <ThumbsUp className="w-3 h-3 text-emerald-500" />;
  if (s === "negative") return <ThumbsDown className="w-3 h-3 text-red-500" />;
  return <MinusCircle className="w-3 h-3 text-muted-foreground" />;
}

export const RadarThemeCard = memo(function RadarThemeCard({
  theme: t, totalComments, rank, onDelete,
}: RadarThemeCardProps) {
  const [expanded, setExpanded] = useState(false);
  const participation = totalComments > 0 ? Math.round((t.total / totalComments) * 100) : 0;

  return (
    <Card className={rank === 0 ? "border-primary/40 shadow-md" : ""}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base font-semibold">{t.label}</CardTitle>
            {t.isCustom && (
              <Badge variant="outline" className="text-[10px] border-primary/30 text-primary">
                Customizado
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {rank === 0 && (
              <Badge variant="default" className="text-[10px]">
                <ArrowUp className="w-3 h-3 mr-0.5" /> Top
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Main stats */}
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-bold">{t.total}</span>
          <span className="text-sm text-muted-foreground">menções</span>
        </div>

        <div className="flex items-center justify-between">
          <GrowthIndicator pct={t.growthPct} />
          <span className="text-xs text-muted-foreground">últimas 24h</span>
        </div>

        {/* Sentiment breakdown */}
        <div className="flex items-center gap-3 text-xs">
          <span className="flex items-center gap-1 text-emerald-600">
            <ThumbsUp className="w-3 h-3" /> {t.sentimentCounts.positive}
          </span>
          <span className="flex items-center gap-1 text-muted-foreground">
            <MinusCircle className="w-3 h-3" /> {t.sentimentCounts.neutral}
          </span>
          <span className="flex items-center gap-1 text-red-600">
            <ThumbsDown className="w-3 h-3" /> {t.sentimentCounts.negative}
          </span>
        </div>

        {/* Participation bar */}
        {totalComments > 0 && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>participação</span>
              <span>{participation}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${Math.min(100, participation)}%` }}
              />
            </div>
          </div>
        )}

        {/* Sparkline */}
        {t.dailyData.length > 0 && (
          <div className="h-16">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={t.dailyData}>
                <defs>
                  <linearGradient id={`grad-${t.key}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="day" hide />
                <YAxis hide />
                <Tooltip
                  contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid hsl(var(--border))' }}
                  labelFormatter={(l) => `Dia ${l}`}
                  formatter={(v: number) => [`${v} menções`, ""]}
                />
                <Area
                  type="monotone"
                  dataKey="count"
                  stroke="hsl(var(--primary))"
                  fill={`url(#grad-${t.key})`}
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Top keywords */}
        {t.topKeywords.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {t.topKeywords.map(({ word, count }) => (
              <Badge key={word} variant="secondary" className="text-[10px] font-normal">
                {word} <span className="ml-1 opacity-60">({count})</span>
              </Badge>
            ))}
          </div>
        )}

        <div className="flex gap-3 pt-1 text-xs text-muted-foreground">
          <span>{t.last24h} nas últimas 24h</span>
          <span>{t.prev24h} nas 24h anteriores</span>
        </div>

        {/* Expand/collapse comments */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1.5 text-xs text-primary hover:underline w-full justify-center pt-1"
        >
          <MessageSquare className="w-3.5 h-3.5" />
          {expanded ? "Ocultar" : "Ver"} {t.matchedComments.length} comentários
          {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>

        {expanded && (
          <div className="max-h-64 overflow-y-auto space-y-2 border-t pt-2">
            {t.matchedComments.slice(0, 50).map((c, i) => (
              <div key={i} className="flex gap-2 text-xs p-2 rounded-lg bg-muted/50">
                <div className="mt-0.5 shrink-0">{sentimentIcon(c.sentiment)}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-medium truncate">{c.author_name || "Anônimo"}</span>
                    <span className="text-muted-foreground shrink-0">{formatDate(c.comment_created_time || c.created_at)}</span>
                  </div>
                  <p className="text-muted-foreground leading-relaxed break-words">{c.text}</p>
                </div>
              </div>
            ))}
            {t.matchedComments.length > 50 && (
              <p className="text-center text-xs text-muted-foreground py-1">
                ... e mais {t.matchedComments.length - 50} comentários
              </p>
            )}
          </div>
        )}

        {/* Delete custom theme */}
        {t.isCustom && onDelete && (
          <button
            onClick={() => onDelete(t.key)}
            className="text-[10px] text-destructive hover:underline w-full text-center pt-1"
          >
            Remover tema customizado
          </button>
        )}
      </CardContent>
    </Card>
  );
});
