import { useState, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import {
  MessageSquare, TrendingUp, TrendingDown, Minus,
  Instagram, Facebook, ExternalLink, Image as ImageIcon, Play,
  ChevronDown, ChevronUp,
} from "lucide-react";
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

interface PostCardProps {
  group: PostGroup;
  onGenerateResponse: (commentId: string, isRegenerate: boolean) => void;
  onSendResponse: (commentId: string, responseText: string, platform: string) => void;
  onManageComment?: (commentId: string, action: 'delete' | 'hide' | 'unhide' | 'block_user') => Promise<void>;
  generatingResponse: string | null;
  responding: string | null;
  managingComment?: string | null;
  editingResponse: { [key: string]: string };
  setEditingResponse: React.Dispatch<React.SetStateAction<{ [key: string]: string }>>;
}

function isVideoUrl(url: string | null): boolean {
  if (!url) return false;
  return /\.(mp4|mov|avi|webm|m3u8)/i.test(url) || url.includes('/v/t2/');
}

function getPostMedia(group: PostGroup): { type: 'image' | 'video' | 'none'; url: string | null } {
  const pic = group.post_full_picture;
  if (!pic) return { type: 'none', url: null };
  if (isVideoUrl(pic)) return { type: 'video', url: pic };
  return { type: 'image', url: pic };
}

function getPlatformIcon(platform: string) {
  if (platform === "instagram") return <Instagram className="w-4 h-4 text-pink-500" />;
  return <Facebook className="w-4 h-4 text-blue-600" />;
}

export function PostCard({
  group,
  onGenerateResponse,
  onSendResponse,
  onManageComment,
  generatingResponse,
  responding,
  managingComment,
  editingResponse,
  setEditingResponse,
}: PostCardProps) {
  const [expanded, setExpanded] = useState(false);
  const media = getPostMedia(group);
  const pendingCount = group.comments.filter(c => c.status === 'pending').length;
  const platforms = Array.from(group.platforms);

  // Organize: top-level comments + nested replies
  const { topLevel, repliesByParent } = useMemo(() => {
    const top: typeof group.comments = [];
    const replies = new Map<string, typeof group.comments>();
    for (const c of group.comments) {
      if (c.parent_comment_id) {
        const arr = replies.get(c.parent_comment_id) || [];
        arr.push(c);
        replies.set(c.parent_comment_id, arr);
      } else {
        top.push(c);
      }
    }
    return { topLevel: top, repliesByParent: replies };
  }, [group.comments]);

  return (
    <div className="bg-card rounded-xl border shadow-sm overflow-hidden hover:shadow-md transition-shadow">
      {/* Post Preview Header */}
      <div className="cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <div className="flex">
          {/* Thumbnail */}
          <div className="w-32 sm:w-40 flex-shrink-0 relative bg-muted">
            {media.type === 'image' && media.url ? (
              <img src={media.url} alt="Post" className="w-full h-full object-cover min-h-[120px] max-h-[160px]" />
            ) : media.type === 'video' && media.url ? (
              <div className="relative w-full min-h-[120px] max-h-[160px]">
                <video src={media.url} className="w-full h-full object-cover min-h-[120px] max-h-[160px]" muted preload="metadata" onLoadedData={(e) => { e.currentTarget.currentTime = 1; }} />
                <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                  <Play className="w-8 h-8 text-white drop-shadow-lg" />
                </div>
              </div>
            ) : (
              <div className="w-full h-full min-h-[120px] max-h-[160px] flex flex-col items-center justify-center gap-2">
                <ImageIcon className="w-8 h-8 text-muted-foreground/40" />
                <span className="text-[10px] text-muted-foreground/60 uppercase tracking-wider">Sem imagem</span>
              </div>
            )}
            <div className="absolute top-2 left-2 flex gap-1">
              {platforms.map(p => (
                <span key={p} className="bg-white/90 backdrop-blur-sm rounded-full p-1 shadow-sm">
                  {getPlatformIcon(p)}
                </span>
              ))}
            </div>
          </div>

          {/* Post Info */}
          <div className="flex-1 p-4 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium line-clamp-2 text-foreground leading-relaxed">
                  {group.post_message || 'Sem legenda'}
                </p>
                {group.post_permalink_url && (
                  <a href={group.post_permalink_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-1.5" onClick={(e) => e.stopPropagation()}>
                    <ExternalLink className="w-3 h-3" />
                    Ver postagem original
                  </a>
                )}
              </div>
              <div className="flex-shrink-0">
                {expanded ? <ChevronUp className="w-5 h-5 text-muted-foreground" /> : <ChevronDown className="w-5 h-5 text-muted-foreground" />}
              </div>
            </div>

            <div className="flex items-center gap-3 mt-3 flex-wrap">
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <MessageSquare className="w-4 h-4" />
                <span className="font-medium">{group.comments.length}</span>
                <span className="hidden sm:inline">comentário{group.comments.length !== 1 ? 's' : ''}</span>
              </div>
              {pendingCount > 0 && (
                <Badge variant="outline" className="border-warning/50 text-warning bg-warning/10 text-xs">
                  {pendingCount} pendente{pendingCount > 1 ? 's' : ''}
                </Badge>
              )}
              <div className="flex items-center gap-2 ml-auto">
                {group.sentimentCounts.positive > 0 && (
                  <span className="flex items-center gap-0.5 text-xs font-medium text-green-600">
                    <TrendingUp className="w-3.5 h-3.5" />{group.sentimentCounts.positive}
                  </span>
                )}
                {group.sentimentCounts.neutral > 0 && (
                  <span className="flex items-center gap-0.5 text-xs font-medium text-muted-foreground">
                    <Minus className="w-3.5 h-3.5" />{group.sentimentCounts.neutral}
                  </span>
                )}
                {group.sentimentCounts.negative > 0 && (
                  <span className="flex items-center gap-0.5 text-xs font-medium text-red-600">
                    <TrendingDown className="w-3.5 h-3.5" />{group.sentimentCounts.negative}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Comments List */}
      {expanded && (
        <div className="border-t divide-y">
          {topLevel.map((comment) => (
            <div key={comment.id}>
              <CommentItem
                comment={comment}
                onGenerateResponse={onGenerateResponse}
                onSendResponse={onSendResponse}
                onManageComment={onManageComment}
                generatingResponse={generatingResponse}
                responding={responding}
                managingComment={managingComment}
                editingResponse={editingResponse}
                setEditingResponse={setEditingResponse}
              />
              {/* Nested replies */}
              {repliesByParent.get(comment.comment_id)?.map((reply) => (
                <div key={reply.id} className="ml-8 border-l-2 border-primary/20">
                  <CommentItem
                    comment={reply}
                    onGenerateResponse={onGenerateResponse}
                    onSendResponse={onSendResponse}
                    onManageComment={onManageComment}
                    generatingResponse={generatingResponse}
                    responding={responding}
                    managingComment={managingComment}
                    editingResponse={editingResponse}
                    setEditingResponse={setEditingResponse}
                  />
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
