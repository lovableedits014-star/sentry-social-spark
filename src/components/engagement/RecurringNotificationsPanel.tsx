import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import {
  Bell,
  BellRing,
  Send,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  Users,
  RefreshCw,
  AlertTriangle,
} from "lucide-react";

interface RecurringNotificationsPanelProps {
  clientId: string | undefined;
}

export function RecurringNotificationsPanel({ clientId }: RecurringNotificationsPanelProps) {
  const [frequency, setFrequency] = useState("daily");
  const [sending, setSending] = useState(false);

  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useQuery({
    queryKey: ["recurring-stats", clientId],
    queryFn: async () => {
      if (!clientId) return null;
      const { data, error } = await supabase.functions.invoke("manage-recurring-notifications", {
        body: { action: "stats", clientId },
      });
      if (error) throw error;
      return data?.stats as { active: number; expired: number; revoked: number; total: number; totalSupporters: number } | null;
    },
    enabled: !!clientId,
  });

  const { data: tokens, isLoading: tokensLoading, refetch: refetchTokens } = useQuery({
    queryKey: ["recurring-tokens", clientId],
    queryFn: async () => {
      if (!clientId) return [];
      const { data, error } = await supabase.functions.invoke("manage-recurring-notifications", {
        body: { action: "list", clientId },
      });
      if (error) throw error;
      return (data?.tokens || []) as Array<{
        id: string;
        supporter_id: string;
        token_status: string;
        frequency: string;
        expires_at: string | null;
        opted_in_at: string;
        last_used_at: string | null;
        supporter: { name: string } | null;
      }>;
    },
    enabled: !!clientId,
  });

  const handleSendBulkOptin = async () => {
    if (!clientId) return;
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-recurring-notifications", {
        body: { action: "send-optin-bulk", clientId, frequency },
      });
      if (error) throw error;
      if (data.success) {
        toast.success(data.message);
        refetchStats();
        refetchTokens();
      } else {
        toast.error(data.error);
      }
    } catch (err: any) {
      toast.error(err.message || "Erro ao enviar opt-ins");
    } finally {
      setSending(false);
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleDateString("pt-BR", {
      day: "2-digit", month: "short", year: "numeric",
    });
  };

  const coveragePercent = stats && stats.totalSupporters > 0
    ? Math.round((stats.active / stats.totalSupporters) * 100)
    : 0;

  const statusIcon: Record<string, any> = {
    active: CheckCircle2,
    expired: Clock,
    revoked: XCircle,
  };

  const statusColor: Record<string, string> = {
    active: "text-emerald-600",
    expired: "text-amber-600",
    revoked: "text-destructive",
  };

  const statusLabel: Record<string, string> = {
    active: "Ativo",
    expired: "Expirado",
    revoked: "Revogado",
  };

  return (
    <div className="space-y-4">
      {/* Info Banner */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <BellRing className="w-5 h-5 text-primary mt-0.5 shrink-0" />
            <div className="space-y-1">
              <p className="text-sm font-medium">Notificações Recorrentes (Marketing Messages)</p>
              <p className="text-xs text-muted-foreground">
                Permite enviar mensagens fora da janela de 24h para apoiadores que aceitaram o opt-in.
                O sistema tentará automaticamente usar o token quando o envio padrão falhar.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4 text-center">
            <Bell className="w-5 h-5 mx-auto mb-1 text-primary" />
            <p className="text-2xl font-bold">{stats?.active || 0}</p>
            <p className="text-xs text-muted-foreground">Opt-ins Ativos</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Users className="w-5 h-5 mx-auto mb-1 text-muted-foreground" />
            <p className="text-2xl font-bold">{stats?.totalSupporters || 0}</p>
            <p className="text-xs text-muted-foreground">Apoiadores Ativos</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">{coveragePercent}%</p>
            <Progress value={coveragePercent} className="h-1.5 mt-1" />
            <p className="text-xs text-muted-foreground mt-1">Cobertura</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <AlertTriangle className="w-5 h-5 mx-auto mb-1 text-amber-500" />
            <p className="text-2xl font-bold">{stats?.expired || 0}</p>
            <p className="text-xs text-muted-foreground">Expirados</p>
          </CardContent>
        </Card>
      </div>

      {/* Actions */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Send className="w-4 h-4" />
            Enviar Pedido de Opt-in em Massa
          </CardTitle>
          <CardDescription className="text-xs">
            Envia um pedido de opt-in via Messenger para todos os apoiadores ativos que ainda não têm um token ativo.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3">
            <Select value={frequency} onValueChange={setFrequency}>
              <SelectTrigger className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">Diário</SelectItem>
                <SelectItem value="weekly">Semanal</SelectItem>
                <SelectItem value="monthly">Mensal</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={handleSendBulkOptin} disabled={sending || !clientId}>
              {sending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              {sending ? "Enviando..." : "Enviar Opt-ins"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            ⚠️ O opt-in só funciona para apoiadores que já interagiram com a página no Messenger pelo menos uma vez.
          </p>
        </CardContent>
      </Card>

      {/* Token List */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Tokens de Notificação</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => { refetchTokens(); refetchStats(); }}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {tokensLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : tokens && tokens.length > 0 ? (
            <ScrollArea className="max-h-[400px]">
              <div className="space-y-1">
                {tokens.map((t) => {
                  const SIcon = statusIcon[t.token_status] || Clock;
                  const sColor = statusColor[t.token_status] || "text-muted-foreground";
                  const sLabel = statusLabel[t.token_status] || t.token_status;

                  return (
                    <div key={t.id} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/50 transition-colors">
                      <Avatar className="h-8 w-8 shrink-0">
                        <AvatarFallback className="text-xs">
                          {t.supporter?.name?.charAt(0) || "?"}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{t.supporter?.name || "Desconhecido"}</p>
                        <p className="text-xs text-muted-foreground">
                          Opt-in: {formatDate(t.opted_in_at)} · Freq: {t.frequency}
                          {t.last_used_at && ` · Último uso: ${formatDate(t.last_used_at)}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <SIcon className={`w-4 h-4 ${sColor}`} />
                        <span className={`text-xs font-medium ${sColor}`}>{sLabel}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Bell className="w-10 h-10 mx-auto mb-3 opacity-20" />
              <p className="text-sm font-medium">Nenhum token registrado</p>
              <p className="text-xs mt-1">Envie pedidos de opt-in para começar a coletar tokens.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
