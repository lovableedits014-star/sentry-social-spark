import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Instagram, Facebook, Link, Plus, X, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";

type ParsedProfile = {
  platform: "facebook" | "instagram";
  username: string;
  originalUrl: string;
  // Resolved from comments/engagement_actions
  resolvedId?: string;
  resolvedName?: string;
  resolvedPicture?: string;
};

function parseProfileUrl(url: string): Omit<ParsedProfile, 'resolvedId' | 'resolvedName' | 'resolvedPicture'> | null {
  const trimmed = url.trim();
  if (!trimmed) return null;

  const fbPatterns = [
    /(?:https?:\/\/)?(?:www\.)?(?:m\.)?facebook\.com\/(?:profile\.php\?id=(\d+))/i,
    /(?:https?:\/\/)?(?:www\.)?(?:m\.)?facebook\.com\/([a-zA-Z0-9._-]+)\/?/i,
    /(?:https?:\/\/)?(?:www\.)?(?:m\.)?fb\.com\/([a-zA-Z0-9._-]+)\/?/i,
  ];

  for (const pattern of fbPatterns) {
    const match = trimmed.match(pattern);
    if (match && match[1]) {
      const username = match[1];
      if (["groups", "pages", "events", "watch", "marketplace", "gaming", "reel", "stories", "photo", "permalink"].includes(username.toLowerCase())) continue;
      return { platform: "facebook", username, originalUrl: trimmed };
    }
  }

  const igPatterns = [
    /(?:https?:\/\/)?(?:www\.)?instagram\.com\/([a-zA-Z0-9._]+)\/?/i,
    /(?:https?:\/\/)?(?:www\.)?instagr\.am\/([a-zA-Z0-9._]+)\/?/i,
  ];

  for (const pattern of igPatterns) {
    const match = trimmed.match(pattern);
    if (match && match[1]) {
      const username = match[1];
      if (["p", "reel", "stories", "explore", "direct", "accounts", "about"].includes(username.toLowerCase())) continue;
      return { platform: "instagram", username, originalUrl: trimmed };
    }
  }

  return null;
}

type Props = {
  clientId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
};

export const AddByProfileLink = ({ clientId, open, onOpenChange, onSuccess }: Props) => {
  const [profileLinks, setProfileLinks] = useState<string[]>([""]);
  const [parsedProfiles, setParsedProfiles] = useState<(ParsedProfile | null)[]>([null]);
  const [name, setName] = useState("");
  const [classification, setClassification] = useState("neutro");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [resolving, setResolving] = useState<number | null>(null);

  // Try to find real platform ID by searching comments
  const resolveProfile = async (profile: ParsedProfile, index: number): Promise<ParsedProfile> => {
    setResolving(index);
    try {
      // For Facebook: search comments for author whose name matches the slug pattern
      // e.g., slug "fagner.teodoro.52" → search "fagner teodoro" in author_name
      const searchName = profile.username
        .replace(/\.\d+$/, '') // remove trailing .52 etc
        .replace(/[._-]/g, ' ')
        .trim();

      const { data: comments } = await supabase
        .from("comments")
        .select("author_id, author_name, author_profile_picture, platform")
        .eq("client_id", clientId)
        .eq("platform", profile.platform)
        .not("author_id", "is", null)
        .not("author_name", "is", null)
        .limit(500);

      if (comments && comments.length > 0) {
        // Try exact slug match first
        const exactMatch = comments.find(c => {
          const authorSlug = (c.author_name || '').toLowerCase().replace(/\s+/g, '.').replace(/'/g, '');
          return authorSlug.includes(profile.username.toLowerCase().replace(/\.\d+$/, ''));
        });

        // Try fuzzy name match
        const fuzzyMatch = !exactMatch ? comments.find(c => {
          const authorLower = (c.author_name || '').toLowerCase();
          const searchLower = searchName.toLowerCase();
          return authorLower.includes(searchLower) || searchLower.includes(authorLower);
        }) : null;

        const match = exactMatch || fuzzyMatch;
        if (match) {
          return {
            ...profile,
            resolvedId: match.author_id || undefined,
            resolvedName: match.author_name || undefined,
            resolvedPicture: match.author_profile_picture || undefined,
          };
        }
      }

      // Also check engagement_actions
      const { data: actions } = await supabase
        .from("engagement_actions")
        .select("platform_user_id, platform_username")
        .eq("client_id", clientId)
        .eq("platform", profile.platform)
        .not("platform_username", "is", null)
        .limit(500);

      if (actions && actions.length > 0) {
        const match = actions.find(a => {
          const actionSlug = (a.platform_username || '').toLowerCase().replace(/\s+/g, '.').replace(/'/g, '');
          return actionSlug.includes(profile.username.toLowerCase().replace(/\.\d+$/, ''))
            || (a.platform_username || '').toLowerCase().includes(searchName.toLowerCase());
        });

        if (match) {
          return {
            ...profile,
            resolvedId: match.platform_user_id || undefined,
            resolvedName: match.platform_username || undefined,
          };
        }
      }

      return profile;
    } catch (error) {
      console.error("Error resolving profile:", error);
      return profile;
    } finally {
      setResolving(null);
    }
  };

  const handleLinkChange = async (index: number, value: string) => {
    const newLinks = [...profileLinks];
    newLinks[index] = value;
    setProfileLinks(newLinks);

    const parsed = parseProfileUrl(value);
    const newParsed = [...parsedProfiles];
    
    if (parsed) {
      // Immediately set parsed, then resolve in background
      const baseProfile: ParsedProfile = { ...parsed };
      newParsed[index] = baseProfile;
      setParsedProfiles(newParsed);

      // Auto-fill name
      if (!name) {
        const searchName = parsed.username
          .replace(/\.\d+$/, '')
          .replace(/[._-]/g, ' ')
          .replace(/\b\w/g, c => c.toUpperCase());
        setName(searchName);
      }

      // Resolve real ID in background
      const resolved = await resolveProfile(baseProfile, index);
      setParsedProfiles(prev => {
        const updated = [...prev];
        updated[index] = resolved;
        return updated;
      });

      // Update name if we found a better one
      if (resolved.resolvedName && !name) {
        setName(resolved.resolvedName);
      }
    } else {
      newParsed[index] = null;
      setParsedProfiles(newParsed);
    }
  };

  const addLinkField = () => {
    if (profileLinks.length >= 5) return;
    setProfileLinks([...profileLinks, ""]);
    setParsedProfiles([...parsedProfiles, null]);
  };

  const removeLinkField = (index: number) => {
    if (profileLinks.length <= 1) return;
    setProfileLinks(profileLinks.filter((_, i) => i !== index));
    setParsedProfiles(parsedProfiles.filter((_, i) => i !== index));
  };

  const validProfiles = parsedProfiles.filter((p): p is ParsedProfile => p !== null);

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error("Nome é obrigatório");
      return;
    }
    if (validProfiles.length === 0) {
      toast.error("Adicione pelo menos um link de perfil válido");
      return;
    }

    setLoading(true);
    try {
      // Check if a supporter with this name or matching profiles already exists
      const { data: existingProfiles } = await supabase
        .from("supporter_profiles")
        .select("supporter_id, platform, platform_user_id")
        .in("platform_user_id", [
          ...validProfiles.map(p => p.username),
          ...validProfiles.filter(p => p.resolvedId).map(p => p.resolvedId!)
        ]);

      if (existingProfiles && existingProfiles.length > 0) {
        // Link to existing supporter instead
        const existingSupporterId = existingProfiles[0].supporter_id;
        const { data: existingSupporter } = await supabase
          .from("supporters")
          .select("name")
          .eq("id", existingSupporterId)
          .single();

        // Add missing profiles to the existing supporter
        let addedCount = 0;
        for (const profile of validProfiles) {
          const ids = [profile.username, profile.resolvedId].filter(Boolean);
          const alreadyLinked = existingProfiles.some(ep => 
            ep.supporter_id === existingSupporterId && ids.includes(ep.platform_user_id)
          );
          if (!alreadyLinked) {
            await supabase.from("supporter_profiles").insert({
              supporter_id: existingSupporterId,
              platform: profile.platform,
              platform_user_id: profile.resolvedId || profile.username,
              platform_username: profile.resolvedName || profile.username,
              profile_picture_url: profile.resolvedPicture || null,
            });
            addedCount++;
          }
        }

        // Link orphan actions
        await supabase.rpc("link_orphan_engagement_actions" as any, { p_client_id: clientId });

        toast.success(`Perfil(is) vinculado(s) ao apoiador existente "${existingSupporter?.name}"!`);
        resetForm();
        onOpenChange(false);
        onSuccess();
        return;
      }

      // Create supporter
      const { data: supporter, error: supporterError } = await supabase
        .from("supporters")
        .insert({
          client_id: clientId,
          name: name.trim(),
          classification: classification as any,
          notes: notes.trim() || null,
        } as any)
        .select()
        .single();

      if (supporterError) throw supporterError;

      // Create profile links - store BOTH the URL slug and the resolved numeric ID
      for (const profile of validProfiles) {
        // Always create with the best ID we have
        const { error: profileError } = await supabase
          .from("supporter_profiles")
          .insert({
            supporter_id: supporter.id,
            platform: profile.platform,
            platform_user_id: profile.resolvedId || profile.username,
            platform_username: profile.resolvedName || profile.username,
            profile_picture_url: profile.resolvedPicture || null,
          });

        if (profileError) console.error("Error adding profile:", profileError);

        // If we have a resolved ID different from username, also create a profile
        // with the slug so both can be matched
        if (profile.resolvedId && profile.resolvedId !== profile.username) {
          try {
            await supabase.from("supporter_profiles").insert({
              supporter_id: supporter.id,
              platform: profile.platform,
              platform_user_id: profile.username,
              platform_username: profile.username,
            });
          } catch { /* ignore duplicate */ }
        }
      }

      // Link orphan actions and recalculate
      await supabase.rpc("link_orphan_engagement_actions" as any, { p_client_id: clientId });

      toast.success(`Apoiador "${name}" cadastrado com ${validProfiles.length} perfil(is)!`);
      resetForm();
      onOpenChange(false);
      onSuccess();
    } catch (error: any) {
      console.error("Error adding supporter:", error);
      toast.error(error.message || "Erro ao cadastrar apoiador");
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setProfileLinks([""]);
    setParsedProfiles([null]);
    setName("");
    setClassification("neutro");
    setNotes("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link className="w-5 h-5" />
            Cadastrar por Link do Perfil
          </DialogTitle>
          <DialogDescription>
            Cole os links do Facebook e/ou Instagram. O sistema busca automaticamente o perfil nos comentários sincronizados.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 pt-2">
          {/* Profile links */}
          <div className="space-y-3">
            <Label>Links de perfil</Label>
            {profileLinks.map((link, index) => (
              <div key={index} className="space-y-1">
                <div className="flex gap-2">
                  <div className="flex-1 relative">
                    <Input
                      value={link}
                      onChange={(e) => handleLinkChange(index, e.target.value)}
                      placeholder="https://facebook.com/nome.usuario ou https://instagram.com/usuario"
                      className="pr-10"
                    />
                    {resolving === index && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                      </div>
                    )}
                    {parsedProfiles[index] && resolving !== index && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        {parsedProfiles[index]!.platform === "instagram" ? (
                          <Instagram className="w-4 h-4 text-pink-500" />
                        ) : (
                          <Facebook className="w-4 h-4 text-blue-600" />
                        )}
                      </div>
                    )}
                  </div>
                  {profileLinks.length > 1 && (
                    <Button size="icon" variant="ghost" onClick={() => removeLinkField(index)}>
                      <X className="w-4 h-4" />
                    </Button>
                  )}
                </div>
                {link && !parsedProfiles[index] && (
                  <p className="text-xs text-destructive">Link não reconhecido. Use um link do Facebook ou Instagram.</p>
                )}
                {parsedProfiles[index] && (
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs gap-1">
                        {parsedProfiles[index]!.platform === "instagram" ? <Instagram className="w-3 h-3" /> : <Facebook className="w-3 h-3" />}
                        @{parsedProfiles[index]!.username}
                      </Badge>
                      {parsedProfiles[index]!.resolvedId ? (
                        <span className="text-xs text-emerald-600 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          Perfil encontrado nos comentários
                        </span>
                      ) : resolving !== index ? (
                        <span className="text-xs text-amber-600 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" />
                          Perfil não encontrado nos comentários (será vinculado quando comentar)
                        </span>
                      ) : null}
                    </div>
                    {/* Show resolved profile info */}
                    {parsedProfiles[index]!.resolvedName && (
                      <div className="flex items-center gap-2 pl-1">
                        {parsedProfiles[index]!.resolvedPicture && (
                          <Avatar className="h-6 w-6">
                            <AvatarImage src={parsedProfiles[index]!.resolvedPicture} />
                            <AvatarFallback className="text-xs">
                              {parsedProfiles[index]!.resolvedName?.charAt(0)}
                            </AvatarFallback>
                          </Avatar>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {parsedProfiles[index]!.resolvedName}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
            {profileLinks.length < 5 && (
              <Button variant="outline" size="sm" onClick={addLinkField} className="w-full">
                <Plus className="w-3.5 h-3.5 mr-1" />
                Adicionar outro perfil
              </Button>
            )}
          </div>

          {/* Supporter info */}
          {validProfiles.length > 0 && (
            <div className="space-y-4 border-t pt-4">
              <div className="space-y-2">
                <Label>Nome do apoiador</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Nome completo"
                />
              </div>

              <div className="space-y-2">
                <Label>Classificação</Label>
                <Select value={classification} onValueChange={setClassification}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="apoiador_ativo">Apoiador Ativo</SelectItem>
                    <SelectItem value="apoiador_passivo">Apoiador Passivo</SelectItem>
                    <SelectItem value="neutro">Neutro</SelectItem>
                    <SelectItem value="critico">Crítico/Oposição</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Observações (opcional)</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Ex: Indicado pelo vereador João, mora no bairro X..."
                  maxLength={500}
                />
              </div>

              {/* Summary */}
              <div className="bg-muted/50 rounded-lg p-3 space-y-2">
                <p className="text-sm font-medium">Resumo do cadastro:</p>
                <div className="flex flex-wrap gap-1">
                  {validProfiles.map((p, i) => (
                    <Badge key={i} variant="secondary" className="gap-1">
                      {p.platform === "instagram" ? <Instagram className="w-3 h-3" /> : <Facebook className="w-3 h-3" />}
                      {p.resolvedName || `@${p.username}`}
                      {p.resolvedId && <CheckCircle2 className="w-3 h-3 text-emerald-500" />}
                    </Badge>
                  ))}
                </div>
                {validProfiles.some(p => !p.resolvedId) && (
                  <p className="text-xs text-muted-foreground">
                    ⚠️ Perfis sem correspondência serão vinculados automaticamente quando o apoiador comentar nas suas publicações.
                  </p>
                )}
              </div>

              <Button onClick={handleSubmit} disabled={loading} className="w-full">
                {loading ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Cadastrando...</>
                ) : (
                  <>Cadastrar Apoiador com {validProfiles.length} perfil(is)</>
                )}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
