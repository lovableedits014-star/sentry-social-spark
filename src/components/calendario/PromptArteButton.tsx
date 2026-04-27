import { useState } from "react";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Copy, Check, ExternalLink, Wand2, Download, Loader2, ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import {
  buildPromptArteFeriado,
  buildPromptArteTemaMes,
  type ContextoArte,
} from "@/lib/prompt-arte-feriado";
import { useContextoArte } from "@/hooks/useContextoArte";

type CandidatePhoto = { id: string; photo_url: string; label: string | null };
type CandidateIdentity = { logo_url: string | null };

type Props =
  | {
      tipo: "feriado";
      feriado: { localName: string; name?: string; date?: string };
      size?: "sm" | "default";
      variant?: "outline" | "ghost" | "default" | "secondary";
      label?: string;
      compact?: boolean;
    }
  | {
      tipo: "tema-mes";
      tema: { titulo: string; descricao: string; emoji?: string };
      size?: "sm" | "default";
      variant?: "outline" | "ghost" | "default" | "secondary";
      label?: string;
      compact?: boolean;
    };

function buildPrompt(props: Props, ctx: ContextoArte) {
  if (props.tipo === "feriado") return buildPromptArteFeriado(props.feriado, ctx);
  return buildPromptArteTemaMes(props.tema, ctx);
}

function getTitulo(props: Props) {
  return props.tipo === "feriado" ? props.feriado.localName : props.tema.titulo;
}

export function PromptArteButton(props: Props) {
  const { ctx, update } = useContextoArte();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [draft, setDraft] = useState<ContextoArte>(ctx);
  const [gerando, setGerando] = useState(false);
  const [imagemUrl, setImagemUrl] = useState<string | null>(null);
  const [qualidade, setQualidade] = useState<"fast" | "pro">("fast");
  const [photoId, setPhotoId] = useState<string | null>(null);
  const [clientId, setClientId] = useState<string | null>(null);

  // Descobre clientId do usuário logado (1x)
  useEffect(() => {
    let cancel = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("clients")
        .select("id")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();
      if (!cancel && data?.id) setClientId(data.id);
    })();
    return () => { cancel = true; };
  }, []);

  const identityQuery = useQuery({
    queryKey: ["candidate-identity", clientId],
    queryFn: async () => {
      const { data } = await supabase
        .from("candidate_identity")
        .select("logo_url")
        .eq("client_id", clientId!)
        .maybeSingle();
      return (data ?? null) as CandidateIdentity | null;
    },
    enabled: !!clientId && open,
  });

  const photosQuery = useQuery({
    queryKey: ["candidate-photos", clientId],
    queryFn: async () => {
      const { data } = await supabase
        .from("candidate_photos")
        .select("id, photo_url, label")
        .eq("client_id", clientId!)
        .order("display_order", { ascending: true });
      return (data ?? []) as CandidatePhoto[];
    },
    enabled: !!clientId && open,
  });

  const photos = photosQuery.data ?? [];
  const logoUrl = identityQuery.data?.logo_url ?? undefined;
  const selectedPhoto = photos.find((p) => p.id === photoId);

  // Quando abre, sincroniza draft com o contexto atual
  const handleOpen = (v: boolean) => {
    setOpen(v);
    if (v) setDraft(ctx);
    if (!v) {
      setCopied(false);
      setImagemUrl(null);
    }
  };

  const prompt = buildPrompt(props, draft);

  const copy = async () => {
    try {
      // Salva o contexto atualizado
      update(draft);
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      toast.success("Prompt copiado! Cole no ChatGPT (modo imagem) ou outro gerador.");
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error("Não foi possível copiar. Selecione o texto e copie manualmente.");
    }
  };

  const gerarArte = async () => {
    setGerando(true);
    setImagemUrl(null);
    update(draft); // persiste contexto
    try {
      const { data, error } = await supabase.functions.invoke("generate-arte-feriado", {
        body: {
          prompt,
          qualidade,
          logoUrl,
          photoUrl: selectedPhoto?.photo_url,
        },
      });
      if (error) throw error;
      const payload = data as { imageUrl?: string; error?: string };
      if (payload.error) throw new Error(payload.error);
      if (!payload.imageUrl) throw new Error("Nenhuma imagem retornada");
      setImagemUrl(payload.imageUrl);
      toast.success("Arte gerada! Confira o preview abaixo.");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Erro desconhecido";
      // Mensagens amigáveis para erros conhecidos
      if (msg.toLowerCase().includes("saldo") || msg.includes("402")) {
        toast.error(
          "Saldo de IA esgotado. Adicione créditos em Cloud → AI balance.",
          { duration: 6000 },
        );
      } else if (msg.toLowerCase().includes("limite") || msg.includes("429")) {
        toast.error("Muitas requisições. Aguarde alguns segundos e tente novamente.");
      } else {
        toast.error(`Falha ao gerar arte: ${msg}`);
      }
    } finally {
      setGerando(false);
    }
  };

  const baixarArte = () => {
    if (!imagemUrl) return;
    const a = document.createElement("a");
    a.href = imagemUrl;
    const safeName = getTitulo(props)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .toLowerCase()
      .slice(0, 60);
    a.download = `arte-${safeName}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const size = props.size ?? "sm";
  const variant = props.variant ?? "outline";

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger asChild>
        <Button size={size} variant={variant} className="gap-1.5">
          <Sparkles className="h-3.5 w-3.5" />
          {props.compact ? null : <span>{props.label ?? "Prompt de arte"}</span>}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Prompt de arte — {getTitulo(props)}
          </DialogTitle>
          <DialogDescription>
            Estilo institucional/candidato. Personalize o contexto abaixo, copie o prompt e cole no ChatGPT
            (ferramenta de imagem) ou em qualquer outro gerador (DALL·E, Midjourney, Nano Banana).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md border bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
            ✨ A IA puxa automaticamente nome, cargo, cidade e identidade visual de{" "}
            <strong>Configurações → Identidade da Campanha</strong> e{" "}
            <strong>Materiais para o gerador de artes</strong>. Não precisa preencher nada aqui.
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="prompt-out" className="text-xs">Prompt gerado</Label>
              <Badge variant="secondary" className="text-[10px]">Estilo: institucional / candidato</Badge>
            </div>
            <Textarea
              id="prompt-out"
              value={prompt}
              readOnly
              className="min-h-[260px] font-mono text-xs"
              onFocus={(e) => e.currentTarget.select()}
            />
            <p className="text-[11px] text-muted-foreground">
              Dica: o ChatGPT precisa estar no modo de geração de imagem (DALL·E). No Midjourney, remova as seções
              em português que não interessam ao motor.
            </p>
          </div>

          {/* Geração interna com Lovable AI */}
          <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <Wand2 className="h-4 w-4 text-primary" />
                <span className="text-xs font-semibold">Gerar arte aqui mesmo</span>
                <Badge variant="outline" className="text-[10px]">via Lovable AI</Badge>
              </div>
              <div className="flex items-center gap-1.5">
                <Label htmlFor="qualidade" className="text-[10px] text-muted-foreground">
                  Qualidade:
                </Label>
                <select
                  id="qualidade"
                  value={qualidade}
                  onChange={(e) => setQualidade(e.target.value as "fast" | "pro")}
                  disabled={gerando}
                  className="h-7 rounded border bg-background text-xs px-1.5"
                >
                  <option value="fast">Padrão (~25/$ 1)</option>
                  <option value="pro">Pro (~16/$ 1)</option>
                </select>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground leading-snug">
              Gera diretamente sem sair da plataforma. Consome saldo de IA do Lovable Cloud
              ($1 grátis/mês). <span className="font-medium">Não interfere</span> no provedor de IA configurado em Configurações.
            </p>

            {/* Seletor de foto + logo do candidato */}
            <div className="space-y-2 rounded border bg-background p-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <Label className="text-[11px] font-semibold flex items-center gap-1">
                  <ImageIcon className="h-3 w-3" />
                  Foto do candidato para usar nesta arte
                </Label>
                <div className="flex items-center gap-1.5">
                  {logoUrl ? (
                    <Badge variant="outline" className="text-[10px] gap-1">
                      <img src={logoUrl} alt="" className="h-3 w-3 object-contain" />
                      Logo será aplicada
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="text-[10px]">
                      Sem logo cadastrada
                    </Badge>
                  )}
                </div>
              </div>

              {photos.length === 0 ? (
                <div className="text-[11px] text-muted-foreground py-2 text-center">
                  Nenhuma foto cadastrada. Vá em <strong>Configurações → Materiais para o gerador
                  de artes</strong> e envie pelo menos 1 foto. A arte será gerada sem foto do
                  candidato.
                </div>
              ) : (
                <div className="flex gap-2 overflow-x-auto pb-1">
                  <button
                    type="button"
                    onClick={() => setPhotoId(null)}
                    className={`shrink-0 w-16 h-16 rounded border-2 flex items-center justify-center text-[10px] transition-colors ${
                      photoId === null
                        ? "border-primary bg-primary/10 text-primary font-semibold"
                        : "border-muted bg-muted/40 text-muted-foreground hover:border-muted-foreground"
                    }`}
                  >
                    Sem foto
                  </button>
                  {photos.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setPhotoId(p.id)}
                      title={p.label || "Foto do candidato"}
                      className={`shrink-0 w-16 h-16 rounded border-2 overflow-hidden transition-colors ${
                        photoId === p.id
                          ? "border-primary ring-2 ring-primary/40"
                          : "border-transparent hover:border-muted-foreground"
                      }`}
                    >
                      <img
                        src={p.photo_url}
                        alt={p.label || ""}
                        className="w-full h-full object-cover"
                      />
                    </button>
                  ))}
                </div>
              )}
              {selectedPhoto && (
                <p className="text-[10px] text-muted-foreground">
                  ✓ A IA usará <strong>{selectedPhoto.label || "esta foto"}</strong> exatamente como
                  está, sem recriar o rosto. Apenas o cenário e elementos serão gerados ao redor.
                </p>
              )}
            </div>

            {imagemUrl && (
              <div className="rounded border bg-background overflow-hidden">
                <img
                  src={imagemUrl}
                  alt={`Arte gerada para ${getTitulo(props)}`}
                  className="w-full h-auto block max-h-[480px] object-contain bg-muted"
                />
              </div>
            )}

            <div className="flex items-center gap-2 flex-wrap">
              <Button
                type="button"
                size="sm"
                onClick={gerarArte}
                disabled={gerando}
                className="gap-1.5"
              >
                {gerando ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Gerando... (até 30s)
                  </>
                ) : (
                  <>
                    <Wand2 className="h-3.5 w-3.5" />
                    {imagemUrl ? "Gerar outra variação" : "Gerar arte agora"}
                  </>
                )}
              </Button>
              {imagemUrl && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={baixarArte}
                  className="gap-1.5"
                >
                  <Download className="h-3.5 w-3.5" />
                  Baixar PNG
                </Button>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" asChild>
            <a href="https://chatgpt.com/" target="_blank" rel="noopener noreferrer" className="gap-1.5">
              <ExternalLink className="h-3.5 w-3.5" />
              Abrir ChatGPT
            </a>
          </Button>
          <Button onClick={copy} className="gap-1.5">
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? "Copiado!" : "Copiar prompt"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}