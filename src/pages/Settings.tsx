import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Settings as SettingsIcon, Copy, ExternalLink, Users, UserPlus, Shield, Info, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import TeamUsersPanel from "@/components/team/TeamUsersPanel";
import WhatsAppConfigCard from "@/components/settings/WhatsAppConfigCard";
import QRCodeLinksCard from "@/components/settings/QRCodeLinksCard";
import TelemarketingSettingsCard from "@/components/settings/TelemarketingSettingsCard";

const Settings = () => {
  const [clientId, setClientId] = useState<string>("");
  const [clientName, setClientName] = useState<string>("");
  const [userId, setUserId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [copiedPortal, setCopiedPortal] = useState(false);
  const [copiedCadastro, setCopiedCadastro] = useState(false);

  useEffect(() => {
    const fetchClient = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);
      const { data } = await supabase
        .from("clients")
        .select("id, name")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();
      if (data) {
        setClientId(data.id);
        setClientName(data.name);
      }
      setLoading(false);
    };
    fetchClient();
  }, []);

  const portalUrl = clientId ? `${window.location.origin}/portal/${clientId}` : "";
  const cadastroUrl = clientId ? `${window.location.origin}/cadastro/${clientId}` : "";

  const copyToClipboard = (text: string, type: "portal" | "cadastro") => {
    navigator.clipboard.writeText(text);
    if (type === "portal") {
      setCopiedPortal(true);
      toast.success("Link do Portal copiado!");
      setTimeout(() => setCopiedPortal(false), 2000);
    } else {
      setCopiedCadastro(true);
      toast.success("Link de Cadastro copiado!");
      setTimeout(() => setCopiedCadastro(false), 2000);
    }
  };


  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Configurações</h1>
        <p className="text-muted-foreground mt-2">
          Gerencie suas preferências e links de acesso
        </p>
      </div>

      {/* Como funciona — explicação SaaS */}
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Info className="w-5 h-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base">Como funciona o isolamento entre contas</CardTitle>
              <CardDescription>Entenda como seus apoiadores são separados dos de outros usuários</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid sm:grid-cols-3 gap-3 text-sm">
            <div className="flex gap-2.5 bg-background rounded-lg p-3 border">
              <Shield className="w-4 h-4 text-primary mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold">ID único por conta</p>
                <p className="text-muted-foreground text-xs mt-0.5">Cada administrador tem um ID exclusivo que aparece na URL do portal. Nenhum outro usuário do sistema tem o mesmo ID.</p>
              </div>
            </div>
            <div className="flex gap-2.5 bg-background rounded-lg p-3 border">
              <Users className="w-4 h-4 text-primary mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold">Apoiadores vinculados ao seu ID</p>
                <p className="text-muted-foreground text-xs mt-0.5">Quando alguém se cadastra pelo seu link, fica vinculado exclusivamente à sua conta. Você nunca vê dados de outros admins.</p>
              </div>
            </div>
            <div className="flex gap-2.5 bg-background rounded-lg p-3 border">
              <CheckCircle2 className="w-4 h-4 text-primary mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold">Isolamento garantido</p>
                <p className="text-muted-foreground text-xs mt-0.5">O banco de dados aplica regras automáticas que impedem qualquer cruzamento de dados entre contas diferentes.</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Links de acesso */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <ExternalLink className="w-5 h-5 text-primary" />
            </div>
            <div>
              <CardTitle>Seus links de acesso exclusivos</CardTitle>
              <CardDescription>Compartilhe esses links com seus apoiadores — cada link é único para a sua conta</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <div className="space-y-3">
              <div className="h-20 bg-muted animate-pulse rounded-lg" />
              <div className="h-20 bg-muted animate-pulse rounded-lg" />
            </div>
          ) : clientId ? (
            <>
              {/* Portal do Apoiador */}
              <div className="border rounded-lg p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-emerald-100 dark:bg-emerald-950/30 rounded-lg flex items-center justify-center shrink-0">
                      <Users className="w-4 h-4 text-emerald-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm">Portal do Apoiador</p>
                      <p className="text-xs text-muted-foreground">Onde apoiadores fazem login, marcam presença e veem missões diárias</p>
                    </div>
                  </div>
                  <Badge variant="secondary" className="text-xs shrink-0">Login diário</Badge>
                </div>
                <div className="bg-muted rounded-md px-3 py-2 flex items-center justify-between gap-2">
                  <code className="text-xs text-muted-foreground truncate flex-1">{portalUrl}</code>
                  <div className="flex gap-1 shrink-0">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => copyToClipboard(portalUrl, "portal")}>
                      {copiedPortal ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => window.open(portalUrl, "_blank")}>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 rounded-md px-3 py-2">
                  💡 <strong>Recomendado para instalar no celular como app.</strong> Compartilhe este link pelo WhatsApp para que apoiadores instalem o app na tela inicial.
                </p>
              </div>

              {/* Cadastro de Apoiador */}
              <div className="border rounded-lg p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-blue-100 dark:bg-blue-950/30 rounded-lg flex items-center justify-center shrink-0">
                      <UserPlus className="w-4 h-4 text-blue-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm">Cadastro de Apoiador</p>
                      <p className="text-xs text-muted-foreground">Formulário para novos apoiadores vincularem seus perfis de Facebook e Instagram</p>
                    </div>
                  </div>
                  <Badge variant="secondary" className="text-xs shrink-0">Cadastro único</Badge>
                </div>
                <div className="bg-muted rounded-md px-3 py-2 flex items-center justify-between gap-2">
                  <code className="text-xs text-muted-foreground truncate flex-1">{cadastroUrl}</code>
                  <div className="flex gap-1 shrink-0">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => copyToClipboard(cadastroUrl, "cadastro")}>
                      {copiedCadastro ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => window.open(cadastroUrl, "_blank")}>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-md px-3 py-2">
                  💡 <strong>Use para cadastro sem login.</strong> Apoiadores preenchem nome e perfis sociais — útil para registrar quem ainda não tem conta no portal.
                </p>
              </div>

              {/* Seu ID de conta */}
              <div className="border border-dashed rounded-lg p-4 space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Seu ID de conta exclusivo</p>
                <div className="flex items-center gap-2">
                  <code className="text-sm font-mono bg-muted px-3 py-1.5 rounded flex-1">{clientId}</code>
                  <Button size="sm" variant="ghost" onClick={() => { navigator.clipboard.writeText(clientId); toast.success("ID copiado!"); }}>
                    <Copy className="w-3.5 h-3.5" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">Este ID aparece em todas as suas URLs. É o que separa seus dados dos demais usuários do sistema.</p>
              </div>
            </>
          ) : (
            <div className="text-center py-8 text-muted-foreground text-sm">
              <p>Nenhuma conta configurada ainda.</p>
              <p className="text-xs mt-1">Acesse o painel e configure seu perfil para obter os links.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* WhatsApp + QR Code */}
      {clientId && <WhatsAppConfigCard clientId={clientId} />}
      {clientId && <QRCodeLinksCard clientId={clientId} />}

      {/* Telemarketing Module */}
      {clientId && <TelemarketingSettingsCard clientId={clientId} />}

      {/* Team Users Management */}
      {clientId && <TeamUsersPanel clientId={clientId} />}

      {/* Mais configurações em breve */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <SettingsIcon className="w-5 h-5 text-primary" />
            </div>
            <div>
              <CardTitle>Mais configurações</CardTitle>
              <CardDescription>Em breve: notificações, preferências de idioma e personalização</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            Esta seção está em desenvolvimento. Em breve você poderá personalizar a aparência do portal, configurar notificações automáticas e muito mais.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default Settings;
