import { useState, useMemo, useEffect, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { toast } from "sonner";
import {
  Facebook,
  Instagram,
  ExternalLink,
  Copy,
  Check,
  MessageSquare,
  Image as ImageIcon,
  Video,
  RefreshCw,
  Send,
  Square,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ChevronDown,
  Loader2,
  Users,
} from "lucide-react";

interface PostData {
  post_id: string;
  post_message: string | null;
  post_permalink_url: string | null;
  post_full_picture: string | null;
  post_media_type: string | null;
  platform: string;
  latest_comment_time: string;
  comment_count: number;
}

interface DispatchData {
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
  batch_delay_seconds: number;
  message_delay_min_seconds: number;
  message_delay_max_seconds: number;
  created_at: string;
  completed_at: string | null;
  cancelled_at: string | null;
  error_message: string | null;
}

interface EngagementPostCardsProps {
  clientId: string | undefined;
}

const DEFAULT_MESSAGE = `🚀 Nova publicação no ar!\nCorre lá, curta, comenta e compartilhe para fortalecer nosso projeto!\n👇\n{LINK}`;

export function EngagementPostCards({ clientId }: EngagementPostCardsProps) {
  const queryClient = useQueryClient();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [sendDialogPost, setSendDialogPost] = useState<PostData | null>(null);
  const [messageTemplate, setMessageTemplate] = useState(DEFAULT_MESSAGE);
  const [batchSize, setBatchSize] = useState(20);
  const [batchDelay, setBatchDelay] = useState(180);
  const [msgDelayMin, setMsgDelayMin] = useState(15);
  const [msgDelayMax, setMsgDelayMax] = useState(45);
  const [creating, setCreating] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);

  // Fetch posts
  const { data: rawComments, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["engagement-posts", clientId],
    queryFn: async () => {
      if (!clientId) return [];
      const { data, error } = await supabase
        .from("comments")
        .select("post_id, post_message, post_permalink_url, post_full_picture, post_media_type, platform, comment_created_time")
        .eq("client_id", clientId)
        .eq("is_page_owner", false)
        .order("comment_created_time", { ascending: false })
        .limit(2000);
      if (error) throw error;
      return data || [];
    },
    enabled: !!clientId,
  });

  // Fetch dispatches
  const { data: dispatches, refetch: refetchDispatches } = useQuery({
    queryKey: ["dispatches", clientId],
    queryFn: async () => {
      if (!clientId) return [];
      const { data, error } = await supabase
        .from("message_dispatches")
        .select("*")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return (data || []) as DispatchData[];
    },
    enabled: !!clientId,
    refetchInterval: processingId ? 5000 : false,
  });

  const posts = useMemo((): PostData[] => {
    if (!rawComments) return [];
    const map = new Map<string, PostData>();
    for (const c of rawComments) {
      const key = `${c.platform}:${c.post_id}`;
      if (!map.has(key)) {
        map.set(key, {
          post_id: c.post_id,
          post_message: c.post_message,
          post_permalink_url: c.post_permalink_url,
          post_full_picture: c.post_full_picture,
          post_media_type: c.post_media_type,
          platform: c.platform || "facebook",
          latest_comment_time: c.comment_created_time || "",
          comment_count: 1,
        });
      } else {
        map.get(key)!.comment_count++;
      }
    }
    return Array.from(map.values())
      .sort((a, b) => b.latest_comment_time.localeCompare(a.latest_comment_time))
      .slice(0, 10);
  }, [rawComments]);

  // Auto-process dispatches that are still processing
  const processDispatch = useCallback(async (dispatchId: string) => {
    if (!clientId) return;
    setProcessingId(dispatchId);
    
    try {
      const { data, error } = await supabase.functions.invoke('send-engagement-messages', {
        body: { action: 'process', clientId, dispatchId },
      });

      if (error) throw error;

      if (data.completed) {
        toast.success(data.message);
        setProcessingId(null);
      } else {
        toast.info(data.message);
        // Continue processing after batch delay
        const dispatch = dispatches?.find(d => d.id === dispatchId);
        const delay = (dispatch?.batch_delay_seconds || 180) * 1000;
        setTimeout(() => processDispatch(dispatchId), delay);
      }
      refetchDispatches();
    } catch (err: any) {
      console.error('Error processing dispatch:', err);
      toast.error(err.message || 'Erro ao processar disparo');
      setProcessingId(null);
    }
  }, [clientId, dispatches, refetchDispatches]);

  const handleCreateDispatch = async () => {
    if (!sendDialogPost || !clientId) return;
    setCreating(true);

    try {
      const finalMessage = messageTemplate.replace('{LINK}', sendDialogPost.post_permalink_url || '');
      
      const { data, error } = await supabase.functions.invoke('send-engagement-messages', {
        body: {
          action: 'create',
          clientId,
          postId: sendDialogPost.post_id,
          postPermalinkUrl: sendDialogPost.post_permalink_url,
          postPlatform: sendDialogPost.platform,
          messageTemplate: finalMessage,
          batchSize,
          batchDelaySeconds: batchDelay,
          messageDelayMin: msgDelayMin,
          messageDelayMax: msgDelayMax,
        },
      });

      if (error) throw error;

      if (data.success) {
        toast.success(data.message);
        setSendDialogPost(null);
        refetchDispatches();
        
        // Start processing
        if (data.dispatch?.id) {
          setTimeout(() => processDispatch(data.dispatch.id), 1000);
        }
      } else {
        toast.error(data.error);
      }
    } catch (err: any) {
      console.error('Error creating dispatch:', err);
      toast.error(err.message || 'Erro ao criar disparo');
    } finally {
      setCreating(false);
    }
  };

  const handleCancelDispatch = async (dispatchId: string) => {
    if (!clientId) return;
    try {
      const { data, error } = await supabase.functions.invoke('send-engagement-messages', {
        body: { action: 'cancel', clientId, dispatchId },
      });
      if (error) throw error;
      toast.success(data.message || 'Disparo cancelado');
      setProcessingId(null);
      refetchDispatches();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao cancelar');
    }
  };

  const handleCopyLink = async (post: PostData) => {
    if (!post.post_permalink_url) { toast.error("Link não disponível"); return; }
    const message = DEFAULT_MESSAGE.replace('{LINK}', post.post_permalink_url);
    try {
      await navigator.clipboard.writeText(message);
      setCopiedMessageId(post.post_id);
      toast.success("Mensagem copiada!");
      setTimeout(() => setCopiedMessageId(null), 3000);
    } catch { toast.error("Erro ao copiar"); }
  };

  const handleCopyLinkOnly = async (post: PostData) => {
    if (!post.post_permalink_url) { toast.error("Link não disponível"); return; }
    try {
      await navigator.clipboard.writeText(post.post_permalink_url);
      setCopiedId(post.post_id);
      toast.success("Link copiado!");
      setTimeout(() => setCopiedId(null), 3000);
    } catch { toast.error("Erro ao copiar"); }
  };

  const openSendDialog = (post: PostData) => {
    setMessageTemplate(DEFAULT_MESSAGE.replace('{LINK}', post.post_permalink_url || ''));
    setSendDialogPost(post);
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "";
    return new Date(dateStr).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
  };

  const formatDateTime = (dateStr: string) => {
    if (!dateStr) return "";
    return new Date(dateStr).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  };

  const truncateText = (text: string | null, maxLen = 120) => {
    if (!text) return "Sem legenda";
    return text.length > maxLen ? text.slice(0, maxLen) + "…" : text;
  };

  const statusConfig: Record<string, { icon: any; label: string; color: string }> = {
    pending: { icon: Clock, label: "Pendente", color: "text-muted-foreground" },
    processing: { icon: Loader2, label: "Processando", color: "text-amber-500" },
    completed: { icon: CheckCircle2, label: "Concluído", color: "text-emerald-500" },
    cancelled: { icon: XCircle, label: "Cancelado", color: "text-destructive" },
    error: { icon: AlertCircle, label: "Erro", color: "text-destructive" },
  };

  const activeDispatches = dispatches?.filter(d => d.status === 'processing' || d.status === 'pending') || [];

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {[1, 2, 3, 4].map(i => <div key={i} className="h-64 bg-muted rounded-xl animate-pulse" />)}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Active/Recent Dispatches Panel */}
      {dispatches && dispatches.length > 0 && (
        <Collapsible defaultOpen={activeDispatches.length > 0}>
          <Card>
            <CardHeader className="pb-2 px-4">
              <CollapsibleTrigger className="flex items-center justify-between w-full">
                <CardTitle className="text-base flex items-center gap-2">
                  <Send className="w-4 h-4" />
                  Disparos Recentes
                  {activeDispatches.length > 0 && (
                    <Badge variant="secondary" className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300">
                      {activeDispatches.length} ativo{activeDispatches.length > 1 ? 's' : ''}
                    </Badge>
                  )}
                </CardTitle>
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              </CollapsibleTrigger>
            </CardHeader>
            <CollapsibleContent>
              <CardContent className="px-4 pt-0 space-y-3">
                {dispatches.map((d) => {
                  const cfg = statusConfig[d.status] || statusConfig.pending;
                  const Icon = cfg.icon;
                  const progress = d.total_recipients > 0
                    ? Math.round(((d.sent_count + d.failed_count) / d.total_recipients) * 100)
                    : 0;
                  const isActive = d.status === 'processing' || d.status === 'pending';

                  return (
                    <div key={d.id} className="border rounded-lg p-3 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <Icon className={`w-4 h-4 shrink-0 ${cfg.color} ${d.status === 'processing' ? 'animate-spin' : ''}`} />
                          <span className={`text-sm font-medium ${cfg.color}`}>{cfg.label}</span>
                          <Badge variant="outline" className="text-xs">
                            {d.post_platform === 'instagram' ? <Instagram className="w-3 h-3 mr-1" /> : <Facebook className="w-3 h-3 mr-1" />}
                            {formatDateTime(d.created_at)}
                          </Badge>
                        </div>
                        {isActive && (
                          <Button
                            variant="destructive"
                            size="sm"
                            className="h-7 text-xs gap-1"
                            onClick={() => handleCancelDispatch(d.id)}
                          >
                            <Square className="w-3 h-3" />
                            Parar
                          </Button>
                        )}
                      </div>

                      <Progress value={progress} className="h-2" />

                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <div className="flex gap-3">
                          <span className="flex items-center gap-1">
                            <Users className="w-3 h-3" />
                            {d.total_recipients} total
                          </span>
                          <span className="flex items-center gap-1 text-emerald-600">
                            <CheckCircle2 className="w-3 h-3" />
                            {d.sent_count} enviados
                          </span>
                          {d.failed_count > 0 && (
                            <span className="flex items-center gap-1 text-destructive">
                              <XCircle className="w-3 h-3" />
                              {d.failed_count} falhas
                            </span>
                          )}
                        </div>
                        <span>{progress}%</span>
                      </div>

                      {d.error_message && (
                        <p className="text-xs text-destructive">{d.error_message}</p>
                      )}

                      {isActive && processingId !== d.id && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs gap-1"
                          onClick={() => processDispatch(d.id)}
                        >
                          <RefreshCw className="w-3 h-3" />
                          Retomar Envio
                        </Button>
                      )}
                    </div>
                  );
                })}
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      )}

      {/* Post Cards */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Últimas postagens. Envie para apoiadores ou copie a mensagem.
        </p>
        <Button variant="ghost" size="sm" onClick={() => refetch()} disabled={isRefetching}>
          <RefreshCw className={`h-4 w-4 ${isRefetching ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {posts.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            <ImageIcon className="w-12 h-12 mx-auto mb-4 opacity-20" />
            <p className="font-medium">Nenhuma postagem encontrada</p>
            <p className="text-sm mt-1">Sincronize os comentários para ver as postagens aqui.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {posts.map((post) => (
            <Card key={`${post.platform}:${post.post_id}`} className="overflow-hidden group hover:shadow-md transition-shadow">
              {post.post_full_picture && (
                <div className="relative aspect-video bg-muted overflow-hidden">
                  <img src={post.post_full_picture} alt="Post" className="w-full h-full object-cover" loading="lazy" />
                  <div className="absolute top-2 left-2">
                    <Badge className={`${post.platform === "instagram" ? "bg-pink-500/90 hover:bg-pink-500" : "bg-blue-600/90 hover:bg-blue-600"} text-white border-0 gap-1`}>
                      {post.platform === "instagram" ? <Instagram className="w-3 h-3" /> : <Facebook className="w-3 h-3" />}
                      {post.platform === "instagram" ? "Instagram" : "Facebook"}
                    </Badge>
                  </div>
                  {post.post_media_type && (
                    <div className="absolute top-2 right-2">
                      <Badge variant="secondary" className="bg-background/80 backdrop-blur-sm text-xs gap-1">
                        {post.post_media_type === "video" || post.post_media_type === "VIDEO" ? (
                          <><Video className="w-3 h-3" /> Vídeo</>
                        ) : (
                          <><ImageIcon className="w-3 h-3" /> Imagem</>
                        )}
                      </Badge>
                    </div>
                  )}
                </div>
              )}

              <CardContent className={`p-4 space-y-3 ${!post.post_full_picture ? "pt-4" : ""}`}>
                {!post.post_full_picture && (
                  <Badge className={`${post.platform === "instagram" ? "bg-pink-500/90 hover:bg-pink-500" : "bg-blue-600/90 hover:bg-blue-600"} text-white border-0 gap-1`}>
                    {post.platform === "instagram" ? <Instagram className="w-3 h-3" /> : <Facebook className="w-3 h-3" />}
                    {post.platform === "instagram" ? "Instagram" : "Facebook"}
                  </Badge>
                )}

                <p className="text-sm leading-relaxed">{truncateText(post.post_message)}</p>

                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{formatDate(post.latest_comment_time)}</span>
                  <span className="flex items-center gap-1">
                    <MessageSquare className="w-3 h-3" />
                    {post.comment_count} comentários
                  </span>
                </div>

                {/* Actions */}
                <div className="flex gap-2 pt-1">
                  <Button
                    variant="default"
                    size="sm"
                    className="flex-1 gap-1.5"
                    onClick={() => openSendDialog(post)}
                    disabled={!!processingId}
                  >
                    <Send className="w-4 h-4" />
                    Enviar para Apoiadores
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => handleCopyLink(post)}
                    title="Copiar mensagem"
                  >
                    {copiedMessageId === post.post_id ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </Button>
                  {post.post_permalink_url && (
                    <Button variant="outline" size="sm" asChild title="Abrir postagem">
                      <a href={post.post_permalink_url} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Send Dialog */}
      <Dialog open={!!sendDialogPost} onOpenChange={(open) => !open && setSendDialogPost(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="w-5 h-5" />
              Enviar para Apoiadores
            </DialogTitle>
            <DialogDescription>
              Envie esta postagem via Messenger/DM para apoiadores ativos. O envio será feito em lotes com intervalos para evitar bloqueios.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Message Preview */}
            <div className="space-y-2">
              <Label>Mensagem</Label>
              <Textarea
                value={messageTemplate}
                onChange={(e) => setMessageTemplate(e.target.value)}
                rows={5}
                className="text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Use {'{LINK}'} para inserir o link da postagem automaticamente.
              </p>
            </div>

            <Separator />

            {/* Anti-blocking Config */}
            <Collapsible>
              <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium">
                <ChevronDown className="w-4 h-4" />
                Configurações Anti-Bloqueio
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-3 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Tamanho do lote</Label>
                    <Input type="number" min={1} max={50} value={batchSize} onChange={(e) => setBatchSize(Number(e.target.value))} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Intervalo entre lotes (seg)</Label>
                    <Input type="number" min={60} max={600} value={batchDelay} onChange={(e) => setBatchDelay(Number(e.target.value))} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Delay mín. por msg (seg)</Label>
                    <Input type="number" min={5} max={120} value={msgDelayMin} onChange={(e) => setMsgDelayMin(Number(e.target.value))} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Delay máx. por msg (seg)</Label>
                    <Input type="number" min={10} max={300} value={msgDelayMax} onChange={(e) => setMsgDelayMax(Number(e.target.value))} />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  A cada {batchSize} envios, o sistema aguarda {Math.round(batchDelay / 60)} min antes do próximo lote.
                  Entre cada mensagem: {msgDelayMin}–{msgDelayMax} segundos aleatórios.
                </p>
              </CollapsibleContent>
            </Collapsible>

            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-lg p-3">
              <p className="text-xs text-amber-800 dark:text-amber-300">
                ⚠️ <strong>Importante:</strong> Mensagens via Messenger/DM só funcionam para apoiadores que já conversaram com sua página. Os demais serão registrados como "falha".
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSendDialogPost(null)}>Cancelar</Button>
            <Button onClick={handleCreateDispatch} disabled={creating} className="gap-1.5">
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {creating ? "Criando..." : "Iniciar Disparo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
