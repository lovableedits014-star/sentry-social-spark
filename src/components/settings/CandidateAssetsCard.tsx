import { useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Image as ImageIcon, Upload, Trash2, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

const BUCKET = "candidate-identity";
const MAX_PHOTOS = 10;
const MAX_BYTES = 8 * 1024 * 1024; // 8 MB

type Identity = {
  id: string;
  client_id: string;
  logo_url: string | null;
  logo_path: string | null;
};

type Photo = {
  id: string;
  client_id: string;
  photo_url: string;
  photo_path: string;
  label: string | null;
  description: string | null;
  display_order: number;
};

export default function CandidateAssetsCard({ clientId }: { clientId: string }) {
  const queryClient = useQueryClient();
  const logoInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoLabel, setPhotoLabel] = useState("");

  const identityQuery = useQuery({
    queryKey: ["candidate-identity", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("candidate_identity")
        .select("*")
        .eq("client_id", clientId)
        .maybeSingle();
      if (error) throw error;
      return data as Identity | null;
    },
    enabled: !!clientId,
  });

  const photosQuery = useQuery({
    queryKey: ["candidate-photos", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("candidate_photos")
        .select("*")
        .eq("client_id", clientId)
        .order("display_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Photo[];
    },
    enabled: !!clientId,
  });

  const uploadLogo = async (file: File) => {
    if (file.size > MAX_BYTES) {
      toast.error("Logo muito grande (máx. 8 MB).");
      return;
    }
    setUploadingLogo(true);
    try {
      const ext = (file.name.split(".").pop() || "png").toLowerCase();
      const path = `${clientId}/logo-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type || "image/png",
      });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);

      // Remove arquivo antigo se existir
      const oldPath = identityQuery.data?.logo_path;

      const { error: dbErr } = await supabase.from("candidate_identity").upsert(
        {
          client_id: clientId,
          logo_url: pub.publicUrl,
          logo_path: path,
        },
        { onConflict: "client_id" },
      );
      if (dbErr) throw dbErr;

      if (oldPath && oldPath !== path) {
        await supabase.storage.from(BUCKET).remove([oldPath]).catch(() => {});
      }

      toast.success("Logo atualizada!");
      queryClient.invalidateQueries({ queryKey: ["candidate-identity", clientId] });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Erro ao enviar logo";
      toast.error(msg);
    } finally {
      setUploadingLogo(false);
      if (logoInputRef.current) logoInputRef.current.value = "";
    }
  };

  const removeLogo = useMutation({
    mutationFn: async () => {
      const path = identityQuery.data?.logo_path;
      const { error } = await supabase
        .from("candidate_identity")
        .update({ logo_url: null, logo_path: null })
        .eq("client_id", clientId);
      if (error) throw error;
      if (path) await supabase.storage.from(BUCKET).remove([path]).catch(() => {});
    },
    onSuccess: () => {
      toast.success("Logo removida.");
      queryClient.invalidateQueries({ queryKey: ["candidate-identity", clientId] });
    },
    onError: (e: any) => toast.error(e.message ?? "Falha ao remover logo"),
  });

  const uploadPhoto = async (file: File) => {
    if ((photosQuery.data?.length ?? 0) >= MAX_PHOTOS) {
      toast.error(`Limite de ${MAX_PHOTOS} fotos atingido. Remova alguma para enviar uma nova.`);
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error("Foto muito grande (máx. 8 MB).");
      return;
    }
    setUploadingPhoto(true);
    try {
      const ext = (file.name.split(".").pop() || "png").toLowerCase();
      const path = `${clientId}/photo-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type || "image/png",
      });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);

      const { error: dbErr } = await supabase.from("candidate_photos").insert({
        client_id: clientId,
        photo_url: pub.publicUrl,
        photo_path: path,
        label: photoLabel.trim() || null,
        display_order: (photosQuery.data?.length ?? 0),
      });
      if (dbErr) throw dbErr;

      toast.success("Foto adicionada à galeria.");
      setPhotoLabel("");
      queryClient.invalidateQueries({ queryKey: ["candidate-photos", clientId] });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Erro ao enviar foto";
      toast.error(msg);
    } finally {
      setUploadingPhoto(false);
      if (photoInputRef.current) photoInputRef.current.value = "";
    }
  };

  const removePhoto = useMutation({
    mutationFn: async (photo: Photo) => {
      const { error } = await supabase.from("candidate_photos").delete().eq("id", photo.id);
      if (error) throw error;
      await supabase.storage.from(BUCKET).remove([photo.photo_path]).catch(() => {});
    },
    onSuccess: () => {
      toast.success("Foto removida.");
      queryClient.invalidateQueries({ queryKey: ["candidate-photos", clientId] });
    },
    onError: (e: any) => toast.error(e.message ?? "Falha ao remover foto"),
  });

  const photos = photosQuery.data ?? [];
  const identity = identityQuery.data;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-primary" />
          Materiais para o gerador de artes
        </CardTitle>
        <CardDescription>
          Envie a <strong>logo do candidato</strong> (aplicada em todas as artes) e até{" "}
          <strong>{MAX_PHOTOS} fotos</strong> para usar nas artes geradas. A IA não recria o rosto —
          ela usa a foto que você escolher e constrói a arte ao redor (fundo, elementos, logo, texto).
          <br />
          <span className="text-[12px] mt-1 inline-block">
            <strong>Recomendado:</strong> PNG com fundo transparente, mínimo 1024×1024px. Para fotos:
            iluminação frontal, boa nitidez, expressões variadas (sorrindo, sério, gesticulando).
          </span>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* LOGO */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-semibold">Logo da campanha</Label>
            {identity?.logo_url && (
              <Badge variant="secondary" className="text-[10px]">Aplicada em todas as artes</Badge>
            )}
          </div>

          <div className="flex items-start gap-4">
            <div className="w-32 h-32 rounded-lg border-2 border-dashed flex items-center justify-center bg-muted/40 overflow-hidden shrink-0">
              {identity?.logo_url ? (
                <img
                  src={identity.logo_url}
                  alt="Logo do candidato"
                  className="max-w-full max-h-full object-contain"
                />
              ) : (
                <ImageIcon className="w-8 h-8 text-muted-foreground" />
              )}
            </div>

            <div className="flex-1 space-y-2">
              <input
                ref={logoInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadLogo(f);
                }}
              />
              <div className="flex gap-2 flex-wrap">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => logoInputRef.current?.click()}
                  disabled={uploadingLogo}
                  className="gap-1.5"
                >
                  {uploadingLogo ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Upload className="w-3.5 h-3.5" />
                  )}
                  {identity?.logo_url ? "Substituir logo" : "Enviar logo"}
                </Button>
                {identity?.logo_url && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => removeLogo.mutate()}
                    disabled={removeLogo.isPending}
                    className="gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Remover
                  </Button>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">
                PNG com fundo transparente. Recomendado: 1024×1024px ou maior.
              </p>
            </div>
          </div>
        </section>

        {/* GALERIA DE FOTOS */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-semibold">
              Galeria de fotos do candidato
            </Label>
            <Badge variant="outline" className="text-[10px]">
              {photos.length}/{MAX_PHOTOS}
            </Badge>
          </div>

          <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2">
              <Input
                placeholder="Legenda da foto (opcional). Ex: Sorrindo de paletó"
                value={photoLabel}
                onChange={(e) => setPhotoLabel(e.target.value.slice(0, 80))}
                disabled={uploadingPhoto || photos.length >= MAX_PHOTOS}
              />
              <input
                ref={photoInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadPhoto(f);
                }}
              />
              <Button
                type="button"
                size="sm"
                onClick={() => photoInputRef.current?.click()}
                disabled={uploadingPhoto || photos.length >= MAX_PHOTOS}
                className="gap-1.5"
              >
                {uploadingPhoto ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Upload className="w-3.5 h-3.5" />
                )}
                Adicionar foto
              </Button>
            </div>
            {photos.length >= MAX_PHOTOS && (
              <p className="text-[11px] text-amber-600">
                Limite de {MAX_PHOTOS} fotos atingido. Remova alguma para enviar uma nova.
              </p>
            )}
          </div>

          {photos.length === 0 ? (
            <div className="rounded-lg border-2 border-dashed py-8 text-center text-sm text-muted-foreground">
              Nenhuma foto cadastrada. Envie pelo menos 1 foto para usar no gerador de artes.
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {photos.map((p) => (
                <div
                  key={p.id}
                  className="group relative rounded-lg border bg-muted/30 overflow-hidden aspect-square"
                >
                  <img
                    src={p.photo_url}
                    alt={p.label || "Foto do candidato"}
                    className="w-full h-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => removePhoto.mutate(p)}
                    disabled={removePhoto.isPending}
                    className="absolute top-1 right-1 p-1.5 rounded-md bg-background/90 hover:bg-destructive hover:text-destructive-foreground transition-colors opacity-0 group-hover:opacity-100"
                    title="Remover foto"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                  {p.label && (
                    <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                      <p className="text-[11px] text-white font-medium line-clamp-2">{p.label}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </CardContent>
    </Card>
  );
}