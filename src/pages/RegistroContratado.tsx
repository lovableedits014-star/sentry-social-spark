import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Loader2, CheckCircle2, AlertCircle, MapPin, Phone, FileText,
  MessageCircle, Briefcase, Eye, EyeOff, Mail, Lock,
  Instagram, Facebook, ClipboardPaste, X, Check, ChevronDown, ChevronUp,
} from "lucide-react";

// ─── Social Link Capture (reused from RegistroPessoa pattern) ────────────────
interface SocialEntry { plataforma: string; usuario: string; url_perfil: string; }

const TikTokIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
    <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.27 6.27 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.34-6.34V8.75a8.18 8.18 0 0 0 4.76 1.52V6.84a4.84 4.84 0 0 1-1-.15Z" />
  </svg>
);

const SOCIAL_PLATFORMS = [
  {
    id: "instagram", label: "Instagram", icon: Instagram, color: "text-pink-500",
    bgColor: "bg-pink-50 dark:bg-pink-950/20 border-pink-200 dark:border-pink-800",
    activeBg: "bg-pink-100 dark:bg-pink-950/40", emoji: "📸",
    steps: [
      { text: "Abra o Instagram no celular", emoji: "📱" },
      { text: "Vá ao seu perfil (ícone no canto inferior direito)", emoji: "👤" },
      { text: "Toque nos 3 pontinhos ⋯ ou ☰", emoji: "⚙️" },
      { text: 'Toque em "Copiar link do perfil"', emoji: "🔗" },
      { text: "Volte aqui e toque COLAR 👇", emoji: "✅" },
    ],
    parse: (input: string) => {
      const m = input.match(/(?:https?:\/\/)?(?:www\.)?instagram\.com\/([a-zA-Z0-9._]+)/i);
      if (m) return { usuario: m[1], url: `https://instagram.com/${m[1]}` };
      const c = input.trim().replace(/^@/, "").replace(/\/$/, "");
      if (c && /^[a-zA-Z0-9._]+$/.test(c)) return { usuario: c, url: `https://instagram.com/${c}` };
      return null;
    },
  },
  {
    id: "facebook", label: "Facebook", icon: Facebook, color: "text-blue-600",
    bgColor: "bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800",
    activeBg: "bg-blue-100 dark:bg-blue-950/40", emoji: "👍",
    steps: [
      { text: "Abra o Facebook no celular", emoji: "📱" },
      { text: "Vá ao seu perfil", emoji: "👤" },
      { text: "Toque nos 3 pontinhos ⋯", emoji: "⚙️" },
      { text: 'Toque em "Copiar link"', emoji: "🔗" },
      { text: "Volte aqui e toque COLAR 👇", emoji: "✅" },
    ],
    parse: (input: string) => {
      const m = input.match(/(?:https?:\/\/)?(?:www\.|m\.)?facebook\.com\/(?:profile\.php\?id=)?([a-zA-Z0-9.]+)/i);
      if (m) return { usuario: m[1], url: input.trim() };
      const c = input.trim().replace(/\/$/, "");
      if (c && /^[a-zA-Z0-9.]+$/.test(c)) return { usuario: c, url: `https://facebook.com/${c}` };
      return null;
    },
  },
  {
    id: "tiktok", label: "TikTok", icon: TikTokIcon, color: "text-foreground",
    bgColor: "bg-muted/50 border-border", activeBg: "bg-muted", emoji: "🎵",
    steps: [
      { text: "Abra o TikTok no celular", emoji: "📱" },
      { text: 'Vá em "Perfil"', emoji: "👤" },
      { text: "Toque ☰ → Compartilhar perfil → Copiar link", emoji: "🔗" },
      { text: "Volte aqui e toque COLAR 👇", emoji: "✅" },
    ],
    parse: (input: string) => {
      const m = input.match(/(?:https?:\/\/)?(?:www\.|vm\.)?tiktok\.com\/@?([a-zA-Z0-9._]+)/i);
      if (m) return { usuario: m[1], url: `https://tiktok.com/@${m[1]}` };
      const c = input.trim().replace(/^@/, "").replace(/\/$/, "");
      if (c && /^[a-zA-Z0-9._]+$/.test(c)) return { usuario: c, url: `https://tiktok.com/@${c}` };
      return null;
    },
  },
];

function SocialLinkCapture({ onSocialsChange }: { onSocialsChange: (s: SocialEntry[]) => void }) {
  const [activePlatform, setActivePlatform] = useState<string | null>(null);
  const [pasteValue, setPasteValue] = useState("");
  const [captured, setCaptured] = useState<Record<string, SocialEntry>>({});
  const [parseError, setParseError] = useState(false);
  const [pasteSuccess, setPasteSuccess] = useState(false);

  function handleConfirm(pid: string, value: string) {
    const p = SOCIAL_PLATFORMS.find(x => x.id === pid);
    if (!p) return;
    const r = p.parse(value);
    if (r) {
      const n = { ...captured, [pid]: { plataforma: pid, usuario: r.usuario, url_perfil: r.url } };
      setCaptured(n); onSocialsChange(Object.values(n));
      setPasteValue(""); setActivePlatform(null); setParseError(false); setPasteSuccess(false);
    } else { setParseError(true); setPasteSuccess(false); }
  }

  function handleRemove(pid: string) {
    const n = { ...captured }; delete n[pid]; setCaptured(n); onSocialsChange(Object.values(n));
  }

  async function handlePaste(pid: string) {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setPasteValue(text); setPasteSuccess(true); setParseError(false);
        const p = SOCIAL_PLATFORMS.find(x => x.id === pid);
        if (p?.parse(text)) setTimeout(() => handleConfirm(pid, text), 600);
      }
    } catch {}
  }

  return (
    <div className="space-y-3">
      <Label className="text-sm font-medium">Redes Sociais (opcional)</Label>
      <p className="text-xs text-muted-foreground">Conecte suas redes para receber missões de interação 😊</p>
      <div className="flex flex-wrap gap-2">
        {SOCIAL_PLATFORMS.map(p => {
          const Icon = p.icon; const done = !!captured[p.id];
          return (
            <button key={p.id} type="button"
              onClick={() => { if (done) return; setActivePlatform(activePlatform === p.id ? null : p.id); setPasteValue(""); setParseError(false); setPasteSuccess(false); }}
              className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium transition-all ${done ? "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-300 text-emerald-700" : activePlatform === p.id ? `${p.activeBg} border-2 ${p.color} shadow-sm` : `${p.bgColor} ${p.color} hover:opacity-80`}`}
            >
              <span className="text-base">{p.emoji}</span><Icon className="w-4 h-4" />{p.label}
              {done && <Check className="w-3.5 h-3.5" />}
              {!done && (activePlatform === p.id ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5 opacity-40" />)}
            </button>
          );
        })}
      </div>
      {Object.entries(captured).map(([pid, entry]) => {
        const p = SOCIAL_PLATFORMS.find(x => x.id === pid); if (!p) return null;
        const Icon = p.icon;
        return (
          <div key={pid} className="flex items-center gap-2 p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200">
            <span>✅</span><Icon className="w-4 h-4 text-emerald-600" />
            <span className="text-sm text-emerald-700 flex-1 truncate font-medium">@{entry.usuario}</span>
            <button type="button" onClick={() => handleRemove(pid)} className="text-muted-foreground hover:text-destructive p-1"><X className="w-3.5 h-3.5" /></button>
          </div>
        );
      })}
      {activePlatform && !captured[activePlatform] && (() => {
        const p = SOCIAL_PLATFORMS.find(x => x.id === activePlatform); if (!p) return null;
        const Icon = p.icon;
        return (
          <div className={`rounded-xl border-2 p-4 space-y-4 ${p.bgColor} animate-in slide-in-from-top-2`}>
            <div className="flex items-center gap-2"><span className="text-lg">{p.emoji}</span><Icon className={`w-5 h-5 ${p.color}`} /><span className="font-semibold text-sm">Passo a passo — {p.label}</span></div>
            <div className="space-y-2">
              {p.steps.map((s, i) => (
                <div key={i} className={`flex items-start gap-2.5 p-2 rounded-lg text-sm ${i === p.steps.length - 1 ? "bg-primary/10 border border-primary/20 font-semibold" : "text-muted-foreground"}`}>
                  <span className="text-base shrink-0 mt-0.5">{s.emoji}</span>
                  <span><span className="font-bold text-foreground mr-1.5">{i + 1}.</span>{s.text}</span>
                </div>
              ))}
            </div>
            <div className="space-y-2 pt-1">
              <Button type="button" size="lg" variant="outline" className="w-full gap-2 text-base font-semibold border-2 border-dashed border-primary/40 hover:border-primary py-5" onClick={() => handlePaste(activePlatform)}>
                <ClipboardPaste className="w-5 h-5" />📋 Tocar aqui para COLAR o link
              </Button>
              {pasteSuccess && pasteValue && (
                <div className="flex items-center gap-2 p-2 rounded-lg bg-emerald-50 border border-emerald-200 text-sm"><span>✅</span><span className="text-emerald-700 truncate flex-1">{pasteValue}</span></div>
              )}
              <Input value={pasteValue} onChange={e => { setPasteValue(e.target.value); setParseError(false); setPasteSuccess(false); }} placeholder="Ou digite/cole o link aqui..." className="bg-background text-sm" onKeyDown={e => e.key === "Enter" && (e.preventDefault(), handleConfirm(activePlatform, pasteValue))} />
              {pasteValue && !pasteSuccess && (
                <Button type="button" className="w-full gap-2" onClick={() => handleConfirm(activePlatform, pasteValue)}><Check className="w-4 h-4" />Confirmar</Button>
              )}
              {parseError && (
                <div className="flex items-start gap-2 p-2.5 rounded-lg bg-destructive/10 border border-destructive/20 text-sm text-destructive">
                  <span>❌</span><div><p className="font-medium">Não conseguimos identificar o perfil</p><p className="text-xs mt-0.5 opacity-80">Tente copiar o link novamente seguindo os passos acima.</p></div>
                </div>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ─── Main Registration Page ──────────────────────────────────────────────────
export default function RegistroContratado() {
  const { clientId, liderId } = useParams<{ clientId: string; liderId: string }>();
  const [clientName, setClientName] = useState("");
  const [liderName, setLiderName] = useState("");
  const [whatsappOficial, setWhatsappOficial] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingClient, setLoadingClient] = useState(true);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [cidade, setCidade] = useState("");
  const [bairro, setBairro] = useState("");
  const [endereco, setEndereco] = useState("");
  const [zonaEleitoral, setZonaEleitoral] = useState("");
  const [secaoEleitoral, setSecaoEleitoral] = useState("");
  const [notas, setNotas] = useState("");
  const [socials, setSocials] = useState<SocialEntry[]>([]);
  const [portalUrl, setPortalUrl] = useState("");

  useEffect(() => {
    if (!clientId) { setLoadingClient(false); return; }
    
    const loadClient = async () => {
      try {
        const { data: clientData, error: clientError } = await supabase
          .from("clients")
          .select("name, whatsapp_oficial")
          .eq("id", clientId)
          .maybeSingle();

        console.log("RegistroContratado: client fetch", { clientId, clientData, clientError });

        if (clientData) {
          setClientName(clientData.name);
          setWhatsappOficial((clientData as any).whatsapp_oficial || "");
        }

        if (liderId) {
          const { data: liderData } = await supabase
            .from("pessoas")
            .select("nome")
            .eq("id", liderId)
            .maybeSingle();
          if (liderData) setLiderName((liderData as any).nome || "");
        }
      } catch (err) {
        console.error("RegistroContratado: error loading client", err);
      } finally {
        setLoadingClient(false);
      }
    };

    loadClient();
  }, [clientId, liderId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim()) { setError("Informe seu nome."); return; }
    if (!telefone.trim()) { setError("Informe seu telefone."); return; }
    if (!email.trim()) { setError("Informe seu e-mail."); return; }
    if (!senha || senha.length < 6) { setError("A senha deve ter no mínimo 6 caracteres."); return; }
    if (!cidade.trim()) { setError("Informe sua cidade."); return; }
    if (!zonaEleitoral.trim()) { setError("Informe sua zona eleitoral."); return; }
    if (!secaoEleitoral.trim()) { setError("Informe sua seção eleitoral."); return; }

    setLoading(true);
    setError("");

    const { data, error: fnError } = await supabase.functions.invoke("register-contratado", {
      body: {
        client_id: clientId,
        lider_id: liderId || null,
        nome: nome.trim(),
        telefone: telefone.trim(),
        email: email.trim().toLowerCase(),
        senha,
        cidade: cidade.trim(),
        bairro: bairro.trim() || null,
        endereco: endereco.trim() || null,
        zona_eleitoral: zonaEleitoral.trim(),
        secao_eleitoral: secaoEleitoral.trim(),
        notas: notas.trim() || null,
        redes_sociais: socials,
      },
    });

    if (fnError || (data && data.error)) {
      setError(data?.error || fnError?.message || "Erro ao realizar cadastro.");
      setLoading(false);
      return;
    }

    setPortalUrl(`${window.location.origin}/portal-contratado/${clientId}`);
    setSuccess(true);
    setLoading(false);
  };

  if (loadingClient) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-primary/5 to-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
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
              Seu cadastro foi registrado com sucesso. Guarde seu e-mail e senha para acessar seu portal diariamente.
            </p>
            <div className="bg-muted/50 rounded-xl p-4 text-left space-y-1 text-sm">
              <p><strong>E-mail:</strong> {email}</p>
              <p><strong>Senha:</strong> a que você definiu</p>
              <p className="text-xs text-muted-foreground pt-1">Use estas credenciais para acessar o portal todos os dias.</p>
            </div>
            <Button asChild className="w-full gap-2">
              <a href={portalUrl}>
                <Briefcase className="w-4 h-4" />
                Acessar Meu Portal
              </a>
            </Button>
            {whatsappLink ? (
              <Button asChild variant="outline" size="lg" className="w-full gap-2 border-green-300 text-green-700 hover:bg-green-50">
                <a href={whatsappLink} target="_blank" rel="noopener noreferrer">
                  <MessageCircle className="w-5 h-5" />
                  Confirmar no WhatsApp (obrigatório)
                </a>
              </Button>
            ) : (
              <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3 rounded-lg text-sm text-amber-800 dark:text-amber-300 text-center">
                ⚠️ Entre em contato com a equipe pelo WhatsApp para confirmar seu cadastro.
              </div>
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
            <Briefcase className="w-7 h-7 text-primary" />
          </div>
          <CardTitle className="text-xl">Cadastro de Contratado</CardTitle>
          <CardDescription>
            {liderName
              ? `Indicado por ${liderName}${clientName ? ` — Base de ${clientName}` : ""}`
              : `Preencha seus dados para concluir seu cadastro${clientName ? ` em ${clientName}` : ""}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="nome">Nome completo *</Label>
              <Input id="nome" value={nome} onChange={e => { setNome(e.target.value); setError(""); }} placeholder="Ex: João da Silva" required />
            </div>

            <div className="space-y-2">
              <Label htmlFor="telefone" className="flex items-center gap-2"><Phone className="w-4 h-4 text-muted-foreground" />Telefone / WhatsApp *</Label>
              <Input id="telefone" value={telefone} onChange={e => { setTelefone(e.target.value); setError(""); }} placeholder="(67) 99999-9999" required />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email" className="flex items-center gap-2"><Mail className="w-4 h-4 text-muted-foreground" />E-mail *</Label>
              <Input id="email" type="email" value={email} onChange={e => { setEmail(e.target.value); setError(""); }} placeholder="seu@email.com" required />
            </div>

            <div className="space-y-2">
              <Label htmlFor="senha" className="flex items-center gap-2"><Lock className="w-4 h-4 text-muted-foreground" />Senha de acesso *</Label>
              <div className="relative">
                <Input id="senha" type={showPassword ? "text" : "password"} value={senha} onChange={e => { setSenha(e.target.value); setError(""); }} placeholder="Mínimo 6 caracteres" minLength={6} required />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">Você usará este e-mail e senha para acessar seu portal todo dia.</p>
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2"><MapPin className="w-4 h-4 text-muted-foreground" />Localização *</Label>
              <div className="grid grid-cols-2 gap-2">
                <Input value={cidade} onChange={e => { setCidade(e.target.value); setError(""); }} placeholder="Cidade *" required />
                <Input value={bairro} onChange={e => setBairro(e.target.value)} placeholder="Bairro" />
              </div>
              <Input value={endereco} onChange={e => setEndereco(e.target.value)} placeholder="Endereço completo" />
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2"><FileText className="w-4 h-4 text-muted-foreground" />Título Eleitoral *</Label>
              <div className="grid grid-cols-2 gap-2">
                <Input value={zonaEleitoral} onChange={e => { setZonaEleitoral(e.target.value); setError(""); }} placeholder="Zona *" required />
                <Input value={secaoEleitoral} onChange={e => { setSecaoEleitoral(e.target.value); setError(""); }} placeholder="Seção *" required />
              </div>
              <p className="text-xs text-muted-foreground">Encontre no seu título de eleitor ou no app e-Título</p>
            </div>

            <SocialLinkCapture onSocialsChange={setSocials} />

            <div className="space-y-2">
              <Label htmlFor="notas" className="flex items-center gap-2"><FileText className="w-4 h-4 text-muted-foreground" />Observação (opcional)</Label>
              <Textarea id="notas" value={notas} onChange={e => setNotas(e.target.value)} placeholder="Ex: Disponível para trabalho noturno..." maxLength={500} />
            </div>

            {error && (
              <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 p-3 rounded-md">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /><p>{error}</p>
              </div>
            )}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Briefcase className="w-4 h-4 mr-2" />}
              Cadastrar
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
