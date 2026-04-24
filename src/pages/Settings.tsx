import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Settings as SettingsIcon } from "lucide-react";
import TeamUsersPanel from "@/components/team/TeamUsersPanel";
import WhatsAppConfigCard from "@/components/settings/WhatsAppConfigCard";
import WhatsAppInstanceCard from "@/components/settings/WhatsAppInstanceCard";
import TelemarketingSettingsCard from "@/components/settings/TelemarketingSettingsCard";
import IntegrationsPanel from "@/components/settings/IntegrationsPanel";
import PublicLinksCard from "@/components/settings/PublicLinksCard";

const Settings = () => {
  const [clientId, setClientId] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchClient = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("clients")
        .select("id, name")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();
      if (data) {
        setClientId(data.id);
      }
      setLoading(false);
    };
    fetchClient();
  }, []);

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Configurações</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Configure suas integrações com WhatsApp (envio de mensagens), Meta (Facebook e Instagram), modelos de IA e gerencie os membros da sua equipe com diferentes níveis de acesso.
        </p>
      </div>

      {/* WhatsApp Instance (UAZAPI) */}
      {clientId && <WhatsAppInstanceCard clientId={clientId} />}

      {/* WhatsApp Oficial */}
      {clientId && <WhatsAppConfigCard clientId={clientId} />}

      {/* Links de Acesso Público */}
      {clientId && <PublicLinksCard clientId={clientId} />}

      {/* Telemarketing Module */}
      {clientId && <TelemarketingSettingsCard clientId={clientId} />}

      {/* Team Users Management */}
      {clientId && <TeamUsersPanel clientId={clientId} />}

      {/* Integrações (Meta, IA, etc.) */}
      {clientId && <IntegrationsPanel clientId={clientId} />}
    </div>
  );
};

export default Settings;
