import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { UserPlus, Loader2, CheckCircle2, AlertCircle, MapPin, Phone, FileText, MessageCircle, Facebook, Instagram, ClipboardPaste, X, Check } from "lucide-react";

const UF_OPTIONS = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];

const TIPO_OPTIONS = [
  { value: "eleitor", label: "Eleitor" },
  { value: "apoiador", label: "Apoiador" },
  { value: "lideranca", label: "Liderança Comunitária" },
  { value: "voluntario", label: "Voluntário" },
  { value: "cidadao", label: "Cidadão" },
];

interface SocialEntry {
  plataforma: string;
  usuario: string;
  url_perfil: string;
}

const SOCIAL_PLATFORMS = [
  {
    id: "instagram",
    label: "Instagram",
    icon: Instagram,
    color: "text-pink-500",
    bgColor: "bg-pink-50 dark:bg-pink-950/20 border-pink-200 dark:border-pink-800",
    activeBg: "bg-pink-100 dark:bg-pink-950/40",
    steps: [
      "Abra o app do Instagram",
      "Vá no seu perfil (ícone no canto inferior direito)",
      "Toque nos 3 pontinhos ⋯ ou no menu ☰",
      'Toque em "Copiar link do perfil"',
      "Volte aqui e cole no campo abaixo",
    ],
    parse: (input: string): { usuario: string; url: string } | null => {
      // Handle full URLs
      const urlMatch = input.match(/(?:https?:\/\/)?(?:www\.)?instagram\.com\/([a-zA-Z0-9._]+)/i);
      if (urlMatch) return { usuario: urlMatch[1], url: `https://instagram.com/${urlMatch[1]}` };
      // Handle @username or plain username
      const clean = input.trim().replace(/^@/, "").replace(/\/$/, "");
      if (clean && /^[a-zA-Z0-9._]+$/.test(clean)) return { usuario: clean, url: `https://instagram.com/${clean}` };
      return null;
    },
  },
  {
    id: "facebook",
    label: "Facebook",
    icon: Facebook,
    color: "text-blue-600",
    bgColor: "bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800",
    activeBg: "bg-blue-100 dark:bg-blue-950/40",
    steps: [
      "Abra o app do Facebook",
      "Vá no seu perfil (toque na sua foto)",
      "Toque nos 3 pontinhos ⋯",
      'Toque em "Copiar link do perfil"',
      "Volte aqui e cole no campo abaixo",
    ],
    parse: (input: string): { usuario: string; url: string } | null => {
      const urlMatch = input.match(/(?:https?:\/\/)?(?:www\.|m\.)?facebook\.com\/(?:profile\.php\?id=)?([a-zA-Z0-9.]+)/i);
      if (urlMatch) return { usuario: urlMatch[1], url: input.trim() };
      const clean = input.trim().replace(/\/$/, "");
      if (clean && /^[a-zA-Z0-9.]+$/.test(clean)) return { usuario: clean, url: `https://facebook.com/${clean}` };
      return null;
    },
  },
  {
    id: "tiktok",
    label: "TikTok",
    icon: () => (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
        <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.27 6.27 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.34-6.34V8.75a8.18 8.18 0 0 0 4.76 1.52V6.84a4.84 4.84 0 0 1-1-.15Z" />
      </svg>
    ),
    color: "text-foreground",
    bgColor: "bg-muted/50 border-border",
    activeBg: "bg-muted",
    steps: [
      "Abra o app do TikTok",
      "Vá no seu perfil (ícone de pessoa)",
      "Toque nos 3 pontinhos ⋯ ou em ☰",
      'Toque em "Compartilhar perfil" → "Copiar link"',
      "Volte aqui e cole no campo abaixo",
    ],
    parse: (input: string): { usuario: string; url: string } | null => {
      const urlMatch = input.match(/(?:https?:\/\/)?(?:www\.|vm\.)?tiktok\.com\/@?([a-zA-Z0-9._]+)/i);
      if (urlMatch) return { usuario: urlMatch[1], url: `https://tiktok.com/@${urlMatch[1]}` };
      const clean = input.trim().replace(/^@/, "").replace(/\/$/, "");
      if (clean && /^[a-zA-Z0-9._]+$/.test(clean)) return { usuario: clean, url: `https://tiktok.com/@${clean}` };
      return null;
    },
  },
];

function SocialLinkCapture({ onSocialsChange }: { onSocialsChange: (socials: SocialEntry[]) => void }) {
  const [activePlatform, setActivePlatform] = useState<string | null>(null);
  const [pasteValue, setPasteValue] = useState("");
  const [captured, setCaptured] = useState<Record<string, SocialEntry>>({});
  const [parseError, setParseError] = useState(false);

  function handlePaste(platformId: string) {
    const platform = SOCIAL_PLATFORMS.find(p => p.id === platformId);
    if (!platform) return;
    const result = platform.parse(pasteValue);
    if (result) {
      const newCaptured = { ...captured, [platformId]: { plataforma: platformId, usuario: result.usuario, url_perfil: result.url } };
      setCaptured(newCaptured);
      onSocialsChange(Object.values(newCaptured));
      setPasteValue("");
      setActivePlatform(null);
      setParseError(false);
    } else {
      setParseError(true);
    }
  }

  function handleRemove(platformId: string) {
    const newCaptured = { ...captured };
    delete newCaptured[platformId];
    setCaptured(newCaptured);
    onSocialsChange(Object.values(newCaptured));
  }

  async function handleClipboardPaste(platformId: string) {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setPasteValue(text);
        // Auto-try to parse immediately
        const platform = SOCIAL_PLATFORMS.find(p => p.id === platformId);
        if (platform) {
          const result = platform.parse(text);
          if (result) {
            const newCaptured = { ...captured, [platformId]: { plataforma: platformId, usuario: result.usuario, url_perfil: result.url } };
            setCaptured(newCaptured);
            onSocialsChange(Object.values(newCaptured));
            setPasteValue("");
            setActivePlatform(null);
            setParseError(false);
            return;
          }
        }
      }
    } catch {
      // Clipboard API not available, user will paste manually
    }
  }

  return (
    <div className="space-y-3">
      <Label className="text-sm font-medium">Redes Sociais (opcional)</Label>
      <p className="text-xs text-muted-foreground">Toque na rede social, siga as instruções e cole o link do seu perfil.</p>
      
      <div className="flex flex-wrap gap-2">
        {SOCIAL_PLATFORMS.map((p) => {
          const Icon = p.icon;
          const isCaptured = !!captured[p.id];
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                if (isCaptured) return;
                setActivePlatform(activePlatform === p.id ? null : p.id);
                setPasteValue("");
                setParseError(false);
              }}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-all ${
                isCaptured
                  ? "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-400"
                  : activePlatform === p.id
                  ? `${p.activeBg} border-2 ${p.color}`
                  : `${p.bgColor} ${p.color} hover:opacity-80`
              }`}
            >
              <Icon className="w-4 h-4" />
              {p.label}
              {isCaptured && <Check className="w-3.5 h-3.5" />}
            </button>
          );
        })}
      </div>

      {/* Captured badges */}
      {Object.entries(captured).map(([platformId, entry]) => {
        const platform = SOCIAL_PLATFORMS.find(p => p.id === platformId);
        if (!platform) return null;
        const Icon = platform.icon;
        return (
          <div key={platformId} className="flex items-center gap-2 p-2 rounded-md bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800">
            <Icon className="w-4 h-4 text-emerald-600" />
            <span className="text-sm text-emerald-700 dark:text-emerald-400 flex-1 truncate">@{entry.usuario}</span>
            <button type="button" onClick={() => handleRemove(platformId)} className="text-muted-foreground hover:text-destructive p-0.5">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}

      {/* Active platform instructions */}
      {activePlatform && !captured[activePlatform] && (() => {
        const platform = SOCIAL_PLATFORMS.find(p => p.id === activePlatform);
        if (!platform) return null;
        const Icon = platform.icon;
        return (
          <div className={`rounded-lg border-2 p-4 space-y-3 ${platform.bgColor} animate-in slide-in-from-top-2 duration-200`}>
            <div className="flex items-center gap-2">
              <Icon className={`w-5 h-5 ${platform.color}`} />
              <span className="font-medium text-sm">Como copiar seu link do {platform.label}:</span>
            </div>
            <ol className="space-y-1.5 text-xs text-muted-foreground list-decimal pl-5">
              {platform.steps.map((step, i) => (
                <li key={i} className={i === platform.steps.length - 1 ? "font-medium text-foreground" : ""}>{step}</li>
              ))}
            </ol>
            <div className="flex gap-2">
              <Input
                value={pasteValue}
                onChange={(e) => { setPasteValue(e.target.value); setParseError(false); }}
                placeholder="Cole o link aqui..."
                className="flex-1 bg-background"
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handlePaste(activePlatform))}
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="gap-1.5 shrink-0"
                onClick={() => handleClipboardPaste(activePlatform)}
              >
                <ClipboardPaste className="w-3.5 h-3.5" />
                Colar
              </Button>
            </div>
            {pasteValue && (
              <Button
                type="button"
                size="sm"
                className="w-full"
                onClick={() => handlePaste(activePlatform)}
              >
                <Check className="w-4 h-4 mr-1.5" />
                Confirmar
              </Button>
            )}
            {parseError && (
              <p className="text-xs text-destructive">Não conseguimos identificar o perfil. Cole o link completo do seu perfil.</p>
            )}
          </div>
        );
      })()}
    </div>
  );
}

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
  const [socials, setSocials] = useState<SocialEntry[]>([]);

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

    const { data: pessoaData, error: insertError } = await supabase.from("pessoas").insert({
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
    }).select("id").single();

    if (insertError) {
      console.error(insertError);
      setError("Erro ao realizar cadastro. Tente novamente.");
    } else if (pessoaData) {
      // Insert social profiles
      if (socials.length > 0) {
        const socialRows = socials.map(s => ({
          pessoa_id: pessoaData.id,
          plataforma: s.plataforma,
          usuario: s.usuario,
          url_perfil: s.url_perfil,
        }));
        await supabase.from("pessoa_social").insert(socialRows);
      }
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

            {/* Redes Sociais - novo componente guiado */}
            <SocialLinkCapture onSocialsChange={setSocials} />

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
