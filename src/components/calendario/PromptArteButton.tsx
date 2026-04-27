import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Copy, Check, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import {
  buildPromptArteFeriado,
  buildPromptArteTemaMes,
  type ContextoArte,
} from "@/lib/prompt-arte-feriado";
import { useContextoArte } from "@/hooks/useContextoArte";

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

  // Quando abre, sincroniza draft com o contexto atual
  const handleOpen = (v: boolean) => {
    setOpen(v);
    if (v) setDraft(ctx);
    if (!v) setCopied(false);
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="cand-nome" className="text-xs">Nome do candidato (opcional)</Label>
              <Input
                id="cand-nome"
                placeholder="Ex: João da Silva"
                value={draft.nomeCandidato ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, nomeCandidato: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cand-cargo" className="text-xs">Cargo / pré-cargo (opcional)</Label>
              <Input
                id="cand-cargo"
                placeholder="Ex: Vereador, Prefeito, Pré-candidato"
                value={draft.cargo ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, cargo: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cand-cidade" className="text-xs">Cidade / região (opcional)</Label>
              <Input
                id="cand-cidade"
                placeholder="Ex: Belo Horizonte - MG"
                value={draft.cidade ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, cidade: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cand-paleta" className="text-xs">Paleta de cores (opcional)</Label>
              <Input
                id="cand-paleta"
                placeholder="Ex: azul royal e branco"
                value={draft.paletaCores ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, paletaCores: e.target.value }))}
              />
            </div>
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