import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserPlus, Loader2, CheckCircle2, AlertCircle, MapPin, Phone, FileText, MessageCircle } from "lucide-react";

const UF_OPTIONS = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];

const TIPO_OPTIONS = [
  { value: "eleitor", label: "Eleitor" },
  { value: "apoiador", label: "Apoiador" },
  { value: "lideranca", label: "Liderança Comunitária" },
  { value: "voluntario", label: "Voluntário" },
  { value: "cidadao", label: "Cidadão" },
];

export default function RegistroPessoa() {
  const { clientId } = useParams<{ clientId: string }>();
  const [clientName, setClientName] = useState("");
  const [whatsappOficial, setWhatsappOficial] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingClient, setLoadingClient] = useState(true);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  // Form fields
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [email, setEmail] = useState("");
  const [cidade, setCidade] = useState("");
  const [bairro, setBairro] = useState("");
  const [endereco, setEndereco] = useState("");
  const [tipoPessoa, setTipoPessoa] = useState("cidadao");
  const [notas, setNotas] = useState("");

  useEffect(() => {
    if (!clientId) return;
    supabase
      .from("clients")
      .select("name, whatsapp_oficial")
      .eq("id", clientId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setClientName(data.name);
          setWhatsappOficial((data as any).whatsapp_oficial || "");
        }
        setLoadingClient(false);
      });
  }, [clientId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim()) { setError("Informe seu nome."); return; }
    if (!telefone.trim()) { setError("Informe seu telefone."); return; }
    if (!cidade.trim()) { setError("Informe sua cidade."); return; }
    if (!bairro.trim()) { setError("Informe seu bairro."); return; }

    setLoading(true);
    setError("");

    const { error: insertError } = await supabase.from("pessoas").insert({
      client_id: clientId!,
      nome: nome.trim(),
      telefone: telefone.trim(),
      email: email.trim() || null,
      cidade: cidade.trim(),
      bairro: bairro.trim(),
      endereco: endereco.trim() || null,
      tipo_pessoa: tipoPessoa as any,
      nivel_apoio: "simpatizante" as any,
      origem_contato: "formulario" as any,
      notas_internas: notas.trim() || null,
    });

    if (insertError) {
      console.error(insertError);
      setError("Erro ao realizar cadastro. Tente novamente.");
    } else {
      setSuccess(true);
    }
    setLoading(false);
  };

  if (loadingClient) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-primary/5 to-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!clientName) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-primary/5 to-background p-4">
        <Card className="w-full max-w-md text-center">
          <CardContent className="py-10">
            <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
            <p className="text-lg font-medium">Link inválido</p>
            <p className="text-sm text-muted-foreground mt-2">Este link de cadastro não é válido ou expirou.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (success) {
    const whatsappLink = whatsappOficial
      ? `https://wa.me/${whatsappOficial}?text=${encodeURIComponent(`Olá! Acabei de me cadastrar como apoiador(a). Meu nome é ${nome.trim()}.`)}`
      : "";

    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-primary/5 to-background p-4">
        <Card className="w-full max-w-md text-center">
          <CardContent className="py-10 space-y-5">
            <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-950/30 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8 text-emerald-600" />
            </div>
            <h2 className="text-2xl font-bold">Cadastro Realizado! 🎉</h2>
            <p className="text-muted-foreground">
              Seu cadastro foi registrado com sucesso na base de {clientName}.
            </p>

            {whatsappLink ? (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Para confirmar seu cadastro, envie uma mensagem pelo WhatsApp:
                </p>
                <Button asChild size="lg" className="w-full gap-2 bg-green-600 hover:bg-green-700 text-white">
                  <a href={whatsappLink} target="_blank" rel="noopener noreferrer">
                    <MessageCircle className="w-5 h-5" />
                    Confirmar no WhatsApp
                  </a>
                </Button>
                <p className="text-xs text-muted-foreground">
                  Ao iniciar a conversa, você autoriza o recebimento de comunicações da campanha.
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Obrigado por se cadastrar! Em breve entraremos em contato.
              </p>
            )}
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
            Preencha seus dados para fazer parte da base de apoio de {clientName}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="nome">Nome completo *</Label>
              <Input
                id="nome"
                value={nome}
                onChange={(e) => { setNome(e.target.value); setError(""); }}
                placeholder="Ex: Maria da Silva"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="telefone" className="flex items-center gap-2">
                <Phone className="w-4 h-4 text-muted-foreground" />
                Telefone / WhatsApp *
              </Label>
              <Input
                id="telefone"
                value={telefone}
                onChange={(e) => { setTelefone(e.target.value); setError(""); }}
                placeholder="(67) 99999-9999"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">E-mail (opcional)</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com"
              />
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-muted-foreground" />
                Localização *
              </Label>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  value={cidade}
                  onChange={(e) => { setCidade(e.target.value); setError(""); }}
                  placeholder="Cidade *"
                  required
                />
                <Input
                  value={bairro}
                  onChange={(e) => { setBairro(e.target.value); setError(""); }}
                  placeholder="Bairro *"
                  required
                />
              </div>
              <Input
                value={endereco}
                onChange={(e) => setEndereco(e.target.value)}
                placeholder="Endereço (opcional)"
              />
            </div>

            <div className="space-y-2">
              <Label>Como você se identifica?</Label>
              <Select value={tipoPessoa} onValueChange={setTipoPessoa}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIPO_OPTIONS.map(t => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notas" className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-muted-foreground" />
                Observação (opcional)
              </Label>
              <Textarea
                id="notas"
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                placeholder="Ex: Líder do bairro Jardim, disponível para eventos..."
                maxLength={500}
              />
            </div>

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
                <><UserPlus className="w-4 h-4 mr-2" />Cadastrar</>
              )}
            </Button>

            <p className="text-xs text-center text-muted-foreground">
              Ao se cadastrar, você autoriza o armazenamento dos seus dados para fins de comunicação política.
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
