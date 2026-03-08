import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, QrCode, Wifi, WifiOff, RefreshCw, Smartphone } from "lucide-react";

interface WhatsAppInstanceCardProps {
  clientId: string;
}

interface InstanceData {
  id: string;
  instance_name: string;
  instance_token: string | null;
  status: string;
  phone_number: string | null;
  qr_code: string | null;
}

export default function WhatsAppInstanceCard({ clientId }: WhatsAppInstanceCardProps) {
  const [instance, setInstance] = useState<InstanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadInstance();
  }, [clientId]);

  const loadInstance = async () => {
    const { data } = await supabase
      .from("whatsapp_instances" as any)
      .select("*")
      .eq("client_id", clientId)
      .maybeSingle();
    setInstance(data as unknown as InstanceData | null);
    setLoading(false);
  };

  const handleCreateInstance = async () => {
    setCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-whatsapp-instance", {
        body: { action: "create", client_id: clientId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success("Instância WhatsApp criada! Escaneie o QR Code abaixo.");
      await loadInstance();
    } catch (err: any) {
      toast.error("Erro ao criar instância: " + (err.message || "tente novamente"));
    } finally {
      setCreating(false);
    }
  };

  const handleRefreshQR = async () => {
    setRefreshing(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-whatsapp-instance", {
        body: { action: "qr", client_id: clientId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      await loadInstance();
      toast.success("QR Code atualizado!");
    } catch (err: any) {
      toast.error("Erro: " + (err.message || "tente novamente"));
    } finally {
      setRefreshing(false);
    }
  };

  const handleCheckStatus = async () => {
    setRefreshing(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-whatsapp-instance", {
        body: { action: "status", client_id: clientId },
      });
      if (error) throw error;

      await loadInstance();
      toast.success(data?.connected ? "WhatsApp conectado!" : "Aguardando conexão...");
    } catch (err: any) {
      toast.error("Erro: " + (err.message || "tente novamente"));
    } finally {
      setRefreshing(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="h-20 bg-muted animate-pulse rounded-lg" />
        </CardContent>
      </Card>
    );
  }

  const statusConfig: Record<string, { label: string; color: string; icon: typeof Wifi }> = {
    connected: { label: "Conectado", color: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30", icon: Wifi },
    qr_pending: { label: "Aguardando QR", color: "bg-amber-500/15 text-amber-600 border-amber-500/30", icon: QrCode },
    disconnected: { label: "Desconectado", color: "bg-red-500/15 text-red-600 border-red-500/30", icon: WifiOff },
  };

  const st = statusConfig[instance?.status || "disconnected"] || statusConfig.disconnected;
  const StIcon = st.icon;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
            <Smartphone className="w-5 h-5 text-green-600" />
          </div>
          <div className="flex-1">
            <CardTitle>Instância WhatsApp (UAZAPI)</CardTitle>
            <CardDescription>
              Conecte um número WhatsApp para disparos e confirmações automáticas
            </CardDescription>
          </div>
          {instance && (
            <Badge className={`${st.color} shrink-0`}>
              <StIcon className="w-3 h-3 mr-1" />
              {st.label}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!instance ? (
          <div className="text-center py-6 space-y-3">
            <div className="w-16 h-16 mx-auto bg-green-50 dark:bg-green-950/20 rounded-2xl flex items-center justify-center">
              <QrCode className="w-8 h-8 text-green-500" />
            </div>
            <div>
              <p className="font-medium">Nenhuma instância configurada</p>
              <p className="text-sm text-muted-foreground mt-1">
                Crie uma instância para começar a enviar mensagens via WhatsApp
              </p>
            </div>
            <Button onClick={handleCreateInstance} disabled={creating} className="bg-green-600 hover:bg-green-700">
              {creating ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <QrCode className="w-4 h-4 mr-1" />}
              Criar Instância e Gerar QR Code
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Instance info */}
            <div className="bg-muted rounded-lg p-3 space-y-1">
              <p className="text-xs text-muted-foreground">Nome da instância</p>
              <p className="text-sm font-mono font-medium">{instance.instance_name}</p>
              {instance.phone_number && (
                <>
                  <p className="text-xs text-muted-foreground mt-2">Número conectado</p>
                  <p className="text-sm font-mono font-medium">{instance.phone_number}</p>
                </>
              )}
            </div>

            {/* QR Code display */}
            {instance.status !== "connected" && instance.qr_code && (
              <div className="border-2 border-dashed border-green-500/30 rounded-xl p-6 text-center space-y-3">
                <p className="text-sm font-medium text-green-700 dark:text-green-400">
                  📱 Escaneie o QR Code com WhatsApp
                </p>
                <div className="flex justify-center">
                  <img
                    src={instance.qr_code}
                    alt="QR Code WhatsApp"
                    className="w-48 h-48 rounded-lg"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Abra o WhatsApp → Menu → Aparelhos conectados → Conectar aparelho
                </p>
              </div>
            )}

            {/* Connected status */}
            {instance.status === "connected" && (
              <div className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 rounded-lg p-4 flex items-center gap-3">
                <Wifi className="w-5 h-5 text-emerald-600" />
                <div>
                  <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">WhatsApp conectado e pronto!</p>
                  <p className="text-xs text-emerald-600/70 dark:text-emerald-500/70 mt-0.5">
                    Este número será usado para disparos e confirmações de cadastro.
                  </p>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2">
              {instance.status !== "connected" && (
                <Button variant="outline" size="sm" onClick={handleRefreshQR} disabled={refreshing}>
                  {refreshing ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <QrCode className="w-4 h-4 mr-1" />}
                  Atualizar QR Code
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={handleCheckStatus} disabled={refreshing}>
                {refreshing ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <RefreshCw className="w-4 h-4 mr-1" />}
                Verificar Status
              </Button>
            </div>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          💡 Os custos da instância WhatsApp são incluídos na sua assinatura. Não é necessário ter conta UAZAPI.
        </p>
      </CardContent>
    </Card>
  );
}
