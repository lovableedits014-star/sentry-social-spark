import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Settings as SettingsIcon } from "lucide-react";

const Settings = () => {
  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Configurações</h1>
        <p className="text-muted-foreground mt-2">
          Gerencie suas preferências e configurações
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <SettingsIcon className="w-5 h-5 text-primary" />
            </div>
            <div>
              <CardTitle>Configurações</CardTitle>
              <CardDescription>Em breve: mais opções de configuração</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            Esta seção está em desenvolvimento. Em breve você poderá configurar notificações,
            preferências de idioma, e muito mais.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default Settings;
