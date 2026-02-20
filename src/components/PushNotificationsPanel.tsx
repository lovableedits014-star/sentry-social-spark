import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { Bell, Send, CheckCircle, XCircle, Loader2, Clock, AlertTriangle, Users } from "lucide-react";

type DispatchJob = {
  id: string;
  title: string | null;
  message: string | null;
  status: "pending" | "processing" | "done" | "failed" | "partial";
  total_subscribers: number;
  sent_count: number;
  failed_count: number;
  skipped_count: number;
  expired_removed: number;
  elapsed_seconds: number;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
};

interface PushNotificationsPanelProps {
  clientId: string;
}

const statusConfig = {
  pending:    { label: "Aguardando",   color: "bg-muted text-muted-foreground",    icon: Clock },
  processing: { label: "Enviando...",  color: "bg-primary/10 text-primary",        icon: Loader2 },
  done:       { label: "Concluído",    color: "bg-secondary text-secondary-foreground", icon: CheckCircle },
  partial:    { label: "Parcial",      color: "bg-muted text-foreground",          icon: AlertTriangle },
  failed:     { label: "Falhou",       color: "bg-destructive/10 text-destructive", icon: XCircle },
};

export function PushNotificationsPanel({ clientId }: PushNotificationsPanelProps) {
  const queryClient = useQueryClient();
  const DEFAULT_TITLE = "📣 Nova missão disponível!";
  const [title, setTitle] = useState(DEFAULT_TITLE);
  const [message, setMessage] = useState("");
  const [isSending, setIsSending] = useState(false);

  // Load job history
  const { data: jobs = [], refetch } = useQuery<DispatchJob[]>({
    queryKey: ["push-dispatch-jobs", clientId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("push_dispatch_jobs")
        .select("*")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data || [];
    },
    enabled: !!clientId,
    refetchInterval: (data: any) => {
      // Auto-refetch every 3s if any job is active
      const hasActive = (data?.state?.data as DispatchJob[] | undefined)?.some(
        j => j.status === "pending" || j.status === "processing"
      );
      return hasActive ? 3000 : false;
    },
  });

  // Realtime subscription for live updates
  useEffect(() => {
    if (!clientId) return;
    const channel = supabase
      .channel(`push-jobs-${clientId}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "push_dispatch_jobs",
        filter: `client_id=eq.${clientId}`,
      }, () => {
        refetch();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [clientId, refetch]);

  // Count active push subscriptions
  const { data: subscriberCount = 0 } = useQuery<number>({
    queryKey: ["push-subscriber-count", clientId],
    queryFn: async () => {
      const { count } = await (supabase as any)
        .from("push_subscriptions")
        .select("*", { count: "exact", head: true })
        .eq("client_id", clientId);
      return count || 0;
    },
    enabled: !!clientId,
  });

  const handleSend = async () => {
    if (!title.trim() && !message.trim()) {
      toast.error("Preencha o título ou a mensagem");
      return;
    }
    if (subscriberCount === 0) {
      toast.error("Nenhum apoiador com notificações ativas.");
      return;
    }

    setIsSending(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { toast.error("Sessão expirada"); return; }

      const { data, error } = await supabase.functions.invoke("send-push-notifications", {
        body: { client_id: clientId, title: title.trim(), message: message.trim() },
      });

      if (error) throw error;

      toast.success("📤 Envio iniciado! Acompanhe o progresso abaixo.");
      setTitle(DEFAULT_TITLE);
      setMessage("");
      refetch();
    } catch (err: any) {
      console.error(err);
      toast.error("Erro ao iniciar envio: " + (err?.message || "tente novamente"));
    } finally {
      setIsSending(false);
    }
  };

  const activeJob = jobs.find(j => j.status === "pending" || j.status === "processing");
  const hasActiveJob = !!activeJob;

  return (
    <div className="space-y-4">
      {/* Send Form */}
      <Card>
        <CardHeader className="px-3 sm:px-6">
          <CardTitle className="text-lg flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary" />
            Enviar Notificação Push
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm flex items-center gap-2">
            <Users className="h-4 w-4" />
            <span>
              <strong>{subscriberCount}</strong> apoiador{subscriberCount !== 1 ? "es" : ""} com notificações ativas
            </span>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 px-3 sm:px-6">
          {subscriberCount === 0 && (
            <div className="rounded-lg border border-border bg-muted p-3 text-xs text-muted-foreground flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>Nenhum apoiador ativou notificações ainda. Peça para acessarem o portal e clicarem em "Ativar Notificações".</span>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="push-title">Título <span className="text-muted-foreground text-xs">(opcional)</span></Label>
            <Input
              id="push-title"
              placeholder="🎯 Nova missão disponível!"
              value={title}
              onChange={e => setTitle(e.target.value)}
              maxLength={80}
              disabled={isSending || hasActiveJob}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="push-message">Mensagem</Label>
            <Textarea
              id="push-message"
              placeholder="Acesse o portal e interaja com a nova postagem para ganhar pontos!"
              value={message}
              onChange={e => setMessage(e.target.value)}
              maxLength={200}
              rows={3}
              disabled={isSending || hasActiveJob}
            />
            <p className="text-xs text-muted-foreground text-right">{message.length}/200</p>
          </div>



          <Button
            onClick={handleSend}
            disabled={isSending || hasActiveJob || subscriberCount === 0}
            className="w-full sm:w-auto"
          >
            {isSending ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Iniciando...</>
            ) : hasActiveJob ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Envio em andamento...</>
            ) : (
              <><Send className="h-4 w-4 mr-2" /> Enviar para {subscriberCount} apoiador{subscriberCount !== 1 ? "es" : ""}</>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Active Job Progress */}
      {activeJob && (
        <Card className="border-primary/30">
          <CardContent className="pt-4 px-3 sm:px-6 pb-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span className="font-medium text-sm">Enviando notificações...</span>
              </div>
              <span className="text-xs text-muted-foreground">
                {activeJob.sent_count} / {activeJob.total_subscribers || "?"}
              </span>
            </div>
            {activeJob.total_subscribers > 0 && (
              <Progress
                value={Math.round((activeJob.sent_count / activeJob.total_subscribers) * 100)}
                className="h-2"
              />
            )}
            <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
              <span className="font-medium">✅ {activeJob.sent_count} enviados</span>
              {activeJob.failed_count > 0 && <span className="text-destructive">❌ {activeJob.failed_count} falhas</span>}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Job History */}
      {jobs.length > 0 && (
        <Card>
          <CardHeader className="px-3 sm:px-6 pb-3">
            <CardTitle className="text-base">Histórico de Disparos</CardTitle>
          </CardHeader>
          <CardContent className="px-3 sm:px-6 pt-0 space-y-2">
            {jobs.map(job => {
              const cfg = statusConfig[job.status];
              const StatusIcon = cfg.icon;
              const progress = job.total_subscribers > 0
                ? Math.round(((job.sent_count + job.failed_count) / job.total_subscribers) * 100)
                : 0;

              return (
                <div key={job.id} className="rounded-lg border p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {job.title || "Sem título"}
                      </p>
                      {job.message && (
                        <p className="text-xs text-muted-foreground truncate">{job.message}</p>
                      )}
                    </div>
                    <Badge className={`${cfg.color} shrink-0 text-xs flex items-center gap-1`}>
                      <StatusIcon className={`h-3 w-3 ${job.status === "processing" ? "animate-spin" : ""}`} />
                      {cfg.label}
                    </Badge>
                  </div>

                  {/* Progress bar for active/done jobs */}
                  {(job.status === "processing" || job.status === "done" || job.status === "partial") && job.total_subscribers > 0 && (
                    <Progress value={progress} className="h-1.5" />
                  )}

                  <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                    <span>👥 {job.total_subscribers} destinatários</span>
                    {job.sent_count > 0 && <span className="font-medium">✅ {job.sent_count} enviados</span>}
                    {job.failed_count > 0 && <span className="text-destructive">❌ {job.failed_count} falhas</span>}
                    {job.skipped_count > 0 && <span>⏭ {job.skipped_count} pulados</span>}
                    {job.expired_removed > 0 && <span>🗑 {job.expired_removed} expirados removidos</span>}
                    {job.elapsed_seconds > 0 && <span>⏱ {job.elapsed_seconds}s</span>}
                    <span className="ml-auto">
                      {new Date(job.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>

                  {job.error_message && (
                    <p className="text-xs text-destructive bg-destructive/10 rounded p-1.5">{job.error_message}</p>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
