import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  Loader2, Wifi, WifiOff, Smartphone, QrCode, RefreshCw,
  Send, CheckCircle2, XCircle, Unplug
} from "lucide-react";

interface WhatsAppInstanceCardProps {
  clientId: string;
}

type ConnectionState = "loading" | "not_configured" | "awaiting_scan" | "connected" | "disconnected";

export default function WhatsAppInstanceCard({ clientId }: WhatsAppInstanceCardProps) {
  const [state, setState] = useState<ConnectionState>("loading");
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [testPhone, setTestPhone] = useState("");
  const [testing, setTesting] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  // Check initial status
  useEffect(() => {
    checkStatus();
    return () => stopPolling();
  }, [clientId]);

  const checkStatus = async () => {
    try {
      const { data, error } = await supabase.functions.invoke("manage-whatsapp-instance", {
        body: { action: "check_bridge", client_id: clientId },
      });
      if (error || !data?.configured) {
        setState("not_configured");
        return;
      }
      // Bridge is configured, check actual instance status
      await pollInstanceStatus();
    } catch {
      setState("not_configured");
    }
  };

  const pollInstanceStatus = async () => {
    try {
      const { data, error } = await supabase.functions.invoke("manage-whatsapp-instance", {
        body: { action: "instance_status", client_id: clientId },
      });
      if (error) {
        setState("disconnected");
        return;
      }
      const status = data?.status || data?.instance?.status;
      if (status === "connected" || status === "open") {
        setState("connected");
        stopPolling();
      } else if (data?.qrcode) {
        setQrCode(data.qrcode);
        setState("awaiting_scan");
      } else {
        setState("disconnected");
      }
    } catch {
      setState("disconnected");
    }
  };

  const startPolling = () => {
    stopPolling();
    pollingRef.current = setInterval(async () => {
      await pollInstanceStatus();
    }, 4000);
  };

  const handleCreateInstance = async () => {
    setCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-whatsapp-instance", {
        body: { action: "create_instance", client_id: clientId },
      });
      if (error) {
        toast.error("Erro ao criar instância: " + (error.message || "Erro desconhecido"));
        return;
      }
      if (data?.qrcode) {
        setQrCode(data.qrcode);
        setState("awaiting_scan");
        startPolling();
        toast.success("Instância criada! Escaneie o QR Code com seu WhatsApp.");
      } else {
        toast.error(data?.error || "Resposta inesperada da ponte");
      }
    } catch (err: any) {
      toast.error("Erro: " + err.message);
    } finally {
      setCreating(false);
    }
  };

  const handleReconnect = async () => {
    setReconnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-whatsapp-instance", {
        body: { action: "reconnect", client_id: clientId },
      });
      if (error) {
        toast.error("Erro ao reconectar: " + error.message);
        return;
      }
      if (data?.qrcode) {
        setQrCode(data.qrcode);
        setState("awaiting_scan");
        startPolling();
        toast.info("Novo QR Code gerado. Escaneie novamente.");
      } else if (data?.status === "connected" || data?.status === "open") {
        setState("connected");
        toast.success("WhatsApp reconectado!");
      } else {
        toast.info("Reconexão solicitada. Verificando status...");
        startPolling();
      }
    } catch (err: any) {
      toast.error("Erro: " + err.message);
    } finally {
      setReconnecting(false);
    }
  };

  const handleTestSend = async () => {
    const phone = testPhone.replace(/\D/g, "");
    if (!phone || phone.length < 10) {
      toast.error("Digite um número válido com DDI + DDD (ex: 5511999999999)");
      return;
    }
    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-whatsapp-instance", {
        body: {
          action: "send",
          client_id: clientId,
          phone,
          message: "✅ Teste de conexão WhatsApp — Sentinelle. Integração funcionando!",
        },
      });
      if (error) {
        toast.error("Falha no envio: " + error.message);
      } else if (data?.error) {
        toast.error("Falha: " + data.error);
      } else {
        toast.success("Mensagem de teste enviada com sucesso!");
      }
    } catch (err: any) {
      toast.error("Erro: " + err.message);
    } finally {
      setTesting(false);
    }
  };

  if (state === "loading") {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Verificando conexão WhatsApp...</span>
          </div>
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
            <CardTitle>Conexão WhatsApp</CardTitle>
            <CardDescription>
              Conecte seu WhatsApp para envio de mensagens e disparos automáticos
            </CardDescription>
          </div>
          <StatusBadge state={state} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* NOT CONFIGURED */}
        {state === "not_configured" && (
          <div className="text-center space-y-4 py-4">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto">
              <QrCode className="w-8 h-8 text-muted-foreground" />
            </div>
            <div>
              <p className="font-medium">Nenhuma instância WhatsApp conectada</p>
              <p className="text-sm text-muted-foreground mt-1">
                Clique abaixo para gerar um QR Code e conectar seu WhatsApp
              </p>
            </div>
            <Button
              onClick={handleCreateInstance}
              disabled={creating}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              {creating ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <QrCode className="w-4 h-4 mr-2" />
              )}
              {creating ? "Criando instância..." : "Conectar WhatsApp"}
            </Button>
          </div>
        )}

        {/* AWAITING SCAN */}
        {state === "awaiting_scan" && qrCode && (
          <div className="text-center space-y-4 py-2">
            <div className="bg-white rounded-xl p-4 inline-block shadow-sm border">
              <img src={qrCode} alt="QR Code WhatsApp" className="w-64 h-64 mx-auto" />
            </div>
            <div>
              <p className="font-medium text-green-700 dark:text-green-400">
                📱 Escaneie o QR Code com seu WhatsApp
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Abra o WhatsApp → Menu (⋮) → Aparelhos conectados → Conectar aparelho
              </p>
            </div>
            <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="w-3 h-3 animate-spin" />
              Aguardando leitura do QR Code...
            </div>
          </div>
        )}

        {/* CONNECTED */}
        {state === "connected" && (
          <div className="space-y-4">
            <div className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 rounded-lg p-4 flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <div>
                <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
                  WhatsApp conectado e pronto!
                </p>
                <p className="text-xs text-emerald-600/70 dark:text-emerald-500/70 mt-0.5">
                  Sua instância está ativa. Disparos de mensagens serão enviados por este WhatsApp.
                </p>
              </div>
            </div>

            {/* Test send */}
            <div className="border rounded-lg p-4 space-y-3">
              <Label className="text-sm font-medium flex items-center gap-1.5">
                <Send className="w-3.5 h-3.5" /> Enviar mensagem de teste
              </Label>
              <div className="flex gap-2">
                <Input
                  value={testPhone}
                  onChange={(e) => setTestPhone(e.target.value.replace(/[^0-9]/g, ""))}
                  placeholder="5511999999999"
                  className="font-mono max-w-[220px]"
                  maxLength={15}
                />
                <Button
                  onClick={handleTestSend}
                  disabled={testing || !testPhone}
                  variant="outline"
                  size="sm"
                >
                  {testing ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Send className="w-4 h-4 mr-1" />}
                  Testar
                </Button>
              </div>
            </div>

            {/* Reconnect */}
            <Button
              onClick={handleReconnect}
              disabled={reconnecting}
              variant="outline"
              size="sm"
              className="w-full"
            >
              {reconnecting ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <RefreshCw className="w-4 h-4 mr-1" />}
              Reconectar / Gerar novo QR Code
            </Button>
          </div>
        )}

        {/* DISCONNECTED */}
        {state === "disconnected" && (
          <div className="text-center space-y-4 py-4">
            <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mx-auto">
              <Unplug className="w-8 h-8 text-red-500" />
            </div>
            <div>
              <p className="font-medium text-red-600 dark:text-red-400">WhatsApp desconectado</p>
              <p className="text-sm text-muted-foreground mt-1">
                A sessão expirou ou o aparelho foi desconectado. Reconecte escaneando um novo QR Code.
              </p>
            </div>
            <Button
              onClick={handleReconnect}
              disabled={reconnecting}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              {reconnecting ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-2" />
              )}
              Reconectar WhatsApp
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StatusBadge({ state }: { state: ConnectionState }) {
  if (state === "connected") {
    return (
      <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30">
        <Wifi className="w-3 h-3 mr-1" /> Conectado
      </Badge>
    );
  }
  if (state === "awaiting_scan") {
    return (
      <Badge className="bg-amber-500/15 text-amber-600 border-amber-500/30">
        <QrCode className="w-3 h-3 mr-1" /> Aguardando QR
      </Badge>
    );
  }
  if (state === "disconnected") {
    return (
      <Badge className="bg-red-500/15 text-red-600 border-red-500/30">
        <WifiOff className="w-3 h-3 mr-1" /> Desconectado
      </Badge>
    );
  }
  return (
    <Badge className="bg-muted text-muted-foreground">
      <XCircle className="w-3 h-3 mr-1" /> Sem instância
    </Badge>
  );
}
