import { memo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Flame } from "lucide-react";
import type { ThemeResult } from "./RadarThemeCard";

interface SentimentHeatmapProps {
  themes: ThemeResult[];
}

function getCellColor(score: number): string {
  // score from -1 (very negative) to +1 (very positive)
  if (score >= 0.5) return "bg-emerald-500/80 text-white";
  if (score >= 0.2) return "bg-emerald-400/60 text-foreground";
  if (score >= -0.2) return "bg-muted text-muted-foreground";
  if (score >= -0.5) return "bg-red-400/60 text-foreground";
  return "bg-red-500/80 text-white";
}

function getIntensity(total: number, max: number): string {
  const pct = max > 0 ? total / max : 0;
  if (pct > 0.7) return "ring-2 ring-primary/50";
  if (pct > 0.4) return "ring-1 ring-primary/30";
  return "";
}

export const SentimentHeatmap = memo(function SentimentHeatmap({
  themes,
}: SentimentHeatmapProps) {
  if (themes.length === 0) return null;

  const maxTotal = Math.max(...themes.map((t) => t.total));

  const rows = themes.map((t) => {
    const total = t.sentimentCounts.positive + t.sentimentCounts.neutral + t.sentimentCounts.negative;
    const score = total > 0
      ? (t.sentimentCounts.positive - t.sentimentCounts.negative) / total
      : 0;
    const posPct = total > 0 ? Math.round((t.sentimentCounts.positive / total) * 100) : 0;
    const neuPct = total > 0 ? Math.round((t.sentimentCounts.neutral / total) * 100) : 0;
    const negPct = total > 0 ? Math.round((t.sentimentCounts.negative / total) * 100) : 0;
    return { ...t, score, posPct, neuPct, negPct };
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Flame className="w-4 h-4 text-primary" />
          <CardTitle className="text-base">Mapa de calor — Tema × Sentimento</CardTitle>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Intensidade da cor mostra polaridade do sentimento. Borda destaca temas com maior volume.
        </p>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-xs text-muted-foreground">
                <th className="text-left py-2 font-medium">Tema</th>
                <th className="text-center py-2 font-medium">Volume</th>
                <th className="text-center py-2 font-medium w-20">😊 Positivo</th>
                <th className="text-center py-2 font-medium w-20">😐 Neutro</th>
                <th className="text-center py-2 font-medium w-20">😠 Negativo</th>
                <th className="text-center py-2 font-medium w-32">Polaridade</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="border-b last:border-0">
                  <td className="py-2 pr-2 font-medium">{r.label}</td>
                  <td className="text-center">
                    <span className={`inline-flex items-center justify-center w-10 h-7 rounded text-xs font-semibold bg-primary/10 ${getIntensity(r.total, maxTotal)}`}>
                      {r.total}
                    </span>
                  </td>
                  <td className="text-center">
                    <span className={`inline-block w-12 py-1 rounded text-xs font-medium ${r.posPct > 0 ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-400" : "text-muted-foreground/40"}`}>
                      {r.posPct}%
                    </span>
                  </td>
                  <td className="text-center">
                    <span className={`inline-block w-12 py-1 rounded text-xs font-medium ${r.neuPct > 0 ? "bg-muted text-foreground" : "text-muted-foreground/40"}`}>
                      {r.neuPct}%
                    </span>
                  </td>
                  <td className="text-center">
                    <span className={`inline-block w-12 py-1 rounded text-xs font-medium ${r.negPct > 0 ? "bg-red-500/20 text-red-700 dark:text-red-400" : "text-muted-foreground/40"}`}>
                      {r.negPct}%
                    </span>
                  </td>
                  <td className="text-center">
                    <div className={`inline-block px-3 py-1 rounded text-xs font-semibold ${getCellColor(r.score)}`}>
                      {r.score > 0 ? "+" : ""}{(r.score * 100).toFixed(0)}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
});