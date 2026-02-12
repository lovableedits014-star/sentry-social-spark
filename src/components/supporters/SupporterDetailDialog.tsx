import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Instagram, Facebook, MessageCircle, TrendingUp, Calendar, FileText, Download } from "lucide-react";
import { Supporter, classificationLabels } from "./SupporterCard";
import { toast } from "sonner";

type CommentHistory = {
  id: string;
  text: string;
  platform: string | null;
  comment_created_time: string | null;
  post_message: string | null;
  status: string | null;
  sentiment: string | null;
  is_page_owner: boolean;
};

type Props = {
  supporter: Supporter | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export const SupporterDetailDialog = ({ supporter, open, onOpenChange }: Props) => {
  const [comments, setComments] = useState<CommentHistory[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);

  useEffect(() => {
    if (supporter && open) {
      fetchCommentHistory();
    }
  }, [supporter, open]);

  const fetchCommentHistory = async () => {
    if (!supporter) return;
    setLoadingComments(true);
    try {
      const authorIds = supporter.supporter_profiles?.map(p => p.platform_user_id) || [];
      if (authorIds.length === 0) {
        setComments([]);
        return;
      }

      const { data, error } = await supabase
        .from("comments")
        .select("id, text, platform, comment_created_time, post_message, status, sentiment, is_page_owner")
        .in("author_id", authorIds)
        .eq("client_id", supporter.client_id)
        .order("comment_created_time", { ascending: false })
        .limit(50);

      if (error) throw error;
      setComments(data || []);
    } catch (error) {
      console.error("Error fetching comment history:", error);
    } finally {
      setLoadingComments(false);
    }
  };

  const generateReport = () => {
    if (!supporter) return;
    const config = classificationLabels[supporter.classification] || classificationLabels.neutro;

    const fbProfiles = supporter.supporter_profiles?.filter(p => p.platform === "facebook") || [];
    const igProfiles = supporter.supporter_profiles?.filter(p => p.platform === "instagram") || [];

    const totalComments = comments.filter(c => !c.is_page_owner).length;
    const positiveComments = comments.filter(c => c.sentiment === "positive" && !c.is_page_owner).length;
    const negativeComments = comments.filter(c => c.sentiment === "negative" && !c.is_page_owner).length;

    const report = `
═══════════════════════════════════════════
  RELATÓRIO DE APOIADOR - SENTINELLE
═══════════════════════════════════════════

📋 DADOS GERAIS
Nome: ${supporter.name}
Classificação: ${config.label}
Score de Engajamento: ${supporter.engagement_score}
Primeiro Contato: ${new Date(supporter.first_contact_date).toLocaleDateString("pt-BR")}
Última Interação: ${supporter.last_interaction_date ? new Date(supporter.last_interaction_date).toLocaleDateString("pt-BR") : "N/A"}

📱 PERFIS VINCULADOS
${fbProfiles.length > 0 ? `Facebook: ${fbProfiles.map(p => p.platform_username || p.platform_user_id).join(", ")}` : "Facebook: Não vinculado"}
${igProfiles.length > 0 ? `Instagram: ${igProfiles.map(p => p.platform_username || p.platform_user_id).join(", ")}` : "Instagram: Não vinculado"}

📊 ESTATÍSTICAS DE INTERAÇÃO
Total de comentários: ${totalComments}
Comentários positivos: ${positiveComments}
Comentários negativos: ${negativeComments}
Comentários neutros: ${totalComments - positiveComments - negativeComments}

💬 ÚLTIMOS COMENTÁRIOS
${comments.filter(c => !c.is_page_owner).slice(0, 10).map((c, i) => 
  `${i + 1}. [${c.platform?.toUpperCase() || "?"}] ${new Date(c.comment_created_time || "").toLocaleDateString("pt-BR")} - "${c.text.substring(0, 100)}${c.text.length > 100 ? '...' : ''}"`
).join("\n") || "Nenhum comentário registrado"}

${supporter.notes ? `\n📝 OBSERVAÇÕES\n${supporter.notes}` : ""}

───────────────────────────────────────────
Gerado em: ${new Date().toLocaleString("pt-BR")}
Sentinelle - Monitoramento de Redes Sociais
═══════════════════════════════════════════
`.trim();

    // Copy to clipboard and offer download
    navigator.clipboard.writeText(report).then(() => {
      toast.success("Relatório copiado para a área de transferência!");
    });

    // Also trigger download as .txt
    const blob = new Blob([report], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `relatorio-${supporter.name.replace(/\s+/g, "-").toLowerCase()}-${new Date().toISOString().split("T")[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!supporter) return null;

  const config = classificationLabels[supporter.classification] || classificationLabels.neutro;
  const fbComments = comments.filter(c => c.platform === "facebook" && !c.is_page_owner);
  const igComments = comments.filter(c => c.platform === "instagram" && !c.is_page_owner);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between pr-8">
            <span>Detalhes do Apoiador</span>
            <Button size="sm" variant="outline" onClick={generateReport}>
              <Download className="w-4 h-4 mr-2" />
              Gerar Relatório
            </Button>
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[70vh]">
          <div className="space-y-6 pr-4">
            {/* Header */}
            <div className="flex items-center gap-4">
              <Avatar className="h-16 w-16">
                <AvatarImage src={supporter.supporter_profiles?.[0]?.profile_picture_url || ''} />
                <AvatarFallback className="text-xl">{supporter.name.charAt(0).toUpperCase()}</AvatarFallback>
              </Avatar>
              <div>
                <h3 className="text-xl font-semibold">{supporter.name}</h3>
                <div className="flex items-center gap-2 mt-1">
                  <Badge className={`${config.color} text-white`}>{config.label}</Badge>
                  <span className="text-sm text-muted-foreground">Score: {supporter.engagement_score}</span>
                </div>
              </div>
            </div>

            {/* Perfis vinculados */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Perfis Vinculados</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {supporter.supporter_profiles?.map((profile) => (
                  <div key={profile.id} className="flex items-center gap-3 p-2 bg-muted/50 rounded-lg">
                    {profile.platform === "instagram" ? (
                      <Instagram className="w-5 h-5 text-pink-500" />
                    ) : (
                      <Facebook className="w-5 h-5 text-blue-600" />
                    )}
                    <div>
                      <p className="font-medium text-sm">{profile.platform_username || profile.platform_user_id}</p>
                      <p className="text-xs text-muted-foreground capitalize">{profile.platform}</p>
                    </div>
                  </div>
                ))}
                {(!supporter.supporter_profiles || supporter.supporter_profiles.length === 0) && (
                  <p className="text-sm text-muted-foreground">Nenhum perfil vinculado</p>
                )}
              </CardContent>
            </Card>

            {/* Datas */}
            <div className="grid grid-cols-3 gap-3">
              <Card>
                <CardContent className="pt-4 text-center">
                  <Calendar className="w-4 h-4 mx-auto mb-1 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">Primeiro contato</p>
                  <p className="text-sm font-medium">{new Date(supporter.first_contact_date).toLocaleDateString("pt-BR")}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 text-center">
                  <TrendingUp className="w-4 h-4 mx-auto mb-1 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">Última interação</p>
                  <p className="text-sm font-medium">{supporter.last_interaction_date ? new Date(supporter.last_interaction_date).toLocaleDateString("pt-BR") : "N/A"}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 text-center">
                  <MessageCircle className="w-4 h-4 mx-auto mb-1 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">Comentários</p>
                  <p className="text-sm font-medium">{comments.filter(c => !c.is_page_owner).length}</p>
                </CardContent>
              </Card>
            </div>

            {/* Histórico de comentários */}
            <Tabs defaultValue="todos" className="w-full">
              <TabsList className="w-full">
                <TabsTrigger value="todos" className="flex-1">
                  Todos ({comments.filter(c => !c.is_page_owner).length})
                </TabsTrigger>
                <TabsTrigger value="facebook" className="flex-1">
                  <Facebook className="w-3.5 h-3.5 mr-1" />
                  FB ({fbComments.length})
                </TabsTrigger>
                <TabsTrigger value="instagram" className="flex-1">
                  <Instagram className="w-3.5 h-3.5 mr-1" />
                  IG ({igComments.length})
                </TabsTrigger>
              </TabsList>

              {["todos", "facebook", "instagram"].map(tab => (
                <TabsContent key={tab} value={tab} className="space-y-2 mt-3">
                  {loadingComments ? (
                    <div className="py-6 text-center text-muted-foreground">Carregando...</div>
                  ) : (
                    (tab === "todos" ? comments.filter(c => !c.is_page_owner) : tab === "facebook" ? fbComments : igComments).map(comment => (
                      <div key={comment.id} className="p-3 border rounded-lg space-y-1">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {comment.platform === "instagram" ? (
                              <Instagram className="w-3.5 h-3.5 text-pink-500" />
                            ) : (
                              <Facebook className="w-3.5 h-3.5 text-blue-600" />
                            )}
                            <span className="text-xs text-muted-foreground">
                              {comment.comment_created_time ? new Date(comment.comment_created_time).toLocaleDateString("pt-BR") : "—"}
                            </span>
                          </div>
                          <div className="flex gap-1">
                            {comment.sentiment && (
                              <Badge variant="outline" className="text-xs">
                                {comment.sentiment === "positive" ? "😊" : comment.sentiment === "negative" ? "😠" : "😐"} {comment.sentiment}
                              </Badge>
                            )}
                            {comment.status && (
                              <Badge variant={comment.status === "responded" ? "default" : "secondary"} className="text-xs">
                                {comment.status === "responded" ? "✅" : comment.status === "ignored" ? "⏭️" : "⏳"} 
                              </Badge>
                            )}
                          </div>
                        </div>
                        <p className="text-sm">{comment.text}</p>
                        {comment.post_message && (
                          <p className="text-xs text-muted-foreground truncate">
                            📌 {comment.post_message.substring(0, 80)}...
                          </p>
                        )}
                      </div>
                    ))
                  )}
                  {!loadingComments && (tab === "todos" ? comments.filter(c => !c.is_page_owner) : tab === "facebook" ? fbComments : igComments).length === 0 && (
                    <div className="py-6 text-center text-muted-foreground text-sm">
                      Nenhum comentário encontrado
                    </div>
                  )}
                </TabsContent>
              ))}
            </Tabs>

            {supporter.notes && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    Observações
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm">{supporter.notes}</p>
                </CardContent>
              </Card>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};
