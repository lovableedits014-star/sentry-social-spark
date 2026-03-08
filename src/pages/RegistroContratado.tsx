import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, AlertCircle, MapPin, Phone, FileText, MessageCircle, Briefcase, ScrollText, Download } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";

// Reuse SocialLinkCapture pattern inline (simplified for contratado)
interface SocialEntry {
  plataforma: string;
  usuario: string;
  url_perfil: string;
}

export default function RegistroContratado() {
  const { clientId, liderId } = useParams<{ clientId: string; liderId: string }>();
  const [clientName, setClientName] = useState("");
  const [liderName, setLiderName] = useState("");
  const [whatsappOficial, setWhatsappOficial] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingClient, setLoadingClient] = useState(true);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const [step, setStep] = useState<"form" | "contract">("form");

  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [email, setEmail] = useState("");
  const [cidade, setCidade] = useState("");
  const [bairro, setBairro] = useState("");
  const [endereco, setEndereco] = useState("");
  const [zonaEleitoral, setZonaEleitoral] = useState("");
  const [notas, setNotas] = useState("");
  const [contratoAceito, setContratoAceito] = useState(false);

  useEffect(() => {
    if (!clientId) return;
    Promise.all([
      supabase.from("clients").select("name, whatsapp_oficial").eq("id", clientId).maybeSingle(),
      liderId ? supabase.from("pessoas").select("nome").eq("id", liderId).maybeSingle() : Promise.resolve({ data: null }),
    ]).then(([clientRes, liderRes]) => {
      if (clientRes.data) {
        setClientName(clientRes.data.name);
        setWhatsappOficial((clientRes.data as any).whatsapp_oficial || "");
      }
      if (liderRes.data) setLiderName((liderRes.data as any).nome || "");
      setLoadingClient(false);
    });
  }, [clientId, liderId]);

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim()) { setError("Informe seu nome."); return; }
    if (!telefone.trim()) { setError("Informe seu telefone."); return; }
    if (!cidade.trim()) { setError("Informe sua cidade."); return; }
    if (!zonaEleitoral.trim()) { setError("Informe sua zona eleitoral."); return; }
    setError("");
    setStep("contract");
  };

  const handleContractAccept = async () => {
    if (!contratoAceito) { setError("Você precisa aceitar o contrato para continuar."); return; }
    setLoading(true);
    setError("");

    const { error: insertError } = await supabase.from("contratados").insert({
      client_id: clientId!,
      lider_id: liderId || null,
      nome: nome.trim(),
      telefone: telefone.trim(),
      email: email.trim() || null,
      endereco: endereco.trim() || null,
      cidade: cidade.trim(),
      bairro: bairro.trim() || null,
      zona_eleitoral: zonaEleitoral.trim(),
      contrato_aceito: true,
      contrato_aceito_em: new Date().toISOString(),
      notas: notas.trim() || null,
    } as any);

    if (insertError) {
      console.error("Registration error:", insertError);
      setError("Erro ao realizar cadastro. Tente novamente.");
    } else {
      setSuccess(true);
    }
    setLoading(false);
  };

  const generateContractText = () => {
    const today = new Date().toLocaleDateString("pt-BR");
    return `CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE MOBILIZAÇÃO DIGITAL

Data: ${today}

CONTRATADO(A):
Nome: ${nome.trim()}
Telefone: ${telefone.trim()}
Endereço: ${endereco.trim() || "Não informado"}
Cidade: ${cidade.trim()}
Bairro: ${bairro.trim() || "Não informado"}
Zona Eleitoral: ${zonaEleitoral.trim()}
${liderName ? `Indicado por: ${liderName}` : ""}

CONTRATANTE: ${clientName}

OBJETO DO CONTRATO:
O(A) CONTRATADO(A) se compromete a prestar serviços de mobilização digital, incluindo:
1. Interação em publicações nas redes sociais conforme missões recebidas;
2. Indicação de contatos de potenciais apoiadores com nome e telefone;
3. Cumprimento das metas de indicação estabelecidas pelo contratante.

OBRIGAÇÕES:
- Realizar as missões enviadas via WhatsApp dentro do prazo solicitado;
- Fornecer indicações verdadeiras e verificáveis;
- Manter sigilo sobre estratégias e informações internas da campanha.

VIGÊNCIA:
Este contrato tem vigência a partir da data de aceite digital até o término do período eleitoral ou rescisão por qualquer das partes.

Ao aceitar digitalmente, o(a) CONTRATADO(A) declara ter lido e concordado com todos os termos acima.`;
  };

  const handleDownloadPDF = () => {
    const text = generateContractText();
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `contrato-${nome.trim().replace(/\s+/g, "-").toLowerCase()}-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
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
            <p className="text-sm text-muted-foreground mt-2">Este link de cadastro não é válido.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (success) {
    const whatsappLink = whatsappOficial
      ? `https://wa.me/${whatsappOficial}?text=${encodeURIComponent(`Olá! Acabei de me cadastrar como contratado(a). Meu nome é ${nome.trim()}.${liderName ? ` Fui indicado(a) por ${liderName}.` : ""}`)}`
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
              Seu cadastro como contratado foi registrado com sucesso.
            </p>
            <Button variant="outline" onClick={handleDownloadPDF} className="w-full gap-2">
              <Download className="w-4 h-4" />
              Baixar Contrato
            </Button>
            {whatsappLink && (
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
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (step === "contract") {
    return (
      <div className="min-h-screen bg-gradient-to-b from-primary/5 to-background flex items-center justify-center p-4">
        <Card className="w-full max-w-lg">
          <CardHeader className="text-center space-y-2">
            <div className="w-14 h-14 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
              <ScrollText className="w-7 h-7 text-primary" />
            </div>
            <CardTitle className="text-xl">Contrato de Trabalho</CardTitle>
            <CardDescription>Leia e aceite o contrato para finalizar seu cadastro</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-muted/50 border rounded-lg p-4 max-h-64 overflow-y-auto">
              <pre className="text-xs whitespace-pre-wrap font-sans text-muted-foreground leading-relaxed">
                {generateContractText()}
              </pre>
            </div>

            <div className="flex items-start gap-3 p-3 rounded-lg border bg-background">
              <Checkbox
                id="aceite"
                checked={contratoAceito}
                onCheckedChange={(c) => { setContratoAceito(!!c); setError(""); }}
              />
              <label htmlFor="aceite" className="text-sm leading-snug cursor-pointer">
                Li e aceito todos os termos do contrato de prestação de serviços acima.
              </label>
            </div>

            {error && (
              <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 p-3 rounded-md">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <p>{error}</p>
              </div>
            )}

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep("form")} className="flex-1">Voltar</Button>
              <Button onClick={handleContractAccept} disabled={loading} className="flex-1">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Aceitar e Cadastrar"}
              </Button>
            </div>
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
            <Briefcase className="w-7 h-7 text-primary" />
          </div>
          <CardTitle className="text-xl">Cadastro de Contratado</CardTitle>
          <CardDescription>
            {liderName
              ? `Indicado por ${liderName} — Base de ${clientName}`
              : `Preencha seus dados para trabalhar com ${clientName}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleFormSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="nome">Nome completo *</Label>
              <Input id="nome" value={nome} onChange={(e) => { setNome(e.target.value); setError(""); }} placeholder="Ex: João da Silva" required />
            </div>

            <div className="space-y-2">
              <Label htmlFor="telefone" className="flex items-center gap-2">
                <Phone className="w-4 h-4 text-muted-foreground" />
                Telefone / WhatsApp *
              </Label>
              <Input id="telefone" value={telefone} onChange={(e) => { setTelefone(e.target.value); setError(""); }} placeholder="(67) 99999-9999" required />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">E-mail (opcional)</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="seu@email.com" />
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-muted-foreground" />
                Localização *
              </Label>
              <div className="grid grid-cols-2 gap-2">
                <Input value={cidade} onChange={(e) => { setCidade(e.target.value); setError(""); }} placeholder="Cidade *" required />
                <Input value={bairro} onChange={(e) => setBairro(e.target.value)} placeholder="Bairro" />
              </div>
              <Input value={endereco} onChange={(e) => setEndereco(e.target.value)} placeholder="Endereço completo" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="zona" className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-muted-foreground" />
                Zona Eleitoral *
              </Label>
              <Input id="zona" value={zonaEleitoral} onChange={(e) => { setZonaEleitoral(e.target.value); setError(""); }} placeholder="Ex: 52ª Zona" required />
              <p className="text-xs text-muted-foreground">Encontre no seu título de eleitor ou no app e-Título</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notas" className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-muted-foreground" />
                Observação (opcional)
              </Label>
              <Textarea id="notas" value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Ex: Disponível para trabalho noturno..." maxLength={500} />
            </div>

            {error && (
              <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 p-3 rounded-md">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <p>{error}</p>
              </div>
            )}

            <Button type="submit" className="w-full">
              <Briefcase className="w-4 h-4 mr-2" />
              Prosseguir para o Contrato
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
