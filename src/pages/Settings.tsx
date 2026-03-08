import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Settings as SettingsIcon } from "lucide-react";
import { toast } from "sonner";
import TeamUsersPanel from "@/components/team/TeamUsersPanel";
import WhatsAppConfigCard from "@/components/settings/WhatsAppConfigCard";
import WhatsAppInstanceCard from "@/components/settings/WhatsAppInstanceCard";
import TelemarketingSettingsCard from "@/components/settings/TelemarketingSettingsCard";

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
        <p className="text-muted-foreground mt-2">
          Gerencie suas preferências de comunicação e equipe
        </p>
      </div>

      {/* WhatsApp Instance (UAZAPI) */}
      {clientId && <WhatsAppInstanceCard clientId={clientId} />}

      {/* WhatsApp Oficial */}
      {clientId && <WhatsAppConfigCard clientId={clientId} />}

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
