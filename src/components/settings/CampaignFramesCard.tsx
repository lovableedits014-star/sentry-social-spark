import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Image as ImageIcon, Loader2, Trash2, Upload, Sparkles } from "lucide-react";
import { toast } from "sonner";

interface Frame {
  id: string;
  nome: string;
  image_url: string;
  is_active: boolean;
  display_order: number;
}

interface Props { clientId: string; }

export default function CampaignFramesCard({ clientId }: Props) {
  const [frames, setFrames] = useState<Frame[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [newName, setNewName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("campaign_frames")
      .select("*")
      .eq("client_id", clientId)
      .order("display_order", { ascending: true });
    setFrames((data ?? []) as Frame[]);
    setLoading(false);
  };

  useEffect(() => { if (clientId) load(); }, [clientId]);

  const handleUpload = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Envie um arquivo de imagem (PNG transparente ideal)");
      return;
    }
    if (!newName.trim()) {
      toast.error("Informe um nome para a moldura");
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "png";
      const path = `${clientId}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("campaign-frames").upload(path, file, { upsert: false });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("campaign-frames").getPublicUrl(path);
      const { error: insErr } = await supabase.from("campaign_frames").insert({
        client_id: clientId,
        nome: newName.trim(),
        image_url: pub.publicUrl,
        is_active: true,
        display_order: frames.length,
      });
      if (insErr) throw insErr;
      toast.success("Moldura adicionada");
      setNewName("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      load();
    } catch (e: any) {
      toast.error(e.message || "Erro ao enviar moldura");
    } finally {
      setUploading(false);
    }
  };

  const toggleActive = async (frame: Frame) => {
    const { error } = await supabase
      .from("campaign_frames")
      .update({ is_active: !frame.is_active })
      .eq("id", frame.id);
    if (error) { toast.error("Erro ao atualizar"); return; }
    load();
  };

  const remove = async (frame: Frame) => {
    if (!confirm(`Remover a moldura "${frame.nome}"?`)) return;
    const { error } = await supabase.from("campaign_frames").delete().eq("id", frame.id);
    if (error) { toast.error("Erro ao remover"); return; }
    toast.success("Moldura removida");
    load();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Sparkles className="w-5 h-5 text-primary" /> Molduras de Foto de Campanha</CardTitle>
        <CardDescription>
          Suba PNGs transparentes <strong>1080x1080</strong> com a moldura/efeito de campanha. Apoiadores, funcionários e contratados poderão usá-las no portal para gerar a foto de perfil personalizada deles.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Upload */}
        <div className="border rounded-lg p-4 bg-muted/30 space-y-3">
          <div className="grid sm:grid-cols-[1fr_auto] gap-2 items-end">
            <div>
              <Label htmlFor="frame-name" className="text-xs">Nome da moldura</Label>
              <Input id="frame-name" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Ex: Padrão Campanha 2026" />
            </div>
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/webp"
                hidden
                onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])}
              />
              <Button onClick={() => fileInputRef.current?.click()} disabled={uploading} className="gap-2 w-full">
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                Enviar PNG
              </Button>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Dica: o círculo central onde a foto entra deve estar transparente. Tudo fora do círculo (anel, texto, badges) faz parte da moldura.
          </p>
        </div>

        {/* List */}
        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin" /></div>
        ) : frames.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <ImageIcon className="w-10 h-10 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Nenhuma moldura cadastrada</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {frames.map((f) => (
              <div key={f.id} className="border rounded-lg overflow-hidden bg-card">
                <div className="aspect-square bg-[conic-gradient(at_50%_50%,#f1f5f9_25%,#e2e8f0_25%_50%,#f1f5f9_50%_75%,#e2e8f0_75%)] bg-[length:20px_20px]">
                  <img src={f.image_url} alt={f.nome} className="w-full h-full object-contain" />
                </div>
                <div className="p-2 space-y-1.5">
                  <p className="text-xs font-medium truncate">{f.nome}</p>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Switch checked={f.is_active} onCheckedChange={() => toggleActive(f)} />
                      <span className="text-[10px] text-muted-foreground">{f.is_active ? "Ativa" : "Inativa"}</span>
                    </div>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => remove(f)}>
                      <Trash2 className="w-3.5 h-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}