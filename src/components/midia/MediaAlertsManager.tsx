import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Bell, BellOff, Plus, Trash2, AlertTriangle, TrendingUp, Frown, CheckCheck, ExternalLink, Info, RefreshCw, Pencil, Play } from "lucide-react";
import { toast } from "sonner";

type Rule = {
  id: string;
  client_id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  keywords: string[];
  uf: string | null;
  municipio: string | null;
  country: string;
  language: string | null;
  domains: string[] | null;
  exclude_terms: string[] | null;
  timespan: string;
  alert_type: "volume" | "sentiment" | "both";
  min_volume: number;
  volume_growth_pct: number;
  negative_tone_threshold: number;
  negative_ratio_threshold: number;
  cooldown_minutes: number;
  last_checked_at: string | null;
  last_triggered_at: string | null;
};

type Event = {
  id: string;
  rule_id: string;
  rule_name: string;
  triggered_at: string;
  trigger_kind: "volume_spike" | "negative_sentiment" | "both";
  severity: "info" | "aviso" | "critico";
  total_articles: number;
  growth_pct: number | null;
  avg_tone: number | null;
  negatives: number;
  positives: number;
  neutrals: number;
  negative_ratio: number | null;
  query_snapshot: string | null;
  sample_articles: any[];
  is_read: boolean;
};

const UFS = ["AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT","PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO"];

const DEFAULT_RULE: Partial<Rule> = {
  name: "",
  description: "",
  is_active: true,
  keywords: [],
  uf: null,
  municipio: null,
  country: "BR",
  language: "por",
  domains: [],
  exclude_terms: [],
  timespan: "6h",
  alert_type: "both",
  min_volume: 10,
  volume_growth_pct: 100,
  negative_tone_threshold: -2,
  negative_ratio_threshold: 0.5,
  cooldown_minutes: 120,
};

function severityColor(s: string) {
  if (s === "critico") return "bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30";
  if (s === "aviso") return "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30";
  return "bg-sky-500/15 text-sky-700 dark:text-sky-400 border-sky-500/30";
}
function kindLabel(k: string) {
  if (k === "volume_spike") return "Pico de volume";
  if (k === "negative_sentiment") return "Sentimento negativo";
  return "Volume + Sentimento";
}
function fmt(d: string) {
  return new Date(d).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export default function MediaAlertsManager({ clientId }: { clientId: string | null }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Partial<Rule> | null>(null);
  const [keywordInput, setKeywordInput] = useState("");
  const [domainInput, setDomainInput] = useState("");
  const [excludeInput, setExcludeInput] = useState("");
  const [running, setRunning] = useState<string | null>(null);

  const { data: rules = [], refetch: refetchRules } = useQuery<Rule[]>({
    queryKey: ["media-alert-rules", clientId],
    enabled: !!clientId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("media_alert_rules")
        .select("*")
        .eq("client_id", clientId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as Rule[]) || [];
    },
  });

  const { data: events = [], refetch: refetchEvents } = useQuery<Event[]>({
    queryKey: ["media-alert-events", clientId],
    enabled: !!clientId,
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("media_alert_events")
        .select("*")
        .eq("client_id", clientId!)
        .order("triggered_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data as Event[]) || [];
    },
  });

  const unread = useMemo(() => events.filter((e) => !e.is_read).length, [events]);

  function openNew() {
    setEditing({ ...DEFAULT_RULE });
    setKeywordInput(""); setDomainInput(""); setExcludeInput("");
  }
  function openEdit(r: Rule) {
    setEditing({ ...r });
    setKeywordInput(""); setDomainInput(""); setExcludeInput("");
  }

  async function saveRule() {
    if (!editing || !clientId) return;
    if (!editing.name || (editing.keywords?.length ?? 0) === 0) {
      toast.error("Defina um nome e ao menos uma palavra-chave.");
      return;
    }
    const payload: any = {
      client_id: clientId,
      name: editing.name,
      description: editing.description || null,
      is_active: editing.is_active ?? true,
      keywords: editing.keywords || [],
      uf: editing.uf || null,
      municipio: editing.municipio || null,
      country: editing.country || "BR",
      language: editing.language || null,
      domains: editing.domains || [],
      exclude_terms: editing.exclude_terms || [],
      timespan: editing.timespan || "6h",
      alert_type: editing.alert_type || "both",
      min_volume: Number(editing.min_volume) || 10,
      volume_growth_pct: Number(editing.volume_growth_pct) || 100,
      negative_tone_threshold: Number(editing.negative_tone_threshold) || -2,
      negative_ratio_threshold: Number(editing.negative_ratio_threshold) || 0.5,
      cooldown_minutes: Number(editing.cooldown_minutes) || 120,
    };
    let err;
    if (editing.id) {
      ({ error: err } = await supabase.from("media_alert_rules").update(payload).eq("id", editing.id));
    } else {
      ({ error: err } = await supabase.from("media_alert_rules").insert(payload));
    }
    if (err) { toast.error("Falha ao salvar: " + err.message); return; }
    toast.success("Regra salva.");
    setEditing(null);
    qc.invalidateQueries({ queryKey: ["media-alert-rules", clientId] });
  }

  async function toggleActive(rule: Rule) {
    const { error } = await supabase
      .from("media_alert_rules")
      .update({ is_active: !rule.is_active })
      .eq("id", rule.id);
    if (error) toast.error(error.message);
    else { toast.success(rule.is_active ? "Regra pausada." : "Regra ativada."); refetchRules(); }
  }

  async function deleteRule(rule: Rule) {
    if (!confirm(`Excluir regra "${rule.name}"?`)) return;
    const { error } = await supabase.from("media_alert_rules").delete().eq("id", rule.id);
    if (error) toast.error(error.message);
    else { toast.success("Regra excluída."); refetchRules(); }
  }

  async function runNow(rule: Rule) {
    setRunning(rule.id);
    try {
      const { data, error } = await supabase.functions.invoke("gdelt-alerts-check", {
        body: { rule_id: rule.id },
      });
      if (error) throw error;
      const r = data?.results?.[0];
      if (r?.fired) toast.success(`Alerta disparado: ${kindLabel(r.kind)} (${r.severity})`);
      else if (r?.skipped) toast.info(`Sem disparo (${r.skipped}).`);
      else toast.message("Verificado. Nenhum gatilho atingido no momento.");
      refetchRules(); refetchEvents();
    } catch (e: any) {
      toast.error("Erro: " + (e?.message || e));
    } finally {
      setRunning(null);
    }
  }

  async function markRead(ev: Event) {
    await supabase.from("media_alert_events").update({ is_read: true, read_at: new Date().toISOString() }).eq("id", ev.id);
    refetchEvents();
  }
  async function markAllRead() {
    if (!clientId) return;
    await supabase.from("media_alert_events").update({ is_read: true, read_at: new Date().toISOString() })
      .eq("client_id", clientId).eq("is_read", false);
    refetchEvents();
    toast.success("Todos marcados como lidos.");
  }

  function addKeyword() {
    const v = keywordInput.trim();
    if (!v || !editing) return;
    setEditing({ ...editing, keywords: [...(editing.keywords || []), v] });
    setKeywordInput("");
  }
  function addDomain() {
    const v = domainInput.trim().toLowerCase().replace(/^https?:\/\//,"").replace(/^www\./,"").split("/")[0];
    if (!v || !editing) return;
    setEditing({ ...editing, domains: [...(editing.domains || []), v] });
    setDomainInput("");
  }
  function addExclude() {
    const v = excludeInput.trim();
    if (!v || !editing) return;
    setEditing({ ...editing, exclude_terms: [...(editing.exclude_terms || []), v] });
    setExcludeInput("");
  }

  if (!clientId) {
    return (
      <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">
        Carregando contexto do cliente…
      </CardContent></Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header com contadores */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Bell className="w-4 h-4 text-primary" />
                Alertas de Mídia
                {unread > 0 && (
                  <Badge variant="destructive" className="ml-1">{unread} não lido(s)</Badge>
                )}
              </CardTitle>
              <CardDescription>
                Monitora picos de cobertura e sentimento negativo automaticamente (verificação a cada hora).
              </CardDescription>
            </div>
            <div className="flex gap-2">
              {unread > 0 && (
                <Button variant="outline" size="sm" onClick={markAllRead}>
                  <CheckCheck className="w-3.5 h-3.5 mr-1.5" /> Marcar todos como lidos
                </Button>
              )}
              <Button size="sm" onClick={openNew}>
                <Plus className="w-3.5 h-3.5 mr-1.5" /> Nova regra
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Lista de regras */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Regras configuradas ({rules.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {rules.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              Nenhuma regra ainda. Crie a primeira para começar a monitorar automaticamente.
            </p>
          ) : (
            <div className="space-y-2">
              {rules.map((r) => (
                <div key={r.id} className="border rounded-lg p-3 flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-[200px]">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{r.name}</span>
                      {r.is_active ? (
                        <Badge variant="outline" className="border-emerald-500/40 text-emerald-700 dark:text-emerald-400">Ativa</Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground">Pausada</Badge>
                      )}
                      <Badge variant="secondary" className="text-xs">
                        {r.alert_type === "volume" ? "Pico" : r.alert_type === "sentiment" ? "Sentimento" : "Pico + Sentimento"}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      <strong>Termos:</strong> {r.keywords.join(", ") || "—"}
                      {r.uf && <> · UF: {r.uf}</>}
                      {r.municipio && <> · {r.municipio}</>}
                      <> · Janela: {r.timespan}</>
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Mín. {r.min_volume} artigos · Crescimento ≥ {r.volume_growth_pct}% · Tom ≤ {r.negative_tone_threshold} · Negativos ≥ {(r.negative_ratio_threshold*100).toFixed(0)}%
                    </p>
                    {r.last_triggered_at && (
                      <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                        Último disparo: {fmt(r.last_triggered_at)}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => runNow(r)} disabled={running === r.id}>
                            <Play className={`w-3.5 h-3.5 ${running === r.id ? "animate-pulse" : ""}`} />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Verificar agora</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => toggleActive(r)}>
                            {r.is_active ? <BellOff className="w-3.5 h-3.5" /> : <Bell className="w-3.5 h-3.5" />}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>{r.is_active ? "Pausar" : "Ativar"}</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(r)}>
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Editar</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => deleteRule(r)}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Excluir</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Histórico de eventos */}
      <Card>
        <CardHeader className="pb-3 flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              Alertas recentes
            </CardTitle>
            <CardDescription>Últimos 50 disparos. Marque como lido após verificar.</CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={() => refetchEvents()}>
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
        </CardHeader>
        <CardContent>
          {events.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Nenhum alerta disparado ainda.</p>
          ) : (
            <div className="space-y-2">
              {events.map((e) => (
                <div key={e.id} className={`border rounded-lg p-3 ${!e.is_read ? "bg-accent/30 border-primary/30" : ""}`}>
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex-1 min-w-[220px]">
                      <div className="flex items-center gap-2 flex-wrap">
                        {e.trigger_kind === "volume_spike" ? <TrendingUp className="w-4 h-4 text-amber-500" />
                          : e.trigger_kind === "negative_sentiment" ? <Frown className="w-4 h-4 text-rose-500" />
                          : <AlertTriangle className="w-4 h-4 text-rose-500" />}
                        <span className="font-medium text-sm">{e.rule_name}</span>
                        <Badge variant="outline" className={severityColor(e.severity)}>{e.severity.toUpperCase()}</Badge>
                        <Badge variant="secondary" className="text-xs">{kindLabel(e.trigger_kind)}</Badge>
                        {!e.is_read && <Badge variant="default" className="text-xs">Novo</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {fmt(e.triggered_at)} · {e.total_articles} artigos
                        {e.growth_pct != null && <> · Crescimento {e.growth_pct}%</>}
                        {e.avg_tone != null && <> · Tom médio {e.avg_tone}</>}
                        <> · {e.negatives} neg / {e.neutrals} neu / {e.positives} pos</>
                      </p>
                      {Array.isArray(e.sample_articles) && e.sample_articles.length > 0 && (
                        <ul className="mt-2 space-y-1">
                          {e.sample_articles.slice(0, 3).map((a: any, i: number) => (
                            <li key={i} className="text-xs">
                              <a href={a.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-start gap-1">
                                <ExternalLink className="w-3 h-3 mt-0.5 shrink-0" />
                                <span>{a.title || a.url}</span>
                              </a>
                              {a.domain && <span className="text-muted-foreground"> — {a.domain}</span>}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    {!e.is_read && (
                      <Button variant="outline" size="sm" onClick={() => markRead(e)}>
                        <CheckCheck className="w-3.5 h-3.5 mr-1.5" /> Lido
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog de edição/criação */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Editar regra" : "Nova regra de alerta"}</DialogTitle>
            <DialogDescription>Configure os filtros e limiares. Picos e/ou sentimento negativo disparam um alerta.</DialogDescription>
          </DialogHeader>

          {editing && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="text-xs font-medium mb-1 block">Nome da regra *</label>
                  <Input value={editing.name || ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="Ex.: Crise saúde Campo Grande" />
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-medium mb-1 block">Descrição (opcional)</label>
                  <Textarea rows={2} value={editing.description || ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
                </div>

                <div className="col-span-2">
                  <label className="text-xs font-medium mb-1 block">Palavras-chave * (Enter para adicionar)</label>
                  <div className="flex gap-2">
                    <Input value={keywordInput} onChange={(e) => setKeywordInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addKeyword(); } }} placeholder='Ex.: "reforma tributária"' />
                    <Button type="button" variant="outline" onClick={addKeyword}>+</Button>
                  </div>
                  {(editing.keywords?.length ?? 0) > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {editing.keywords!.map((k, i) => (
                        <Badge key={i} variant="secondary" className="gap-1">
                          {k}
                          <button onClick={() => setEditing({ ...editing, keywords: editing.keywords!.filter((_, j) => j !== i) })}>×</button>
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <label className="text-xs font-medium mb-1 block">UF</label>
                  <Select value={editing.uf || "__none__"} onValueChange={(v) => setEditing({ ...editing, uf: v === "__none__" ? null : v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent className="max-h-72">
                      <SelectItem value="__none__">Todas</SelectItem>
                      {UFS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-medium mb-1 block">Município</label>
                  <Input value={editing.municipio || ""} onChange={(e) => setEditing({ ...editing, municipio: e.target.value })} placeholder="Ex.: Campo Grande" />
                </div>

                <div>
                  <label className="text-xs font-medium mb-1 block">Janela de avaliação</label>
                  <Select value={editing.timespan || "6h"} onValueChange={(v) => setEditing({ ...editing, timespan: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1h">Última 1h</SelectItem>
                      <SelectItem value="3h">Últimas 3h</SelectItem>
                      <SelectItem value="6h">Últimas 6h</SelectItem>
                      <SelectItem value="12h">Últimas 12h</SelectItem>
                      <SelectItem value="24h">Últimas 24h</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-medium mb-1 block">Tipo de alerta</label>
                  <Select value={editing.alert_type || "both"} onValueChange={(v: any) => setEditing({ ...editing, alert_type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="volume">Pico de volume</SelectItem>
                      <SelectItem value="sentiment">Sentimento negativo</SelectItem>
                      <SelectItem value="both">Ambos</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-xs font-medium mb-1 flex items-center gap-1">
                    Mín. de artigos
                    <TooltipProvider><Tooltip><TooltipTrigger><Info className="w-3 h-3 text-muted-foreground" /></TooltipTrigger>
                      <TooltipContent className="max-w-xs">Volume mínimo na janela para considerar disparo. Evita alarmes em temas com pouca cobertura.</TooltipContent>
                    </Tooltip></TooltipProvider>
                  </label>
                  <Input type="number" min={1} value={editing.min_volume ?? 10} onChange={(e) => setEditing({ ...editing, min_volume: Number(e.target.value) })} />
                </div>
                <div>
                  <label className="text-xs font-medium mb-1 flex items-center gap-1">
                    Crescimento mín. (%)
                    <TooltipProvider><Tooltip><TooltipTrigger><Info className="w-3 h-3 text-muted-foreground" /></TooltipTrigger>
                      <TooltipContent className="max-w-xs">Aumento percentual em relação à janela imediatamente anterior. 100% = volume dobrou.</TooltipContent>
                    </Tooltip></TooltipProvider>
                  </label>
                  <Input type="number" min={0} value={editing.volume_growth_pct ?? 100} onChange={(e) => setEditing({ ...editing, volume_growth_pct: Number(e.target.value) })} />
                </div>
                <div>
                  <label className="text-xs font-medium mb-1 flex items-center gap-1">
                    Tom médio máximo
                    <TooltipProvider><Tooltip><TooltipTrigger><Info className="w-3 h-3 text-muted-foreground" /></TooltipTrigger>
                      <TooltipContent className="max-w-xs">Tom GDELT vai de -10 (muito negativo) a +10 (muito positivo). Padrão -2 captura cobertura claramente negativa.</TooltipContent>
                    </Tooltip></TooltipProvider>
                  </label>
                  <Input type="number" step="0.1" value={editing.negative_tone_threshold ?? -2} onChange={(e) => setEditing({ ...editing, negative_tone_threshold: Number(e.target.value) })} />
                </div>
                <div>
                  <label className="text-xs font-medium mb-1 flex items-center gap-1">
                    % mín. de notícias negativas
                    <TooltipProvider><Tooltip><TooltipTrigger><Info className="w-3 h-3 text-muted-foreground" /></TooltipTrigger>
                      <TooltipContent className="max-w-xs">Proporção de artigos com tom negativo na janela. 0.5 = metade da cobertura é negativa.</TooltipContent>
                    </Tooltip></TooltipProvider>
                  </label>
                  <Input type="number" step="0.05" min={0} max={1} value={editing.negative_ratio_threshold ?? 0.5} onChange={(e) => setEditing({ ...editing, negative_ratio_threshold: Number(e.target.value) })} />
                </div>
                <div>
                  <label className="text-xs font-medium mb-1 flex items-center gap-1">
                    Cooldown (min)
                    <TooltipProvider><Tooltip><TooltipTrigger><Info className="w-3 h-3 text-muted-foreground" /></TooltipTrigger>
                      <TooltipContent className="max-w-xs">Tempo mínimo entre disparos da mesma regra. Evita receber o mesmo alerta repetidas vezes.</TooltipContent>
                    </Tooltip></TooltipProvider>
                  </label>
                  <Input type="number" min={5} value={editing.cooldown_minutes ?? 120} onChange={(e) => setEditing({ ...editing, cooldown_minutes: Number(e.target.value) })} />
                </div>
                <div>
                  <label className="text-xs font-medium mb-1 block">Idioma</label>
                  <Select value={editing.language || "__any__"} onValueChange={(v) => setEditing({ ...editing, language: v === "__any__" ? null : v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__any__">Qualquer</SelectItem>
                      <SelectItem value="por">Português</SelectItem>
                      <SelectItem value="eng">Inglês</SelectItem>
                      <SelectItem value="spa">Espanhol</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="col-span-2">
                  <label className="text-xs font-medium mb-1 block">Domínios (opcional, restringe fontes)</label>
                  <div className="flex gap-2">
                    <Input value={domainInput} onChange={(e) => setDomainInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addDomain(); } }} placeholder="Ex.: g1.globo.com" />
                    <Button type="button" variant="outline" onClick={addDomain}>+</Button>
                  </div>
                  {(editing.domains?.length ?? 0) > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {editing.domains!.map((d, i) => (
                        <Badge key={i} variant="outline" className="gap-1">{d}
                          <button onClick={() => setEditing({ ...editing, domains: editing.domains!.filter((_, j) => j !== i) })}>×</button>
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>

                <div className="col-span-2">
                  <label className="text-xs font-medium mb-1 block">Termos a excluir (opcional)</label>
                  <div className="flex gap-2">
                    <Input value={excludeInput} onChange={(e) => setExcludeInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addExclude(); } }} placeholder="Ex.: futebol" />
                    <Button type="button" variant="outline" onClick={addExclude}>+</Button>
                  </div>
                  {(editing.exclude_terms?.length ?? 0) > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {editing.exclude_terms!.map((d, i) => (
                        <Badge key={i} variant="outline" className="gap-1">−{d}
                          <button onClick={() => setEditing({ ...editing, exclude_terms: editing.exclude_terms!.filter((_, j) => j !== i) })}>×</button>
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>

                <div className="col-span-2 flex items-center gap-2 pt-2">
                  <Switch checked={editing.is_active ?? true} onCheckedChange={(v) => setEditing({ ...editing, is_active: v })} />
                  <span className="text-sm">Regra ativa (será verificada a cada hora)</span>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button onClick={saveRule}>Salvar regra</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}