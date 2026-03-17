import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";

interface CustomThemeDialogProps {
  onSave: (label: string, keywords: string[]) => Promise<void>;
}

export function CustomThemeDialog({ onSave }: CustomThemeDialogProps) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [keywordInput, setKeywordInput] = useState("");
  const [keywords, setKeywords] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const addKeyword = () => {
    const kw = keywordInput.trim().toLowerCase();
    if (!kw) return;
    if (keywords.includes(kw)) {
      toast.error("Palavra-chave já adicionada");
      return;
    }
    setKeywords([...keywords, kw]);
    setKeywordInput("");
  };

  const removeKeyword = (kw: string) => {
    setKeywords(keywords.filter((k) => k !== kw));
  };

  const handleSave = async () => {
    if (!label.trim()) { toast.error("Nome do tema é obrigatório"); return; }
    if (keywords.length === 0) { toast.error("Adicione pelo menos uma palavra-chave"); return; }
    setSaving(true);
    try {
      await onSave(label.trim(), keywords);
      setLabel("");
      setKeywords([]);
      setKeywordInput("");
      setOpen(false);
      toast.success("Tema customizado criado!");
    } catch (e: any) {
      toast.error(e.message || "Erro ao salvar tema");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Plus className="w-4 h-4 mr-1.5" /> Novo Tema
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Criar Tema Customizado</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Nome do tema</Label>
            <Input
              placeholder="Ex: Infraestrutura Urbana"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Palavras-chave</Label>
            <div className="flex gap-2">
              <Input
                placeholder="Ex: buraco, asfalto, calçada..."
                value={keywordInput}
                onChange={(e) => setKeywordInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addKeyword(); } }}
              />
              <Button variant="outline" size="icon" onClick={addKeyword} type="button">
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Pressione Enter ou clique + para adicionar. Use expressões como "minha casa" para frases compostas.
            </p>
          </div>

          {keywords.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {keywords.map((kw) => (
                <Badge key={kw} variant="secondary" className="gap-1 pr-1">
                  {kw}
                  <button onClick={() => removeKeyword(kw)} className="hover:text-destructive">
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}

          <Button onClick={handleSave} disabled={saving} className="w-full">
            {saving ? "Salvando..." : "Criar Tema"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
