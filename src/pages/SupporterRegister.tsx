import { useState } from "react";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Facebook, Instagram, CheckCircle2, Loader2, UserPlus, Phone, FileText, AlertCircle, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type ParsedProfile = {
  platform: "facebook" | "instagram";
  username: string;
};

function parseProfileUrl(url: string): ParsedProfile | null {
  const trimmed = url.trim();
  if (!trimmed) return null;

  const fbPatterns = [
    /(?:https?:\/\/)?(?:www\.)?(?:m\.)?facebook\.com\/(?:profile\.php\?id=(\d+))/i,
    /(?:https?:\/\/)?(?:www\.)?(?:m\.)?facebook\.com\/([a-zA-Z0-9._-]+)\/?/i,
    /(?:https?:\/\/)?(?:www\.)?(?:m\.)?fb\.com\/([a-zA-Z0-9._-]+)\/?/i,
  ];
  const fbBlacklist = ["groups","pages","events","watch","marketplace","gaming","reel","stories","photo","permalink","sharer","share","login","home","notifications","messages"];
  for (const pattern of fbPatterns) {
    const match = trimmed.match(pattern);
    if (match?.[1]) {
      const u = match[1];
      if (fbBlacklist.includes(u.toLowerCase())) continue;
      return { platform: "facebook", username: u };
    }
  }

  const igPatterns = [
    /(?:https?:\/\/)?(?:www\.)?instagram\.com\/([a-zA-Z0-9._]+)\/?/i,
    /(?:https?:\/\/)?(?:www\.)?instagr\.am\/([a-zA-Z0-9._]+)\/?/i,
  ];
  const igBlacklist = ["p","reel","stories","explore","direct","accounts","about"];
  for (const pattern of igPatterns) {
    const match = trimmed.match(pattern);
    if (match?.[1]) {
      const u = match[1];
      if (igBlacklist.includes(u.toLowerCase())) continue;
      return { platform: "instagram", username: u };
    }
  }

  return null;
}

export default function SupporterRegister() {
  const { clientId } = useParams<{ clientId: string }>();
  const [name, setName] = useState("");
  const [facebookUrl, setFacebookUrl] = useState("");
  const [instagramUrl, setInstagramUrl] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [linkedProfiles, setLinkedProfiles] = useState<ParsedProfile[]>([]);
  const [error, setError] = useState("");

  // Real-time parse preview
  const fbParsed = parseProfileUrl(facebookUrl);
  const igParsed = parseProfileUrl(instagramUrl);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Por favor, informe seu nome.");
      return;
    }
    if (!facebookUrl.trim() && !instagramUrl.trim()) {
      setError("Por favor, informe pelo menos um perfil (Facebook ou Instagram).");
      return;
    }
    if (facebookUrl.trim() && !fbParsed) {
      setError("O link do Facebook não foi reconhecido. Cole o link completo do seu perfil.");
      return;
    }
    if (instagramUrl.trim() && !igParsed) {
      setError("O link do Instagram não foi reconhecido. Cole o link completo do seu perfil.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const { data, error: fnError } = await supabase.functions.invoke("register-supporter", {
        body: {
          client_id: clientId,
          name: name.trim(),
          facebook_url: facebookUrl.trim() || null,
          instagram_url: instagramUrl.trim() || null,
          phone: phone.trim() || null,
          notes: notes.trim() || null,
        },
      });

      if (fnError) throw fnError;

      if (data?.success) {
        const profiles: ParsedProfile[] = [];
        if (fbParsed) profiles.push(fbParsed);
        if (igParsed) profiles.push(igParsed);
        setLinkedProfiles(profiles);
        setSuccess(true);
        setSuccessMessage(data.message);
      } else {
        setError(data?.error || "Erro ao cadastrar. Tente novamente.");
      }
    } catch (err: any) {
      console.error("Registration error:", err);
      setError("Erro ao conectar. Verifique sua conexão e tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-primary/5 to-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md text-center">
          <CardContent className="pt-10 pb-10 space-y-5">
            <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8 text-emerald-600" />
            </div>
            <h2 className="text-2xl font-bold text-foreground">Cadastro Realizado! 🎉</h2>
            <p className="text-muted-foreground">{successMessage}</p>

            {linkedProfiles.length > 0 && (
              <div className="bg-muted/50 rounded-lg p-4 text-left space-y-2">
                <p className="text-sm font-medium text-foreground">Perfis vinculados com sucesso:</p>
                {linkedProfiles.map((p, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    {p.platform === "facebook" ? (
                      <Facebook className="w-4 h-4 text-blue-600 shrink-0" />
                    ) : (
                      <Instagram className="w-4 h-4 text-pink-500 shrink-0" />
                    )}
                    <span className="font-medium capitalize">{p.platform}:</span>
                    <span className="text-muted-foreground">{p.username}</span>
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 ml-auto shrink-0" />
                  </div>
                ))}
              </div>
            )}

            <p className="text-sm text-muted-foreground">
              Agora interaja nas publicações para ganhar pontos de engajamento! 🚀
            </p>

            <Button asChild className="w-full mt-2">
              <a href={`/portal/${clientId}`}>
                Acessar Portal do Apoiador
              </a>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary/5 to-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-2">
          <div className="w-14 h-14 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
            <UserPlus className="w-7 h-7 text-primary" />
          </div>
          <CardTitle className="text-xl">Cadastro de Apoiador</CardTitle>
          <CardDescription>
            Cole os links dos seus perfis — vamos vincular automaticamente para rastrear seu engajamento.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Seu nome completo *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: João da Silva"
                required
              />
            </div>

            {/* Facebook */}
            <div className="space-y-2">
              <Label htmlFor="facebook" className="flex items-center gap-2">
                <Facebook className="w-4 h-4 text-blue-600" />
                Link do Facebook
              </Label>
              <Input
                id="facebook"
                value={facebookUrl}
                onChange={(e) => { setFacebookUrl(e.target.value); setError(""); }}
                placeholder="https://facebook.com/seu.perfil"
              />
              {/* Preview */}
              {facebookUrl.trim() && (
                <div className={`flex items-center gap-2 text-xs px-3 py-2 rounded-md ${fbParsed ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400' : 'bg-destructive/10 text-destructive'}`}>
                  {fbParsed ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                      <span>Identificado: <strong>{fbParsed.username}</strong></span>
                    </>
                  ) : (
                    <>
                      <XCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>Link não reconhecido. Use o link completo do perfil (ex: facebook.com/joao.silva)</span>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Instagram */}
            <div className="space-y-2">
              <Label htmlFor="instagram" className="flex items-center gap-2">
                <Instagram className="w-4 h-4 text-pink-500" />
                Link do Instagram
              </Label>
              <Input
                id="instagram"
                value={instagramUrl}
                onChange={(e) => { setInstagramUrl(e.target.value); setError(""); }}
                placeholder="https://instagram.com/seu.perfil"
              />
              {instagramUrl.trim() && (
                <div className={`flex items-center gap-2 text-xs px-3 py-2 rounded-md ${igParsed ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400' : 'bg-destructive/10 text-destructive'}`}>
                  {igParsed ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                      <span>Identificado: <strong>@{igParsed.username}</strong></span>
                    </>
                  ) : (
                    <>
                      <XCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>Link não reconhecido. Use o link completo (ex: instagram.com/joao.silva)</span>
                    </>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone" className="flex items-center gap-2">
                <Phone className="w-4 h-4 text-muted-foreground" />
                Telefone (opcional)
              </Label>
              <Input
                id="phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(11) 99999-9999"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes" className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-muted-foreground" />
                Observação (opcional)
              </Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Bairro, cidade, como soube de nós..."
                maxLength={300}
              />
            </div>

            {/* Summary before submit */}
            {(fbParsed || igParsed) && (
              <div className="bg-muted/50 rounded-lg p-3 space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Resumo do cadastro</p>
                {fbParsed && (
                  <div className="flex items-center gap-2 text-sm">
                    <Facebook className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                    <span className="text-muted-foreground">Facebook:</span>
                    <Badge variant="secondary" className="text-xs">{fbParsed.username}</Badge>
                  </div>
                )}
                {igParsed && (
                  <div className="flex items-center gap-2 text-sm">
                    <Instagram className="w-3.5 h-3.5 text-pink-500 shrink-0" />
                    <span className="text-muted-foreground">Instagram:</span>
                    <Badge variant="secondary" className="text-xs">@{igParsed.username}</Badge>
                  </div>
                )}
              </div>
            )}

            {error && (
              <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 p-3 rounded-md">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <p>{error}</p>
              </div>
            )}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Cadastrando...</>
              ) : (
                <><UserPlus className="w-4 h-4 mr-2" />Cadastrar como Apoiador Ativo</>
              )}
            </Button>

            <p className="text-xs text-center text-muted-foreground">
              Ao se cadastrar, você confirma sua participação como apoiador ativo.
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
