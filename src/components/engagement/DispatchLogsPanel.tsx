import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Facebook,
  Instagram,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  ChevronDown,
  ChevronRight,
  Users,
  Send,
  AlertCircle,
  SkipForward,
  Eye,
  RefreshCw,
  Ban,
} from "lucide-react";

interface DispatchLogsProps {
  clientId: string | undefined;
}

interface DispatchItem {
  id: string;
  dispatch_id: string;
  supporter_id: string;
  supporter_name: string;
  platform: string;
  platform_user_id: string | null;
  status: string;
  sent_at: string | null;
  error_message: string | null;
  created_at: string;
}

interface Dispatch {
  id: string;
  post_id: string;
  post_permalink_url: string | null;
  post_platform: string;
  message_template: string;
  status: string;
  total_recipients: number;
  sent_count: number;
  failed_count: number;
  batch_size: number;
  created_at: string;
  completed_at: string | null;
  cancelled_at: string | null;
  error_message: string | null;
}

const statusConfig: Record<string, { icon: any; label: string; color: string; bg: string }> = {
  pending: { icon: Clock, label: "Pendente", color: "text-muted-foreground", bg: "bg-muted" },
  processing: { icon: Loader2, label: "Processando", color: "text-amber-600", bg: "bg-amber-100 dark:bg-amber-900/30" },
  completed: { icon: CheckCircle2, label: "Concluído", color: "text-emerald-600", bg: "bg-emerald-100 dark:bg-emerald-900/30" },
  cancelled: { icon: Ban, label: "Cancelado", color: "text-muted-foreground", bg: "bg-muted" },
  error: { icon: AlertCircle, label: "Erro", color: "text-destructive", bg: "bg-destructive/10" },
};

const itemStatusConfig: Record<string, { icon: any; label: string; color: string }> = {
  pending: { icon: Clock, label: "Pendente", color: "text-muted-foreground" },
  sent: { icon: CheckCircle2, label: "Enviado", color: "text-emerald-600" },
  failed: { icon: XCircle, label: "Falhou", color: "text-destructive" },
  skipped: { icon: SkipForward, label: "Ignorado", color: "text-amber-600" },
  cancelled: { icon: Ban, label: "Cancelado", color: "text-muted-foreground" },
};

export function DispatchLogsPanel({ clientId }: DispatchLogsProps) {
  const [selectedDispatch, setSelectedDispatch] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data: dispatches, isLoading, refetch } = useQuery({
    queryKey: ["dispatch-logs", clientId],
    queryFn: async () => {
      if (!clientId) return [];
      const { data, error } = await supabase
        .from("message_dispatches")
        .select("*")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data || []) as Dispatch[];
    },
    enabled: !!clientId,
    refetchInterval: 10000,
  });

  const { data: dispatchItems, isLoading: itemsLoading } = useQuery({
    queryKey: ["dispatch-items", selectedDispatch],
    queryFn: async () => {
      if (!selectedDispatch) return [];
      const { data, error } = await supabase
        .from("dispatch_items")
        .select("*")
        .eq("dispatch_id", selectedDispatch)
        .order("status", { ascending: true })
        .order("sent_at", { ascending: false });
      if (error) throw error;
      return (data || []) as DispatchItem[];
    },
    enabled: !!selectedDispatch,
    refetchInterval: selectedDispatch ? 5000 : false,
  });

  const filteredItems = dispatchItems?.filter(
    (item) => statusFilter === "all" || item.status === statusFilter
  );

  const formatDateTime = (dateStr: string) => {
    if (!dateStr) return "";
    return new Date(dateStr).toLocaleString("pt-BR", {
      day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
    });
  };

  const getItemCounts = (items: DispatchItem[] | undefined) => {
    if (!items) return { sent: 0, failed: 0, skipped: 0, pending: 0, cancelled: 0 };
    return {
      sent: items.filter(i => i.status === "sent").length,
      failed: items.filter(i => i.status === "failed").length,
      skipped: items.filter(i => i.status === "skipped").length,
      pending: items.filter(i => i.status === "pending").length,
      cancelled: items.filter(i => i.status === "cancelled").length,
    };
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map(i => <div key={i} className="h-20 bg-muted rounded-lg animate-pulse" />)}
      </div>
    );
  }

  if (!dispatches || dispatches.length === 0) {
    return (
      <Card>
        <CardContent className="py-16 text-center text-muted-foreground">
          <Send className="w-12 h-12 mx-auto mb-4 opacity-20" />
          <p className="font-medium">Nenhum disparo realizado</p>
          <p className="text-sm mt-1">Envie mensagens pela aba Central para ver os logs aqui.</p>
        </CardContent>
      </Card>
    );
  }

  const selectedDispatchData = dispatches.find(d => d.id === selectedDispatch);
  const counts = getItemCounts(dispatchItems);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Histórico de todos os disparos realizados. Clique para ver detalhes.
        </p>
        <Button variant="ghost" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      <div className="space-y-2">
        {dispatches.map((d) => {
          const cfg = statusConfig[d.status] || statusConfig.pending;
          const Icon = cfg.icon;
          const progress = d.total_recipients > 0
            ? Math.round(((d.sent_count + d.failed_count) / d.total_recipients) * 100)
            : 0;

          return (
            <Card
              key={d.id}
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => setSelectedDispatch(d.id)}
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className={`p-2 rounded-lg ${cfg.bg}`}>
                      <Icon className={`w-4 h-4 ${cfg.color} ${d.status === 'processing' ? 'animate-spin' : ''}`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-sm font-medium ${cfg.color}`}>{cfg.label}</span>
                        <Badge variant="outline" className="text-xs gap-1">
                          {d.post_platform === 'instagram'
                            ? <Instagram className="w-3 h-3" />
                            : <Facebook className="w-3 h-3" />}
                          {d.post_platform === 'instagram' ? 'Instagram' : 'Facebook'}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {formatDateTime(d.created_at)}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Users className="w-3 h-3" /> {d.total_recipients}
                        </span>
                        <span className="flex items-center gap-1 text-emerald-600">
                          <CheckCircle2 className="w-3 h-3" /> {d.sent_count}
                        </span>
                        {d.failed_count > 0 && (
                          <span className="flex items-center gap-1 text-destructive">
                            <XCircle className="w-3 h-3" /> {d.failed_count}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <span className="text-sm font-bold">{progress}%</span>
                    </div>
                    <Eye className="w-4 h-4 text-muted-foreground" />
                  </div>
                </div>
                {(d.status === 'processing' || d.status === 'pending') && (
                  <Progress value={progress} className="h-1.5 mt-3" />
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Detail Dialog */}
      <Dialog open={!!selectedDispatch} onOpenChange={(open) => !open && setSelectedDispatch(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="w-5 h-5" />
              Detalhes do Disparo
              {selectedDispatchData && (
                <Badge variant="outline" className="text-xs gap-1">
                  {selectedDispatchData.post_platform === 'instagram'
                    ? <Instagram className="w-3 h-3" />
                    : <Facebook className="w-3 h-3" />}
                  {formatDateTime(selectedDispatchData.created_at)}
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>

          {selectedDispatchData && (
            <div className="space-y-4 flex-1 min-h-0">
              {/* Summary */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="text-center p-2 rounded-lg bg-muted/50">
                  <p className="text-lg font-bold">{selectedDispatchData.total_recipients}</p>
                  <p className="text-xs text-muted-foreground">Total</p>
                </div>
                <div className="text-center p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/30">
                  <p className="text-lg font-bold text-emerald-600">{counts.sent}</p>
                  <p className="text-xs text-emerald-600">Enviados</p>
                </div>
                <div className="text-center p-2 rounded-lg bg-destructive/5">
                  <p className="text-lg font-bold text-destructive">{counts.failed}</p>
                  <p className="text-xs text-destructive">Falhas</p>
                </div>
                <div className="text-center p-2 rounded-lg bg-amber-50 dark:bg-amber-950/30">
                  <p className="text-lg font-bold text-amber-600">{counts.skipped + counts.pending}</p>
                  <p className="text-xs text-amber-600">Ignorados/Pendentes</p>
                </div>
              </div>

              {selectedDispatchData.error_message && (
                <div className="p-3 rounded-lg bg-destructive/10 text-sm text-destructive">
                  {selectedDispatchData.error_message}
                </div>
              )}

              <Separator />

              {/* Filters */}
              <div className="flex gap-1.5 flex-wrap">
                {[
                  { value: "all", label: "Todos" },
                  { value: "sent", label: `Enviados (${counts.sent})` },
                  { value: "failed", label: `Falhas (${counts.failed})` },
                  { value: "skipped", label: `Ignorados (${counts.skipped})` },
                  { value: "pending", label: `Pendentes (${counts.pending})` },
                ].map((f) => (
                  <Button
                    key={f.value}
                    variant={statusFilter === f.value ? "default" : "outline"}
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setStatusFilter(f.value)}
                  >
                    {f.label}
                  </Button>
                ))}
              </div>

              {/* Items List */}
              <ScrollArea className="flex-1 max-h-[400px]">
                {itemsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <div className="space-y-1">
                    {filteredItems?.map((item) => {
                      const icfg = itemStatusConfig[item.status] || itemStatusConfig.pending;
                      const IIcon = icfg.icon;
                      return (
                        <div key={item.id} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/50 transition-colors">
                          <Avatar className="h-8 w-8 shrink-0">
                            <AvatarFallback className="text-xs">
                              {item.supporter_name.charAt(0)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{item.supporter_name}</p>
                            {item.error_message && (
                              <p className="text-xs text-destructive truncate" title={item.error_message}>
                                {item.error_message}
                              </p>
                            )}
                            {item.sent_at && (
                              <p className="text-xs text-muted-foreground">
                                {formatDateTime(item.sent_at)}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <Badge variant="outline" className="text-xs gap-1">
                              {item.platform === 'instagram'
                                ? <Instagram className="w-3 h-3" />
                                : <Facebook className="w-3 h-3" />}
                            </Badge>
                            <IIcon className={`w-4 h-4 ${icfg.color}`} />
                            <span className={`text-xs font-medium ${icfg.color}`}>{icfg.label}</span>
                          </div>
                        </div>
                      );
                    })}
                    {filteredItems?.length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-8">
                        Nenhum item com este filtro.
                      </p>
                    )}
                  </div>
                )}
              </ScrollArea>

              {/* Message preview */}
              <Collapsible>
                <CollapsibleTrigger className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
                  <ChevronRight className="w-4 h-4" />
                  Ver mensagem enviada
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2">
                  <div className="p-3 rounded-lg bg-muted text-sm whitespace-pre-wrap">
                    {selectedDispatchData.message_template}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
