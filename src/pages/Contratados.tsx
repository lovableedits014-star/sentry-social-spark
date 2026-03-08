import { useState, useEffect, useRef, useCallback } from "react";
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
import {
  Briefcase, Search, Users, QrCode, Play, Pause, Square, Loader2,
  MessageCircle, Clock, CheckCircle2, AlertCircle, Send, Copy, ExternalLink,
  Shield, Printer, FileText, UserPlus, Target, Phone, MapPin, CalendarCheck,
  ChevronRight, Award, TrendingUp, Trash2,
} from "lucide-react";
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
function ContractPrintDialog({ contratado, clientName, liderName }: { contratado: Contratado; clientName: string; liderName?: string }) {
  const printRef = useRef<HTMLDivElement>(null);
  const today = new Date().toLocaleDateString("pt-BR");

  const handlePrint = () => {
    const content = printRef.current;
    if (!content) return;
    const win = window.open("", "_blank");
    if (!win) { toast.error("Permita pop-ups para imprimir."); return; }
    win.document.write(`
      <html><head><title>Contrato - ${contratado.nome}</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 40px; font-size: 14px; line-height: 1.6; color: #222; }
        h1 { text-align: center; font-size: 18px; margin-bottom: 30px; text-transform: uppercase; letter-spacing: 1px; }
        .section { margin: 20px 0; }
        .field { margin: 4px 0; }
        .field strong { display: inline-block; min-width: 140px; }
        .signature { margin-top: 60px; display: flex; justify-content: space-between; }
        .signature div { text-align: center; width: 45%; }
        .signature .line { border-top: 1px solid #333; margin-top: 60px; padding-top: 5px; }
        @media print { body { padding: 20px; } }
      </style></head><body>
      ${content.innerHTML}
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

  const socials = Array.isArray(contratado.redes_sociais) ? contratado.redes_sociais : [];

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5"><Printer className="w-3.5 h-3.5" />Contrato</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><FileText className="w-5 h-5" />Contrato de {contratado.nome}</DialogTitle>
          <DialogDescription>Imprima o contrato para assinatura presencial</DialogDescription>
        </DialogHeader>

        <div className="flex gap-2 mb-4">
          <Button onClick={handlePrint} className="gap-2"><Printer className="w-4 h-4" />Imprimir Contrato</Button>
          {!contratado.contrato_aceito && (
            <Button variant="outline" onClick={handleAcceptContract} className="gap-2"><CheckCircle2 className="w-4 h-4" />Marcar como Assinado</Button>
          )}
          {contratado.contrato_aceito && (
            <Badge className="gap-1 self-center"><CheckCircle2 className="w-3 h-3" />Assinado em {new Date(contratado.contrato_aceito_em!).toLocaleDateString("pt-BR")}</Badge>
          )}
        </div>

        {/* Print content (hidden but used for print) */}
        <div ref={printRef} className="border rounded-lg p-6 bg-white text-foreground text-sm leading-relaxed">
          <h1 style={{ textAlign: "center", fontSize: "16px", fontWeight: "bold", marginBottom: "24px" }}>
            CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE MOBILIZAÇÃO DIGITAL
          </h1>

          <div className="section">
            <p><strong>Data:</strong> {today}</p>
          </div>

          <div className="section" style={{ marginTop: "16px" }}>
            <p style={{ fontWeight: "bold", marginBottom: "8px" }}>CONTRATADO(A):</p>
            <p><strong>Nome:</strong> {contratado.nome}</p>
            <p><strong>Telefone:</strong> {contratado.telefone}</p>
            {contratado.email && <p><strong>E-mail:</strong> {contratado.email}</p>}
            <p><strong>Endereço:</strong> {contratado.endereco || "Não informado"}</p>
            <p><strong>Cidade:</strong> {contratado.cidade || "Não informada"}</p>
            {contratado.bairro && <p><strong>Bairro:</strong> {contratado.bairro}</p>}
            {contratado.zona_eleitoral && <p><strong>Zona Eleitoral:</strong> {contratado.zona_eleitoral}</p>}
            {liderName && <p><strong>Indicado por:</strong> {liderName}</p>}
            {socials.length > 0 && <p><strong>Redes Sociais:</strong> {socials.map((s: any) => `@${s.usuario} (${s.plataforma})`).join(", ")}</p>}
          </div>

          <div className="section" style={{ marginTop: "16px" }}>
            <p style={{ fontWeight: "bold", marginBottom: "8px" }}>CONTRATANTE: {clientName}</p>
          </div>

          <div className="section" style={{ marginTop: "16px" }}>
            <p style={{ fontWeight: "bold" }}>OBJETO DO CONTRATO:</p>
            <p>O(A) CONTRATADO(A) se compromete a prestar serviços de mobilização digital, incluindo:</p>
            <p>1. Interação em publicações nas redes sociais conforme missões recebidas;</p>
            <p>2. Indicação de contatos de potenciais apoiadores com nome e telefone;</p>
            <p>3. Cumprimento das metas de indicação estabelecidas pelo contratante;</p>
            <p>4. Marcação diária de presença no sistema.</p>
          </div>

          <div className="section" style={{ marginTop: "16px" }}>
            <p style={{ fontWeight: "bold" }}>OBRIGAÇÕES:</p>
            <p>- Realizar as missões enviadas dentro do prazo solicitado;</p>
            <p>- Fornecer indicações verdadeiras e verificáveis;</p>
            <p>- Manter sigilo sobre estratégias e informações internas;</p>
            <p>- Marcar presença diariamente no sistema.</p>
          </div>

          <div className="section" style={{ marginTop: "16px" }}>
            <p style={{ fontWeight: "bold" }}>VIGÊNCIA:</p>
            <p>Este contrato tem vigência a partir da data de assinatura até o término do período eleitoral ou rescisão por qualquer das partes.</p>
          </div>

          <div style={{ marginTop: "60px", display: "flex", justifyContent: "space-between" }}>
            <div style={{ textAlign: "center", width: "45%" }}>
              <div style={{ borderTop: "1px solid #333", marginTop: "60px", paddingTop: "5px" }}>
                CONTRATANTE
              </div>
            </div>
            <div style={{ textAlign: "center", width: "45%" }}>
              <div style={{ borderTop: "1px solid #333", marginTop: "60px", paddingTop: "5px" }}>
                {contratado.nome}<br />CONTRATADO(A)
              </div>
            </div>
          </div>
        </div>
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

    // Load leader names
    const liderIds = [...new Set(contData.filter(c => c.lider_id).map(c => c.lider_id!))];
    if (liderIds.length > 0) {
      const { data: lideres } = await supabase.from("pessoas").select("id, nome").in("id", liderIds);
      if (lideres) {
        const map: Record<string, string> = {};
        lideres.forEach((l: any) => { map[l.id] = l.nome; });
        setLiderMap(map);
      }
    }

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

  const registrationUrl = clientId ? `${window.location.origin}/contratado/${clientId}` : "";
  const portalUrl = clientId ? `${window.location.origin}/portal-contratado/${clientId}` : "";
  const activeContratados = contratados.filter(c => c.status === "ativo");
  const filtered = contratados.filter(c =>
    c.nome.toLowerCase().includes(search.toLowerCase()) || c.telefone.includes(search) || (c.zona_eleitoral || "").toLowerCase().includes(search.toLowerCase())
  );

  // Group by leader
  const leaders = [...new Set(contratados.filter(c => c.lider_id).map(c => c.lider_id!))];
  const withoutLeader = contratados.filter(c => !c.lider_id);

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
          <p className="text-sm text-muted-foreground">{contratados.length} contratados • {totalIndicados} indicados ({pendentes} pendentes p/ telemarketing)</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Dialog open={showQRDialog} onOpenChange={setShowQRDialog}>
            <DialogTrigger asChild><Button variant="outline" size="sm" className="gap-1.5"><QrCode className="w-4 h-4" />Links</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Links do Sistema</DialogTitle><DialogDescription>Links para líderes e contratados</DialogDescription></DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-xs font-medium">Link de cadastro (base)</Label>
                  <div className="flex items-center gap-2">
                    <Input value={registrationUrl} readOnly className="text-xs" />
                    <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(registrationUrl); toast.success("Copiado!"); }}><Copy className="w-4 h-4" /></Button>
                  </div>
                  <p className="text-xs text-muted-foreground">Para vincular a um líder: <code>{registrationUrl}/{"{liderId}"}</code></p>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-medium">Portal do contratado</Label>
                  <div className="flex items-center gap-2">
                    <Input value={portalUrl} readOnly className="text-xs" />
                    <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(portalUrl); toast.success("Copiado!"); }}><Copy className="w-4 h-4" /></Button>
                  </div>
                </div>
              </div>
            </DialogContent>
          </Dialog>

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

      {/* Tabs: Contratados / Indicados */}
      <Tabs defaultValue="contratados">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="contratados" className="gap-1.5"><Briefcase className="w-3.5 h-3.5" />Contratados</TabsTrigger>
          <TabsTrigger value="indicados" className="gap-1.5"><Users className="w-3.5 h-3.5" />Indicados ({totalIndicados})</TabsTrigger>
        </TabsList>

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
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <Briefcase className="w-5 h-5 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-sm truncate">{c.nome}</p>
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
                      <ContractPrintDialog contratado={c} clientName={clientName} liderName={c.lider_id ? liderMap[c.lider_id] : undefined} />
                      <Badge variant={c.status === "ativo" ? "default" : "secondary"} className="text-[10px]">{c.status}</Badge>
                    </div>
                  </div>

                  {/* Stats row */}
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

                  {/* Quota edit */}
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
      </Tabs>
    </div>
  );
}
