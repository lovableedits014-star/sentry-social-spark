import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Users, Search, Star, TrendingUp, Merge, AlertTriangle, Instagram, Facebook, Share2, Copy, ExternalLink, Link2Off } from "lucide-react";
import { toast } from "sonner";
import { SupporterCard, Supporter } from "@/components/supporters/SupporterCard";
import { SupporterDetailDialog } from "@/components/supporters/SupporterDetailDialog";
import { MergeSupportersDialog } from "@/components/supporters/MergeSupportersDialog";

const Supporters = () => {
  const [supporters, setSupporters] = useState<Supporter[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [classificationFilter, setClassificationFilter] = useState<string>("all");
  const [platformFilter, setPlatformFilter] = useState<string>("all");
  const [clientId, setClientId] = useState<string>("");
  const [selectedSupporter, setSelectedSupporter] = useState<Supporter | null>(null);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

  // Merge mode
  const [mergeMode, setMergeMode] = useState(false);
  const [selectedForMerge, setSelectedForMerge] = useState<string[]>([]);
  const [isMergeDialogOpen, setIsMergeDialogOpen] = useState(false);

  useEffect(() => { fetchSupporters(); }, []);

  const fetchSupporters = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: clients } = await supabase
        .from("clients").select("id").eq("user_id", user.id).limit(1);

      if (!clients || clients.length === 0) { setLoading(false); return; }
      setClientId(clients[0].id);

      const { data, error } = await supabase
        .from("supporters")
        .select(`*, supporter_profiles (*)`)
        .eq("client_id", clients[0].id)
        .order("last_interaction_date", { ascending: false });

      if (error) throw error;
      setSupporters(data || []);
    } catch (error: any) {
      console.error("Error fetching supporters:", error);
      toast.error("Erro ao carregar apoiadores");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateSupporter = async () => {
    if (!selectedSupporter) return;
    try {
      const { error } = await supabase.from("supporters").update({
        name: selectedSupporter.name,
        classification: selectedSupporter.classification as any,
        notes: selectedSupporter.notes,
      } as any).eq("id", selectedSupporter.id);
      if (error) throw error;
      toast.success("Apoiador atualizado!");
      setIsEditDialogOpen(false);
      fetchSupporters();
    } catch (error: any) {
      toast.error("Erro ao atualizar apoiador");
    }
  };

  const handleDeleteSupporter = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir este apoiador?")) return;
    try {
      const { error } = await supabase.from("supporters").delete().eq("id", id);
      if (error) throw error;
      toast.success("Apoiador excluído!");
      fetchSupporters();
    } catch (error: any) {
      toast.error("Erro ao excluir apoiador");
    }
  };

  const handleToggleMergeSelect = (id: string) => {
    setSelectedForMerge(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      if (prev.length >= 2) return [prev[1], id];
      return [...prev, id];
    });
  };

  // Detect possible duplicates (similar names)
  const possibleDuplicates = useMemo(() => {
    const dupes: Array<[Supporter, Supporter]> = [];
    for (let i = 0; i < supporters.length; i++) {
      for (let j = i + 1; j < supporters.length; j++) {
        const a = supporters[i];
        const b = supporters[j];
        const nameA = a.name.toLowerCase().trim();
        const nameB = b.name.toLowerCase().trim();
        const firstA = nameA.split(" ")[0];
        const firstB = nameB.split(" ")[0];
        if (
          (firstA.length > 2 && firstA === firstB) ||
          nameA.includes(nameB) ||
          nameB.includes(nameA)
        ) {
          const platformsA = new Set(a.supporter_profiles?.map(p => p.platform) || []);
          const platformsB = new Set(b.supporter_profiles?.map(p => p.platform) || []);
          const overlap = [...platformsA].some(p => platformsB.has(p));
          if (!overlap || platformsA.size === 0 || platformsB.size === 0) {
            dupes.push([a, b]);
          }
        }
      }
    }
    return dupes;
  }, [supporters]);

  const filteredSupporters = supporters.filter((supporter) => {
    const matchesSearch = supporter.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      supporter.supporter_profiles?.some(p => p.platform_username?.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesClassification = classificationFilter === "all" || supporter.classification === classificationFilter;
    const matchesPlatform = platformFilter === "all" ||
      supporter.supporter_profiles?.some(p => p.platform === platformFilter);
    return matchesSearch && matchesClassification && matchesPlatform;
  });

  const stats = {
    total: supporters.length,
    ativos: supporters.filter(s => s.classification === "apoiador_ativo").length,
    multiplataforma: supporters.filter(s => {
      const platforms = new Set(s.supporter_profiles?.map(p => p.platform) || []);
      return platforms.size > 1;
    }).length,
    semPerfil: supporters.filter(s => !s.supporter_profiles || s.supporter_profiles.length === 0).length,
  };

  const mergeTargets = selectedForMerge.length === 2
    ? supporters.filter(s => selectedForMerge.includes(s.id))
    : [];

  const cadastroUrl = `${window.location.origin}/cadastro/${clientId}`;
  const portalUrl = `${window.location.origin}/portal/${clientId}`;

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-1/4" />
          <div className="grid grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => <div key={i} className="h-24 bg-muted rounded" />)}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-8 space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Apoiadores</h1>
          <p className="text-sm text-muted-foreground mt-1">CRM político — gerencie e unifique perfis</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {/* Links de cadastro e portal */}
          {clientId && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  navigator.clipboard.writeText(portalUrl);
                  toast.success("Link do Portal copiado!", { description: "Apoiadores entram aqui todo dia para marcar presença." });
                }}
                title="Copiar link do portal diário"
              >
                <Copy className="w-4 h-4 mr-1.5" />
                Copiar Portal
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={() => {
                  navigator.clipboard.writeText(cadastroUrl);
                  toast.success("Link de cadastro copiado!", { description: "Apoiadores se cadastram por aqui com o perfil social vinculado." });
                }}
                title="Copiar link de cadastro"
              >
                <Share2 className="w-4 h-4 mr-1.5" />
                Copiar Link de Cadastro
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open(cadastroUrl, "_blank")}
                title="Abrir página de cadastro"
              >
                <ExternalLink className="w-4 h-4" />
              </Button>
            </>
          )}
          {/* Unificar */}
          <Button
            variant={mergeMode ? "default" : "outline"}
            size="sm"
            onClick={() => { setMergeMode(!mergeMode); setSelectedForMerge([]); }}
            title="Unificar dois perfis duplicados"
          >
            <Merge className="w-4 h-4 mr-1.5" />
            {mergeMode ? "Cancelar" : "Unificar"}
          </Button>
        </div>
      </div>

      {/* Sem perfil vinculado — alerta */}
      {stats.semPerfil > 0 && !mergeMode && (
        <Card className="border-amber-300 bg-amber-50 dark:bg-amber-950/20">
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              <Link2Off className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium text-amber-800 dark:text-amber-300">
                  {stats.semPerfil} apoiador(es) sem perfil social vinculado
                </p>
                <p className="text-sm text-amber-700 dark:text-amber-400 mt-1">
                  Esses apoiadores têm score = 0 porque não há como rastrear as interações deles. 
                  Peça para se cadastrarem pelo link de cadastro — ao entrar com o nome correto, 
                  as interações passadas são recuperadas automaticamente.
                </p>
                {clientId && (
                  <button
                    className="text-xs text-amber-800 dark:text-amber-300 underline mt-2 font-medium"
                    onClick={() => { navigator.clipboard.writeText(cadastroUrl); toast.success("Link copiado!"); }}
                  >
                    Copiar link de cadastro
                  </button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Merge mode bar */}
      {mergeMode && (
        <Card className="border-primary bg-primary/5">
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Merge className="w-5 h-5 text-primary" />
                <div>
                  <p className="font-medium">Modo de unificação ativo</p>
                  <p className="text-sm text-muted-foreground">
                    Selecione exatamente 2 apoiadores para unificar ({selectedForMerge.length}/2 selecionados)
                  </p>
                </div>
              </div>
              <Button
                disabled={selectedForMerge.length !== 2}
                onClick={() => setIsMergeDialogOpen(true)}
              >
                Unificar Selecionados
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Possible duplicates alert */}
      {!mergeMode && possibleDuplicates.length > 0 && (
        <Card className="border-amber-300 bg-amber-50 dark:bg-amber-950/20">
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5" />
              <div>
                <p className="font-medium text-amber-800 dark:text-amber-300">
                  {possibleDuplicates.length} possível(is) duplicata(s) encontrada(s)
                </p>
                <p className="text-sm text-amber-700 dark:text-amber-400 mt-1">
                  Detectamos apoiadores com nomes similares. Use "Unificar" para combiná-los.
                </p>
                <div className="flex flex-wrap gap-2 mt-2">
                  {possibleDuplicates.slice(0, 3).map(([a, b], i) => (
                    <Badge key={i} variant="outline" className="border-amber-400 text-amber-700 dark:text-amber-300">
                      {a.name} ↔ {b.name}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg"><Users className="w-5 h-5 text-primary" /></div>
              <div>
                <p className="text-2xl font-bold">{stats.total}</p>
                <p className="text-sm text-muted-foreground">Total</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-500/10 rounded-lg"><Star className="w-5 h-5 text-emerald-500" /></div>
              <div>
                <p className="text-2xl font-bold">{stats.ativos}</p>
                <p className="text-sm text-muted-foreground">Ativos</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg"><Merge className="w-5 h-5 text-primary" /></div>
              <div>
                <p className="text-2xl font-bold">{stats.multiplataforma}</p>
                <p className="text-sm text-muted-foreground">Multiplataforma</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-500/10 rounded-lg"><TrendingUp className="w-5 h-5 text-amber-500" /></div>
              <div>
                <p className="text-2xl font-bold">{possibleDuplicates.length}</p>
                <p className="text-sm text-muted-foreground">Possíveis duplicatas</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Buscar por nome ou username..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10" />
            </div>
            <Select value={classificationFilter} onValueChange={setClassificationFilter}>
              <SelectTrigger className="w-full md:w-[200px]"><SelectValue placeholder="Classificação" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas classificações</SelectItem>
                <SelectItem value="apoiador_ativo">Apoiador Ativo</SelectItem>
                <SelectItem value="apoiador_passivo">Apoiador Passivo</SelectItem>
                <SelectItem value="neutro">Neutro</SelectItem>
                <SelectItem value="critico">Crítico/Oposição</SelectItem>
              </SelectContent>
            </Select>
            <Select value={platformFilter} onValueChange={setPlatformFilter}>
              <SelectTrigger className="w-full md:w-[180px]"><SelectValue placeholder="Plataforma" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas plataformas</SelectItem>
                <SelectItem value="facebook">
                  <span className="flex items-center gap-2"><Facebook className="w-4 h-4" /> Facebook</span>
                </SelectItem>
                <SelectItem value="instagram">
                  <span className="flex items-center gap-2"><Instagram className="w-4 h-4" /> Instagram</span>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Supporters List */}
      <div className="space-y-3">
        {filteredSupporters.length === 0 ? (
          <Card>
            <CardContent className="py-12">
              <div className="text-center text-muted-foreground">
                <Users className="w-12 h-12 mx-auto mb-4 opacity-20" />
                <p>Nenhum apoiador encontrado</p>
                <p className="text-sm mt-2">Compartilhe o link de cadastro para que apoiadores se registrem com o perfil social vinculado.</p>
              </div>
            </CardContent>
          </Card>
        ) : (
          filteredSupporters.map((supporter) => (
            <SupporterCard
              key={supporter.id}
              supporter={supporter}
              mergeMode={mergeMode}
              isSelected={selectedForMerge.includes(supporter.id)}
              onSelect={handleToggleMergeSelect}
              onView={(s) => { setSelectedSupporter(s); setIsViewDialogOpen(true); }}
              onEdit={(s) => { setSelectedSupporter(s); setIsEditDialogOpen(true); }}
              onDelete={handleDeleteSupporter}
            />
          ))
        )}
      </div>

      {/* View Detail Dialog */}
      <SupporterDetailDialog
        supporter={selectedSupporter}
        open={isViewDialogOpen}
        onOpenChange={setIsViewDialogOpen}
      />

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar Apoiador</DialogTitle></DialogHeader>
          {selectedSupporter && (
            <div className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label>Nome</Label>
                <Input value={selectedSupporter.name} onChange={(e) => setSelectedSupporter({ ...selectedSupporter, name: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Classificação</Label>
                <Select value={selectedSupporter.classification} onValueChange={(v) => setSelectedSupporter({ ...selectedSupporter, classification: v })}>
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
                <Label>Observações</Label>
                <Textarea value={selectedSupporter.notes || ""} onChange={(e) => setSelectedSupporter({ ...selectedSupporter, notes: e.target.value })} />
              </div>
              <Button onClick={handleUpdateSupporter} className="w-full">Salvar Alterações</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Merge Dialog */}
      {mergeTargets.length === 2 && (
        <MergeSupportersDialog
          supporters={mergeTargets}
          open={isMergeDialogOpen}
          onOpenChange={setIsMergeDialogOpen}
          onMergeComplete={() => {
            setMergeMode(false);
            setSelectedForMerge([]);
            fetchSupporters();
          }}
        />
      )}
    </div>
  );
};

export default Supporters;
