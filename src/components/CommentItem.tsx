import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  TrendingUp, TrendingDown, Minus, Sparkles, Send,
  Instagram, Facebook, Calendar, AlertTriangle, ExternalLink,
  Trash2, EyeOff, Eye, Ban, Loader2, PenLine, X,
} from "lucide-react";
import { AddToSupportersButton } from "@/components/AddToSupportersButton";

export interface CommentData {
  id: string;
  comment_id: string;
  post_id: string;
  client_id: string;
  text: string;
  author_name: string | null;
  author_id: string | null;
  author_profile_picture: string | null;
  platform: string | null;
  platform_user_id: string | null;
  social_profile_id: string | null;
  author_unavailable: boolean;
  author_unavailable_reason: string | null;
  status: string | null;
  sentiment: string | null;
  ai_response: string | null;
  final_response: string | null;
  post_message: string | null;
  post_permalink_url: string | null;
  post_full_picture: string | null;
  post_media_type: string | null;
  comment_created_time: string | null;
  created_at: string;
  parent_comment_id: string | null;
  is_page_owner: boolean;
  is_hidden?: boolean;
}

export interface CommentItemProps {
  comment: CommentData;
  onGenerateResponse: (commentId: string, isRegenerate: boolean) => void;
  onSendResponse: (commentId: string, responseText: string, platform: string) => void;
  onManageComment?: (commentId: string, action: 'delete' | 'hide' | 'unhide' | 'block_user') => Promise<void>;
  generatingResponse: string | null;
  responding: string | null;
  managingComment?: string | null;
  editingResponse: { [key: string]: string };
  setEditingResponse: React.Dispatch<React.SetStateAction<{ [key: string]: string }>>;
  showPostInfo?: boolean;
}

function getPlatformIcon(platform: string) {
  if (platform === "instagram") return <Instagram className="w-4 h-4 text-pink-500" />;
  return <Facebook className="w-4 h-4 text-blue-600" />;
}

function getSentimentIcon(sentiment: string) {
  switch (sentiment) {
    case "positive": return <TrendingUp className="w-3.5 h-3.5" />;
    case "negative": return <TrendingDown className="w-3.5 h-3.5" />;
    default: return <Minus className="w-3.5 h-3.5" />;
  }
}

function getSentimentBadge(sentiment: string) {
  const config: Record<string, { variant: "default" | "destructive" | "secondary"; label: string }> = {
    positive: { variant: "default", label: "Positivo" },
    negative: { variant: "destructive", label: "Negativo" },
    neutral: { variant: "secondary", label: "Neutro" },
  };
  const c = config[sentiment] || config.neutral;
  return (
    <Badge variant={c.variant} className="gap-1 text-xs">
      {getSentimentIcon(sentiment)}
      {c.label}
    </Badge>
  );
}

function getStatusBadge(status: string) {
  const config: Record<string, { label: string; className: string }> = {
    pending: { label: "Pendente", className: "border-warning/50 text-warning bg-warning/10" },
    responded: { label: "Respondido", className: "border-green-500/50 text-green-600 bg-green-50" },
    ignored: { label: "Ignorado", className: "border-muted-foreground/30 text-muted-foreground" },
  };
  const c = config[status] || { label: status, className: "" };
  return <Badge variant="outline" className={`text-xs ${c.className}`}>{c.label}</Badge>;
}

export function CommentItem({
  comment,
  onGenerateResponse,
  onSendResponse,
  onManageComment,
  generatingResponse,
  responding,
  managingComment,
  editingResponse,
  setEditingResponse,
  showPostInfo = false,
}: CommentItemProps) {
  const isResponded = comment.status === 'responded';
  const isPageOwner = comment.is_page_owner;
  const isHidden = comment.is_hidden;
  const isManaging = managingComment === comment.id;
  const [showManualReply, setShowManualReply] = useState(false);
  const [manualText, setManualText] = useState("");

  return (
    <div className={`p-4 transition-colors ${
      isHidden ? 'bg-muted/60 opacity-70 border-l-2 border-muted-foreground/30' :
      isPageOwner ? 'bg-primary/5 border-l-2 border-primary/30' : 
      isResponded ? 'bg-muted/40 opacity-60' : 'bg-muted/10 hover:bg-muted/20'
    }`}>
      {/* Hidden badge */}
      {isHidden && (
        <div className="flex items-center gap-1.5 mb-2">
          <Badge variant="outline" className="text-[10px] border-muted-foreground/40 text-muted-foreground bg-muted/30 gap-1">
            <EyeOff className="w-3 h-3" />
            Comentário oculto
          </Badge>
        </div>
      )}

      {/* Page owner badge */}
      {isPageOwner && !isHidden && (
        <div className="flex items-center gap-1.5 mb-2">
          <Badge variant="outline" className="text-[10px] border-primary/40 text-primary bg-primary/10">
            👤 Sua resposta
          </Badge>
        </div>
      )}

      {/* Post context (for flat list view) */}
      {showPostInfo && comment.post_message && (
        <div className="flex items-center gap-2 mb-3 pb-2 border-b border-border/50">
          <span className="text-xs text-muted-foreground truncate max-w-[80%]">
            📝 {comment.post_message.slice(0, 80)}{comment.post_message.length > 80 ? '…' : ''}
          </span>
          {comment.post_permalink_url && (
            <a
              href={comment.post_permalink_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-primary hover:underline flex items-center gap-1 flex-shrink-0"
            >
              <ExternalLink className="w-3 h-3" />
              Ver
            </a>
          )}
        </div>
      )}

      {/* Comment Header */}
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-3">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="relative">
                  <Avatar className="h-9 w-9">
                    {comment.author_profile_picture && (
                      <AvatarImage src={comment.author_profile_picture} alt={comment.author_name || 'Autor'} />
                    )}
                    <AvatarFallback
                      className={
                        comment.platform === 'instagram'
                          ? 'bg-gradient-to-br from-pink-500 to-purple-600 text-white text-xs'
                          : 'bg-primary/10 text-primary text-xs'
                      }
                    >
                      {comment.author_name ? comment.author_name.replace('@', '').charAt(0).toUpperCase() : '?'}
                    </AvatarFallback>
                  </Avatar>
                  {comment.author_unavailable && (
                    <div className="absolute -bottom-0.5 -right-0.5 bg-warning rounded-full p-0.5">
                      <AlertTriangle className="w-2.5 h-2.5 text-warning-foreground" />
                    </div>
                  )}
                </div>
              </TooltipTrigger>
              <TooltipContent>
                {comment.author_unavailable ? (
                  <p className="text-xs">{comment.author_unavailable_reason || 'Dados não fornecidos'}</p>
                ) : comment.platform === 'instagram' ? (
                  <p className="text-xs">Instagram limita dados de perfil</p>
                ) : (
                  <p className="text-xs">Perfil identificado</p>
                )}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">
                {comment.author_name || (comment.author_unavailable ? "Não identificado" : "Desconhecido")}
              </span>
              {getPlatformIcon(comment.platform || 'facebook')}
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Calendar className="w-3 h-3" />
              {comment.comment_created_time
                ? new Date(comment.comment_created_time).toLocaleString("pt-BR")
                : new Date(comment.created_at).toLocaleString("pt-BR")}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          {isHidden && (
            <Badge variant="outline" className="text-[10px] border-muted-foreground/30 text-muted-foreground gap-1">
              <EyeOff className="w-3 h-3" />
              Oculto
            </Badge>
          )}
          {comment.sentiment && getSentimentBadge(comment.sentiment)}
          {comment.status && getStatusBadge(comment.status)}
        </div>
      </div>

      {/* Comment Text */}
      <div className={`rounded-lg p-3 mb-3 ml-12 ${isHidden ? 'bg-muted/50' : 'bg-background'}`}>
        <p className={`text-sm leading-relaxed ${isHidden ? 'text-muted-foreground' : ''}`}>{comment.text}</p>
      </div>

      {/* AI Response */}
      {comment.ai_response && !isResponded && (
        <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 mb-3 ml-12">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-4 h-4 text-primary" />
            <span className="text-xs font-medium text-primary">Resposta sugerida</span>
          </div>
          <Textarea
            value={editingResponse[comment.id] ?? comment.ai_response}
            onChange={(e) => setEditingResponse({ ...editingResponse, [comment.id]: e.target.value })}
            className="min-h-[60px] text-sm"
          />
        </div>
      )}

      {/* Final Response */}
      {comment.status === 'responded' && comment.final_response && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-3 ml-12">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-medium text-green-700">✅ Resposta publicada</span>
          </div>
          <p className="text-sm text-green-800">{comment.final_response}</p>
        </div>
      )}

      {/* Actions */}
      {!isPageOwner && (
        <div className="ml-12 space-y-2">
          {/* Manual reply box */}
          {showManualReply && !isResponded && (
            <div className="border border-border rounded-lg p-3 bg-background space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-foreground flex items-center gap-1.5">
                  <PenLine className="w-3.5 h-3.5" />
                  Sua resposta
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 w-6 p-0 text-muted-foreground"
                  onClick={() => { setShowManualReply(false); setManualText(""); }}
                >
                  <X className="w-3.5 h-3.5" />
                </Button>
              </div>
              <Textarea
                value={manualText}
                onChange={(e) => setManualText(e.target.value)}
                placeholder="Escreva sua resposta aqui..."
                className="min-h-[80px] text-sm resize-none"
                autoFocus
              />
              <div className="flex justify-end gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 text-xs"
                  onClick={() => { setShowManualReply(false); setManualText(""); }}
                >
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => {
                    onSendResponse(comment.id, manualText, comment.platform || 'facebook');
                    setShowManualReply(false);
                    setManualText("");
                  }}
                  disabled={!manualText.trim() || responding === comment.id}
                >
                  <Send className="w-3.5 h-3.5 mr-1.5" />
                  {responding === comment.id ? "Publicando..." : "Publicar"}
                </Button>
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {/* Standard response actions - hidden when responded */}
            {!isResponded && (
              <>
                {comment.author_id && <AddToSupportersButton comment={comment} />}

                {/* Manual reply button — always visible when not responded */}
                {!showManualReply && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowManualReply(true)}
                    className="h-8 text-xs"
                  >
                    <PenLine className="w-3.5 h-3.5 mr-1.5" />
                    Responder
                  </Button>
                )}

                {!comment.ai_response && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onGenerateResponse(comment.id, false)}
                    disabled={generatingResponse === comment.id}
                    className="h-8 text-xs"
                  >
                    <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                    {generatingResponse === comment.id ? "Gerando..." : "Usar IA"}
                  </Button>
                )}

                {comment.ai_response && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onGenerateResponse(comment.id, true)}
                      disabled={generatingResponse === comment.id}
                      className="h-8 text-xs"
                    >
                      <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                      {generatingResponse === comment.id ? "Regenerando..." : "Nova Resposta IA"}
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => onSendResponse(
                        comment.id,
                        editingResponse[comment.id] || comment.ai_response!,
                        comment.platform || 'facebook'
                      )}
                      disabled={responding === comment.id}
                      className="h-8 text-xs"
                    >
                      <Send className="w-3.5 h-3.5 mr-1.5" />
                      {responding === comment.id ? "Publicando..." : "Publicar IA"}
                    </Button>
                  </>
                )}
              </>
            )}

          </div>{/* end flex flex-wrap gap-2 */}

          {/* Moderation actions - always visible */}
          {onManageComment && (
            <div className="flex gap-1 ml-auto">
              {/* Hide / Unhide */}
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onManageComment(comment.id, isHidden ? 'unhide' : 'hide')}
                      disabled={isManaging}
                      className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                    >
                      {isManaging ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> :
                        isHidden ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />
                      }
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-xs">{isHidden ? 'Desocultar comentário' : 'Ocultar comentário'}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>

              {/* Block user */}
              {(comment.author_id || comment.platform_user_id) && comment.platform === 'facebook' && (
                <AlertDialog>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <AlertDialogTrigger asChild>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={isManaging}
                            className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                          >
                            <Ban className="w-3.5 h-3.5" />
                          </Button>
                        </AlertDialogTrigger>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="text-xs">Bloquear usuário</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Bloquear usuário</AlertDialogTitle>
                      <AlertDialogDescription>
                        Tem certeza que deseja bloquear <strong>{comment.author_name || 'este usuário'}</strong> da sua página? 
                        Esta pessoa não poderá mais comentar em suas publicações.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => onManageComment(comment.id, 'block_user')}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Bloquear
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}

              {/* Delete comment */}
              <AlertDialog>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <AlertDialogTrigger asChild>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={isManaging}
                          className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </AlertDialogTrigger>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="text-xs">Excluir comentário</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Excluir comentário</AlertDialogTitle>
                    <AlertDialogDescription>
                      Tem certeza que deseja excluir este comentário? Esta ação não pode ser desfeita e o comentário será 
                      removido da rede social.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => onManageComment(comment.id, 'delete')}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Excluir
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
