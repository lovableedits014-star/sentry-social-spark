import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Instagram, Facebook, Calendar, TrendingUp, Eye, Edit2, Trash2, Merge, ExternalLink } from "lucide-react";
import { getSocialProfileUrl } from "@/lib/social-url";

export type SupporterProfile = {
  id: string;
  supporter_id: string;
  platform: string;
  platform_user_id: string;
  platform_username: string | null;
  profile_picture_url: string | null;
  created_at: string;
};

export type Supporter = {
  id: string;
  client_id: string;
  name: string;
  classification: string;
  notes: string | null;
  first_contact_date: string;
  last_interaction_date: string;
  engagement_score: number;
  created_at: string;
  supporter_profiles: SupporterProfile[];
};

export const classificationLabels: Record<string, { label: string; color: string }> = {
  apoiador_ativo: { label: "Apoiador Ativo", color: "bg-emerald-500" },
  apoiador_passivo: { label: "Apoiador Passivo", color: "bg-sky-500" },
  neutro: { label: "Neutro", color: "bg-muted-foreground" },
  critico: { label: "Crítico/Oposição", color: "bg-destructive" },
};

type Props = {
  supporter: Supporter;
  isSelected?: boolean;
  onSelect?: (id: string) => void;
  onView: (supporter: Supporter) => void;
  onEdit: (supporter: Supporter) => void;
  onDelete: (id: string) => void;
  mergeMode?: boolean;
};

export const SupporterCard = ({ supporter, isSelected, onSelect, onView, onEdit, onDelete, mergeMode }: Props) => {
  const config = classificationLabels[supporter.classification] || classificationLabels.neutro;

  const platformGroups = {
    facebook: supporter.supporter_profiles?.filter(p => p.platform === "facebook") || [],
    instagram: supporter.supporter_profiles?.filter(p => p.platform === "instagram") || [],
  };

  const hasBothPlatforms = platformGroups.facebook.length > 0 && platformGroups.instagram.length > 0;

  const getActivityDot = () => {
    if (!supporter.last_interaction_date) return "bg-muted-foreground";
    const days = Math.floor((Date.now() - new Date(supporter.last_interaction_date).getTime()) / (1000 * 60 * 60 * 24));
    if (days <= 3) return "bg-emerald-500 animate-pulse";
    if (days <= 7) return "bg-sky-500";
    if (days <= 14) return "bg-amber-500";
    return "bg-destructive";
  };

  // Get best profile picture from any profile
  const profilePicture = supporter.supporter_profiles?.find(p => p.profile_picture_url)?.profile_picture_url;

  return (
    <Card className={`transition-all ${mergeMode && isSelected ? 'ring-2 ring-primary bg-primary/5' : ''} ${mergeMode ? 'cursor-pointer' : ''}`}
      onClick={() => mergeMode && onSelect?.(supporter.id)}
    >
      <CardContent className="pt-4 pb-4 px-3 sm:pt-6 sm:px-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div className="flex items-start gap-3 sm:gap-4 min-w-0 flex-1">
            {mergeMode && (
              <Checkbox checked={isSelected} className="mt-1 shrink-0" />
            )}
            <div className="relative shrink-0">
              <Avatar className="h-10 w-10 sm:h-12 sm:w-12">
                <AvatarImage src={profilePicture || ''} alt={supporter.name} />
                <AvatarFallback className="text-base sm:text-lg">{supporter.name.charAt(0).toUpperCase()}</AvatarFallback>
              </Avatar>
              <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 sm:w-3.5 sm:h-3.5 rounded-full border-2 border-background ${getActivityDot()}`} />
            </div>
            <div className="space-y-1.5 sm:space-y-2 min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-semibold text-base sm:text-lg truncate">{supporter.name}</h3>
                <Badge className={`${config.color} text-white text-xs`}>{config.label}</Badge>
                {hasBothPlatforms && (
                  <Badge variant="outline" className="gap-1 text-xs border-primary/30 text-primary hidden sm:flex">
                    <Merge className="w-3 h-3" />
                    Multi
                  </Badge>
                )}
              </div>

              {/* Platform profiles */}
              <div className="flex flex-wrap gap-1.5">
                {supporter.supporter_profiles?.map((profile) => {
                  const profileUrl = getSocialProfileUrl(profile.platform, profile.platform_user_id, profile.platform_username);
                  return (
                    <TooltipProvider key={profile.id}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Badge
                            variant="outline"
                            className={`gap-1 text-xs ${profileUrl ? 'cursor-pointer hover:bg-accent' : ''}`}
                            onClick={(e) => {
                              if (profileUrl) {
                                e.stopPropagation();
                                window.open(profileUrl, "_blank", "noopener,noreferrer");
                              }
                            }}
                          >
                            {profile.platform === "instagram" ? <Instagram className="w-3 h-3" /> : <Facebook className="w-3 h-3" />}
                            <span className="truncate max-w-[120px] sm:max-w-[180px]">
                              {profile.platform_username || profile.platform_user_id}
                            </span>
                            {profileUrl && <ExternalLink className="w-2.5 h-2.5 opacity-50" />}
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="text-xs">{profileUrl ? "Abrir perfil na rede social" : "Perfil vinculado"}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  );
                })}
                {(!supporter.supporter_profiles || supporter.supporter_profiles.length === 0) && (
                  <span className="text-xs text-muted-foreground">Sem perfis vinculados</span>
                )}
              </div>

              {/* Metadata */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs sm:text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Calendar className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                  {new Date(supporter.first_contact_date).toLocaleDateString("pt-BR")}
                </span>
                <span className="flex items-center gap-1 font-medium text-foreground">
                  <TrendingUp className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                  Score: {supporter.engagement_score}
                </span>
                {supporter.last_interaction_date && (
                  <span className="text-xs">
                    Última: {new Date(supporter.last_interaction_date).toLocaleDateString("pt-BR")}
                  </span>
                )}
              </div>

              {supporter.notes && (
                <p className="text-xs sm:text-sm text-muted-foreground italic truncate">"{supporter.notes}"</p>
              )}
            </div>
          </div>

          {!mergeMode && (
            <div className="flex gap-1 shrink-0 self-end sm:self-start">
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => onView(supporter)}>
                <Eye className="w-4 h-4" />
              </Button>
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => onEdit(supporter)}>
                <Edit2 className="w-4 h-4" />
              </Button>
              <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => onDelete(supporter.id)}>
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
