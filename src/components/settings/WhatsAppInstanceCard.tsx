import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Wifi, WifiOff, Smartphone } from "lucide-react";

interface WhatsAppInstanceCardProps {
  clientId: string;
}

export default function WhatsAppInstanceCard({ clientId }: WhatsAppInstanceCardProps) {
  const [configured, setConfigured] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkBridgeStatus();
  }, [clientId]);

  const checkBridgeStatus = async () => {
    try {
      const { data, error } = await supabase.functions.invoke("manage-whatsapp-instance", {
        body: { action: "check_bridge" },
      });
      if (!error && data?.configured) {
        setConfigured(true);
      }
    } catch {
      // Bridge not configured
    } finally {
      setLoading(false);
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

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
            <Smartphone className="w-5 h-5 text-green-600" />
          </div>
          <div className="flex-1">
            <CardTitle>WhatsApp — Ponte API</CardTitle>
            <CardDescription>
              Status da conexão com o sistema externo de envio de mensagens WhatsApp
            </CardDescription>
          </div>
          <Badge className={configured
            ? "bg-emerald-500/15 text-emerald-600 border-emerald-500/30"
            : "bg-red-500/15 text-red-600 border-red-500/30"
          }>
            {configured ? (
              <><Wifi className="w-3 h-3 mr-1" /> Ponte Configurada</>
            ) : (
              <><WifiOff className="w-3 h-3 mr-1" /> Não Configurada</>
            )}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {configured ? (
          <div className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 rounded-lg p-4 flex items-center gap-3">
            <Wifi className="w-5 h-5 text-emerald-600" />
            <div>
              <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">Ponte WhatsApp ativa e pronta!</p>
              <p className="text-xs text-emerald-600/70 dark:text-emerald-500/70 mt-0.5">
                A gestão da instância WhatsApp (QR Code, conexão) é feita no sistema externo. Aqui apenas os disparos são executados.
              </p>
            </div>
          </div>
        ) : (
          <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
            <p className="text-sm font-medium text-amber-700 dark:text-amber-400">⚠️ Ponte WhatsApp não configurada</p>
            <p className="text-xs text-amber-600/70 dark:text-amber-500/70 mt-1">
              O administrador da plataforma precisa configurar a URL e a chave da Ponte API no painel Super Admin para que os disparos de WhatsApp funcionem.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
