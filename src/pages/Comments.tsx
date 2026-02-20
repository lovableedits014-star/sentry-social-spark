import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  MessageSquare, Search, TrendingUp, TrendingDown,
  Instagram, Facebook, RefreshCw, LayoutGrid, List,
} from "lucide-react";
import { toast } from "sonner";
import { PostCard } from "@/components/PostCard";
import { CommentItem, type CommentData } from "@/components/CommentItem";

type Comment = CommentData;

interface PostGroup {
  post_id: string;
  post_message: string | null;
  post_permalink_url: string | null;
  post_full_picture: string | null;
  post_media_type: string | null;
  comments: Comment[];
  platforms: Set<string>;
  sentimentCounts: { positive: number; neutral: number; negative: number };
}

const Comments = () => {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [sentimentFilter, setSentimentFilter] = useState<string>("all");
  const [platformFilter, setPlatformFilter] = useState<string>("all");
  const [postsLimit, setPostsLimit] = useState<number>(5);
  const [generatingResponse, setGeneratingResponse] = useState<string | null>(null);
  const [responding, setResponding] = useState<string | null>(null);
  const [managingComment, setManagingComment] = useState<string | null>(null);
  const [editingResponse, setEditingResponse] = useState<{ [key: string]: string }>({});
  const [clientId, setClientId] = useState<string>("");
  const [syncing, setSyncing] = useState(false);
  const [activeTab, setActiveTab] = useState("posts");

  useEffect(() => {
    fetchComments();
  }, [postsLimit]);

  useEffect(() => {
    const onFocus = () => fetchComments();
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') fetchComments();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [postsLimit]);

  const fetchComments = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: clients } = await supabase
        .from("clients")
        .select("id")
        .eq("user_id", user.id);

      if (!clients || clients.length === 0) {
        setLoading(false);
        return;
      }

      const clientIds = clients.map(c => c.id);
      setClientId(clientIds[0]);

      // Step 1: Find the N most recent distinct post_ids using post stubs first (most accurate date)
      // Post stubs have comment_created_time = the actual post creation date
      const { data: stubs } = await supabase
        .from("comments")
        .select("post_id, platform, comment_created_time")
        .in("client_id", clientIds)
        .like("comment_id", "post_stub_%")
        .order("comment_created_time", { ascending: false })
        .limit(postsLimit * 2); // fetch more to allow platform interleaving

      // Build ordered post list from stubs (most recent first)
      const seenFromStubs = new Set<string>();
      const stubPostIds: Array<{post_id: string; platform: string; time: string}> = [];
      for (const row of stubs || []) {
        if (!row?.post_id || seenFromStubs.has(row.post_id)) continue;
        seenFromStubs.add(row.post_id);
        stubPostIds.push({ post_id: row.post_id, platform: row.platform || '', time: row.comment_created_time || '' });
      }

      // Also scan real comments for older posts not covered by stubs
      const scanLimit = Math.max(postsLimit * 200, 2000);
      const { data: recent, error: recentError } = await supabase
        .from("comments")
        .select("post_id, platform, comment_created_time")
        .in("client_id", clientIds)
        .not("comment_id", "like", "post_stub_%")
        .not("text", "eq", "__post_stub__")
        .order("comment_created_time", { ascending: false })
        .limit(scanLimit);

      if (recentError) throw recentError;

      // Merge all post candidates, stubs take priority (more accurate date)
      const allCandidates: Array<{post_id: string; platform: string; time: string}> = [...stubPostIds];
      const seenAll = new Set<string>(seenFromStubs);
      for (const row of recent || []) {
        if (!row?.post_id || seenAll.has(row.post_id)) continue;
        seenAll.add(row.post_id);
        allCandidates.push({ post_id: row.post_id, platform: row.platform || '', time: row.comment_created_time || '' });
      }

      // Sort all candidates by date descending, then interleave FB and IG
      allCandidates.sort((a, b) => b.time.localeCompare(a.time));

      // Interleave: alternating Facebook and Instagram (same post same day = paired)
      const fbCandidates = allCandidates.filter(p => p.platform === 'facebook');
      const igCandidates = allCandidates.filter(p => p.platform === 'instagram');
      const otherCandidates = allCandidates.filter(p => p.platform !== 'facebook' && p.platform !== 'instagram');

      const interleaved: string[] = [];
      const maxLen = Math.max(fbCandidates.length, igCandidates.length, otherCandidates.length);
      for (let i = 0; i < maxLen && interleaved.length < postsLimit; i++) {
        if (fbCandidates[i]) interleaved.push(fbCandidates[i].post_id);
        if (igCandidates[i] && interleaved.length < postsLimit) interleaved.push(igCandidates[i].post_id);
        if (otherCandidates[i] && interleaved.length < postsLimit) interleaved.push(otherCandidates[i].post_id);
      }

      const recentPostIds = interleaved.slice(0, postsLimit);

      if (recentPostIds.length === 0) {
        setComments([]);
        return;
      }

      // Step 2: Fetch ALL comments for these posts (excluding stubs)
      const PAGE_SIZE = 1000;
      let allComments: Comment[] = [];
      let page = 0;
      let hasMore = true;

      while (hasMore) {
        const from = page * PAGE_SIZE;
        const to = from + PAGE_SIZE - 1;

        const { data, error } = await supabase
          .from("comments")
          .select("*")
          .in("client_id", clientIds)
          .in("post_id", recentPostIds)
          .not("text", "eq", "__post_stub__")
          .order("comment_created_time", { ascending: false })
          .range(from, to);

        if (error) throw error;

        allComments = [...allComments, ...(data || [])];
        hasMore = (data?.length || 0) === PAGE_SIZE;
        page++;
      }

      // Sort: keep recentPostIds order (interleaved), then comments within each post by date
      const postOrder = new Map<string, number>(recentPostIds.map((id, idx) => [id, idx]));
      allComments.sort((a, b) => {
        const orderDiff = (postOrder.get(a.post_id) ?? 999) - (postOrder.get(b.post_id) ?? 999);
        if (orderDiff !== 0) return orderDiff;
        return (b.comment_created_time || '').localeCompare(a.comment_created_time || '');
      });

      setComments(allComments);
    } catch (error: any) {
      console.error("Error fetching comments:", error);
      toast.error("Erro ao carregar comentários");
    } finally {
      setLoading(false);
    }
  };

  const handleSyncComments = async () => {
    if (!clientId) {
      toast.error("Cliente não encontrado");
      return;
    }

    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('fetch-meta-comments', {
        body: { clientId, postsLimit }
      });

      if (error) throw error;

      if (data.success) {
        toast.success(data.message);
        if (data.warnings && data.warnings.length > 0) {
          data.warnings.forEach((w: string) => {
            if (w.startsWith('⚠️')) {
              toast.warning(w.replace('⚠️ ', ''), { duration: 10000 });
            }
          });
        }
        await fetchComments();
      } else {
        toast.error(data.error || 'Erro ao sincronizar comentários');
      }
    } catch (error: any) {
      console.error("Error syncing comments:", error);
      toast.error(error.message || "Erro ao sincronizar comentários");
    } finally {
      setSyncing(false);
    }
  };

  const handleGenerateResponse = async (commentId: string, isRegenerate = false) => {
    setGeneratingResponse(commentId);
    try {
      const { data, error } = await supabase.functions.invoke('generate-response', {
        body: { commentId, clientId }
      });

      if (error) throw error;

      if (data.success) {
        await fetchComments();
        toast.success(isRegenerate ? "Nova resposta gerada!" : "Resposta gerada!");
      } else {
        toast.error(data.error || 'Erro ao gerar resposta.');
      }
    } catch (error: any) {
      console.error("Error generating response:", error);
      toast.error(error.message || "Erro ao gerar resposta.");
    } finally {
      setGeneratingResponse(null);
    }
  };

  const handleSendResponse = async (commentId: string, responseText: string, platform: string) => {
    if (!responseText || responseText.trim().length === 0) {
      toast.error("A resposta não pode estar vazia");
      return;
    }

    setResponding(commentId);
    try {
      const { data, error } = await supabase.functions.invoke('respond-to-comment', {
        body: { commentId, clientId, responseText }
      });

      if (error) throw error;

      if (data.success) {
        await fetchComments();
        toast.success(`Resposta publicada no ${platform === 'instagram' ? 'Instagram' : 'Facebook'}!`);
        setEditingResponse(prev => {
          const newState = { ...prev };
          delete newState[commentId];
          return newState;
        });
      } else {
        toast.error(data.error || 'Falha ao publicar');
      }
    } catch (error: any) {
      console.error("Error sending response:", error);
      toast.error(error.message || "Erro ao publicar resposta");
    } finally {
      setResponding(null);
    }
  };

  const handleManageComment = async (commentId: string, action: 'delete' | 'hide' | 'unhide' | 'block_user') => {
    setManagingComment(commentId);
    try {
      const { data, error } = await supabase.functions.invoke('manage-comment', {
        body: { commentId, clientId, action }
      });

      if (error) throw error;

      if (data.success) {
        toast.success(data.message);
        await fetchComments();
      } else {
        toast.error(data.error || 'Erro na operação');
      }
    } catch (error: any) {
      console.error(`Error ${action} comment:`, error);
      toast.error(error.message || 'Erro ao gerenciar comentário');
    } finally {
      setManagingComment(null);
    }
  };

  // Filtered comments (shared between both tabs)
  const filteredComments = useMemo(() => {
    return comments.filter((comment) => {
      const matchesSearch = comment.text.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           comment.author_name?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesSentiment = sentimentFilter === "all" || comment.sentiment === sentimentFilter;
      const matchesPlatform = platformFilter === "all" || comment.platform === platformFilter;
      return matchesSearch && matchesSentiment && matchesPlatform;
    });
  }, [comments, searchTerm, sentimentFilter, platformFilter]);

  const postGroups = useMemo((): PostGroup[] => {
    const groups = new Map<string, PostGroup>();

    // Also track the earliest comment_created_time per post (= post publication date from stubs)
    const postDates = new Map<string, string>();

    filteredComments.forEach(comment => {
      const postId = comment.post_id;
      if (!groups.has(postId)) {
        groups.set(postId, {
          post_id: postId,
          post_message: comment.post_message,
          post_permalink_url: comment.post_permalink_url,
          post_full_picture: comment.post_full_picture,
          post_media_type: comment.post_media_type,
          comments: [],
          platforms: new Set(),
          sentimentCounts: { positive: 0, neutral: 0, negative: 0 }
        });
      }

      const group = groups.get(postId)!;
      group.comments.push(comment);
      if (comment.platform) group.platforms.add(comment.platform);
      if (comment.sentiment === 'positive') group.sentimentCounts.positive++;
      else if (comment.sentiment === 'negative') group.sentimentCounts.negative++;
      else group.sentimentCounts.neutral++;

      // Track best date for the post (most recent entry wins — stubs have real post date)
      const t = comment.comment_created_time || comment.created_at || '';
      if (t) {
        const existing = postDates.get(postId) || '';
        if (t > existing) postDates.set(postId, t);
      }
    });

    const allGroups = Array.from(groups.values());

    // Sort each group's comments by date desc
    allGroups.forEach(g => {
      g.comments.sort((a, b) =>
        (b.comment_created_time || '').localeCompare(a.comment_created_time || '')
      );
    });

    // Sort groups by most recent post date desc
    allGroups.sort((a, b) => {
      const at = postDates.get(a.post_id) || '';
      const bt = postDates.get(b.post_id) || '';
      return bt.localeCompare(at);
    });

    // Interleave Facebook and Instagram posts when platformFilter is "all"
    if (platformFilter === "all") {
      const fb = allGroups.filter(g => g.platforms.has('facebook') && !g.platforms.has('instagram'));
      const ig = allGroups.filter(g => g.platforms.has('instagram') && !g.platforms.has('facebook'));
      const both = allGroups.filter(g => g.platforms.has('facebook') && g.platforms.has('instagram'));
      const other = allGroups.filter(g => !g.platforms.has('facebook') && !g.platforms.has('instagram'));

      // Interleave fb and ig lists
      const interleaved: PostGroup[] = [...both, ...other];
      const maxLen = Math.max(fb.length, ig.length);
      for (let i = 0; i < maxLen; i++) {
        if (fb[i]) interleaved.push(fb[i]);
        if (ig[i]) interleaved.push(ig[i]);
      }
      return interleaved;
    }

    return allGroups;
  }, [filteredComments, platformFilter]);

  const stats = useMemo(() => {
    const facebookCount = comments.filter(c => c.platform === 'facebook').length;
    const instagramCount = comments.filter(c => c.platform === 'instagram').length;
    const pendingCount = comments.filter(c => c.status === 'pending').length;
    const totalPosts = new Set(comments.map(c => c.post_id)).size;
    return { facebookCount, instagramCount, pendingCount, totalPosts };
  }, [comments]);

  if (loading) {
    return (
      <div className="p-6 md:p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-1/4"></div>
          <div className="grid grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => <div key={i} className="h-20 bg-muted rounded-xl"></div>)}
          </div>
          <div className="space-y-4">
            {[1, 2, 3].map(i => <div key={i} className="h-36 bg-muted rounded-xl"></div>)}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Comentários</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gerencie comentários organizados por postagem
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={fetchComments} disabled={syncing} size="sm">
            <RefreshCw className="w-4 h-4 mr-1.5" />
            Atualizar
          </Button>
          <Button onClick={handleSyncComments} disabled={syncing || !clientId} size="sm">
            <RefreshCw className={`w-4 h-4 mr-1.5 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? "Sincronizando..." : "Sincronizar Meta"}
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-card rounded-xl border p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <LayoutGrid className="w-5 h-5 text-primary" />
          </div>
          <div>
            <p className="text-xl font-bold">{stats.totalPosts}</p>
            <p className="text-xs text-muted-foreground">Postagens</p>
          </div>
        </div>
        <div className="bg-card rounded-xl border p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
            <Facebook className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <p className="text-xl font-bold">{stats.facebookCount}</p>
            <p className="text-xs text-muted-foreground">Facebook</p>
          </div>
        </div>
        <div className="bg-card rounded-xl border p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-pink-500/10 flex items-center justify-center">
            <Instagram className="w-5 h-5 text-pink-500" />
          </div>
          <div>
            <p className="text-xl font-bold">{stats.instagramCount}</p>
            <p className="text-xs text-muted-foreground">Instagram</p>
          </div>
        </div>
        <div className="bg-card rounded-xl border p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-warning/10 flex items-center justify-center">
            <MessageSquare className="w-5 h-5 text-warning" />
          </div>
          <div>
            <p className="text-xl font-bold">{stats.pendingCount}</p>
            <p className="text-xs text-muted-foreground">Pendentes</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por texto ou autor..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 h-9"
          />
        </div>
        <Select value={platformFilter} onValueChange={setPlatformFilter}>
          <SelectTrigger className="w-full sm:w-[160px] h-9">
            <SelectValue placeholder="Plataforma" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            <SelectItem value="facebook">Facebook</SelectItem>
            <SelectItem value="instagram">Instagram</SelectItem>
          </SelectContent>
        </Select>
        <Select value={String(postsLimit)} onValueChange={(v) => setPostsLimit(Number(v))}>
          <SelectTrigger className="w-full sm:w-[170px] h-9">
            <SelectValue placeholder="Posts" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="5">Últimas 5 postagens</SelectItem>
            <SelectItem value="10">Últimas 10 postagens</SelectItem>
            <SelectItem value="15">Últimas 15 postagens</SelectItem>
            <SelectItem value="20">Últimas 20 postagens</SelectItem>
            <SelectItem value="30">Últimas 30 postagens</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sentimentFilter} onValueChange={setSentimentFilter}>
          <SelectTrigger className="w-full sm:w-[150px] h-9">
            <SelectValue placeholder="Sentimento" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="positive">Positivos</SelectItem>
            <SelectItem value="neutral">Neutros</SelectItem>
            <SelectItem value="negative">Negativos</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="posts" className="gap-1.5">
            <LayoutGrid className="w-4 h-4" />
            Por Postagem
          </TabsTrigger>
          <TabsTrigger value="recent" className="gap-1.5">
            <List className="w-4 h-4" />
            Últimos Comentários
            {stats.pendingCount > 0 && (
              <Badge variant="destructive" className="ml-1 h-5 min-w-[20px] text-[10px] px-1.5">
                {stats.pendingCount}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Tab: Por Postagem */}
        <TabsContent value="posts">
          <div className="space-y-4">
            {postGroups.length === 0 ? (
              <Card>
                <CardContent className="py-16">
                  <div className="text-center text-muted-foreground">
                    <MessageSquare className="w-12 h-12 mx-auto mb-4 opacity-20" />
                    <p className="font-medium">Nenhum comentário encontrado</p>
                    <p className="text-sm mt-1">Ajuste os filtros ou clique em Sincronizar Meta</p>
                  </div>
                </CardContent>
              </Card>
            ) : (
              postGroups.map((group) => (
                <PostCard
                  key={group.post_id}
                  group={group}
                  onGenerateResponse={handleGenerateResponse}
                  onSendResponse={handleSendResponse}
                  onManageComment={handleManageComment}
                  generatingResponse={generatingResponse}
                  responding={responding}
                  managingComment={managingComment}
                  editingResponse={editingResponse}
                  setEditingResponse={setEditingResponse}
                />
              ))
            )}
          </div>
        </TabsContent>

        {/* Tab: Últimos Comentários */}
        <TabsContent value="recent">
          <div className="space-y-0 bg-card rounded-xl border shadow-sm overflow-hidden divide-y">
            {filteredComments.length === 0 ? (
              <div className="py-16">
                <div className="text-center text-muted-foreground">
                  <MessageSquare className="w-12 h-12 mx-auto mb-4 opacity-20" />
                  <p className="font-medium">Nenhum comentário encontrado</p>
                  <p className="text-sm mt-1">Ajuste os filtros ou clique em Sincronizar Meta</p>
                </div>
              </div>
            ) : (
              (() => {
                // Show only top-level comments with their replies nested
                const topLevel = filteredComments.filter(c => !c.parent_comment_id);
                const repliesByParent = new Map<string, Comment[]>();
                for (const c of filteredComments) {
                  if (c.parent_comment_id) {
                    const arr = repliesByParent.get(c.parent_comment_id) || [];
                    arr.push(c);
                    repliesByParent.set(c.parent_comment_id, arr);
                  }
                }
                return topLevel.map((comment) => (
                  <div key={comment.id}>
                    <CommentItem
                      comment={comment}
                      onGenerateResponse={handleGenerateResponse}
                      onSendResponse={handleSendResponse}
                      onManageComment={handleManageComment}
                      generatingResponse={generatingResponse}
                      responding={responding}
                      managingComment={managingComment}
                      editingResponse={editingResponse}
                      setEditingResponse={setEditingResponse}
                      showPostInfo
                    />
                    {repliesByParent.get(comment.comment_id)?.map((reply) => (
                      <div key={reply.id} className="ml-8 border-l-2 border-primary/20">
                        <CommentItem
                          comment={reply}
                          onGenerateResponse={handleGenerateResponse}
                          onSendResponse={handleSendResponse}
                          onManageComment={handleManageComment}
                          generatingResponse={generatingResponse}
                          responding={responding}
                          managingComment={managingComment}
                          editingResponse={editingResponse}
                          setEditingResponse={setEditingResponse}
                        />
                      </div>
                    ))}
                  </div>
                ));
              })()
            )}
          </div>
          {filteredComments.length > 0 && (
            <p className="text-xs text-muted-foreground text-center mt-3">
              {filteredComments.filter(c => !c.parent_comment_id).length} comentário{filteredComments.filter(c => !c.parent_comment_id).length !== 1 ? 's' : ''} listado{filteredComments.filter(c => !c.parent_comment_id).length !== 1 ? 's' : ''}
            </p>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Comments;
