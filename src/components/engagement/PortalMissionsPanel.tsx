import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Target, Plus, Pencil, Trash2, Facebook, Instagram, GripVertical,
  ExternalLink, ToggleLeft, ToggleRight, Loader2, Info,
} from "lucide-react";
import { toast } from "sonner";

interface Mission {
  id: string;
  client_id: string;
  platform: "facebook" | "instagram";
  post_url: string;
  title: string | null;
  description: string | null;
  display_order: number;
  is_active: boolean;
  created_at: string;
}

interface PortalMissionsPanelProps {
  clientId: string;
}

function parsePlatformFromUrl(url: string): "facebook" | "instagram" | null {
  if (!url) return null;
  if (url.includes("facebook.com") || url.includes("fb.com") || url.includes("fb.watch")) return "facebook";
  if (url.includes("instagram.com")) return "instagram";
  return null;
}

const EMPTY_FORM = {
  platform: "facebook" as "facebook" | "instagram",
  post_url: "",
  title: "",
  description: "",
};

export function PortalMissionsPanel({ clientId }: PortalMissionsPanelProps) {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editMission, setEditMission] = useState<Mission | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const { data: missions = [], isLoading } = useQuery({
    queryKey: ["portal-missions", clientId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("portal_missions")
        .select("*")
        .eq("client_id", clientId)
        .order("display_order", { ascending: true });
      if (error) throw error;
      return (data || []) as Mission[];
    },
    enabled: !!clientId,
  });

  const saveMutation = useMutation({
    mutationFn: async (values: typeof form & { id?: string }) => {
      const payload = {
        client_id: clientId,
        platform: values.platform,
        post_url: values.post_url.trim(),
        title: values.title.trim() || null,
        description: values.description.trim() || null,
        display_order: values.id
          ? (missions.find((m) => m.id === values.id)?.display_order ?? 0)
          : missions.length,
        is_active: true,
      };
      if (values.id) {
        const { error } = await (supabase as any)
          .from("portal_missions").update(payload).eq("id", values.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any)
          .from("portal_missions").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["portal-missions", clientId] });
      setDialogOpen(false);
      setEditMission(null);
      setForm(EMPTY_FORM);
      toast.success(editMission ? "Missão atualizada!" : "Missão adicionada!");
    },
    onError: () => toast.error("Erro ao salvar missão"),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await (supabase as any)
        .from("portal_missions").update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["portal-missions", clientId] }),
    onError: () => toast.error("Erro ao atualizar missão"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from("portal_missions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["portal-missions", clientId] });
      setDeleteId(null);
      toast.success("Missão removida!");
    },
    onError: () => toast.error("Erro ao remover missão"),
  });

  const openAdd = () => {
    setEditMission(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEdit = (m: Mission) => {
    setEditMission(m);
    setForm({
      platform: m.platform,
      post_url: m.post_url,
      title: m.title || "",
      description: m.description || "",
    });
    setDialogOpen(true);
  };

  // Auto-detect platform from URL
  const handleUrlChange = (url: string) => {
    const detected = parsePlatformFromUrl(url);
    setForm((f) => ({
      ...f,
      post_url: url,
      ...(detected ? { platform: detected } : {}),
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.post_url.trim()) { toast.error("Informe a URL da publicação"); return; }
    saveMutation.mutate({ ...form, id: editMission?.id });
  };

  const activeMissions = missions.filter((m) => m.is_active);
  const inactiveMissions = missions.filter((m) => !m.is_active);

  return (
    <div className="space-y-4">
      {/* Header card */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="p-4 flex items-start gap-3">
          <Target className="w-5 h-5 text-primary shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold">Missões de Engajamento</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Escolha as publicações que seus apoiadores devem interagir. Elas aparecem em destaque no portal deles — você pode trocar quando quiser.
            </p>
          </div>
          <Button size="sm" onClick={openAdd} className="shrink-0">
            <Plus className="w-4 h-4 mr-1" />
            Adicionar
          </Button>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-primary">{activeMissions.length}</p>
            <p className="text-xs text-muted-foreground">Missões ativas</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-blue-600">
              {missions.filter((m) => m.platform === "facebook" && m.is_active).length}
            </p>
            <p className="text-xs text-muted-foreground">Facebook</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-pink-500">
              {missions.filter((m) => m.platform === "instagram" && m.is_active).length}
            </p>
            <p className="text-xs text-muted-foreground">Instagram</p>
          </CardContent>
        </Card>
      </div>

      {/* Active missions */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Target className="w-4 h-4 text-primary" />
            Missões Ativas no Portal
          </CardTitle>
          <CardDescription className="text-xs">
            Estas publicações estão sendo exibidas para os apoiadores agora
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : activeMissions.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <Target className="w-10 h-10 mx-auto mb-3 opacity-20" />
              <p className="text-sm font-medium">Nenhuma missão ativa</p>
              <p className="text-xs mt-1">Adicione publicações para exibir no portal dos apoiadores</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={openAdd}>
                <Plus className="w-4 h-4 mr-1" /> Adicionar missão
              </Button>
            </div>
          ) : (
            activeMissions.map((m) => (
              <MissionCard
                key={m.id}
                mission={m}
                onEdit={() => openEdit(m)}
                onDelete={() => setDeleteId(m.id)}
                onToggle={() => toggleMutation.mutate({ id: m.id, is_active: false })}
              />
            ))
          )}
        </CardContent>
      </Card>

      {/* Inactive missions */}
      {inactiveMissions.length > 0 && (
        <Card className="opacity-70">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-muted-foreground">Missões Pausadas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {inactiveMissions.map((m) => (
              <MissionCard
                key={m.id}
                mission={m}
                onEdit={() => openEdit(m)}
                onDelete={() => setDeleteId(m.id)}
                onToggle={() => toggleMutation.mutate({ id: m.id, is_active: true })}
                inactive
              />
            ))}
          </CardContent>
        </Card>
      )}

      {/* Tip */}
      <Card className="border-dashed border-muted-foreground/30">
        <CardContent className="p-3 flex items-start gap-2">
          <Info className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground">
            <strong>Dica:</strong> Adicione a missão com uma descrição motivacional como{" "}
            <em>"Curta e comente esta postagem sobre [tema]!"</em> — o apoiador saberá exatamente o que fazer.
          </p>
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(v) => { setDialogOpen(v); if (!v) { setEditMission(null); setForm(EMPTY_FORM); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editMission ? "Editar Missão" : "Nova Missão de Engajamento"}</DialogTitle>
            <DialogDescription>
              Cole o link da publicação que deseja que seus apoiadores interajam.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>URL da Publicação *</Label>
              <Input
                value={form.post_url}
                onChange={(e) => handleUrlChange(e.target.value)}
                placeholder="https://www.facebook.com/..."
                required
              />
              <p className="text-xs text-muted-foreground">
                Cole o link direto da publicação no Facebook ou Instagram
              </p>
            </div>

            <div className="space-y-2">
              <Label>Plataforma</Label>
              <Select
                value={form.platform}
                onValueChange={(v) => setForm((f) => ({ ...f, platform: v as "facebook" | "instagram" }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="facebook">
                    <span className="flex items-center gap-2">
                      <Facebook className="w-4 h-4 text-blue-600" /> Facebook
                    </span>
                  </SelectItem>
                  <SelectItem value="instagram">
                    <span className="flex items-center gap-2">
                      <Instagram className="w-4 h-4 text-pink-500" /> Instagram
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Título da Missão <span className="text-muted-foreground">(opcional)</span></Label>
              <Input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Ex: Apoie o post de hoje!"
                maxLength={80}
              />
            </div>

            <div className="space-y-2">
              <Label>Mensagem para o Apoiador <span className="text-muted-foreground">(opcional)</span></Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Ex: Curta, comente e compartilhe esta publicação! Cada interação conta muito para nós."
                rows={3}
                maxLength={200}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                {editMission ? "Salvar alterações" : "Adicionar missão"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={(v) => { if (!v) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover missão?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta missão será removida permanentemente do portal dos apoiadores.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ── Sub-component: MissionCard ─────────────────────────────────────────────
function MissionCard({
  mission,
  onEdit,
  onDelete,
  onToggle,
  inactive = false,
}: {
  mission: Mission;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
  inactive?: boolean;
}) {
  return (
    <div className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
      inactive ? "bg-muted/30 border-muted" : "bg-card border-border hover:bg-muted/20"
    }`}>
      <div className={`p-1.5 rounded-md shrink-0 mt-0.5 ${
        mission.platform === "instagram" ? "bg-pink-500/10" : "bg-blue-500/10"
      }`}>
        {mission.platform === "instagram"
          ? <Instagram className="w-4 h-4 text-pink-500" />
          : <Facebook className="w-4 h-4 text-blue-600" />}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          {mission.title ? (
            <p className="text-sm font-medium truncate">{mission.title}</p>
          ) : (
            <p className="text-sm text-muted-foreground truncate italic">Sem título</p>
          )}
          <Badge variant="outline" className="text-xs shrink-0 capitalize">
            {mission.platform}
          </Badge>
        </div>
        {mission.description && (
          <p className="text-xs text-muted-foreground line-clamp-2">{mission.description}</p>
        )}
        <a
          href={mission.post_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-1"
        >
          <ExternalLink className="w-3 h-3" />
          Ver publicação
        </a>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={onToggle}
          title={inactive ? "Ativar" : "Pausar"}
        >
          {inactive
            ? <ToggleLeft className="w-4 h-4 text-muted-foreground" />
            : <ToggleRight className="w-4 h-4 text-primary" />}
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onEdit}>
          <Pencil className="w-3.5 h-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7 hover:text-destructive" onClick={onDelete}>
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}
