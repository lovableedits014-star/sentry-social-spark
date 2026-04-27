import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Facebook, Instagram, ExternalLink, ClipboardPaste, Loader2, CheckCircle2, RotateCw, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { buildSearchUrl, extractHandleFromUrl } from "@/lib/social-url";
import { toast } from "sonner";

type Platform = "facebook" | "instagram";

export type ConnectedSocial = {
  platform: Platform;
  handle: string;
  url: string;
  name?: string | null;
  avatarUrl?: string | null;
};

interface Props {
  platform: Platform;
  /** Nome digitado no formulário, usado para pré-preencher a busca */
  searchName: string;
  value: ConnectedSocial | null;
  onChange: (value: ConnectedSocial | null) => void;
}

type Step = "intro" | "paste" | "previewing" | "confirm" | "rejected";

const PLATFORM_META: Record<Platform, { label: string; color: string; icon: typeof Facebook }> = {
  facebook: { label: "Facebook", color: "text-blue-600", icon: Facebook },
  instagram: { label: "Instagram", color: "text-pink-500", icon: Instagram },
};

export default function SocialConnectFlow({ platform, searchName, value, onChange }: Props) {
  const meta = PLATFORM_META[platform];
  const Icon = meta.icon;
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("intro");
  const [pastedLink, setPastedLink] = useState("");
  const [preview, setPreview] = useState<ConnectedSocial | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const popupRef = useRef<Window | null>(null);

  useEffect(() => {
    if (!open) {
      // reset interno ao fechar
      setStep("intro");
      setPastedLink("");
      setPreview(null);
      setPreviewError(null);
    }
  }, [open]);

  function openSocialPopup() {
    const url = buildSearchUrl(platform, searchName || "");
    try {
      popupRef.current = window.open(url, `connect-${platform}`, "width=480,height=720,noopener");
    } catch {
      // bloqueador de popup — ainda assim mostra o link como fallback
      window.open(url, "_blank", "noopener");
    }
    setStep("paste");
  }

  async function tryAutoPaste() {
    try {
      // Em mobile, normalmente requer gesto do usuário (este clique conta)
      const text = await navigator.clipboard.readText();
      if (text && text.trim()) {
        setPastedLink(text.trim());
        await resolveLink(text.trim());
        return;
      }
      toast.info("A área de transferência está vazia. Cole manualmente.");
    } catch {
      toast.info("Seu navegador não permitiu colar automaticamente. Cole manualmente no campo.");
    }
  }

  async function resolveLink(rawLink: string) {
    if (!rawLink.trim()) return;
    setPreviewError(null);
    setStep("previewing");

    // 1) Tenta extrair handle direto (link "limpo")
    let handle = extractHandleFromUrl(platform, rawLink);
    let canonicalUrl: string | null = null;

    // 2) Se não conseguiu (ex: link de share do FB), chama resolve-social-link
    if (!handle) {
      try {
        const { data, error } = await supabase.functions.invoke("resolve-social-link", {
          body: { url: rawLink, platform },
        });
        if (error) throw error;
        if (data?.resolved && data?.usuario) {
          handle = data.usuario as string;
          canonicalUrl = (data.url as string) || null;
        }
      } catch (e) {
        console.warn("resolve-social-link falhou:", e);
      }
    }

    if (!handle) {
      setPreviewError(
        "Não consegui identificar o perfil neste link. Confira se você copiou o link do seu perfil (não de uma postagem).",
      );
      setStep("paste");
      return;
    }

    // 3) Busca preview (foto + nome) — mas mesmo se falhar, prossegue só com handle
    let name: string | null = null;
    let avatarUrl: string | null = null;
    let resolvedCanonical = canonicalUrl;
    try {
      const { data, error } = await supabase.functions.invoke("preview-social-profile", {
        body: { platform, handle },
      });
      if (!error && data) {
        name = data.name || null;
        avatarUrl = data.avatarUrl || null;
        resolvedCanonical = resolvedCanonical || data.canonicalUrl || null;
      }
    } catch (e) {
      console.warn("preview-social-profile falhou:", e);
    }

    if (!resolvedCanonical) {
      resolvedCanonical =
        platform === "instagram"
          ? `https://www.instagram.com/${handle.replace(/^@/, "")}`
          : /^\d+$/.test(handle)
            ? `https://www.facebook.com/profile.php?id=${handle}`
            : `https://www.facebook.com/${handle}`;
    }

    setPreview({ platform, handle, url: resolvedCanonical, name, avatarUrl });
    setStep("confirm");
  }

  function confirmIsMe() {
    if (!preview) return;
    onChange(preview);
    setOpen(false);
    toast.success(`${meta.label} conectado!`);
  }

  function rejectAndRetry() {
    setPreview(null);
    setPastedLink("");
    setStep("paste");
  }

  function disconnect() {
    onChange(null);
  }

  // ===== Render do "card" externo (estado conectado vs não conectado) =====
  if (value) {
    return (
      <div className={`flex items-center gap-3 rounded-lg border-2 border-emerald-200 dark:border-emerald-900 bg-emerald-50/50 dark:bg-emerald-950/20 p-3`}>
        <Avatar className="h-12 w-12 shrink-0">
          {value.avatarUrl ? <AvatarImage src={value.avatarUrl} alt={value.name || value.handle} /> : null}
          <AvatarFallback className={meta.color}>
            <Icon className="h-5 w-5" />
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            <span className="text-sm font-medium text-foreground truncate">
              {meta.label} conectado
            </span>
          </div>
          <div className="text-xs text-muted-foreground truncate">
            {value.name ? <strong className="text-foreground">{value.name}</strong> : null}
            {value.name ? " · " : ""}
            {platform === "instagram" ? `@${value.handle.replace(/^@/, "")}` : value.handle}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button type="button" variant="ghost" size="sm" onClick={() => { setOpen(true); }}>
            <RotateCw className="h-3.5 w-3.5 mr-1" />
            Trocar
          </Button>
          <Button type="button" variant="ghost" size="icon" onClick={disconnect} aria-label="Remover">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="lg"
        className="w-full h-14 justify-start gap-3 border-2"
        onClick={() => setOpen(true)}
      >
        <Icon className={`h-5 w-5 ${meta.color}`} />
        <span className="flex-1 text-left">
          <span className="block text-sm font-semibold">Conectar meu {meta.label}</span>
          <span className="block text-xs text-muted-foreground font-normal">Toque para buscar seu perfil</span>
        </span>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Icon className={`h-5 w-5 ${meta.color}`} />
              Conectar meu {meta.label}
            </DialogTitle>
            <DialogDescription>
              {step === "intro" && "Vamos abrir o " + meta.label + " pra você achar seu perfil."}
              {step === "paste" && "Volte aqui depois de copiar o link do seu perfil."}
              {step === "previewing" && "Buscando seu perfil..."}
              {step === "confirm" && "Confirme se este é o seu perfil:"}
            </DialogDescription>
          </DialogHeader>

          {/* ============ STEP 1: INTRO ============ */}
          {step === "intro" && (
            <div className="space-y-4">
              <div className="rounded-lg bg-muted/50 p-4 text-sm space-y-2">
                <p className="font-medium">Como funciona:</p>
                <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                  <li>Vamos abrir o {meta.label} numa janela já buscando pelo seu nome.</li>
                  <li>Toque em <strong>você</strong> na lista de resultados.</li>
                  <li>No seu perfil, toque em <strong>Compartilhar</strong> → <strong>Copiar link</strong>.</li>
                  <li>Volte aqui e cole — a gente confirma a foto pra você.</li>
                </ol>
              </div>
              {!searchName.trim() && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  Dica: preencha seu nome completo lá em cima para a busca já vir pronta.
                </p>
              )}
              <Button type="button" size="lg" className="w-full" onClick={openSocialPopup}>
                <ExternalLink className="h-4 w-4 mr-2" />
                Abrir {meta.label}
              </Button>
            </div>
          )}

          {/* ============ STEP 2: PASTE ============ */}
          {step === "paste" && (
            <div className="space-y-4">
              <div className="rounded-lg border-2 border-dashed border-primary/40 bg-primary/5 p-4 text-sm space-y-2">
                <p className="font-medium text-foreground">No {meta.label} que abriu:</p>
                <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                  <li>Toque no <strong>seu perfil</strong> na lista.</li>
                  <li>Toque em <strong>⋯</strong> ou <strong>Compartilhar perfil</strong>.</li>
                  <li>Toque em <strong>Copiar link</strong>.</li>
                </ol>
              </div>

              <Button type="button" variant="default" size="lg" className="w-full" onClick={tryAutoPaste}>
                <ClipboardPaste className="h-4 w-4 mr-2" />
                Já copiei — colar do meu celular
              </Button>

              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground text-center">ou cole manualmente:</p>
                <Input
                  value={pastedLink}
                  onChange={(e) => setPastedLink(e.target.value)}
                  placeholder={platform === "facebook" ? "https://facebook.com/..." : "https://instagram.com/..."}
                  className="h-12 text-sm"
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="lg"
                  className="w-full"
                  disabled={!pastedLink.trim()}
                  onClick={() => resolveLink(pastedLink)}
                >
                  Continuar
                </Button>
              </div>

              {previewError && (
                <div className="text-xs text-destructive bg-destructive/10 rounded-md p-2.5">
                  {previewError}
                </div>
              )}

              <button
                type="button"
                className="text-xs text-muted-foreground hover:underline w-full text-center"
                onClick={openSocialPopup}
              >
                Abrir {meta.label} de novo
              </button>
            </div>
          )}

          {/* ============ STEP 3: PREVIEWING ============ */}
          {step === "previewing" && (
            <div className="flex flex-col items-center py-8 gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Buscando seu perfil no {meta.label}...</p>
            </div>
          )}

          {/* ============ STEP 4: CONFIRM ============ */}
          {step === "confirm" && preview && (
            <div className="space-y-4">
              <div className="rounded-lg border-2 border-primary/40 bg-primary/5 p-4 flex items-center gap-3">
                <Avatar className="h-16 w-16 shrink-0">
                  {preview.avatarUrl ? <AvatarImage src={preview.avatarUrl} alt={preview.name || preview.handle} /> : null}
                  <AvatarFallback className={meta.color}>
                    <Icon className="h-7 w-7" />
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="text-base font-semibold text-foreground truncate">
                    {preview.name || (platform === "instagram" ? `@${preview.handle.replace(/^@/, "")}` : preview.handle)}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {preview.url.replace(/^https?:\/\//, "")}
                  </div>
                </div>
              </div>

              {!preview.avatarUrl && !preview.name && (
                <p className="text-xs text-amber-600 dark:text-amber-400 text-center">
                  Não consegui carregar a foto, mas o link foi reconhecido. Confirme se este é o seu perfil.
                </p>
              )}

              <div className="flex flex-col gap-2">
                <Button type="button" size="lg" className="w-full" onClick={confirmIsMe}>
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Sim, sou eu
                </Button>
                <Button type="button" variant="outline" size="lg" className="w-full" onClick={rejectAndRetry}>
                  Não — tentar outro link
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}