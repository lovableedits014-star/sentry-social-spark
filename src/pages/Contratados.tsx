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
import {
  Briefcase, Search, Users, QrCode, Play, Pause, Square, Loader2,
  MessageCircle, Clock, CheckCircle2, AlertCircle, Send, Copy, ExternalLink,
  ChevronDown, ChevronUp, Shield,
} from "lucide-react";
import { toast } from "sonner";

interface Contratado {
  id: string;
  nome: string;
  telefone: string;
  cidade: string;
  bairro: string | null;
  zona_eleitoral: string | null;
  status: string;
  contrato_aceito: boolean;
  lider_id: string | null;
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

function AntiSpamConfig({
  batchSize, setBatchSize,
  delayMin, setDelayMin,
  delayMax, setDelayMax,
  batchPause, setBatchPause,
}: {
  batchSize: number; setBatchSize: (v: number) => void;
  delayMin: number; setDelayMin: (v: number) => void;
  delayMax: number; setDelayMax: (v: number) => void;
  batchPause: number; setBatchPause: (v: number) => void;
}) {
  return (
    <div className="space-y-4 p-4 rounded-xl border bg-muted/30">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Shield className="w-4 h-4 text-primary" />
        Configuração Anti-Spam
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label className="text-xs">Tamanho do lote</Label>
          <div className="flex items-center gap-2">
            <Slider value={[batchSize]} onValueChange={([v]) => setBatchSize(v)} min={3} max={30} step={1} />
            <span className="text-sm font-mono w-8 text-right">{batchSize}</span>
          </div>
          <p className="text-[10px] text-muted-foreground">Envios antes de pausar</p>
        </div>

        <div className="space-y-2">
          <Label className="text-xs">Pausa entre lotes</Label>
          <div className="flex items-center gap-2">
            <Slider value={[batchPause]} onValueChange={([v]) => setBatchPause(v)} min={60} max={600} step={30} />
            <span className="text-sm font-mono w-10 text-right">{batchPause}s</span>
          </div>
          <p className="text-[10px] text-muted-foreground">{Math.floor(batchPause / 60)}min {batchPause % 60}s de pausa</p>
        </div>

        <div className="space-y-2">
          <Label className="text-xs">Delay mínimo entre msgs</Label>
          <div className="flex items-center gap-2">
            <Slider value={[delayMin]} onValueChange={([v]) => { setDelayMin(v); if (v > delayMax) setDelayMax(v); }} min={10} max={120} step={5} />
            <span className="text-sm font-mono w-10 text-right">{delayMin}s</span>
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-xs">Delay máximo entre msgs</Label>
          <div className="flex items-center gap-2">
            <Slider value={[delayMax]} onValueChange={([v]) => { setDelayMax(v); if (v < delayMin) setDelayMin(v); }} min={10} max={180} step={5} />
            <span className="text-sm font-mono w-10 text-right">{delayMax}s</span>
          </div>
        </div>
      </div>

      <div className="text-xs text-muted-foreground bg-background p-2 rounded-md border">
        ⏱️ Estimativa: cada lote de <strong>{batchSize}</strong> msgs leva ~{Math.round(batchSize * ((delayMin + delayMax) / 2))}s + {batchPause}s de pausa.
        {" "}Para 50 contratados ≈ <strong>{Math.round((50 / batchSize) * (batchSize * ((delayMin + delayMax) / 2) + batchPause) / 60)}min</strong>.
      </div>
    </div>
  );
}

function DispatchRunner({
  job, contratados, clientId, onComplete,
}: {
  job: DispatchJob;
  contratados: Contratado[];
  clientId: string;
  onComplete: () => void;
}) {
  const [status, setStatus] = useState<"idle" | "running" | "paused" | "done">("idle");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [sentCount, setSentCount] = useState(0);
  const [countdown, setCountdown] = useState(0);
  const [isPausing, setIsPausing] = useState(false);
  const abortRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const randomDelay = useCallback(() => {
    const min = job.delay_min_seconds * 1000;
    const max = job.delay_max_seconds * 1000;
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }, [job.delay_min_seconds, job.delay_max_seconds]);

  const openWhatsApp = useCallback((telefone: string, mensagem: string) => {
    const phone = telefone.replace(/\D/g, "");
    const fullPhone = phone.startsWith("55") ? phone : `55${phone}`;
    const url = `https://wa.me/${fullPhone}?text=${encodeURIComponent(mensagem)}`;
    window.open(url, "_blank");
  }, []);

  const processQueue = useCallback(async () => {
    const targets = contratados.filter(c => c.status === "ativo" && c.contrato_aceito);

    for (let i = currentIndex; i < targets.length; i++) {
      if (abortRef.current) {
        setStatus("paused");
        setCurrentIndex(i);
        return;
      }

      const contratado = targets[i];
      const mensagem = job.mensagem_template
        .replace("{nome}", contratado.nome.split(" ")[0])
        .replace("{link}", job.link_missao || "");

      openWhatsApp(contratado.telefone, mensagem);
      setSentCount(prev => prev + 1);
      setCurrentIndex(i + 1);

      // Update dispatch
      await supabase.from("contratado_missao_dispatches").update({
        enviados: i + 1,
        status: "em_andamento",
      } as any).eq("id", job.id);

      // Check if end of batch
      const posInBatch = (i + 1) % job.batch_size;
      if (posInBatch === 0 && i + 1 < targets.length) {
        // Batch pause
        setIsPausing(true);
        const pauseMs = job.batch_pause_seconds * 1000;
        setCountdown(job.batch_pause_seconds);
        const pauseInterval = setInterval(() => setCountdown(prev => Math.max(0, prev - 1)), 1000);
        await new Promise(resolve => {
          timerRef.current = setTimeout(resolve, pauseMs);
        });
        clearInterval(pauseInterval);
        setIsPausing(false);
        if (abortRef.current) { setStatus("paused"); setCurrentIndex(i + 1); return; }
      } else if (i + 1 < targets.length) {
        // Random delay between messages
        const delay = randomDelay();
        setCountdown(Math.ceil(delay / 1000));
        const delayInterval = setInterval(() => setCountdown(prev => Math.max(0, prev - 1)), 1000);
        await new Promise(resolve => {
          timerRef.current = setTimeout(resolve, delay);
        });
        clearInterval(delayInterval);
        if (abortRef.current) { setStatus("paused"); setCurrentIndex(i + 1); return; }
      }
    }

    await supabase.from("contratado_missao_dispatches").update({
      status: "concluido",
      completed_at: new Date().toISOString(),
      enviados: targets.length,
    } as any).eq("id", job.id);

    setStatus("done");
    toast.success("Disparo concluído!");
    onComplete();
  }, [currentIndex, contratados, job, openWhatsApp, randomDelay, onComplete]);

  const handleStart = () => {
    abortRef.current = false;
    setStatus("running");
    processQueue();
  };

  const handlePause = () => {
    abortRef.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);
  };

  const handleStop = async () => {
    abortRef.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);
    setStatus("done");
    await supabase.from("contratado_missao_dispatches").update({
      status: "cancelado",
    } as any).eq("id", job.id);
    onComplete();
  };

  const targets = contratados.filter(c => c.status === "ativo" && c.contrato_aceito);
  const progress = targets.length > 0 ? Math.round((sentCount / targets.length) * 100) : 0;

  return (
    <div className="space-y-4 p-4 border rounded-xl bg-background">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="font-semibold text-sm">{job.titulo}</h4>
          <p className="text-xs text-muted-foreground">{sentCount}/{targets.length} enviados</p>
        </div>
        <div className="flex gap-2">
          {status === "idle" && (
            <Button size="sm" onClick={handleStart} className="gap-1.5">
              <Play className="w-3.5 h-3.5" /> Iniciar
            </Button>
          )}
          {status === "paused" && (
            <Button size="sm" onClick={handleStart} className="gap-1.5">
              <Play className="w-3.5 h-3.5" /> Retomar
            </Button>
          )}
          {status === "running" && (
            <>
              <Button size="sm" variant="outline" onClick={handlePause} className="gap-1.5">
                <Pause className="w-3.5 h-3.5" /> Pausar
              </Button>
              <Button size="sm" variant="destructive" onClick={handleStop} className="gap-1.5">
                <Square className="w-3.5 h-3.5" /> Parar
              </Button>
            </>
          )}
          {status === "done" && (
            <Badge variant="outline" className="gap-1">
              <CheckCircle2 className="w-3 h-3" /> Concluído
            </Badge>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="w-full bg-muted rounded-full h-2.5">
        <div
          className="bg-primary h-2.5 rounded-full transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Countdown */}
      {status === "running" && countdown > 0 && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Clock className="w-3.5 h-3.5 animate-pulse" />
          {isPausing
            ? `⏸️ Pausa entre lotes: ${countdown}s restantes...`
            : `⏱️ Próximo envio em ${countdown}s (delay anti-spam)`}
        </div>
      )}
    </div>
  );
}

export default function Contratados() {
  const [clientId, setClientId] = useState<string | null>(null);
  const [contratados, setContratados] = useState<Contratado[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showDispatchDialog, setShowDispatchDialog] = useState(false);
  const [dispatches, setDispatches] = useState<DispatchJob[]>([]);
  const [activeDispatch, setActiveDispatch] = useState<DispatchJob | null>(null);
  const [showQRDialog, setShowQRDialog] = useState(false);

  // Dispatch form
  const [dispTitulo, setDispTitulo] = useState("");
  const [dispMensagem, setDispMensagem] = useState("Olá {nome}! 🎯 Nova missão para você:\n\n{link}\n\nAcesse e interaja agora! 💪");
  const [dispLink, setDispLink] = useState("");
  const [batchSize, setBatchSize] = useState(10);
  const [delayMin, setDelayMin] = useState(30);
  const [delayMax, setDelayMax] = useState(90);
  const [batchPause, setBatchPause] = useState(300);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: client } = await supabase.from("clients").select("id").eq("user_id", user.id).maybeSingle();
    if (!client) return;
    setClientId(client.id);

    const [contRes, dispRes] = await Promise.all([
      supabase.from("contratados").select("*").eq("client_id", client.id).order("created_at", { ascending: false }),
      supabase.from("contratado_missao_dispatches").select("*").eq("client_id", client.id).order("created_at", { ascending: false }).limit(10),
    ]);

    if (contRes.data) setContratados(contRes.data as any);
    if (dispRes.data) setDispatches(dispRes.data as any);
    setLoading(false);
  }

  async function createDispatch() {
    if (!clientId || !dispTitulo.trim() || !dispMensagem.trim()) {
      toast.error("Preencha título e mensagem.");
      return;
    }
    const targets = contratados.filter(c => c.status === "ativo" && c.contrato_aceito);

    const { data, error } = await supabase.from("contratado_missao_dispatches").insert({
      client_id: clientId,
      titulo: dispTitulo.trim(),
      mensagem_template: dispMensagem.trim(),
      link_missao: dispLink.trim() || null,
      total_destinatarios: targets.length,
      batch_size: batchSize,
      delay_min_seconds: delayMin,
      delay_max_seconds: delayMax,
      batch_pause_seconds: batchPause,
    } as any).select().single();

    if (error) {
      toast.error("Erro ao criar disparo.");
      return;
    }
    const newDispatch = data as any as DispatchJob;
    setActiveDispatch(newDispatch);
    setDispatches(prev => [newDispatch, ...prev]);
    setShowDispatchDialog(false);
    toast.success("Disparo criado! Clique em Iniciar para começar.");
  }

  const registrationUrl = clientId ? `${window.location.origin}/contratado/${clientId}` : "";
  const activeContratados = contratados.filter(c => c.status === "ativo" && c.contrato_aceito);
  const filtered = contratados.filter(c =>
    c.nome.toLowerCase().includes(search.toLowerCase()) ||
    c.telefone.includes(search) ||
    (c.zona_eleitoral || "").toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Briefcase className="w-6 h-6 text-primary" />
            Contratados
          </h1>
          <p className="text-sm text-muted-foreground">
            {contratados.length} contratados • {activeContratados.length} ativos com contrato
          </p>
        </div>
        <div className="flex gap-2">
          <Dialog open={showQRDialog} onOpenChange={setShowQRDialog}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5">
                <QrCode className="w-4 h-4" /> Link de Cadastro
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Link de Cadastro de Contratados</DialogTitle>
                <DialogDescription>Compartilhe com os líderes para gerar QR Codes vinculados</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Input value={registrationUrl} readOnly className="text-xs" />
                  <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(registrationUrl); toast.success("Link copiado!"); }}>
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  💡 Para vincular a um líder, adicione o ID dele no final: <code>/contratado/{"{clientId}"}/{"{liderId}"}</code>
                </p>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={showDispatchDialog} onOpenChange={setShowDispatchDialog}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5" disabled={activeContratados.length === 0}>
                <Send className="w-4 h-4" /> Disparar Missão
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Novo Disparo de Missão</DialogTitle>
                <DialogDescription>Envie uma missão para {activeContratados.length} contratados ativos via WhatsApp</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Título do disparo *</Label>
                  <Input value={dispTitulo} onChange={(e) => setDispTitulo(e.target.value)} placeholder="Ex: Missão Instagram - Post do candidato" />
                </div>
                <div className="space-y-2">
                  <Label>Link da missão</Label>
                  <Input value={dispLink} onChange={(e) => setDispLink(e.target.value)} placeholder="https://instagram.com/p/..." />
                </div>
                <div className="space-y-2">
                  <Label>Mensagem (use {"{nome}"} e {"{link}"})</Label>
                  <Textarea value={dispMensagem} onChange={(e) => setDispMensagem(e.target.value)} rows={4} />
                </div>

                <AntiSpamConfig
                  batchSize={batchSize} setBatchSize={setBatchSize}
                  delayMin={delayMin} setDelayMin={setDelayMin}
                  delayMax={delayMax} setDelayMax={setDelayMax}
                  batchPause={batchPause} setBatchPause={setBatchPause}
                />

                <Button onClick={createDispatch} className="w-full gap-2">
                  <Send className="w-4 h-4" /> Criar Disparo ({activeContratados.length} destinatários)
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Active dispatch runner */}
      {activeDispatch && (
        <DispatchRunner
          job={activeDispatch}
          contratados={contratados}
          clientId={clientId!}
          onComplete={() => { setActiveDispatch(null); loadData(); }}
        />
      )}

      {/* Recent dispatches */}
      {dispatches.length > 0 && !activeDispatch && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Clock className="w-4 h-4" /> Disparos Recentes
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {dispatches.slice(0, 5).map(d => (
              <div key={d.id} className="flex items-center justify-between p-2 rounded-lg border text-sm">
                <div>
                  <p className="font-medium">{d.titulo}</p>
                  <p className="text-xs text-muted-foreground">
                    {d.enviados}/{d.total_destinatarios} enviados • {new Date(d.created_at).toLocaleDateString("pt-BR")}
                  </p>
                </div>
                <Badge variant={d.status === "concluido" ? "default" : d.status === "cancelado" ? "destructive" : "secondary"}>
                  {d.status}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Search + list */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nome, telefone ou zona..." className="pl-9" />
      </div>

      <div className="grid gap-3">
        {filtered.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              <Briefcase className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>Nenhum contratado cadastrado.</p>
              <p className="text-xs mt-1">Compartilhe o link de cadastro para começar.</p>
            </CardContent>
          </Card>
        ) : (
          filtered.map(c => (
            <div key={c.id} className="flex items-center justify-between p-3 rounded-xl border bg-card hover:bg-accent/5 transition-colors">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <Briefcase className="w-4 h-4 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">{c.nome}</p>
                  <p className="text-xs text-muted-foreground">
                    📞 {c.telefone} • 📍 {c.cidade}{c.bairro ? `, ${c.bairro}` : ""}
                    {c.zona_eleitoral && ` • 🗳️ ${c.zona_eleitoral}`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {c.contrato_aceito && <Badge variant="outline" className="text-[10px] gap-1"><CheckCircle2 className="w-3 h-3 text-emerald-500" />Contrato</Badge>}
                <Badge variant={c.status === "ativo" ? "default" : "secondary"} className="text-[10px]">{c.status}</Badge>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
