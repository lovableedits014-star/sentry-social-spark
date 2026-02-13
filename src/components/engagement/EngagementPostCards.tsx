import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

interface EngagementPostCardsProps {
  clientId: string | undefined;
}

export function EngagementPostCards({ clientId }: EngagementPostCardsProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);

  const { data: rawComments, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["engagement-posts", clientId],
    queryFn: async () => {
      if (!clientId) return [];
      // Fetch recent comments to extract unique posts
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

  const handleCopyLink = async (post: PostData) => {
    if (!post.post_permalink_url) {
      toast.error("Link da postagem não disponível");
      return;
    }
    const message = `🚀 Nova publicação no ar!\nCorre lá, curta, comenta e compartilhe para fortalecer nosso projeto!\n👇\n${post.post_permalink_url}`;
    try {
      await navigator.clipboard.writeText(message);
      setCopiedMessageId(post.post_id);
      toast.success("Mensagem copiada! Cole e envie para seus apoiadores.");
      setTimeout(() => setCopiedMessageId(null), 3000);
    } catch {
      toast.error("Erro ao copiar");
    }
  };

  const handleCopyLinkOnly = async (post: PostData) => {
    if (!post.post_permalink_url) {
      toast.error("Link da postagem não disponível");
      return;
    }
    try {
      await navigator.clipboard.writeText(post.post_permalink_url);
      setCopiedId(post.post_id);
      toast.success("Link copiado!");
      setTimeout(() => setCopiedId(null), 3000);
    } catch {
      toast.error("Erro ao copiar");
    }
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
  };

  const truncateText = (text: string | null, maxLen = 120) => {
    if (!text) return "Sem legenda";
    return text.length > maxLen ? text.slice(0, maxLen) + "…" : text;
  };

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="h-64 bg-muted rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Últimas postagens das suas redes sociais. Copie a mensagem e envie para seus apoiadores.
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
            <p className="text-sm mt-1">Sincronize os comentários na aba Comentários para ver as postagens aqui.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {posts.map((post) => (
            <Card key={`${post.platform}:${post.post_id}`} className="overflow-hidden group hover:shadow-md transition-shadow">
              {/* Image */}
              {post.post_full_picture && (
                <div className="relative aspect-video bg-muted overflow-hidden">
                  <img
                    src={post.post_full_picture}
                    alt="Post"
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                  {/* Platform badge */}
                  <div className="absolute top-2 left-2">
                    <Badge 
                      className={`${
                        post.platform === "instagram" 
                          ? "bg-pink-500/90 hover:bg-pink-500" 
                          : "bg-blue-600/90 hover:bg-blue-600"
                      } text-white border-0 gap-1`}
                    >
                      {post.platform === "instagram" ? (
                        <Instagram className="w-3 h-3" />
                      ) : (
                        <Facebook className="w-3 h-3" />
                      )}
                      {post.platform === "instagram" ? "Instagram" : "Facebook"}
                    </Badge>
                  </div>
                  {/* Media type */}
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

              {/* Content */}
              <CardContent className={`p-4 space-y-3 ${!post.post_full_picture ? "pt-4" : ""}`}>
                {/* No image - show platform inline */}
                {!post.post_full_picture && (
                  <Badge 
                    className={`${
                      post.platform === "instagram" 
                        ? "bg-pink-500/90 hover:bg-pink-500" 
                        : "bg-blue-600/90 hover:bg-blue-600"
                    } text-white border-0 gap-1`}
                  >
                    {post.platform === "instagram" ? (
                      <Instagram className="w-3 h-3" />
                    ) : (
                      <Facebook className="w-3 h-3" />
                    )}
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
                    onClick={() => handleCopyLink(post)}
                  >
                    {copiedMessageId === post.post_id ? (
                      <><Check className="w-4 h-4" /> Copiado!</>
                    ) : (
                      <><Copy className="w-4 h-4" /> Copiar Mensagem</>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => handleCopyLinkOnly(post)}
                    title="Copiar apenas o link"
                  >
                    {copiedId === post.post_id ? (
                      <Check className="w-4 h-4" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </Button>
                  {post.post_permalink_url && (
                    <Button
                      variant="outline"
                      size="sm"
                      asChild
                      title="Abrir postagem"
                    >
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
    </div>
  );
}
