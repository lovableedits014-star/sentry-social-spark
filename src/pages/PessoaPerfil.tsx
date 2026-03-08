import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Pencil, Plus, ExternalLink, User, MapPin, Phone, Mail, Calendar, Tag, FileText } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import EditarPessoaDialog from "@/components/pessoas/EditarPessoaDialog";
import AddSocialDialog from "@/components/pessoas/AddSocialDialog";

const TIPO_LABELS: Record<string, string> = {
  eleitor: "Eleitor", apoiador: "Apoiador", lideranca: "Liderança",
  jornalista: "Jornalista", influenciador: "Influenciador", voluntario: "Voluntário",
  adversario: "Adversário", cidadao: "Cidadão",
};

const NIVEL_LABELS: Record<string, string> = {
  desconhecido: "Desconhecido", simpatizante: "Simpatizante",
  apoiador: "Apoiador", militante: "Militante", opositor: "Opositor",
};

const NIVEL_COLORS: Record<string, string> = {
  desconhecido: "bg-muted text-muted-foreground",
  simpatizante: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  apoiador: "bg-green-500/10 text-green-600 border-green-500/20",
  militante: "bg-purple-500/10 text-purple-600 border-purple-500/20",
  opositor: "bg-red-500/10 text-red-600 border-red-500/20",
};

const ORIGEM_LABELS: Record<string, string> = {
  rede_social: "Rede Social", formulario: "Formulário", evento: "Evento",
  importacao: "Importação", manual: "Manual",
};

const PLATFORM_ICONS: Record<string, string> = {
  facebook: "🔵", instagram: "📸", twitter: "🐦", tiktok: "🎵", youtube: "▶️",
};

export default function PessoaPerfil() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [pessoa, setPessoa] = useState<any>(null);
  const [socials, setSocials] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [socialOpen, setSocialOpen] = useState(false);

  useEffect(() => {
    if (id) fetchData();
  }, [id]);

  async function fetchData() {
    setLoading(true);
    const [pessoaRes, socialRes] = await Promise.all([
      supabase.from("pessoas").select("*").eq("id", id!).single(),
      supabase.from("pessoa_social").select("*").eq("pessoa_id", id!).order("created_at"),
    ]);

    if (pessoaRes.error) {
      toast.error("Pessoa não encontrada");
      navigate("/pessoas");
      return;
    }

    setPessoa(pessoaRes.data);
    setSocials(socialRes.data || []);
    setLoading(false);
  }

  async function handleDeleteSocial(socialId: string) {
    const { error } = await supabase.from("pessoa_social").delete().eq("id", socialId);
    if (error) {
      toast.error("Erro ao remover rede social");
    } else {
      toast.success("Rede social removida");
      setSocials(prev => prev.filter(s => s.id !== socialId));
    }
  }

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[50vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!pessoa) return null;

  const InfoRow = ({ icon: Icon, label, value }: { icon: any; label: string; value: string | null }) => (
    <div className="flex items-start gap-3 py-2">
      <Icon className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium text-foreground">{value || "—"}</p>
      </div>
    </div>
  );

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/pessoas")}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-foreground">{pessoa.nome}</h1>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="outline" className="text-xs">
              {TIPO_LABELS[pessoa.tipo_pessoa] || pessoa.tipo_pessoa}
            </Badge>
            <Badge variant="outline" className={`text-xs ${NIVEL_COLORS[pessoa.nivel_apoio] || ""}`}>
              {NIVEL_LABELS[pessoa.nivel_apoio] || pessoa.nivel_apoio}
            </Badge>
          </div>
        </div>
        <Button variant="outline" className="gap-2" onClick={() => setEditOpen(true)}>
          <Pencil className="w-4 h-4" />
          Editar
        </Button>
      </div>

      {/* Content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column - Dados */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Dados Pessoais</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
              <InfoRow icon={User} label="Nome" value={pessoa.nome} />
              <InfoRow icon={Mail} label="Email" value={pessoa.email} />
              <InfoRow icon={Phone} label="Telefone" value={pessoa.telefone} />
              <InfoRow icon={Calendar} label="Data de Nascimento" value={pessoa.data_nascimento ? format(new Date(pessoa.data_nascimento + "T00:00:00"), "dd/MM/yyyy") : null} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Localização</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
              <InfoRow icon={MapPin} label="Cidade" value={pessoa.cidade} />
              <InfoRow icon={MapPin} label="Bairro" value={pessoa.bairro} />
              <div className="sm:col-span-2">
                <InfoRow icon={MapPin} label="Endereço" value={pessoa.endereco} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Classificação Política</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-x-6">
              <InfoRow icon={Tag} label="Tipo de Pessoa" value={TIPO_LABELS[pessoa.tipo_pessoa] || pessoa.tipo_pessoa} />
              <InfoRow icon={Tag} label="Nível de Apoio" value={NIVEL_LABELS[pessoa.nivel_apoio] || pessoa.nivel_apoio} />
              <InfoRow icon={Tag} label="Origem do Contato" value={ORIGEM_LABELS[pessoa.origem_contato] || pessoa.origem_contato} />
            </CardContent>
          </Card>

          {/* Tags & Notas */}
          {(pessoa.tags?.length > 0 || pessoa.notas_internas) && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Tags & Notas</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {pessoa.tags?.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1.5">Tags</p>
                    <div className="flex flex-wrap gap-1.5">
                      {pessoa.tags.map((tag: string, i: number) => (
                        <Badge key={i} variant="secondary" className="text-xs">{tag}</Badge>
                      ))}
                    </div>
                  </div>
                )}
                {pessoa.notas_internas && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Notas Internas</p>
                    <p className="text-sm text-foreground whitespace-pre-wrap">{pessoa.notas_internas}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right column - Redes sociais */}
        <div className="space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-base">Redes Sociais</CardTitle>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setSocialOpen(true)}>
                <Plus className="w-3.5 h-3.5" />
                Adicionar
              </Button>
            </CardHeader>
            <CardContent>
              {socials.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  Nenhuma rede social vinculada
                </p>
              ) : (
                <div className="space-y-3">
                  {socials.map((s) => (
                    <div key={s.id} className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
                      <span className="text-lg">{PLATFORM_ICONS[s.plataforma] || "🌐"}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium capitalize">{s.plataforma}</p>
                        <p className="text-xs text-muted-foreground truncate">{s.usuario || "—"}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        {s.url_perfil && (
                          <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
                            <a href={s.url_perfil} target="_blank" rel="noopener noreferrer">
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => handleDeleteSocial(s.id)}
                        >
                          ✕
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Meta info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Informações do Registro</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs text-muted-foreground">
              <p>Criado em: {format(new Date(pessoa.created_at), "dd/MM/yyyy HH:mm")}</p>
              <p>Atualizado em: {format(new Date(pessoa.updated_at), "dd/MM/yyyy HH:mm")}</p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Dialogs */}
      <EditarPessoaDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        pessoa={pessoa}
        onSuccess={fetchData}
      />
      <AddSocialDialog
        open={socialOpen}
        onOpenChange={setSocialOpen}
        pessoaId={pessoa.id}
        onSuccess={fetchData}
      />
    </div>
  );
}
