import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Users, RefreshCw, Award, Crown, Medal, Trophy, Star, ThumbsUp, ThumbsDown, Minus,
} from "lucide-react";

type Influencer = {
  platformUserId: string;
  authorName: string;
  authorPicture: string | null;
  platform: string;
  totalComments: number;
  positiveCount: number;
  negativeCount: number;
  neutralCount: number;
  repliesReceived: number;
  uniquePosts: number;
  firstSeen: string;
  lastSeen: string;
  score: number;
};

function computeScore(inf: Influencer): number {
  return (
    inf.totalComments * 3 +
    inf.repliesReceived * 5 +
    inf.uniquePosts * 2 +
    inf.positiveCount * 1 +
    inf.negativeCount * 2
  );
}

const RANK_ICONS = [Crown, Trophy, Medal];
const RANK_COLORS = ["text-amber-500", "text-muted-foreground", "text-orange-400"];

const SentimentBar = ({ pos, neg, neu }: { pos: number; neg: number; neu: number }) => {
  const total = pos + neg + neu;
  if (total === 0) return null;
  return (
    <div className="flex h-1.5 rounded-full overflow-hidden bg-muted w-full min-w-[60px]">
      {pos > 0 && <div className="bg-emerald-500 h-full" style={{ width: `${(pos / total) * 100}%` }} />}
      {neu > 0 && <div className="bg-muted-foreground/30 h-full" style={{ width: `${(neu / total) * 100}%` }} />}
      {neg > 0 && <div className="bg-destructive h-full" style={{ width: `${(neg / total) * 100}%` }} />}
    </div>
  );
};

export default function InfluenciadoresTab({ clientId }: { clientId: string }) {
  const [loading, setLoading] = useState(true);
  const [influencers, setInfluencers] = useState<Influencer[]>([]);
  const [days, setDays] = useState(30);

  const fetchData = async () => {
    setLoading(true);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    let allComments: any[] = [];
    let from = 0;
    const pageSize = 1000;
    while (true) {
      const { data } = await supabase
        .from("comments")
        .select("platform_user_id, author_name, author_profile_picture, platform, sentiment, post_id, parent_comment_id, comment_created_time, is_page_owner, text, comment_id")
        .eq("client_id", clientId)
        .eq("is_page_owner", false)
        .gte("created_at", since)
        .neq("text", "__post_stub__")
        .range(from, from + pageSize - 1);
      if (data && data.length > 0) {
        allComments = allComments.concat(data);
        from += pageSize;
        if (data.length < pageSize) break;
      } else break;
    }

    let replies: any[] = [];
    from = 0;
    while (true) {
      const { data } = await supabase
        .from("comments")
        .select("parent_comment_id")
        .eq("client_id", clientId)
        .eq("is_page_owner", true)
        .gte("created_at", since)
        .not("parent_comment_id", "is", null)
        .range(from, from + pageSize - 1);
      if (data && data.length > 0) {
        replies = replies.concat(data);
        from += pageSize;
        if (data.length < pageSize) break;
      } else break;
    }

    const replyCountByParent = new Map<string, number>();
    for (const r of replies) {
      replyCountByParent.set(r.parent_comment_id, (replyCountByParent.get(r.parent_comment_id) || 0) + 1);
    }

    const map = new Map<string, Influencer>();
    for (const c of allComments) {
      if (!c.platform_user_id) continue;
      const key = `${c.platform || "facebook"}:${c.platform_user_id}`;
      let inf = map.get(key);
      if (!inf) {
        inf = {
          platformUserId: c.platform_user_id, authorName: c.author_name || c.platform_user_id,
          authorPicture: c.author_profile_picture, platform: c.platform || "facebook",
          totalComments: 0, positiveCount: 0, negativeCount: 0, neutralCount: 0,
          repliesReceived: 0, uniquePosts: 0, firstSeen: c.comment_created_time || "",
          lastSeen: c.comment_created_time || "", score: 0,
        };
        map.set(key, inf);
      }
      inf.totalComments++;
      if (c.sentiment === "positive") inf.positiveCount++;
      else if (c.sentiment === "negative") inf.negativeCount++;
      else inf.neutralCount++;
      const ts = c.comment_created_time || "";
      if (ts < inf.firstSeen || !inf.firstSeen) inf.firstSeen = ts;
      if (ts > inf.lastSeen) inf.lastSeen = ts;
    }

    for (const inf of map.values()) {
      const userComments = allComments.filter(
        (c) => c.platform_user_id === inf.platformUserId && (c.platform || "facebook") === inf.platform
      );
      inf.uniquePosts = new Set(userComments.map((c) => c.post_id)).size;
      let repliesCount = 0;
      for (const c of userComments) {
        repliesCount += replyCountByParent.get(c.comment_id || "") || 0;
      }
      inf.repliesReceived = repliesCount;
      inf.score = computeScore(inf);
    }

    const sorted = Array.from(map.values())
      .filter((i) => i.totalComments >= 2)
      .sort((a, b) => b.score - a.score)
      .slice(0, 50);

    setInfluencers(sorted);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [clientId, days]);

  const topInfluencers = influencers.slice(0, 3);
  const restInfluencers = influencers.slice(3);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Top comentaristas e formadores de opinião detectados automaticamente
        </p>
        <div className="flex items-center gap-2">
          <div className="flex bg-muted rounded-lg p-0.5">
            {[7, 30, 90].map((d) => (
              <button key={d} onClick={() => setDays(d)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${days === d ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                {d}d
              </button>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </div>
      </div>

      {loading && (
        <div className="grid gap-4 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}><CardContent className="p-6 space-y-3">
              <Skeleton className="h-12 w-12 rounded-full" />
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-48" />
            </CardContent></Card>
          ))}
        </div>
      )}

      {!loading && influencers.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center gap-3">
            <Users className="w-10 h-10 text-muted-foreground/50" />
            <p className="text-muted-foreground">Nenhum influenciador detectado nos últimos {days} dias.</p>
            <p className="text-xs text-muted-foreground/70">Sincronize comentários para que o sistema identifique os principais comentaristas.</p>
          </CardContent>
        </Card>
      )}

      {!loading && topInfluencers.length > 0 && (
        <div className="grid gap-4 md:grid-cols-3">
          {topInfluencers.map((inf, idx) => {
            const RankIcon = RANK_ICONS[idx] || Star;
            const rankColor = RANK_COLORS[idx] || "text-muted-foreground";
            return (
              <Card key={`${inf.platform}:${inf.platformUserId}`} className={idx === 0 ? "border-primary/40 shadow-md" : ""}>
                <CardContent className="p-5 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <Avatar className="w-12 h-12">
                        <AvatarImage src={inf.authorPicture || undefined} />
                        <AvatarFallback className="text-sm font-bold">{inf.authorName.charAt(0).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-background border flex items-center justify-center">
                        <RankIcon className={`w-3 h-3 ${rankColor}`} />
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold truncate">{inf.authorName}</p>
                      <p className="text-xs text-muted-foreground capitalize">{inf.platform}</p>
                    </div>
                    <Badge variant={idx === 0 ? "default" : "secondary"} className="text-xs">#{idx + 1}</Badge>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div><p className="text-lg font-bold">{inf.totalComments}</p><p className="text-[10px] text-muted-foreground">comentários</p></div>
                    <div><p className="text-lg font-bold">{inf.uniquePosts}</p><p className="text-[10px] text-muted-foreground">posts</p></div>
                    <div><p className="text-lg font-bold">{inf.repliesReceived}</p><p className="text-[10px] text-muted-foreground">respostas</p></div>
                  </div>
                  <div className="space-y-1">
                    <SentimentBar pos={inf.positiveCount} neg={inf.negativeCount} neu={inf.neutralCount} />
                    <div className="flex justify-between text-[10px] text-muted-foreground">
                      <span className="flex items-center gap-0.5"><ThumbsUp className="w-2.5 h-2.5" /> {inf.positiveCount}</span>
                      <span className="flex items-center gap-0.5"><Minus className="w-2.5 h-2.5" /> {inf.neutralCount}</span>
                      <span className="flex items-center gap-0.5"><ThumbsDown className="w-2.5 h-2.5" /> {inf.negativeCount}</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between pt-1 border-t">
                    <span className="text-xs text-muted-foreground">Score de influência</span>
                    <span className="text-sm font-bold text-primary">{inf.score}</span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {!loading && restInfluencers.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Award className="w-4 h-4 text-primary" />Ranking completo
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead className="text-center hidden sm:table-cell">Comentários</TableHead>
                  <TableHead className="text-center hidden md:table-cell">Posts</TableHead>
                  <TableHead className="text-center hidden md:table-cell">Respostas</TableHead>
                  <TableHead className="hidden lg:table-cell w-32">Sentimento</TableHead>
                  <TableHead className="text-right">Score</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {restInfluencers.map((inf, idx) => (
                  <TableRow key={`${inf.platform}:${inf.platformUserId}`}>
                    <TableCell className="font-medium text-muted-foreground">{idx + 4}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Avatar className="w-7 h-7">
                          <AvatarImage src={inf.authorPicture || undefined} />
                          <AvatarFallback className="text-[10px]">{inf.authorName.charAt(0).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate max-w-[150px]">{inf.authorName}</p>
                          <p className="text-[10px] text-muted-foreground capitalize">{inf.platform}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-center hidden sm:table-cell">{inf.totalComments}</TableCell>
                    <TableCell className="text-center hidden md:table-cell">{inf.uniquePosts}</TableCell>
                    <TableCell className="text-center hidden md:table-cell">{inf.repliesReceived}</TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <SentimentBar pos={inf.positiveCount} neg={inf.negativeCount} neu={inf.neutralCount} />
                    </TableCell>
                    <TableCell className="text-right font-semibold">{inf.score}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
