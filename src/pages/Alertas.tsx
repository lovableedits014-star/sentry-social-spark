import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Bell, BellOff, ShieldAlert, TrendingDown, MessageSquareWarning,
  Clock, Eye, Trash2, RefreshCw, AlertTriangle, CheckCircle2, Loader2,
  Zap,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

type Alerta = {
  id: string;
  client_id: string;
  tipo: string;
  severidade: string;
  titulo: string;
  descricao: string | null;
  dados: any;
  lido: boolean;
  descartado: boolean;
  created_at: string;
};

const TIPO_CONFIG: Record<string, { icon: any; color: string; label: string }> = {
  crise: { icon: ShieldAlert, color: "text-red-500", label: "Crise" },
  sentimento_negativo: { icon: MessageSquareWarning, color: "text-orange-500", label: "Sentimento" },
  queda_engajamento: { icon: TrendingDown, color: "text-amber-500", label: "Engajamento" },
  tarefa_atrasada: { icon: Clock, color: "text-blue-500", label: "Tarefas" },
  inatividade: { icon: BellOff, color: "text-slate-500", label: "Inatividade" },
};

const SEVERIDADE_CONFIG: Record<string, { label: string; color: string }> = {
  baixa: { label: "Baixa", color: "bg-slate-500/10 text-slate-400 border-slate-500/30" },
  media: { label: "Média", color: "bg-blue-500/10 text-blue-400 border-blue-500/30" },
  alta: { label: "Alta", color: "bg-orange-500/10 text-orange-400 border-orange-500/30" },
  critica: { label: "Crítica", color: "bg-red-500/10 text-red-400 border-red-500/30 animate-pulse" },
};

const AlertasPage = () => {
  const [clientId, setClientId] = useState<string | null>(null);
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [filtroTipo, setFiltroTipo] = useState<string>("todos");
  const [filtroLido, setFiltroLido] = useState<string>("nao_lidos");

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const { data: client } = await supabase
      .from("clients").select("id").eq("user_id", session.user.id).maybeSingle();
    let cId = client?.id;
    if (!cId) {
      const { data: tm } = await supabase
        .from("team_members").select("client_id").eq("user_id", session.user.id).eq("status", "active").maybeSingle();
      cId = tm?.client_id;
    }
    if (!cId) { setLoading(false); return; }
    setClientId(cId);

    const { data } = await supabase
      .from("alertas")
      .select("*")
      .eq("client_id", cId)
      .eq("descartado", false)
      .order("created_at", { ascending: false })
      .limit(100);

    if (data) setAlertas(data as Alerta[]);
    setLoading(false);
  };

  const runScan = async () => {
    if (!clientId) return;
    setScanning(true);
    try {
      const { data, error } = await supabase.functions.invoke("check-alerts", {
        body: { client_id: clientId },
      });
      if (error) throw error;
      toast.success(`Análise concluída: ${data.alerts_generated} alerta(s) gerado(s)`);
      loadData();
    } catch (e: any) {
      toast.error("Erro ao analisar: " + (e.message || "falha na análise"));
    }
    setScanning(false);
  };

  const markAsRead = async (id: string) => {
    await supabase.from("alertas").update({ lido: true }).eq("id", id);
    setAlertas(prev => prev.map(a => a.id === id ? { ...a, lido: true } : a));
  };

  const markAllAsRead = async () => {
    if (!clientId) return;
    await supabase.from("alertas").update({ lido: true }).eq("client_id", clientId).eq("lido", false);
    setAlertas(prev => prev.map(a => ({ ...a, lido: true })));
    toast.success("Todos marcados como lidos");
  };

  const dismissAlert = async (id: string) => {
    await supabase.from("alertas").update({ descartado: true }).eq("id", id);
    setAlertas(prev => prev.filter(a => a.id !== id));
    toast.success("Alerta descartado");
  };

  // Filtered alerts
  const filtered = alertas.filter(a => {
    if (filtroTipo !== "todos" && a.tipo !== filtroTipo) return false;
    if (filtroLido === "nao_lidos" && a.lido) return false;
    if (filtroLido === "lidos" && !a.lido) return false;
    return true;
  });

  const naoLidos = alertas.filter(a => !a.lido).length;

  // Summary counts
  const countByType = (tipo: string) => alertas.filter(a => a.tipo === tipo && !a.lido).length;

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Bell className="w-6 h-6 text-primary" />
            Alertas Inteligentes
            {naoLidos > 0 && (
              <Badge variant="destructive" className="text-xs">{naoLidos}</Badge>
            )}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Monitoramento automático de sentimento, engajamento e crises
          </p>
        </div>
        <div className="flex gap-2">
          {naoLidos > 0 && (
            <Button variant="outline" size="sm" onClick={markAllAsRead} className="gap-1">
              <Eye className="w-3.5 h-3.5" /> Marcar todos como lidos
            </Button>
          )}
          <Button onClick={runScan} disabled={scanning} className="gap-2">
            {scanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
            {scanning ? "Analisando..." : "Analisar Agora"}
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {Object.entries(TIPO_CONFIG).map(([tipo, cfg]) => {
          const Icon = cfg.icon;
          const count = countByType(tipo);
          return (
            <Card key={tipo} className={`cursor-pointer transition-all hover:shadow-md ${filtroTipo === tipo ? "ring-2 ring-primary" : ""}`}
              onClick={() => setFiltroTipo(filtroTipo === tipo ? "todos" : tipo)}>
              <CardContent className="p-3 flex items-center gap-3">
                <Icon className={`w-5 h-5 ${cfg.color}`} />
                <div>
                  <p className="text-lg font-bold text-foreground leading-none">{count}</p>
                  <p className="text-[10px] text-muted-foreground uppercase">{cfg.label}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex gap-3 items-center">
        <Select value={filtroLido} onValueChange={setFiltroLido}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="nao_lidos">Não lidos</SelectItem>
            <SelectItem value="lidos">Lidos</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">{filtered.length} alerta(s)</span>
      </div>

      {/* Alerts Timeline */}
      {filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-8 text-center text-muted-foreground">
            <CheckCircle2 className="w-12 h-12 mx-auto mb-3 opacity-20" />
            <p className="font-medium">Nenhum alerta {filtroLido === "nao_lidos" ? "não lido" : ""}</p>
            <p className="text-sm mt-1">
              Clique em "Analisar Agora" para verificar sentimento, engajamento e tarefas
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map(a => {
            const tipoCfg = TIPO_CONFIG[a.tipo] || TIPO_CONFIG.inatividade;
            const sevCfg = SEVERIDADE_CONFIG[a.severidade] || SEVERIDADE_CONFIG.media;
            const Icon = tipoCfg.icon;
            return (
              <Card
                key={a.id}
                className={`transition-all ${
                  !a.lido ? "border-l-4 border-l-primary shadow-md" : "opacity-75"
                } ${a.severidade === "critica" ? "border-l-destructive bg-destructive/5" : ""}`}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-lg bg-muted/50 shrink-0 mt-0.5 ${tipoCfg.color}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <h3 className={`text-sm font-semibold ${!a.lido ? "text-foreground" : "text-muted-foreground"}`}>
                          {a.titulo}
                        </h3>
                        <Badge variant="outline" className={`text-[10px] ${sevCfg.color}`}>
                          {sevCfg.label}
                        </Badge>
                      </div>
                      {a.descricao && (
                        <p className="text-sm text-muted-foreground">{a.descricao}</p>
                      )}
                      <p className="text-[11px] text-muted-foreground mt-2">
                        {formatDistanceToNow(new Date(a.created_at), { addSuffix: true, locale: ptBR })}
                        {" · "}
                        {format(new Date(a.created_at), "dd/MM HH:mm")}
                      </p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      {!a.lido && (
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => markAsRead(a.id)} title="Marcar como lido">
                          <Eye className="w-4 h-4" />
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => dismissAlert(a.id)} title="Descartar">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default AlertasPage;
