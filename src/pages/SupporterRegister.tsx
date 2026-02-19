import { useState } from "react";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Facebook, Instagram, CheckCircle2, Loader2, UserPlus, Phone, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

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
  const [error, setError] = useState("");

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
          <CardContent className="pt-10 pb-10 space-y-4">
            <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8 text-emerald-600" />
            </div>
            <h2 className="text-2xl font-bold text-foreground">Cadastro Realizado!</h2>
            <p className="text-muted-foreground">{successMessage}</p>
            <p className="text-sm text-muted-foreground mt-4">
              Agora interaja nas publicações para ganhar pontos de engajamento! 🚀
            </p>
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
            Preencha seus dados para se cadastrar como apoiador. Vincule suas redes sociais para participar!
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

            <div className="space-y-2">
              <Label htmlFor="facebook" className="flex items-center gap-2">
                <Facebook className="w-4 h-4 text-blue-600" />
                Perfil do Facebook
              </Label>
              <Input
                id="facebook"
                value={facebookUrl}
                onChange={(e) => setFacebookUrl(e.target.value)}
                placeholder="https://facebook.com/seu.perfil"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="instagram" className="flex items-center gap-2">
                <Instagram className="w-4 h-4 text-pink-500" />
                Perfil do Instagram
              </Label>
              <Input
                id="instagram"
                value={instagramUrl}
                onChange={(e) => setInstagramUrl(e.target.value)}
                placeholder="https://instagram.com/seu.perfil"
              />
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

            {error && (
              <p className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">{error}</p>
            )}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Cadastrando...</>
              ) : (
                <><UserPlus className="w-4 h-4 mr-2" />Cadastrar como Apoiador</>
              )}
            </Button>

            <p className="text-xs text-center text-muted-foreground">
              Ao se cadastrar, você autoriza o recebimento de mensagens sobre novas publicações.
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
