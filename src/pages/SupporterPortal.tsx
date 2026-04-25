import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import CampaignFrameGenerator from "@/components/campaign-frame/CampaignFrameGenerator";
import WhatsAppGate from "@/components/portal/WhatsAppGate";
import {
  Shield, LogOut, CheckCircle2, Loader2, ExternalLink, Facebook,
  Instagram, CalendarCheck, UserPlus, Eye, EyeOff, Edit2, Save, X,
  Bell, Users, MapPin
} from "lucide-react";
import { toast } from "sonner";
import { ReferralPanel } from "@/components/referral/ReferralPanel";
interface Mission {
  id: string;
  platform: string;
  post_url: string;
  title: string | null;
  description: string | null;
  display_order: number;
}

interface Post {
  id: string;
  message: string;
  permalink_url: string;
  platform: string;
  created_at: string;
}

interface SupporterAccount {
  id: string;
  name: string;
  email: string;
  facebook_username: string | null;
  instagram_username: string | null;
  city: string | null;
  neighborhood: string | null;
  state: string | null;
  client_id: string;
  whatsapp_confirmado?: boolean;
}

interface ClientInfo {
  name: string;
  logo_url: string | null;
  cargo: string | null;
}

export default function SupporterPortal() {
  const { clientId } = useParams<{ clientId: string }>();
  const navigate = useNavigate();

  // Save clientId so the PWA installed shortcut knows where to redirect
  // We use BOTH localStorage AND a cookie because iOS PWA standalone has isolated localStorage
  useEffect(() => {
    if (clientId) {
      localStorage.setItem("pwa_client_id", clientId);
      // Cookie is shared between Safari and iOS PWA standalone mode
      document.cookie = `pwa_client_id=${clientId}; path=/; max-age=31536000; SameSite=Lax`;
    }
  }, [clientId]);

  // Auth state
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [authLoading, setAuthLoading] = useState(false);

  // Login/register form
  const [tab, setTab] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  // Portal state
  const [account, setAccount] = useState<SupporterAccount | null>(null);
  const [clientInfo, setClientInfo] = useState<ClientInfo | null>(null);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [missionsLoading, setMissionsLoading] = useState(false);
  const [checkedInToday, setCheckedInToday] = useState(false);
  const [checkingIn, setCheckingIn] = useState(false);
  const [totalCheckins, setTotalCheckins] = useState(0);
  const [streak, setStreak] = useState(0);

  // Edit profile
  const [editMode, setEditMode] = useState(false);
  const [editFacebook, setEditFacebook] = useState("");
  const [editInstagram, setEditInstagram] = useState("");
  const [editName, setEditName] = useState("");
  const [editCity, setEditCity] = useState("");
  const [editNeighborhood, setEditNeighborhood] = useState("");
  const [editState, setEditState] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  // Load client info as soon as clientId is available (before login)
  useEffect(() => {
    if (!clientId) return;
    supabase
      .from("clients")
      .select("name, logo_url, cargo")
      .eq("id", clientId)
      .maybeSingle()
      .then(({ data }) => { if (data) setClientInfo(data); });
  }, [clientId]);

  useEffect(() => {
    supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      setLoading(false);
    });
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (session && clientId) {
      loadPortalData();
    }
  }, [session, clientId]);

  const loadPortalData = async () => {
    if (!session || !clientId) return;

    // Load client info
    const { data: client } = await supabase
      .from("clients")
      .select("name, logo_url, cargo")
      .eq("id", clientId)
      .maybeSingle();
    if (client) setClientInfo(client);

    // Load or create supporter account
    const { data: existingAccount } = await supabase
      .from("supporter_accounts")
      .select("*")
      .eq("user_id", session.user.id)
      .eq("client_id", clientId)
      .maybeSingle();

    if (existingAccount) {
      setAccount(existingAccount);
      setEditFacebook(existingAccount.facebook_username || "");
      setEditInstagram(existingAccount.instagram_username || "");
      setEditName(existingAccount.name || "");
      setEditCity(existingAccount.city || "");
      setEditNeighborhood(existingAccount.neighborhood || "");
      setEditState(existingAccount.state || "");
      checkTodayCheckin(existingAccount.id);
      loadCheckinStats(existingAccount.id);
    } else {
      // Create account if user just registered
      const userName = session.user.user_metadata?.full_name || session.user.email?.split("@")[0] || "Apoiador";
      const { data: newAccount } = await supabase
        .from("supporter_accounts")
        .insert({
          user_id: session.user.id,
          client_id: clientId,
          name: userName,
          email: session.user.email!,
        })
        .select()
        .single();

      if (newAccount) {
        setAccount(newAccount);
        setEditName(newAccount.name || "");
        // Auto link as supporter in the supporters table
        await linkAsSupporterActive(newAccount.id, userName);
      }
    }

    // Load missions pinned by the manager
    loadMissions();
  };

  const linkAsSupporterActive = async (accountId: string, supporterName: string) => {
    if (!clientId) return;
    try {
      await supabase.functions.invoke("link-supporter-account", {
        body: {
          account_id: accountId,
          client_id: clientId,
          supporter_name: supporterName,
        },
      });
    } catch (err) {
      console.error("Error linking supporter account:", err);
    }
  };

  const loadMissions = async () => {
    if (!clientId) return;
    setMissionsLoading(true);
    try {
      const { data } = await (supabase as any)
        .from("portal_missions")
        .select("id, platform, post_url, title, description, display_order")
        .eq("client_id", clientId)
        .eq("is_active", true)
        .order("display_order", { ascending: true });
      setMissions((data || []) as Mission[]);
    } finally {
      setMissionsLoading(false);
    }
  };

  const checkTodayCheckin = async (accountId: string) => {
    const today = new Date().toISOString().split("T")[0];
    const { data } = await supabase
      .from("supporter_checkins")
      .select("id")
      .eq("supporter_account_id", accountId)
      .eq("checkin_date", today)
      .maybeSingle();
    setCheckedInToday(!!data);
  };

  const loadCheckinStats = async (accountId: string) => {
    const { data } = await supabase
      .from("supporter_checkins")
      .select("checkin_date")
      .eq("supporter_account_id", accountId)
      .order("checkin_date", { ascending: false })
      .limit(90);

    if (data) {
      setTotalCheckins(data.length);
      // Calculate streak
      let s = 0;
      const today = new Date();
      for (let i = 0; i < data.length; i++) {
        const expected = new Date(today);
        expected.setDate(expected.getDate() - i);
        const expectedStr = expected.toISOString().split("T")[0];
        if (data[i].checkin_date === expectedStr) s++;
        else break;
      }
      setStreak(s);
    }
  };

  const handleCheckin = async () => {
    if (!account || checkedInToday) return;
    setCheckingIn(true);
    try {
      const today = new Date().toISOString().split("T")[0];
      const { error } = await supabase.from("supporter_checkins").insert({
        supporter_account_id: account.id,
        client_id: clientId!,
        checkin_date: today,
      } as any);

      if (error && error.code === "23505") {
        setCheckedInToday(true);
        toast.info("Você já marcou presença hoje!");
        return;
      }
      if (error) throw error;

      setCheckedInToday(true);
      setStreak((s) => s + 1);
      setTotalCheckins((t) => t + 1);
      toast.success("✅ Presença marcada! Agora vá interagir nas postagens!");
    } catch (err: any) {
      toast.error("Erro ao marcar presença");
    } finally {
      setCheckingIn(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    } catch (err: any) {
      toast.error(err.message || "Erro ao entrar");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { toast.error("Informe seu nome"); return; }
    setAuthLoading(true);
    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: name } },
      });
      if (error) throw error;
      toast.success("Conta criada! Fazendo login...");
    } catch (err: any) {
      toast.error(err.message || "Erro ao criar conta");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!account) return;
    setSavingProfile(true);
    try {
      const { error } = await supabase
        .from("supporter_accounts")
        .update({
          name: editName.trim() || account.name,
          facebook_username: editFacebook.replace("@", "").trim() || null,
          instagram_username: editInstagram.replace("@", "").trim() || null,
          city: editCity.trim() || null,
          neighborhood: editNeighborhood.trim() || null,
          state: editState.trim() || null,
        } as any)
        .eq("id", account.id);

      if (error) throw error;

      setAccount({
        ...account,
        name: editName.trim() || account.name,
        facebook_username: editFacebook.replace("@", "").trim() || null,
        instagram_username: editInstagram.replace("@", "").trim() || null,
        city: editCity.trim() || null,
        neighborhood: editNeighborhood.trim() || null,
        state: editState.trim() || null,
      });

      // Update supporter name too if linked
      if ((account as any).supporter_id) {
        await supabase
          .from("supporters")
          .update({ name: editName.trim() || account.name } as any)
          .eq("id", (account as any).supporter_id);
      }

      setEditMode(false);
      toast.success("Perfil atualizado!");
    } catch (err: any) {
      toast.error("Erro ao salvar perfil");
    } finally {
      setSavingProfile(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setAccount(null);
  };

  const formatDate = (str: string) => {
    if (!str) return "";
    return new Date(str).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-primary/5 to-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // ─── AUTH SCREEN ──────────────────────────────────────────────────────────
  if (!session) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-primary/10 via-background to-background flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-sm space-y-6">
          {/* Header */}
          <div className="text-center space-y-2">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto shadow-lg overflow-hidden bg-primary">
              {clientInfo?.logo_url ? (
                <img src={clientInfo.logo_url} alt="Logo" className="w-full h-full object-cover" />
              ) : (
                <Shield className="w-8 h-8 text-primary-foreground" />
              )}
            </div>
            {clientInfo && (
              <>
                <h1 className="text-2xl font-bold">{clientInfo.name}</h1>
                {clientInfo.cargo && (
                  <p className="text-sm text-muted-foreground">{clientInfo.cargo}</p>
                )}
              </>
            )}
            <p className="text-sm text-muted-foreground font-medium">Portal do Apoiador</p>
          </div>

          <Card className="shadow-xl">
            <CardContent className="pt-6">
              <Tabs value={tab} onValueChange={(v) => setTab(v as "login" | "register")}>
                <TabsList className="grid w-full grid-cols-2 mb-4">
                  <TabsTrigger value="login">Entrar</TabsTrigger>
                  <TabsTrigger value="register">Cadastrar</TabsTrigger>
                </TabsList>

                <TabsContent value="login">
                  <form onSubmit={handleLogin} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="email">E-mail</Label>
                      <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="seu@email.com" required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="password">Senha</Label>
                      <div className="relative">
                        <Input
                          id="password"
                          type={showPassword ? "text" : "password"}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="••••••••"
                          required
                        />
                        <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                    <Button type="submit" className="w-full" disabled={authLoading}>
                      {authLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                      Entrar
                    </Button>
                  </form>
                </TabsContent>

                <TabsContent value="register">
                  <form onSubmit={handleRegister} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="reg-name">Seu nome completo</Label>
                      <Input id="reg-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="João da Silva" required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="reg-email">E-mail</Label>
                      <Input id="reg-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="seu@email.com" required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="reg-password">Senha</Label>
                      <div className="relative">
                        <Input
                          id="reg-password"
                          type={showPassword ? "text" : "password"}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="Mínimo 6 caracteres"
                          minLength={6}
                          required
                        />
                        <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                    <Button type="submit" className="w-full" disabled={authLoading}>
                      {authLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <UserPlus className="w-4 h-4 mr-2" />}
                      Criar Conta
                    </Button>
                    <p className="text-xs text-center text-muted-foreground">
                      Ao se cadastrar, você entra automaticamente como apoiador ativo!
                    </p>
                  </form>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // ─── PORTAL SCREEN ────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-b from-primary/5 to-background">
      {/* Top bar */}
      <header className="bg-card border-b sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg overflow-hidden bg-primary flex items-center justify-center shrink-0">
              {clientInfo?.logo_url ? (
                <img src={clientInfo.logo_url} alt="Logo" className="w-full h-full object-cover" />
              ) : (
                <Shield className="w-4 h-4 text-primary-foreground" />
              )}
            </div>
            <div>
              <p className="text-sm font-semibold leading-none">{clientInfo?.name || "Portal"}</p>
              <p className="text-xs text-muted-foreground">{account?.name}</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={handleLogout}>
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6 space-y-4">
        {/* Gerador de foto de campanha */}
        {clientId && <CampaignFrameGenerator clientId={clientId} variant="showcase" />}
        {/* Tabs: Presença / Convidar / Perfil */}
        <Tabs defaultValue="presenca">
          <TabsList className="grid w-full grid-cols-3 mb-4">
            <TabsTrigger value="presenca" className="text-xs gap-1"><CalendarCheck className="w-3.5 h-3.5" /> Presença</TabsTrigger>
            <TabsTrigger value="convidar" className="text-xs gap-1"><Users className="w-3.5 h-3.5" /> Convidar</TabsTrigger>
            <TabsTrigger value="perfil" className="text-xs gap-1"><Edit2 className="w-3.5 h-3.5" /> Perfil</TabsTrigger>
          </TabsList>

          <TabsContent value="presenca" className="space-y-4">
        {/* CHECK-IN CARD */}
        <Card className={checkedInToday ? "border-emerald-500/50 bg-emerald-500/5" : "border-primary/30 bg-primary/5"}>
          <CardContent className="pt-6 pb-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-bold text-lg">Marcar Presença</h2>
                <p className="text-xs text-muted-foreground">
                  {new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}
                </p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-primary">{streak}</p>
                <p className="text-xs text-muted-foreground">dias seguidos 🔥</p>
              </div>
            </div>

            {checkedInToday ? (
              <div className="flex items-center gap-3 p-3 bg-emerald-500/10 rounded-lg">
                <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" />
                <div>
                  <p className="font-medium text-emerald-700 dark:text-emerald-400">Presença marcada hoje! ✅</p>
                  <p className="text-xs text-muted-foreground">Agora interaja nas postagens abaixo</p>
                </div>
              </div>
            ) : (
              <Button
                className="w-full h-12 text-base font-semibold"
                onClick={handleCheckin}
                disabled={checkingIn}
              >
                {checkingIn ? (
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                ) : (
                  <CalendarCheck className="w-5 h-5 mr-2" />
                )}
                {checkingIn ? "Registrando..." : "✅ Marcar Presença Agora"}
              </Button>
            )}

            <div className="mt-3 flex gap-4 text-center">
              <div className="flex-1 bg-background/60 rounded-lg p-2">
                <p className="text-xl font-bold">{totalCheckins}</p>
                <p className="text-xs text-muted-foreground">Total de presenças</p>
              </div>
              <div className="flex-1 bg-background/60 rounded-lg p-2">
                <p className="text-xl font-bold">{streak}</p>
                <p className="text-xs text-muted-foreground">Sequência atual</p>
              </div>
            </div>
          </CardContent>
        </Card>


        {/* MISSIONS */}
        <div>
          <h3 className="font-semibold text-sm mb-3 text-muted-foreground uppercase tracking-wide">
            🎯 Missões de Engajamento
          </h3>
          {missionsLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : missions.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground text-sm">
                <p className="font-medium">Nenhuma missão ativa no momento.</p>
                <p className="text-xs mt-1 opacity-70">Volte em breve — novas missões serão publicadas aqui!</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {missions.map((mission) => (
                <Card key={mission.id} className="overflow-hidden border-primary/20">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3 mb-3">
                      <div className={`p-2 rounded-lg shrink-0 ${
                        mission.platform === "instagram" ? "bg-pink-500/10" : "bg-blue-500/10"
                      }`}>
                        {mission.platform === "instagram"
                          ? <Instagram className="w-4 h-4 text-pink-500" />
                          : <Facebook className="w-4 h-4 text-blue-600" />
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        {mission.title && (
                          <p className="text-sm font-semibold text-foreground mb-1">{mission.title}</p>
                        )}
                        {mission.description && (
                          <p className="text-sm text-muted-foreground">{mission.description}</p>
                        )}
                        {!mission.title && !mission.description && (
                          <p className="text-sm text-muted-foreground capitalize">
                            Publicação no {mission.platform}
                          </p>
                        )}
                      </div>
                    </div>
                    <a
                      href={mission.post_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
                    >
                      <ExternalLink className="w-4 h-4" />
                      Abrir e Interagir Agora
                    </a>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
          </TabsContent>

          <TabsContent value="convidar">
            {account && clientId && (
              <ReferralPanel accountId={account.id} clientId={clientId} />
            )}
          </TabsContent>

          <TabsContent value="perfil">
            {/* PROFILE */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Meu Perfil</CardTitle>
                  {!editMode ? (
                    <Button variant="ghost" size="sm" onClick={() => setEditMode(true)}>
                      <Edit2 className="w-4 h-4 mr-1" /> Editar
                    </Button>
                  ) : (
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm" onClick={() => setEditMode(false)}>
                        <X className="w-4 h-4" />
                      </Button>
                      <Button size="sm" onClick={handleSaveProfile} disabled={savingProfile}>
                        {savingProfile ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3 mr-1" />}
                        Salvar
                      </Button>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {!editMode ? (
                  <>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center font-bold text-primary">
                        {account?.name?.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium">{account?.name}</p>
                        <p className="text-xs text-muted-foreground">{account?.email}</p>
                      </div>
                      <Badge variant="secondary" className="ml-auto text-xs bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                        Ativo
                      </Badge>
                    </div>
                    <div className="flex flex-wrap gap-2 pt-1">
                      {account?.facebook_username && (
                        <Badge variant="outline" className="text-xs gap-1">
                          <Facebook className="w-3 h-3 text-blue-600" />
                          @{account.facebook_username}
                        </Badge>
                      )}
                      {account?.instagram_username && (
                        <Badge variant="outline" className="text-xs gap-1">
                          <Instagram className="w-3 h-3 text-pink-500" />
                          @{account.instagram_username}
                        </Badge>
                      )}
                      {(account?.city || account?.neighborhood) && (
                        <Badge variant="outline" className="text-xs gap-1">
                          <MapPin className="w-3 h-3 text-primary" />
                          {[account.neighborhood, account.city, account.state].filter(Boolean).join(", ")}
                        </Badge>
                      )}
                      {!account?.facebook_username && !account?.instagram_username && (
                        <p className="text-xs text-muted-foreground">Nenhuma rede social vinculada. Clique em Editar para adicionar.</p>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Nome</Label>
                      <Input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Seu nome" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs flex items-center gap-1">
                        <Facebook className="w-3 h-3 text-blue-600" /> Facebook (username)
                      </Label>
                      <Input value={editFacebook} onChange={(e) => setEditFacebook(e.target.value)} placeholder="joaosilva (sem @)" />
                      <p className="text-xs text-muted-foreground">Ex: se seu perfil é facebook.com/joaosilva, coloque "joaosilva"</p>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs flex items-center gap-1">
                        <Instagram className="w-3 h-3 text-pink-500" /> Instagram (username)
                      </Label>
                      <Input value={editInstagram} onChange={(e) => setEditInstagram(e.target.value)} placeholder="joaosilva (sem @)" />
                      <p className="text-xs text-muted-foreground">Ex: se seu perfil é instagram.com/joaosilva, coloque "joaosilva"</p>
                    </div>
                    <div className="border-t pt-3 mt-2">
                      <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                        <MapPin className="w-3 h-3" /> Localização
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <Label className="text-xs">Cidade</Label>
                          <Input value={editCity} onChange={(e) => setEditCity(e.target.value)} placeholder="São Paulo" />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Estado (UF)</Label>
                          <Input value={editState} onChange={(e) => setEditState(e.target.value)} placeholder="SP" maxLength={2} />
                        </div>
                      </div>
                      <div className="space-y-1 mt-2">
                        <Label className="text-xs">Bairro</Label>
                        <Input value={editNeighborhood} onChange={(e) => setEditNeighborhood(e.target.value)} placeholder="Centro" />
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
