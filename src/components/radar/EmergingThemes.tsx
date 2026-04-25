import { memo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sparkles, ThumbsUp, ThumbsDown, MinusCircle, MessageSquare, Phone, Users } from "lucide-react";

export interface EmergingTheme {
  theme: string;
  description: string;
  total: number;
  sentimentCounts: { positive: number; neutral: number; negative: number };
  sources: { comment: number; telemarketing: number; crm: number };
  examples: string[];
}

interface EmergingThemesProps {
  themes: EmergingTheme[];
  provider?: string;
  totalAnalyzed?: number;
}

export const EmergingThemes = memo(function EmergingThemes({
  themes,
  provider,
  totalAnalyzed,
}: EmergingThemesProps) {
  if (themes.length === 0) return null;

  return (
    <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-transparent">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            <CardTitle className="text-base">Temas emergentes descobertos pela IA</CardTitle>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {provider && (
              <Badge variant="outline" className="text-[10px]">
                via {provider}
              </Badge>
            )}
            {totalAnalyzed !== undefined && <span>{totalAnalyzed} mensagens analisadas</span>}
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Assuntos que apareceram nos últimos 7 dias e não estão nas categorias pré-definidas.
          Cobre comentários, telemarketing e interações do CRM.
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {themes
            .sort((a, b) => b.total - a.total)
            .map((t) => (
              <div
                key={t.theme}
                className="rounded-lg border bg-card p-3 space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h4 className="font-semibold text-sm truncate">{t.theme}</h4>
                    {t.description && (
                      <p className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5">
                        {t.description}
                      </p>
                    )}
                  </div>
                  <Badge variant="default" className="text-[10px] shrink-0">
                    {t.total}
                  </Badge>
                </div>

                {/* Source breakdown */}
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                  {t.sources.comment > 0 && (
                    <span className="flex items-center gap-0.5">
                      <MessageSquare className="w-3 h-3" /> {t.sources.comment}
                    </span>
                  )}
                  {t.sources.telemarketing > 0 && (
                    <span className="flex items-center gap-0.5">
                      <Phone className="w-3 h-3" /> {t.sources.telemarketing}
                    </span>
                  )}
                  {t.sources.crm > 0 && (
                    <span className="flex items-center gap-0.5">
                      <Users className="w-3 h-3" /> {t.sources.crm}
                    </span>
                  )}
                </div>

                {/* Sentiment */}
                <div className="flex items-center gap-3 text-[11px]">
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

                {/* First example */}
                {t.examples[0] && (
                  <p className="text-[11px] text-muted-foreground italic line-clamp-2 border-l-2 border-primary/30 pl-2">
                    "{t.examples[0]}"
                  </p>
                )}
              </div>
            ))}
        </div>
      </CardContent>
    </Card>
  );
});