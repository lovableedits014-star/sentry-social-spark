import { useState, useEffect, useRef, useCallback } from "react";
import ContractTemplatesManager from "@/components/contratados/ContractTemplatesManager";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Progress } from "@/components/ui/progress";
import {
  Briefcase, Search, Users, QrCode, Play, Pause, Square, Loader2,
  MessageCircle, Clock, CheckCircle2, AlertCircle, Send, Copy, ExternalLink,
  Shield, Printer, FileText, UserPlus, Target, Phone, MapPin, CalendarCheck,
  ChevronRight, Award, TrendingUp, Trash2, Crown, PhoneCall,
} from "lucide-react";
import TelemarketingResultsPanel from "@/components/contratados/TelemarketingResultsPanel";
import TelemarketingReportsPanel from "@/components/contratados/TelemarketingReportsPanel";
import { toast } from "sonner";

interface Contratado {
  id: string;
  nome: string;
  telefone: string;
  email: string | null;
  cidade: string | null;
  bairro: string | null;
  endereco: string | null;
  zona_eleitoral: string | null;
  status: string;
  contrato_aceito: boolean;
  contrato_aceito_em: string | null;
  lider_id: string | null;
  is_lider: boolean;
  quota_indicados: number;
  redes_sociais: any;
  created_at: string;
}

interface Indicado {
  id: string;
  nome: string;
  telefone: string;
  cidade: string | null;
  bairro: string | null;
  status: string;
  contratado_id: string;
  created_at: string;
  ligacao_status: string | null;
  vota_candidato: string | null;
  candidato_alternativo: string | null;
  operador_nome: string | null;
  ligacao_em: string | null;
}

interface DispatchJob {
  id: string;
  titulo: string;
  status: string;
  total_destinatarios: number;
  enviados: number;
  falhas: number;
  batch_size: number;
  delay_min_seconds: number;
  delay_max_seconds: number;
  batch_pause_seconds: number;
  mensagem_template: string;
  link_missao: string | null;
  created_at: string;
}

interface CheckinStats {
  contratado_id: string;
  total: number;
  last_checkin: string | null;
}

// ─── Anti-Spam Config ────────────────────────────────────────────────────────
function AntiSpamConfig({ batchSize, setBatchSize, delayMin, setDelayMin, delayMax, setDelayMax, batchPause, setBatchPause }: {
  batchSize: number; setBatchSize: (v: number) => void;
  delayMin: number; setDelayMin: (v: number) => void;
  delayMax: number; setDelayMax: (v: number) => void;
  batchPause: number; setBatchPause: (v: number) => void;
}) {
  return (
    <div className="space-y-4 p-4 rounded-xl border bg-muted/30">
      <div className="flex items-center gap-2 text-sm font-semibold"><Shield className="w-4 h-4 text-primary" />Configuração Anti-Spam</div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label className="text-xs">Tamanho do lote</Label>
          <div className="flex items-center gap-2"><Slider value={[batchSize]} onValueChange={([v]) => setBatchSize(v)} min={3} max={30} step={1} /><span className="text-sm font-mono w-8 text-right">{batchSize}</span></div>
        </div>
        <div className="space-y-2">
          <Label className="text-xs">Pausa entre lotes</Label>
          <div className="flex items-center gap-2"><Slider value={[batchPause]} onValueChange={([v]) => setBatchPause(v)} min={60} max={600} step={30} /><span className="text-sm font-mono w-10 text-right">{batchPause}s</span></div>
        </div>
        <div className="space-y-2">
          <Label className="text-xs">Delay mín entre msgs</Label>
          <div className="flex items-center gap-2"><Slider value={[delayMin]} onValueChange={([v]) => { setDelayMin(v); if (v > delayMax) setDelayMax(v); }} min={10} max={120} step={5} /><span className="text-sm font-mono w-10 text-right">{delayMin}s</span></div>
        </div>
        <div className="space-y-2">
          <Label className="text-xs">Delay máx entre msgs</Label>
          <div className="flex items-center gap-2"><Slider value={[delayMax]} onValueChange={([v]) => { setDelayMax(v); if (v < delayMin) setDelayMin(v); }} min={10} max={180} step={5} /><span className="text-sm font-mono w-10 text-right">{delayMax}s</span></div>
        </div>
      </div>
      <div className="text-xs text-muted-foreground bg-background p-2 rounded-md border">
        ⏱️ Cada lote de <strong>{batchSize}</strong> msgs ≈ {Math.round(batchSize * ((delayMin + delayMax) / 2))}s + {batchPause}s pausa.
      </div>
    </div>
  );
}

// ─── Dispatch Runner ─────────────────────────────────────────────────────────
function DispatchRunner({ job, contratados, clientId, onComplete }: {
  job: DispatchJob; contratados: Contratado[]; clientId: string; onComplete: () => void;
}) {
  const [status, setStatus] = useState<"idle" | "running" | "paused" | "done">("idle");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [sentCount, setSentCount] = useState(0);
  const [countdown, setCountdown] = useState(0);
  const [isPausing, setIsPausing] = useState(false);
  const abortRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const randomDelay = useCallback(() => Math.floor(Math.random() * (job.delay_max_seconds - job.delay_min_seconds + 1) * 1000) + job.delay_min_seconds * 1000, [job]);
  const openWhatsApp = useCallback((tel: string, msg: string) => {
    const p = tel.replace(/\D/g, ""); const fp = p.startsWith("55") ? p : `55${p}`;
    window.open(`https://wa.me/${fp}?text=${encodeURIComponent(msg)}`, "_blank");
  }, []);

  const processQueue = useCallback(async () => {
    const targets = contratados.filter(c => c.status === "ativo");
    for (let i = currentIndex; i < targets.length; i++) {
      if (abortRef.current) { setStatus("paused"); setCurrentIndex(i); return; }
      const c = targets[i];
      openWhatsApp(c.telefone, job.mensagem_template.replace("{nome}", c.nome.split(" ")[0]).replace("{link}", job.link_missao || ""));
      setSentCount(p => p + 1); setCurrentIndex(i + 1);
      await supabase.from("contratado_missao_dispatches").update({ enviados: i + 1, status: "em_andamento" } as any).eq("id", job.id);
      const posInBatch = (i + 1) % job.batch_size;
      if (posInBatch === 0 && i + 1 < targets.length) {
        setIsPausing(true); setCountdown(job.batch_pause_seconds);
        const iv = setInterval(() => setCountdown(p => Math.max(0, p - 1)), 1000);
        await new Promise(r => { timerRef.current = setTimeout(r, job.batch_pause_seconds * 1000); });
        clearInterval(iv); setIsPausing(false);
        if (abortRef.current) { setStatus("paused"); setCurrentIndex(i + 1); return; }
      } else if (i + 1 < targets.length) {
        const d = randomDelay(); setCountdown(Math.ceil(d / 1000));
        const iv = setInterval(() => setCountdown(p => Math.max(0, p - 1)), 1000);
        await new Promise(r => { timerRef.current = setTimeout(r, d); });
        clearInterval(iv);
        if (abortRef.current) { setStatus("paused"); setCurrentIndex(i + 1); return; }
      }
    }
    await supabase.from("contratado_missao_dispatches").update({ status: "concluido", completed_at: new Date().toISOString(), enviados: targets.length } as any).eq("id", job.id);
    setStatus("done"); toast.success("Disparo concluído!"); onComplete();
  }, [currentIndex, contratados, job, openWhatsApp, randomDelay, onComplete]);

  const targets = contratados.filter(c => c.status === "ativo");
  const progress = targets.length > 0 ? Math.round((sentCount / targets.length) * 100) : 0;

  return (
    <div className="space-y-4 p-4 border rounded-xl bg-background">
      <div className="flex items-center justify-between">
        <div><h4 className="font-semibold text-sm">{job.titulo}</h4><p className="text-xs text-muted-foreground">{sentCount}/{targets.length} enviados</p></div>
        <div className="flex gap-2">
          {(status === "idle" || status === "paused") && <Button size="sm" onClick={() => { abortRef.current = false; setStatus("running"); processQueue(); }} className="gap-1.5"><Play className="w-3.5 h-3.5" />{status === "paused" ? "Retomar" : "Iniciar"}</Button>}
          {status === "running" && (
            <>
              <Button size="sm" variant="outline" onClick={() => { abortRef.current = true; if (timerRef.current) clearTimeout(timerRef.current); }} className="gap-1.5"><Pause className="w-3.5 h-3.5" />Pausar</Button>
              <Button size="sm" variant="destructive" onClick={async () => { abortRef.current = true; if (timerRef.current) clearTimeout(timerRef.current); setStatus("done"); await supabase.from("contratado_missao_dispatches").update({ status: "cancelado" } as any).eq("id", job.id); onComplete(); }} className="gap-1.5"><Square className="w-3.5 h-3.5" />Parar</Button>
            </>
          )}
          {status === "done" && <Badge variant="outline" className="gap-1"><CheckCircle2 className="w-3 h-3" />Concluído</Badge>}
        </div>
      </div>
      <div className="w-full bg-muted rounded-full h-2.5"><div className="bg-primary h-2.5 rounded-full transition-all" style={{ width: `${progress}%` }} /></div>
      {status === "running" && countdown > 0 && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground"><Clock className="w-3.5 h-3.5 animate-pulse" />{isPausing ? `⏸️ Pausa: ${countdown}s` : `⏱️ Próximo em ${countdown}s`}</div>
      )}
    </div>
  );
}

// ─── Contract Generator ──────────────────────────────────────────────────────
interface TemplateOption {
  id: string;
  titulo: string;
  tipo: string;
  conteudo: string;
}

function ContractPrintDialog({ contratado, clientName, liderName, clientId }: { contratado: Contratado; clientName: string; liderName?: string; clientId: string }) {
  const printRef = useRef<HTMLDivElement>(null);
  const today = new Date().toLocaleDateString("pt-BR");
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  const [renderedContent, setRenderedContent] = useState<string>("");

  useEffect(() => {
    supabase.from("contract_templates").select("id, titulo, tipo, conteudo")
      .eq("client_id", clientId).order("tipo").order("created_at")
      .then(({ data }) => {
        const tpls = (data || []) as any as TemplateOption[];
        setTemplates(tpls);
        if (tpls.length > 0) setSelectedTemplate(tpls[0].id);
      });
  }, [clientId]);

  useEffect(() => {
    const tpl = templates.find(t => t.id === selectedTemplate);
    if (!tpl) { setRenderedContent(""); return; }
    const socials = Array.isArray(contratado.redes_sociais) ? contratado.redes_sociais : [];
    const socialsStr = socials.map((s: any) => `@${s.usuario} (${s.plataforma})`).join(", ") || "Não informado";
    const content = tpl.conteudo
      .replace(/\{nome\}/g, contratado.nome)
      .replace(/\{telefone\}/g, contratado.telefone)
      .replace(/\{email\}/g, contratado.email || "Não informado")
      .replace(/\{endereco\}/g, contratado.endereco || "Não informado")
      .replace(/\{cidade\}/g, contratado.cidade || "Não informada")
      .replace(/\{bairro\}/g, contratado.bairro || "Não informado")
      .replace(/\{zona_eleitoral\}/g, contratado.zona_eleitoral || "Não informada")
      .replace(/\{lider\}/g, liderName || "Sem líder")
      .replace(/\{contratante\}/g, clientName)
      .replace(/\{data\}/g, today)
      .replace(/\{redes_sociais\}/g, socialsStr);
    setRenderedContent(content);
  }, [selectedTemplate, templates, contratado, clientName, liderName, today]);

  const handlePrint = () => {
    const content = printRef.current;
    if (!content) return;
    const win = window.open("", "_blank");
    if (!win) { toast.error("Permita pop-ups para imprimir."); return; }
    win.document.write(`
      <html><head><title>Contrato - ${contratado.nome}</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 40px; font-size: 14px; line-height: 1.6; color: #222; white-space: pre-wrap; }
        @media print { body { padding: 20px; } }
      </style></head><body>
      ${content.innerText}
      </body></html>
    `);
    win.document.close();
    setTimeout(() => { win.print(); }, 500);
  };

  const handleAcceptContract = async () => {
    await supabase.from("contratados").update({
      contrato_aceito: true,
      contrato_aceito_em: new Date().toISOString(),
    } as any).eq("id", contratado.id);
    toast.success("Contrato marcado como assinado!");
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5"><Printer className="w-3.5 h-3.5" />Contrato</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><FileText className="w-5 h-5" />Contrato de {contratado.nome}</DialogTitle>
        </DialogHeader>

        {templates.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground text-sm">
            <FileText className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p>Nenhum modelo de contrato criado.</p>
            <p className="text-xs mt-1">Crie um modelo na seção "Modelos de Contrato" abaixo da lista.</p>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 mb-2">
              <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
                <SelectTrigger className="flex-1"><SelectValue placeholder="Selecione o modelo" /></SelectTrigger>
                <SelectContent>
                  {templates.map(t => (
                    <SelectItem key={t.id} value={t.id}>
                      [{t.tipo === "lider" ? "Líder" : "Liderado"}] {t.titulo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-2 mb-4">
              <Button onClick={handlePrint} className="gap-2"><Printer className="w-4 h-4" />Imprimir</Button>
              {!contratado.contrato_aceito && (
                <Button variant="outline" onClick={handleAcceptContract} className="gap-2"><CheckCircle2 className="w-4 h-4" />Marcar como Assinado</Button>
              )}
              {contratado.contrato_aceito && (
                <Badge className="gap-1 self-center"><CheckCircle2 className="w-3 h-3" />Assinado em {new Date(contratado.contrato_aceito_em!).toLocaleDateString("pt-BR")}</Badge>
              )}
            </div>

            <div ref={printRef} className="border rounded-lg p-6 bg-white text-foreground text-sm leading-relaxed whitespace-pre-wrap font-mono">
              {renderedContent}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Admin Page ─────────────────────────────────────────────────────────
export default function Contratados() {
  const [clientId, setClientId] = useState<string | null>(null);
  const [clientName, setClientName] = useState("");
  const [contratados, setContratados] = useState<Contratado[]>([]);
  const [indicados, setIndicados] = useState<Indicado[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showDispatchDialog, setShowDispatchDialog] = useState(false);
  const [dispatches, setDispatches] = useState<DispatchJob[]>([]);
  const [activeDispatch, setActiveDispatch] = useState<DispatchJob | null>(null);
  const [showQRDialog, setShowQRDialog] = useState(false);
  const [checkinStats, setCheckinStats] = useState<Record<string, { total: number; last: string | null }>>({});
  const [selectedContratado, setSelectedContratado] = useState<Contratado | null>(null);
  const [editQuota, setEditQuota] = useState(10);

  // Add líder
  const [showAddLiderDialog, setShowAddLiderDialog] = useState(false);
  const [liderNomeInput, setLiderNomeInput] = useState("");
  const [liderTelInput, setLiderTelInput] = useState("");
  const [liderCidadeInput, setLiderCidadeInput] = useState("");
  const [addingLider, setAddingLider] = useState(false);

  // Dispatch form
  const [dispTitulo, setDispTitulo] = useState("");
  const [dispMensagem, setDispMensagem] = useState("Olá {nome}! 🎯 Nova missão:\n\n{link}\n\nAcesse e interaja! 💪");
  const [dispLink, setDispLink] = useState("");
  const [batchSize, setBatchSize] = useState(10);
  const [delayMin, setDelayMin] = useState(30);
  const [delayMax, setDelayMax] = useState(90);
  const [batchPause, setBatchPause] = useState(300);

  // Líderes map (lider_id -> lider name)
  const [liderMap, setLiderMap] = useState<Record<string, string>>({});

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: client } = await supabase.from("clients").select("id, name").eq("user_id", user.id).maybeSingle();
    if (!client) return;
    setClientId(client.id); setClientName(client.name);

    const [contRes, dispRes, indRes] = await Promise.all([
      supabase.from("contratados").select("*").eq("client_id", client.id).order("created_at", { ascending: false }),
      supabase.from("contratado_missao_dispatches").select("*").eq("client_id", client.id).order("created_at", { ascending: false }).limit(10),
      supabase.from("contratado_indicados").select("*").eq("client_id", client.id).order("created_at", { ascending: false }),
    ]);

    const contData = (contRes.data || []) as any as Contratado[];
    setContratados(contData);
    if (dispRes.data) setDispatches(dispRes.data as any);
    if (indRes.data) setIndicados(indRes.data as any);

    // Build leader map from contratados with is_lider=true + any referenced lider_ids
    const map: Record<string, string> = {};
    contData.filter(c => (c as any).is_lider).forEach(c => { map[c.id] = c.nome; });
    // Also include any lider_ids that reference contratados not marked as is_lider (legacy)
    contData.filter(c => c.lider_id && !map[c.lider_id]).forEach(c => {
      const lider = contData.find(x => x.id === c.lider_id);
      if (lider) map[lider.id] = lider.nome;
    });
    setLiderMap(map);

    // Load checkin stats
    const { data: checkins } = await supabase
      .from("contratado_checkins")
      .select("contratado_id, checkin_date")
      .eq("client_id", client.id)
      .order("checkin_date", { ascending: false });

    if (checkins) {
      const stats: Record<string, { total: number; last: string | null }> = {};
      checkins.forEach((c: any) => {
        if (!stats[c.contratado_id]) stats[c.contratado_id] = { total: 0, last: null };
        stats[c.contratado_id].total++;
        if (!stats[c.contratado_id].last) stats[c.contratado_id].last = c.checkin_date;
      });
      setCheckinStats(stats);
    }

    setLoading(false);
  }

  async function createDispatch() {
    if (!clientId || !dispTitulo.trim() || !dispMensagem.trim()) { toast.error("Preencha título e mensagem."); return; }
    const targets = contratados.filter(c => c.status === "ativo");
    const { data, error } = await supabase.from("contratado_missao_dispatches").insert({
      client_id: clientId, titulo: dispTitulo.trim(), mensagem_template: dispMensagem.trim(),
      link_missao: dispLink.trim() || null, total_destinatarios: targets.length,
      batch_size: batchSize, delay_min_seconds: delayMin, delay_max_seconds: delayMax, batch_pause_seconds: batchPause,
    } as any).select().single();
    if (error) { toast.error("Erro ao criar disparo."); return; }
    setActiveDispatch(data as any); setDispatches(prev => [data as any, ...prev]);
    setShowDispatchDialog(false); toast.success("Disparo criado!");
  }

  async function updateQuota(contratadoId: string, quota: number) {
    await supabase.from("contratados").update({ quota_indicados: quota } as any).eq("id", contratadoId);
    setContratados(prev => prev.map(c => c.id === contratadoId ? { ...c, quota_indicados: quota } : c));
    toast.success("Meta atualizada!");
  }

  async function deleteContratado(contratadoId: string) {
    if (!confirm("Tem certeza que deseja excluir este contratado? Os indicados dele também serão removidos.")) return;
    // Delete indicados first, then checkins, then contratado
    await supabase.from("contratado_indicados").delete().eq("contratado_id", contratadoId);
    await supabase.from("contratado_checkins").delete().eq("contratado_id", contratadoId);
    const { error } = await supabase.from("contratados").delete().eq("id", contratadoId);
    if (error) { toast.error("Erro ao excluir: " + error.message); return; }
    setContratados(prev => prev.filter(c => c.id !== contratadoId));
    setIndicados(prev => prev.filter(i => i.contratado_id !== contratadoId));
    toast.success("Contratado excluído!");
  }

  async function createLider() {
    if (!clientId || !liderNomeInput.trim()) { toast.error("Informe o nome do líder."); return; }
    setAddingLider(true);
    const { data, error } = await supabase.from("pessoas").insert({
      client_id: clientId,
      nome: liderNomeInput.trim(),
      telefone: liderTelInput.trim() || null,
      cidade: liderCidadeInput.trim() || null,
      tipo_pessoa: "liderança" as any,
      nivel_apoio: "apoiador" as any,
      origem_contato: "manual" as any,
    }).select("id, nome").single();
    if (error || !data) { toast.error("Erro ao criar líder."); setAddingLider(false); return; }
    setLiderMap(prev => ({ ...prev, [(data as any).id]: (data as any).nome }));
    setShowAddLiderDialog(false);
    setLiderNomeInput(""); setLiderTelInput(""); setLiderCidadeInput("");
    setAddingLider(false);
    toast.success(`Líder "${(data as any).nome}" criado! Agora atribua contratados a ele.`);
  }

  async function assignLider(contratadoId: string, liderId: string | null) {
    await supabase.from("contratados").update({ lider_id: liderId } as any).eq("id", contratadoId);
    setContratados(prev => prev.map(c => c.id === contratadoId ? { ...c, lider_id: liderId } : c));
    toast.success(liderId ? "Líder atribuído!" : "Líder removido!");
  }

  const registrationUrl = clientId ? `${window.location.origin}/contratado/${clientId}` : "";
  const portalUrl = clientId ? `${window.location.origin}/portal-contratado/${clientId}` : "";
  const activeContratados = contratados.filter(c => c.status === "ativo");
  const filtered = contratados.filter(c =>
    c.nome.toLowerCase().includes(search.toLowerCase()) || c.telefone.includes(search) || (c.zona_eleitoral || "").toLowerCase().includes(search.toLowerCase())
  );

  // Group by leader: leaders are contratados with is_lider=true
  const leaderContratados = contratados.filter(c => (c as any).is_lider);
  const leaders = leaderContratados.map(c => c.id);
  const withoutLeader = contratados.filter(c => !c.lider_id && !(c as any).is_lider);

  // Indicado stats per contratado
  const indicadosByContratado = (cid: string) => indicados.filter(i => i.contratado_id === cid);
  const totalIndicados = indicados.length;
  const pendentes = indicados.filter(i => i.status === "pendente").length;

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Briefcase className="w-6 h-6 text-primary" />Contratados</h1>
          <p className="text-sm text-muted-foreground">
            Gerencie pessoas contratadas para captação de apoiadores. Cada contratado recebe um link para indicar pessoas, que depois são verificadas por telemarketing. Líderes podem ter liderados abaixo deles formando uma rede hierárquica.
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">{contratados.length} contratados • {totalIndicados} indicados ({pendentes} pendentes p/ telemarketing)</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Dialog open={showQRDialog} onOpenChange={setShowQRDialog}>
            <DialogTrigger asChild><Button variant="outline" size="sm" className="gap-1.5"><QrCode className="w-4 h-4" />Links</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Links do Sistema</DialogTitle><DialogDescription>Links para líderes e contratados</DialogDescription></DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-xs font-medium">👑 Link de cadastro de Líder</Label>
                  <div className="flex items-center gap-2">
                    <Input value={registrationUrl} readOnly className="text-xs" />
                    <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(registrationUrl); toast.success("Copiado!"); }}><Copy className="w-4 h-4" /></Button>
                  </div>
                  <p className="text-xs text-muted-foreground">Envie este link para o líder se cadastrar. Ele receberá no portal dele um link exclusivo para cadastrar seus liderados.</p>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-medium">Portal do contratado</Label>
                  <div className="flex items-center gap-2">
                    <Input value={portalUrl} readOnly className="text-xs" />
                    <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(portalUrl); toast.success("Copiado!"); }}><Copy className="w-4 h-4" /></Button>
                  </div>
                  <p className="text-xs text-muted-foreground">Portal de acesso para líderes e contratados (mesmo link para todos).</p>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          {/* Removed "Novo Líder" manual button - leaders self-register via the link */}

          <Dialog open={showDispatchDialog} onOpenChange={setShowDispatchDialog}>
            <DialogTrigger asChild><Button size="sm" className="gap-1.5" disabled={activeContratados.length === 0}><Send className="w-4 h-4" />Disparar Missão</Button></DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Novo Disparo</DialogTitle><DialogDescription>{activeContratados.length} contratados ativos</DialogDescription></DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2"><Label>Título *</Label><Input value={dispTitulo} onChange={e => setDispTitulo(e.target.value)} placeholder="Ex: Missão Instagram" /></div>
                <div className="space-y-2"><Label>Link</Label><Input value={dispLink} onChange={e => setDispLink(e.target.value)} placeholder="https://..." /></div>
                <div className="space-y-2"><Label>Mensagem</Label><Textarea value={dispMensagem} onChange={e => setDispMensagem(e.target.value)} rows={4} /></div>
                <AntiSpamConfig batchSize={batchSize} setBatchSize={setBatchSize} delayMin={delayMin} setDelayMin={setDelayMin} delayMax={delayMax} setDelayMax={setDelayMax} batchPause={batchPause} setBatchPause={setBatchPause} />
                <Button onClick={createDispatch} className="w-full gap-2"><Send className="w-4 h-4" />Criar Disparo ({activeContratados.length})</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="p-4 text-center"><p className="text-2xl font-bold">{contratados.length}</p><p className="text-xs text-muted-foreground">Total</p></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><p className="text-2xl font-bold">{contratados.filter(c => c.contrato_aceito).length}</p><p className="text-xs text-muted-foreground">Contratos Assinados</p></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><p className="text-2xl font-bold">{totalIndicados}</p><p className="text-xs text-muted-foreground">Indicados</p></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-amber-600">{pendentes}</p><p className="text-xs text-muted-foreground">P/ Telemarketing</p></CardContent></Card>
      </div>

      {/* Active dispatch */}
      {activeDispatch && <DispatchRunner job={activeDispatch} contratados={contratados} clientId={clientId!} onComplete={() => { setActiveDispatch(null); loadData(); }} />}

      {/* Recent dispatches */}
      {dispatches.length > 0 && !activeDispatch && (
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><Clock className="w-4 h-4" />Disparos Recentes</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {dispatches.slice(0, 3).map(d => (
              <div key={d.id} className="flex items-center justify-between p-2 rounded-lg border text-sm">
                <div><p className="font-medium">{d.titulo}</p><p className="text-xs text-muted-foreground">{d.enviados}/{d.total_destinatarios} • {new Date(d.created_at).toLocaleDateString("pt-BR")}</p></div>
                <Badge variant={d.status === "concluido" ? "default" : d.status === "cancelado" ? "destructive" : "secondary"}>{d.status}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Tabs: Por Líder / Todos / Indicados */}
      <Tabs defaultValue="lideres">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="lideres" className="gap-1.5"><Crown className="w-3.5 h-3.5" />Por Líder</TabsTrigger>
          <TabsTrigger value="contratados" className="gap-1.5"><Briefcase className="w-3.5 h-3.5" />Todos</TabsTrigger>
          <TabsTrigger value="indicados" className="gap-1.5"><Users className="w-3.5 h-3.5" />Indicados ({totalIndicados})</TabsTrigger>
          <TabsTrigger value="telemarketing" className="gap-1.5"><PhoneCall className="w-3.5 h-3.5" />Ligações</TabsTrigger>
          <TabsTrigger value="relatorios" className="gap-1.5"><TrendingUp className="w-3.5 h-3.5" />Relatórios</TabsTrigger>
        </TabsList>

        {/* ─── POR LÍDER TAB ──────────────────────────────────── */}
        <TabsContent value="lideres" className="space-y-4 mt-4">
          {leaders.length === 0 && withoutLeader.length === 0 && (
            <Card><CardContent className="py-10 text-center text-muted-foreground"><Briefcase className="w-10 h-10 mx-auto mb-3 opacity-30" /><p>Nenhum contratado.</p></CardContent></Card>
          )}

          {leaders.map(liderId => {
            const liderContratado = contratados.find(c => c.id === liderId);
            const liderNome = liderContratado?.nome || liderMap[liderId] || "Líder desconhecido";
            const membros = contratados.filter(c => c.lider_id === liderId);
            const membrosAtivos = membros.filter(c => c.status === "ativo").length;
            const contratos = membros.filter(c => c.contrato_aceito).length;
            const totalInds = membros.reduce((sum, c) => sum + indicadosByContratado(c.id).length, 0);
            const totalQuota = membros.reduce((sum, c) => sum + c.quota_indicados, 0);
            const indProgress = totalQuota > 0 ? Math.min(100, Math.round((totalInds / totalQuota) * 100)) : 0;
            const today = new Date().toISOString().split("T")[0];
            const checkedToday = membros.filter(c => checkinStats[c.id]?.last === today).length;
            const liderRegUrl = `${window.location.origin}/contratado/${clientId}/${liderId}`;

            return (
              <Collapsible key={liderId} defaultOpen>
                <Card className="overflow-hidden">
                  <CollapsibleTrigger asChild>
                    <CardHeader className="pb-3 cursor-pointer hover:bg-muted/30 transition-colors">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                            <Crown className="w-5 h-5 text-primary" />
                          </div>
                          <div>
                            <CardTitle className="text-sm">{liderNome}</CardTitle>
                            <CardDescription className="text-xs">{membros.length} contratados • {membrosAtivos} ativos</CardDescription>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <ChevronRight className="w-4 h-4 text-muted-foreground transition-transform data-[state=open]:rotate-90" />
                        </div>
                      </div>
                      {/* Leader summary stats */}
                      <div className="grid grid-cols-4 gap-2 mt-3">
                        <div className="text-center p-2 rounded-lg bg-muted/50">
                          <p className="text-lg font-bold">{contratos}/{membros.length}</p>
                          <p className="text-[10px] text-muted-foreground">Contratos</p>
                        </div>
                        <div className="text-center p-2 rounded-lg bg-muted/50">
                          <p className="text-lg font-bold">{totalInds}</p>
                          <p className="text-[10px] text-muted-foreground">Indicados</p>
                        </div>
                        <div className="text-center p-2 rounded-lg bg-muted/50">
                          <p className="text-lg font-bold">{checkedToday}/{membros.length}</p>
                          <p className="text-[10px] text-muted-foreground">Presença Hoje</p>
                        </div>
                        <div className="text-center p-2 rounded-lg bg-muted/50">
                          <p className="text-lg font-bold">{indProgress}%</p>
                          <p className="text-[10px] text-muted-foreground">Meta Geral</p>
                        </div>
                      </div>
                      <Progress value={indProgress} className="h-1.5 mt-2" />
                    </CardHeader>
                  </CollapsibleTrigger>

                  <CollapsibleContent>
                    <CardContent className="pt-0 space-y-2">
                      {/* Leader link copy */}
                      <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/30 border border-dashed">
                        <p className="text-[10px] text-muted-foreground truncate flex-1">Link de cadastro: {liderRegUrl}</p>
                        <Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => { navigator.clipboard.writeText(liderRegUrl); toast.success("Link copiado!"); }}>
                          <Copy className="w-3 h-3" />
                        </Button>
                      </div>

                      {membros.map(c => {
                        const inds = indicadosByContratado(c.id);
                        const stats = checkinStats[c.id];
                        const cToday = stats?.last === today;

                        return (
                          <div key={c.id} className="p-3 rounded-lg border bg-background space-y-2">
                            <div className="flex items-start justify-between">
                              <div className="min-w-0">
                                <p className="font-medium text-sm truncate">{c.nome}</p>
                                <p className="text-xs text-muted-foreground">📞 {c.telefone}{c.cidade ? ` • 📍 ${c.cidade}` : ""}</p>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <ContractPrintDialog contratado={c} clientName={clientName} liderName={liderNome} clientId={clientId!} />
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:bg-destructive/10" onClick={() => deleteContratado(c.id)}>
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {c.contrato_aceito
                                ? <Badge variant="outline" className="text-[10px] gap-1"><CheckCircle2 className="w-3 h-3 text-emerald-500" />Contrato</Badge>
                                : <Badge variant="outline" className="text-[10px] gap-1 text-amber-600 border-amber-300"><AlertCircle className="w-3 h-3" />Sem contrato</Badge>
                              }
                              <Badge variant="outline" className="text-[10px] gap-1">
                                <CalendarCheck className="w-3 h-3" />{stats?.total || 0} presenças{cToday && <span className="text-emerald-500"> • hoje ✓</span>}
                              </Badge>
                              <Badge variant="outline" className="text-[10px] gap-1">
                                <Users className="w-3 h-3" />{inds.length}/{c.quota_indicados}
                              </Badge>
                              {inds.length >= c.quota_indicados && <Badge className="text-[10px] gap-1 bg-emerald-500"><Award className="w-3 h-3" />Meta</Badge>}
                              <Badge variant={c.status === "ativo" ? "default" : "secondary"} className="text-[10px]">{c.status}</Badge>
                            </div>
                          </div>
                        );
                      })}
                    </CardContent>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            );
          })}

          {/* Without leader */}
          {withoutLeader.length > 0 && (
            <Collapsible defaultOpen>
              <Card className="overflow-hidden">
                <CollapsibleTrigger asChild>
                  <CardHeader className="pb-3 cursor-pointer hover:bg-muted/30 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                          <Briefcase className="w-5 h-5 text-muted-foreground" />
                        </div>
                        <div>
                          <CardTitle className="text-sm">Sem Líder</CardTitle>
                          <CardDescription className="text-xs">{withoutLeader.length} contratados sem líder vinculado</CardDescription>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    </div>
                  </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent className="pt-0 space-y-2">
                    {withoutLeader.map(c => {
                      const inds = indicadosByContratado(c.id);
                      const stats = checkinStats[c.id];
                      const today2 = new Date().toISOString().split("T")[0];
                      const cToday = stats?.last === today2;
                      return (
                        <div key={c.id} className="p-3 rounded-lg border bg-background space-y-2">
                          <div className="flex items-start justify-between">
                            <div className="min-w-0">
                              <p className="font-medium text-sm truncate">{c.nome}</p>
                              <p className="text-xs text-muted-foreground">📞 {c.telefone}{c.cidade ? ` • 📍 ${c.cidade}` : ""}</p>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <ContractPrintDialog contratado={c} clientName={clientName} clientId={clientId!} />
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:bg-destructive/10" onClick={() => deleteContratado(c.id)}>
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {c.contrato_aceito
                              ? <Badge variant="outline" className="text-[10px] gap-1"><CheckCircle2 className="w-3 h-3 text-emerald-500" />Contrato</Badge>
                              : <Badge variant="outline" className="text-[10px] gap-1 text-amber-600 border-amber-300"><AlertCircle className="w-3 h-3" />Sem contrato</Badge>
                            }
                            <Badge variant="outline" className="text-[10px] gap-1">
                              <CalendarCheck className="w-3 h-3" />{stats?.total || 0} presenças{cToday && <span className="text-emerald-500"> • hoje ✓</span>}
                            </Badge>
                            <Badge variant="outline" className="text-[10px] gap-1">
                              <Users className="w-3 h-3" />{inds.length}/{c.quota_indicados}
                            </Badge>
                            {inds.length >= c.quota_indicados && <Badge className="text-[10px] gap-1 bg-emerald-500"><Award className="w-3 h-3" />Meta</Badge>}
                            <Badge variant={c.status === "ativo" ? "default" : "secondary"} className="text-[10px]">{c.status}</Badge>
                          </div>
                          {/* Assign líder */}
                          <div className="flex items-center gap-2">
                            <Label className="text-xs whitespace-nowrap"><Crown className="w-3 h-3 inline mr-1" />Atribuir líder:</Label>
                            <Select value="" onValueChange={(v) => assignLider(c.id, v)}>
                              <SelectTrigger className="h-7 text-xs flex-1"><SelectValue placeholder="Selecionar líder..." /></SelectTrigger>
                              <SelectContent>
                                {Object.entries(liderMap).map(([id, nome]) => (
                                  <SelectItem key={id} value={id}>{nome}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      );
                    })}
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          )}
        </TabsContent>

        {/* ─── TODOS TAB (flat list) ──────────────────────────── */}
        <TabsContent value="contratados" className="space-y-4 mt-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nome, telefone ou zona..." className="pl-9" />
          </div>

          {filtered.length === 0 ? (
            <Card><CardContent className="py-10 text-center text-muted-foreground"><Briefcase className="w-10 h-10 mx-auto mb-3 opacity-30" /><p>Nenhum contratado.</p></CardContent></Card>
          ) : (
            filtered.map(c => {
              const inds = indicadosByContratado(c.id);
              const stats = checkinStats[c.id];
              const today = new Date().toISOString().split("T")[0];
              const checkedToday = stats?.last === today;

              return (
                <div key={c.id} className="p-4 rounded-xl border bg-card space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${(c as any).is_lider ? "bg-amber-100 dark:bg-amber-950/30" : "bg-primary/10"}`}>
                        {(c as any).is_lider ? <Crown className="w-5 h-5 text-amber-600" /> : <Briefcase className="w-5 h-5 text-primary" />}
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-sm truncate">{c.nome} {(c as any).is_lider && <span className="text-amber-600 text-xs font-normal">👑 Líder</span>}</p>
                        <p className="text-xs text-muted-foreground">
                          📞 {c.telefone} • 📍 {c.cidade || "—"}{c.bairro ? `, ${c.bairro}` : ""}
                          {c.zona_eleitoral && ` • 🗳️ ${c.zona_eleitoral}`}
                        </p>
                        {c.lider_id && liderMap[c.lider_id] && (
                          <p className="text-xs text-muted-foreground">👤 Líder: {liderMap[c.lider_id]}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <ContractPrintDialog contratado={c} clientName={clientName} liderName={c.lider_id ? liderMap[c.lider_id] : undefined} clientId={clientId!} />
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:bg-destructive/10" onClick={() => deleteContratado(c.id)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                      <Badge variant={c.status === "ativo" ? "default" : "secondary"} className="text-[10px]">{c.status}</Badge>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {c.contrato_aceito ? (
                      <Badge variant="outline" className="text-[10px] gap-1"><CheckCircle2 className="w-3 h-3 text-emerald-500" />Contrato</Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] gap-1 text-amber-600 border-amber-300"><AlertCircle className="w-3 h-3" />Sem contrato</Badge>
                    )}
                    <Badge variant="outline" className="text-[10px] gap-1">
                      <CalendarCheck className="w-3 h-3" />{stats?.total || 0} presenças
                      {checkedToday && <span className="text-emerald-500">• hoje ✓</span>}
                    </Badge>
                    <Badge variant="outline" className="text-[10px] gap-1">
                      <Users className="w-3 h-3" />{inds.length}/{c.quota_indicados} indicados
                    </Badge>
                    {inds.length >= c.quota_indicados && (
                      <Badge className="text-[10px] gap-1 bg-emerald-500"><Award className="w-3 h-3" />Meta atingida</Badge>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <Label className="text-xs whitespace-nowrap"><Crown className="w-3 h-3 inline mr-1" />Líder:</Label>
                    <Select value={c.lider_id || "none"} onValueChange={(v) => assignLider(c.id, v === "none" ? null : v)}>
                      <SelectTrigger className="h-7 text-xs flex-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sem líder</SelectItem>
                        {Object.entries(liderMap).map(([id, nome]) => (
                          <SelectItem key={id} value={id}>{nome}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center gap-2">
                    <Label className="text-xs whitespace-nowrap">Meta:</Label>
                    <Input
                      type="number"
                      className="w-20 h-7 text-xs"
                      defaultValue={c.quota_indicados}
                      onBlur={(e) => {
                        const v = parseInt(e.target.value);
                        if (v > 0 && v !== c.quota_indicados) updateQuota(c.id, v);
                      }}
                      min={1}
                    />
                    <div className="flex-1 bg-muted rounded-full h-2">
                      <div className={`h-2 rounded-full transition-all ${inds.length >= c.quota_indicados ? "bg-emerald-500" : "bg-primary"}`}
                        style={{ width: `${Math.min(100, (inds.length / Math.max(c.quota_indicados, 1)) * 100)}%` }} />
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </TabsContent>

        {/* ─── INDICADOS TAB ──────────────────────────────────── */}
        <TabsContent value="indicados" className="space-y-3 mt-4">
          <p className="text-xs text-muted-foreground">Indicados pelos contratados para verificação por telemarketing. Altere o status para confirmar ou marcar como falso.</p>
          {indicados.length === 0 ? (
            <Card><CardContent className="py-10 text-center text-muted-foreground"><Users className="w-10 h-10 mx-auto mb-3 opacity-30" /><p>Nenhum indicado ainda.</p></CardContent></Card>
          ) : (
            indicados.map(ind => {
              const contratadoNome = contratados.find(c => c.id === ind.contratado_id)?.nome || "—";
              return (
                <div key={ind.id} className="flex items-center justify-between p-3 rounded-xl border bg-card">
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{ind.nome}</p>
                    <p className="text-xs text-muted-foreground">
                      📞 {ind.telefone}{ind.cidade ? ` • 📍 ${ind.cidade}` : ""}
                      {ind.bairro ? `, ${ind.bairro}` : ""}
                    </p>
                    <p className="text-xs text-muted-foreground">Indicado por: {contratadoNome}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <a href={`tel:${ind.telefone.replace(/\D/g, "")}`} className="p-2 rounded-lg hover:bg-accent"><Phone className="w-4 h-4 text-primary" /></a>
                    <Select defaultValue={ind.status} onValueChange={async (v) => {
                      await supabase.from("contratado_indicados").update({ status: v, verified_at: new Date().toISOString() } as any).eq("id", ind.id);
                      setIndicados(prev => prev.map(i => i.id === ind.id ? { ...i, status: v } : i));
                      toast.success("Status atualizado!");
                    }}>
                      <SelectTrigger className="w-[120px] h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pendente">⏳ Pendente</SelectItem>
                        <SelectItem value="confirmado">✅ Confirmado</SelectItem>
                        <SelectItem value="falso">❌ Falso</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              );
            })
          )}
        </TabsContent>

        {/* ─── TELEMARKETING TAB ──────────────────────────────── */}
        <TabsContent value="telemarketing" className="mt-4">
          <TelemarketingResultsPanel contratados={contratados as any} indicados={indicados as any} />
        </TabsContent>
      </Tabs>

      {/* Contract Templates Manager */}
      {clientId && <ContractTemplatesManager clientId={clientId} />}
    </div>
  );
}
