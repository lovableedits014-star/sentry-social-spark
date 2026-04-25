import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger
} from "@/components/ui/alert-dialog";
import {
  Loader2, QrCode, Send, Trash2, Wifi, WifiOff, Pencil, Check, X, RefreshCw, Power
} from "lucide-react";
import { toast } from "sonner";

export interface PoolInstance {
  id: string;
  apelido: string;
  phone_number: string | null;
  status: string;
  is_active: boolean;
  last_send_at: string | null;
  messages_sent_today: number;
  total_sent: number;
  total_failed: number;
  consecutive_failures: number;
  connected_since: string | null;
  health_score: number;
  success_rate_24h: number;
  sent_24h: number;
  bridge_url: string | null;
  created_at: string;
}

interface Props {
  clientId: string;
  instance: PoolInstance;
  onChange: () => void;
}

function timeSince(iso: string | null): string {
  if (!iso) return "nunca";
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return `há ${Math.floor(diff)}s`;
  if (diff < 3600) return `há ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `há ${Math.floor(diff / 3600)}h`;
  return `há ${Math.floor(diff / 86400)}d`;
}

function healthLabel(score: number): { color: string; label: string; ring: string } {
  if (score >= 70) return { color: "text-emerald-600", ring: "ring-emerald-500/30 bg-emerald-500/10", label: "Saudável" };
  if (score >= 40) return { color: "text-amber-600", ring: "ring-amber-500/30 bg-amber-500/10", label: "Atenção" };
  return { color: "text-red-600", ring: "ring-red-500/30 bg-red-500/10", label: "Em risco" };
}

const CONNECTED = new Set(["connected", "open"]);

export default function WhatsAppInstancePoolCard({ clientId, instance, onChange }: Props) {
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState(instance.apelido);
  const [busy, setBusy] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);
  const [showTest, setShowTest] = useState(false);
  const [testPhone, setTestPhone] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => setName(instance.apelido), [instance.apelido]);

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    setPolling(false);
  }, []);

  useEffect(() => () => stopPolling(), [stopPolling]);

  const invoke = async (action: string, extra: Record<string, unknown> = {}) => {
    return supabase.functions.invoke("manage-whatsapp-instance", {
      body: { action, client_id: clientId, instance_id: instance.id, ...extra },
    });
  };

  const startPolling = () => {
    stopPolling();
    setPolling(true);
    let attempts = 0;
    pollRef.current = setInterval(async () => {
      attempts += 1;
      const { data } = await invoke("instance_status");
      const status = String(data?.status || data?.instance?.status || "").toLowerCase();
      const qr = data?.qrcode || data?.instance?.qrcode;
      if (qr && qr !== qrCode) setQrCode(typeof qr === "string" ? (qr.startsWith("data:") ? qr : `data:image/png;base64,${qr}`) : null);
      if (CONNECTED.has(status)) {
        setQrCode(null);
        stopPolling();
        toast.success(`${instance.apelido} conectado!`);
        onChange();
      } else if (attempts >= 25) {
        stopPolling();
      }
    }, 3000);
  };

  const handleConnect = async () => {
    setBusy("connect");
    try {
      const { data, error } = await invoke("create_instance");
      if (error || data?.error) {
        toast.error("Erro: " + (error?.message || data?.error));
        return;
      }
      const qr = data?.qrcode || data?.instance?.qrcode;
      if (qr) setQrCode(typeof qr === "string" ? (qr.startsWith("data:") ? qr : `data:image/png;base64,${qr}`) : null);
      startPolling();
      onChange();
    } finally {
      setBusy(null);
    }
  };

  const handleDisconnect = async () => {
    setBusy("disconnect");
    try {
      await invoke("disconnect");
      setQrCode(null);
      stopPolling();
      toast.success("Instância desconectada.");
      onChange();
    } finally { setBusy(null); }
  };

  const handleDelete = async () => {
    setBusy("delete");
    const { data, error } = await invoke("delete_instance_record");
    setBusy(null);
    if (error || data?.error) toast.error("Erro: " + (error?.message || data?.error));
    else { toast.success("Instância removida."); onChange(); }
  };

  const togglePool = async (active: boolean) => {
    await invoke("update_instance_record", { is_active: active });
    onChange();
  };

  const saveName = async () => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === instance.apelido) { setEditingName(false); return; }
    await invoke("update_instance_record", { apelido: trimmed });
    setEditingName(false);
    onChange();
  };

  const handleTest = async () => {
    const phone = testPhone.replace(/\D/g, "");
    if (phone.length < 10) { toast.error("Número inválido"); return; }
    setBusy("test");
    const { data, error } = await invoke("send", {
      phone,
      message: `✅ Teste do chip "${instance.apelido}" — Sentinelle.`,
    });
    setBusy(null);
    if (error || data?.error) toast.error("Falha: " + (error?.message || data?.error));
    else toast.success("Mensagem de teste enviada!");
  };

  const isConnected = CONNECTED.has(instance.status);
  const health = healthLabel(instance.health_score);
  const isNew = instance.connected_since
    && (Date.now() - new Date(instance.connected_since).getTime()) < 7 * 86400000;

  return (
    <div className="border rounded-lg p-4 space-y-3 bg-card">
      {/* Header: health + name + status */}
      <div className="flex items-start gap-3">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className={`w-12 h-12 rounded-full ring-2 ${health.ring} flex flex-col items-center justify-center cursor-help shrink-0`}>
                <span className={`text-sm font-bold leading-none ${health.color}`}>{instance.health_score}</span>
                <span className="text-[9px] text-muted-foreground leading-none mt-0.5">saúde</span>
              </div>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              <p className="text-xs">
                <b>Health Score: {health.label}</b><br />
                Combina tempo de descanso (70%) e taxa de entrega 24h (30%).<br />
                <b>{">70"}</b> saudável · <b>40-70</b> atenção · <b>{"<40"}</b> em risco.
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <div className="flex-1 min-w-0">
          {editingName ? (
            <div className="flex items-center gap-1">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-7 text-sm"
                autoFocus
                onKeyDown={(e) => e.key === "Enter" && saveName()}
              />
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={saveName}><Check className="w-3.5 h-3.5" /></Button>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setName(instance.apelido); setEditingName(false); }}><X className="w-3.5 h-3.5" /></Button>
            </div>
          ) : (
            <button className="group flex items-center gap-1 max-w-full" onClick={() => setEditingName(true)}>
              <span className="font-semibold text-sm truncate">{instance.apelido}</span>
              <Pencil className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
            </button>
          )}
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {isConnected ? (
              <Badge variant="outline" className="text-[10px] gap-1 border-emerald-500/40 text-emerald-700 dark:text-emerald-400">
                <Wifi className="w-2.5 h-2.5" /> Conectado
              </Badge>
            ) : instance.status === "banned" ? (
              <Badge variant="destructive" className="text-[10px]">Banido</Badge>
            ) : (
              <Badge variant="outline" className="text-[10px] gap-1 text-muted-foreground">
                <WifiOff className="w-2.5 h-2.5" /> {instance.status === "connecting" ? "Conectando..." : "Desconectado"}
              </Badge>
            )}
            {isNew && (
              <Badge variant="outline" className="text-[10px] border-blue-500/40 text-blue-700 dark:text-blue-400">Chip novo</Badge>
            )}
            {instance.phone_number && (
              <span className="text-[11px] text-muted-foreground font-mono">{instance.phone_number}</span>
            )}
          </div>
        </div>
      </div>

      {/* Métricas */}
      <div className="grid grid-cols-3 gap-2 text-center text-xs border-t border-b py-2">
        <div>
          <p className="font-semibold">{instance.messages_sent_today}</p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">hoje</p>
        </div>
        <div>
          <p className="font-semibold">{instance.success_rate_24h}%</p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">entrega 24h</p>
        </div>
        <div>
          <p className="font-semibold text-[11px]">{timeSince(instance.last_send_at)}</p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">último envio</p>
        </div>
      </div>

      {/* QR Code se em conexão */}
      {qrCode && (
        <div className="text-center border rounded-md p-3 bg-white">
          <img src={qrCode} alt="QR Code" className="w-44 h-44 mx-auto" />
          <p className="text-[11px] text-muted-foreground mt-2">
            Escaneie no WhatsApp do número desejado
          </p>
        </div>
      )}
      {polling && !qrCode && (
        <div className="text-center text-xs text-muted-foreground flex items-center justify-center gap-1 py-1">
          <Loader2 className="w-3 h-3 animate-spin" /> Aguardando QR Code...
        </div>
      )}

      {/* Pool toggle */}
      <div className="flex items-center justify-between bg-muted/30 rounded-md px-3 py-2">
        <Label htmlFor={`pool-${instance.id}`} className="text-xs cursor-pointer">
          Incluir no pool de rotação
        </Label>
        <Switch
          id={`pool-${instance.id}`}
          checked={instance.is_active}
          onCheckedChange={togglePool}
        />
      </div>

      {/* Ações */}
      <div className="flex flex-wrap gap-1.5">
        {!isConnected ? (
          <Button size="sm" variant="default" onClick={handleConnect} disabled={busy === "connect"} className="bg-green-600 hover:bg-green-700 text-white">
            {busy === "connect" ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <QrCode className="w-3.5 h-3.5 mr-1" />}
            Conectar
          </Button>
        ) : (
          <>
            <Button size="sm" variant="outline" onClick={() => setShowTest((v) => !v)}>
              <Send className="w-3.5 h-3.5 mr-1" /> Testar
            </Button>
            <Button size="sm" variant="outline" onClick={handleConnect} disabled={busy === "connect"}>
              <RefreshCw className={`w-3.5 h-3.5 mr-1 ${busy === "connect" ? "animate-spin" : ""}`} /> Reconectar
            </Button>
            <Button size="sm" variant="outline" onClick={handleDisconnect} disabled={busy === "disconnect"}>
              <Power className="w-3.5 h-3.5 mr-1" /> Desconectar
            </Button>
          </>
        )}

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button size="sm" variant="ghost" className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30 ml-auto">
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remover instância?</AlertDialogTitle>
              <AlertDialogDescription>
                A instância <b>{instance.apelido}</b> será desconectada e removida permanentemente.
                Esta ação não pode ser desfeita.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
                Remover
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {showTest && isConnected && (
        <div className="flex gap-1.5 pt-1">
          <Input
            value={testPhone}
            onChange={(e) => setTestPhone(e.target.value)}
            placeholder="5511999999999"
            className="h-8 text-xs font-mono"
          />
          <Button size="sm" onClick={handleTest} disabled={busy === "test" || !testPhone}>
            {busy === "test" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Enviar"}
          </Button>
        </div>
      )}
    </div>
  );
}