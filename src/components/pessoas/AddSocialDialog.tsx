import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pessoaId: string;
  onSuccess: () => void;
}

const PLATFORM_OPTIONS = [
  { value: "facebook", label: "Facebook" },
  { value: "instagram", label: "Instagram" },
  { value: "twitter", label: "Twitter / X" },
  { value: "tiktok", label: "TikTok" },
  { value: "youtube", label: "YouTube" },
];

export default function AddSocialDialog({ open, onOpenChange, pessoaId, onSuccess }: Props) {
  const [saving, setSaving] = useState(false);
  const [plataforma, setPlataforma] = useState("instagram");
  const [usuario, setUsuario] = useState("");
  const [urlPerfil, setUrlPerfil] = useState("");

  function reset() {
    setPlataforma("instagram");
    setUsuario("");
    setUrlPerfil("");
  }

  async function handleSave() {
    if (!usuario.trim() && !urlPerfil.trim()) {
      toast.error("Informe o usuário ou URL do perfil");
      return;
    }

    setSaving(true);
    const { error } = await supabase.from("pessoa_social").insert({
      pessoa_id: pessoaId,
      plataforma,
      usuario: usuario.trim() || null,
      url_perfil: urlPerfil.trim() || null,
    } as any);

    setSaving(false);
    if (error) {
      toast.error("Erro ao adicionar rede social");
      console.error(error);
    } else {
      toast.success("Rede social adicionada!");
      reset();
      onOpenChange(false);
      onSuccess();
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Adicionar Rede Social</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Plataforma</Label>
            <Select value={plataforma} onValueChange={setPlataforma}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PLATFORM_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Usuário</Label>
            <Input value={usuario} onChange={e => setUsuario(e.target.value)} placeholder="@usuario" maxLength={100} />
          </div>
          <div>
            <Label>URL do Perfil</Label>
            <Input value={urlPerfil} onChange={e => setUrlPerfil(e.target.value)} placeholder="https://..." maxLength={500} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
