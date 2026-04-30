import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, FileText, Copy, Trash2, Sparkles, RefreshCw, History, Facebook, Instagram, ExternalLink, MessageSquare, ThumbsUp, ThumbsDown } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

interface Props { clientId: string }

const todayIso = () => new Date().toISOString().slice(0, 10);
const daysAgoIso = (d: number) => new Date(Date.now() - d * 86400000).toISOString().slice(0, 10);

export function MateriasPanel({ clientId }: Props) {
  const [tipo, setTipo] = useState("materia");
  const [tom, setTom] = useState("jornalistico");
  const [tema, setTema] = useState("");
  const [briefing, setBriefing] = useState("");
  const [loading, setLoading] = useState(false);
  const [materias, setMaterias] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [transcricoes, setTranscricoes] = useState<any[]>([]);
  const [transcriptionIds, setTranscriptionIds] = useState<string[]>([]);
  const [sourceTranscripts, setSourceTranscripts] = useState<any[]>([]);
  const [sourceLoading, setSourceLoading] = useState(false);
  const [sourceOpen, setSourceOpen] = useState<string | null>(null); // id da fonte aberta no modal
  const [reprocessOpen, setReprocessOpen] = useState(false);
  const [reprocessProvider, setReprocessProvider] = useState("lovable");
  const [reprocessModel, setReprocessModel] = useState("");
  const [reprocessLoading, setReprocessLoading] = useState(false);
  const [refineInstructions, setRefineInstructions] = useState("");
  const [versions, setVersions] = useState<any[]>([]);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [versionPreview, setVersionPreview] = useState<any>(null);
  // Boletim semanal
  const [boletimSince, setBoletimSince] = useState(daysAgoIso(7));
  const [boletimUntil, setBoletimUntil] = useState(todayIso());
  const [incluirPosts, setIncluirPosts] = useState(true);
  const [incluirAcoes, setIncluirAcoes] = useState(true);
  const [incluirVisitas, setIncluirVisitas] = useState(true);

  const isBoletim = tipo === "boletim";

  // Carrega versões anteriores quando seleciona uma matéria
  useEffect(() => {
    if (!selected?.id) { setVersions([]); return; }
    let cancel = false;
    (async () => {
      const { data } = await supabase
        .from("materias_versions" as any)
        .select("*")
        .eq("materia_id", selected.id)
        .order("versao", { ascending: false });
      if (!cancel) setVersions((data as any[]) || []);
    })();
    return () => { cancel = true; };
  }, [selected?.id]);

  const reprocessar = async () => {
    const isBol = selected?.tipo === "boletim";
    const trId = selected?.transcription_id || selected?.fontes?.transcription_id || selected?.fontes?.transcription_ids?.[0];
    if (!isBol && !trId) {
      toast.error("Esta matéria não tem transcrição-fonte vinculada para reprocessar.");
      return;
    }
    setReprocessLoading(true);
    try {
      let data: any, error: any;
      if (isBol) {
        const periodo = selected?.fontes?.periodo || {};
        const r = await supabase.functions.invoke("ic-write-boletim", {
          body: {
            clientId,
            since: periodo.since ? periodo.since.slice(0, 10) : boletimSince,
            until: periodo.until ? periodo.until.slice(0, 10) : boletimUntil,
            tema: selected?.tema || undefined,
            providerOverride: reprocessProvider || undefined,
            modelOverride: reprocessModel || undefined,
            reprocessMateriaId: selected.id,
            briefing: refineInstructions.trim() || undefined,
          },
        });
        data = r.data; error = r.error;
      } else {
        const r = await supabase.functions.invoke("ic-reprocess-transcription", {
          body: {
            clientId,
            transcriptionId: trId,
            provider: reprocessProvider || undefined,
            model: reprocessModel || undefined,
            reprocessMateriaId: selected.id,
            regenerateMemory: !refineInstructions.trim(),
            materia: refineInstructions.trim() ? { briefing: refineInstructions.trim() } : undefined,
          },
        });
        data = r.data; error = r.error;
      }
      if (error) throw error;
      if (data?.materia_error) throw new Error(data.materia_error);
      toast.success(`Reprocessado com ${data?.materia_provider || data?.provider || reprocessProvider}/${data?.materia_model || data?.model || "default"}`);
      setReprocessOpen(false);
      setRefineInstructions("");
      await load();
      const next = data?.saved || data?.materia;
      if (next) setSelected(next);
    } catch (e: any) {
      toast.error(e.message || "Erro ao reprocessar");
    } finally {
      setReprocessLoading(false);
    }
  };

  const PROVIDERS = [
    { value: "lovable", label: "Lovable AI (Gemini)", defaultModel: "google/gemini-2.5-flash" },
    { value: "openai", label: "OpenAI", defaultModel: "gpt-4o-mini" },
    { value: "anthropic", label: "Anthropic Claude", defaultModel: "claude-3-haiku-20240307" },
    { value: "groq", label: "Groq", defaultModel: "llama-3.1-8b-instant" },
    { value: "gemini", label: "Google Gemini (direct)", defaultModel: "gemini-1.5-flash" },
    { value: "mistral", label: "Mistral", defaultModel: "mistral-small-latest" },
  ];

  // Quando seleciona uma matéria, carrega TODAS as transcrições-fonte vinculadas
  useEffect(() => {
    const ids: string[] =
      selected?.fontes?.transcription_ids ||
      (selected?.transcription_id ? [selected.transcription_id] : selected?.fontes?.transcription_id ? [selected.fontes.transcription_id] : []);
    if (!selected || ids.length === 0) {
      setSourceTranscripts([]);
      return;
    }
    let cancel = false;
    (async () => {
      setSourceLoading(true);
      const { data } = await supabase
        .from("ic_transcriptions")
        .select("id, filename, full_text, created_at, duration_sec")
        .in("id", ids);
      if (!cancel) {
        // Preserva a ordem original (F1, F2, ...)
        const byId = new Map((data || []).map((t: any) => [t.id, t]));
        setSourceTranscripts(ids.map((id) => byId.get(id)).filter(Boolean));
        setSourceLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, [selected]);

  const load = async () => {
    const { data } = await supabase
      .from("materias_geradas")
      .select("*")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false })
      .limit(30);
    setMaterias(data || []);
    const { data: trs } = await supabase
      .from("ic_transcriptions")
      .select("id, filename, created_at, full_text")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false })
      .limit(50);
    setTranscricoes(trs || []);
  };

  useEffect(() => { if (clientId) load(); }, [clientId]);

  const toggleTranscription = (id: string) => {
    setTranscriptionIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const gerar = async () => {
    if (isBoletim) {
      setLoading(true);
      try {
        const { data, error } = await supabase.functions.invoke("ic-write-boletim", {
          body: {
            clientId,
            since: boletimSince,
            until: boletimUntil,
            tema: tema || undefined,
            incluir: { posts: incluirPosts, acoes: incluirAcoes, visitas: incluirVisitas },
          },
        });
        if (error) throw error;
        toast.success("Boletim gerado!");
        setSelected(data?.saved || data?.boletim);
        await load();
      } catch (e: any) {
        toast.error(e.message || "Erro ao gerar boletim");
      } finally {
        setLoading(false);
      }
      return;
    }
    const hasTranscript = transcriptionIds.length > 0;
    if (!hasTranscript && briefing.trim().length < 10) {
      toast.error("Descreva o briefing OU selecione uma transcrição-fonte.");
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("ic-write-materia", {
        body: {
          clientId,
          tipo,
          tom,
          tema: tema || undefined,
          briefing,
          salvarComo: "rascunho",
          transcriptionIds: hasTranscript ? transcriptionIds : undefined,
        },
      });
      if (error) throw error;
      toast.success("Matéria gerada!");
      setSelected(data?.saved || data?.materia);
      setBriefing("");
      setTranscriptionIds([]);
      await load();
    } catch (e: any) {
      toast.error(e.message || "Erro ao gerar matéria");
    } finally {
      setLoading(false);
    }
  };

  const apagar = async (id: string) => {
    if (!confirm("Apagar esta matéria?")) return;
    await supabase.from("materias_geradas").delete().eq("id", id);
    if (selected?.id === id) setSelected(null);
    await load();
  };

  const openSource = sourceTranscripts.find((t) => t.id === sourceOpen) || null;
  const tracos: Array<{ trecho: string; fonte: string }> = Array.isArray(selected?.fontes?.tracos)
    ? selected.fontes.tracos
    : [];
  const labelMap = new Map<string, { label: string; filename?: string }>();
  const labelsMeta: Array<{ id: string; label: string; filename?: string }> =
    selected?.fontes?.transcription_labels || [];
  labelsMeta.forEach((l) => labelMap.set(l.id, { label: l.label, filename: l.filename }));

  // Auditoria por parágrafo: { indice, resumo, citacoes:[{fonte, trecho_origem, transcription_id, offset_aprox}] }
  const paragrafosAuditoria: any[] = Array.isArray(selected?.fontes?.paragrafos)
    ? selected.fontes.paragrafos
    : [];
  const auditByIndex = new Map<number, any>();
  paragrafosAuditoria.forEach((p) => {
    if (typeof p?.indice === "number") auditByIndex.set(p.indice, p);
  });
  const corpoParagrafos: string[] = (selected?.corpo || "")
    .split(/\n\n+/)
    .map((s: string) => s.trim())
    .filter(Boolean);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <Card className="lg:col-span-1">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="w-4 h-4" /> Nova matéria
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            A IA usa a Memória do candidato + transcrições + posts recentes para escrever sem inventar fatos.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>Tipo</Label>
            <Select value={tipo} onValueChange={setTipo}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="materia">Escrever Matéria</SelectItem>
                <SelectItem value="boletim">Boletim semanal</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {!isBoletim && <div>
            <div className="flex items-center justify-between">
              <Label>Transcrições-fonte ({transcriptionIds.length} selecionada{transcriptionIds.length === 1 ? "" : "s"})</Label>
              {transcriptionIds.length > 0 && (
                <Button variant="ghost" size="sm" className="h-6 text-[11px] px-2" onClick={() => setTranscriptionIds([])}>
                  Limpar
                </Button>
              )}
            </div>
            <ScrollArea className="h-44 rounded-md border mt-1">
              <div className="p-2 space-y-1">
                {transcricoes.length === 0 && (
                  <p className="text-xs text-muted-foreground p-2">Nenhuma transcrição disponível.</p>
                )}
                {transcricoes.map((t, idx) => {
                  const checked = transcriptionIds.includes(t.id);
                  const order = checked ? transcriptionIds.indexOf(t.id) + 1 : null;
                  return (
                    <label
                      key={t.id}
                      className="flex items-start gap-2 text-xs hover:bg-accent/40 rounded px-2 py-1.5 cursor-pointer"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => toggleTranscription(t.id)}
                        className="mt-0.5"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          {order && (
                            <Badge variant="secondary" className="text-[9px] px-1 py-0 h-4">
                              F{order}
                            </Badge>
                          )}
                          <span className="truncate font-medium text-foreground">
                            {t.filename || `Transcrição ${idx + 1}`}
                          </span>
                        </div>
                        <span className="text-muted-foreground">
                          {new Date(t.created_at).toLocaleDateString("pt-BR")}
                        </span>
                      </div>
                    </label>
                  );
                })}
              </div>
            </ScrollArea>
            <p className="text-[11px] text-muted-foreground mt-1">
              Selecione uma ou mais. A IA combina todas e marca a origem de cada trecho com [F1], [F2]…
            </p>
          </div>}
          {isBoletim && (
            <div className="space-y-3 rounded-md border bg-muted/30 p-3">
              <p className="text-[11px] text-muted-foreground leading-snug">
                A IA vai puxar <strong>postagens reais da semana</strong> (com comentários e sentimento), <strong>ações externas</strong> e <strong>visitas registradas</strong> no período, e organizar tudo num resumo da semana.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">De</Label>
                  <Input type="date" value={boletimSince} onChange={(e) => setBoletimSince(e.target.value)} className="h-8" />
                </div>
                <div>
                  <Label className="text-xs">Até</Label>
                  <Input type="date" value={boletimUntil} onChange={(e) => setBoletimUntil(e.target.value)} className="h-8" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Incluir no boletim</Label>
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <Checkbox checked={incluirPosts} onCheckedChange={(v) => setIncluirPosts(!!v)} />
                  Postagens em redes sociais
                </label>
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <Checkbox checked={incluirAcoes} onCheckedChange={(v) => setIncluirAcoes(!!v)} />
                  Ações externas / agenda
                </label>
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <Checkbox checked={incluirVisitas} onCheckedChange={(v) => setIncluirVisitas(!!v)} />
                  Visitas registradas
                </label>
              </div>
            </div>
          )}
          {!isBoletim && <div>
            <Label>Tom</Label>
            <Select value={tom} onValueChange={setTom}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="jornalistico">Jornalístico</SelectItem>
                <SelectItem value="formal">Formal</SelectItem>
                <SelectItem value="popular">Popular</SelectItem>
                <SelectItem value="tecnico">Técnico</SelectItem>
              </SelectContent>
            </Select>
          </div>}
          <div>
            <Label>{isBoletim ? "Foco da semana (opcional)" : "Tema (opcional)"}</Label>
            <Input
              placeholder={isBoletim ? "ex: ênfase em saúde nesta semana" : "ex: saude, educacao, mobilidade"}
              value={tema}
              onChange={(e) => setTema(e.target.value)}
            />
          </div>
          {!isBoletim && <div>
            <Label>
              Briefing {transcriptionIds.length > 0 && <span className="text-muted-foreground font-normal">(opcional — as transcrições já são a base)</span>}
            </Label>
            <Textarea
              placeholder={
                transcriptionIds.length > 0
                  ? "Opcional. Adicione um ângulo extra se quiser (ex: 'foque na promessa de UBS')."
                  : "Ex: Quero uma matéria sobre as obras de asfalto na Moreninha 4 anunciadas hoje."
              }
              value={briefing}
              onChange={(e) => setBriefing(e.target.value)}
              rows={5}
            />
          </div>}
          <Button onClick={gerar} disabled={loading} className="w-full">
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
            {isBoletim ? "Gerar boletim" : "Gerar matéria"}
          </Button>
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><FileText className="w-4 h-4" /> {selected ? selected.titulo : "Histórico"}</CardTitle>
        </CardHeader>
        <CardContent>
          {selected ? (
            <div className="space-y-3">
              <div className="flex gap-2 flex-wrap">
                <Badge variant="outline">{selected.tipo}</Badge>
                {selected.tom && <Badge variant="outline">{selected.tom}</Badge>}
                {selected.metadata?.avisos && (
                  <Badge variant="destructive" className="text-[10px]">⚠ {selected.metadata.avisos}</Badge>
                )}
              </div>
              {selected.subtitulo && <p className="text-sm text-muted-foreground italic">{selected.subtitulo}</p>}
              {selected.tipo === "boletim" && Array.isArray(selected.fontes?.posts_referenciados) && selected.fontes.posts_referenciados.length > 0 && (
                <div className="rounded-md border bg-muted/40 p-3 space-y-2">
                  <p className="text-xs font-medium text-foreground flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-primary" />
                    Cobertura da semana ({selected.fontes.posts_referenciados.length} postagens
                    {selected.fontes?.stats?.comentarios ? ` · ${selected.fontes.stats.comentarios} comentários` : ""}
                    {selected.fontes?.periodo?.since && ` · ${new Date(selected.fontes.periodo.since).toLocaleDateString("pt-BR")} → ${new Date(selected.fontes.periodo.until).toLocaleDateString("pt-BR")}`})
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {selected.fontes.posts_referenciados.map((p: any) => {
                      const Icon = p.platform === "instagram" ? Instagram : Facebook;
                      return (
                        <div key={p.post_id} className="rounded border bg-background p-2 text-xs flex gap-2">
                          <Icon className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <p className="text-foreground line-clamp-2 leading-snug">{p.message || "(sem texto)"}</p>
                            <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
                              {p.first_seen && <span>{new Date(p.first_seen).toLocaleDateString("pt-BR")}</span>}
                              <span className="flex items-center gap-0.5"><MessageSquare className="w-2.5 h-2.5" />{p.total}</span>
                              {p.pos > 0 && <span className="flex items-center gap-0.5 text-emerald-600"><ThumbsUp className="w-2.5 h-2.5" />{p.pos}</span>}
                              {p.neg > 0 && <span className="flex items-center gap-0.5 text-rose-600"><ThumbsDown className="w-2.5 h-2.5" />{p.neg}</span>}
                              {p.url && (
                                <a href={p.url} target="_blank" rel="noreferrer" className="ml-auto text-primary hover:underline flex items-center gap-0.5">
                                  Ver post <ExternalLink className="w-2.5 h-2.5" />
                                </a>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {selected.tipo !== "boletim" && sourceTranscripts.length > 0 && (
                <div className="rounded-md border bg-muted/40 p-3 space-y-2 text-xs">
                  <p className="font-medium text-foreground flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-primary" />
                    {sourceTranscripts.length === 1 ? "Fonte: transcrição integral" : `Fontes combinadas: ${sourceTranscripts.length} transcrições`}
                  </p>
                  {sourceLoading && <p className="text-muted-foreground">Carregando…</p>}
                  <div className="space-y-1">
                    {sourceTranscripts.map((t, i) => {
                      const label = labelMap.get(t.id)?.label || `F${i + 1}`;
                      return (
                        <div key={t.id} className="flex items-center gap-2">
                          <Badge variant="secondary" className="text-[9px] px-1 py-0 h-4">{label}</Badge>
                          <span className="flex-1 min-w-0 truncate text-muted-foreground">
                            <span className="text-foreground font-medium">{t.filename || "Transcrição"}</span>
                            {t.created_at && ` · ${new Date(t.created_at).toLocaleDateString("pt-BR")}`}
                            {t.full_text && ` · ${t.full_text.length.toLocaleString("pt-BR")} car.`}
                          </span>
                          <Button size="sm" variant="outline" className="h-6 text-[11px] px-2" onClick={() => setSourceOpen(t.id)}>
                            Ver completa
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                  {tracos.length > 0 && (
                    <details className="pt-1">
                      <summary className="cursor-pointer text-[11px] text-muted-foreground hover:text-foreground">
                        Rastreabilidade ({tracos.length} trecho{tracos.length === 1 ? "" : "s"} mapeado{tracos.length === 1 ? "" : "s"})
                      </summary>
                      <ul className="mt-1.5 space-y-1 pl-1">
                        {tracos.map((t, i) => (
                          <li key={i} className="flex gap-1.5">
                            <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 shrink-0">{t.fonte}</Badge>
                            <span className="text-foreground/80">{t.trecho}</span>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
              )}
              <article className="rounded-lg border bg-card p-6 md:p-8 shadow-sm">
                <h1 className="font-serif text-2xl md:text-3xl leading-tight font-semibold tracking-tight text-foreground mb-2">
                  {selected.titulo}
                </h1>
                {selected.subtitulo && (
                  <p className="text-base md:text-lg text-muted-foreground italic mb-5 leading-snug border-l-2 border-primary/40 pl-3">
                    {selected.subtitulo}
                  </p>
                )}
                <div className="prose prose-sm md:prose-base max-w-none
                  prose-headings:font-serif prose-headings:font-semibold prose-headings:tracking-tight
                  prose-h2:text-lg prose-h2:mt-6 prose-h2:mb-2 prose-h2:text-foreground
                  prose-h3:text-base prose-h3:mt-4 prose-h3:mb-1.5
                  prose-p:text-foreground/90 prose-p:leading-relaxed prose-p:my-3
                  prose-strong:text-foreground prose-strong:font-semibold
                  prose-blockquote:border-l-4 prose-blockquote:border-primary
                  prose-blockquote:bg-primary/5 prose-blockquote:py-2 prose-blockquote:px-4
                  prose-blockquote:not-italic prose-blockquote:text-foreground prose-blockquote:font-medium
                  prose-blockquote:rounded-r-md
                  prose-ul:my-2 prose-li:my-0.5 prose-li:text-foreground/90
                  prose-a:text-primary">
                  <ReactMarkdown>{selected.corpo || ""}</ReactMarkdown>
                </div>
              </article>
              {selected.tipo !== "boletim" && paragrafosAuditoria.length > 0 && (
                <details className="rounded-md border bg-muted/30 p-3">
                  <summary className="cursor-pointer text-xs font-medium text-foreground hover:text-primary select-none">
                    🔎 Auditoria por parágrafo ({paragrafosAuditoria.length})
                  </summary>
                  <ol className="mt-3 space-y-3">
                    {paragrafosAuditoria.map((audit, i) => {
                      const cits: any[] = Array.isArray(audit?.citacoes) ? audit.citacoes : [];
                      const par = corpoParagrafos[i];
                      return (
                        <li key={i} className="border-l-2 border-muted pl-3">
                          <div className="flex items-start gap-2">
                            <Badge variant="outline" className="text-[10px] mt-0.5">§{i + 1}</Badge>
                            <p className="text-xs text-foreground/80 line-clamp-2 flex-1">
                              {audit?.resumo || par || ""}
                            </p>
                          </div>
                          {cits.length > 0 ? (
                            <ul className="mt-1.5 space-y-1 ml-8">
                              {cits.map((c, ci) => {
                                const tr = sourceTranscripts.find((t) => t.id === c.transcription_id);
                                return (
                                  <li key={ci} className="text-[11px] flex gap-1.5">
                                    <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 shrink-0">{c.fonte}</Badge>
                                    <div className="flex-1 min-w-0">
                                      <span className="text-foreground/70 italic">"{c.trecho_origem}"</span>
                                      {tr && (
                                        <button
                                          type="button"
                                          className="ml-1.5 text-primary hover:underline"
                                          onClick={() => setSourceOpen(tr.id)}
                                        >
                                          ver na fonte →
                                        </button>
                                      )}
                                    </div>
                                  </li>
                                );
                              })}
                            </ul>
                          ) : (
                            <p className="ml-8 mt-1 text-[10px] text-muted-foreground/70 italic">
                              (parágrafo de transição — sem fato citável)
                            </p>
                          )}
                        </li>
                      );
                    })}
                  </ol>
                </details>
              )}
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(`${selected.titulo}\n\n${selected.corpo}`); toast.success("Copiado!"); }}>
                  <Copy className="w-3.5 h-3.5 mr-1.5" /> Copiar
                </Button>
                {paragrafosAuditoria.length > 0 && (
                  <Button size="sm" variant="ghost" onClick={() => {
                    const md = corpoParagrafos.map((par, i) => {
                      const a = auditByIndex.get(i);
                      const cits = (a?.citacoes || []).map((c: any) => `  - [${c.fonte}] "${c.trecho_origem}"`).join("\n");
                      return `§${i + 1}. ${par}${cits ? "\n" + cits : ""}`;
                    }).join("\n\n");
                    navigator.clipboard.writeText(`${selected.titulo}\n\n${md}`);
                    toast.success("Matéria + auditoria copiadas!");
                  }}>
                    <Copy className="w-3.5 h-3.5 mr-1.5" /> Copiar com auditoria
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => setSelected(null)}>Voltar</Button>
                {(selected.transcription_id || selected.fontes?.transcription_id || selected.fontes?.transcription_ids?.[0]) && (
                  <Button size="sm" variant="default" onClick={() => {
                    const cur = (selected.provider as string) || "lovable";
                    setReprocessProvider(cur);
                    setReprocessModel("");
                    setRefineInstructions("");
                    setReprocessOpen(true);
                  }}>
                    <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Reprocessar
                  </Button>
                )}
                {versions.length > 0 && (
                  <Button size="sm" variant="outline" onClick={() => setVersionsOpen(true)}>
                    <History className="w-3.5 h-3.5 mr-1.5" /> Histórico ({versions.length})
                  </Button>
                )}
                {(selected.provider || selected.metadata?.provider) && (
                  <Badge variant="secondary" className="text-[10px] ml-auto self-center">
                    v{selected.versao || 1} · {selected.provider || selected.metadata?.provider}
                    {selected.model && ` / ${selected.model}`}
                  </Badge>
                )}
              </div>
            </div>
          ) : materias.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma matéria ainda. Gere a primeira ao lado.</p>
          ) : (
            <div className="space-y-2">
              {materias.map((m) => (
                <div key={m.id} className="p-3 border rounded-md hover:bg-accent/50 cursor-pointer flex justify-between gap-3" onClick={() => setSelected(m)}>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{m.titulo}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(m.created_at).toLocaleString("pt-BR")} · {m.tipo}
                      {Array.isArray(m.fontes?.transcription_ids) && m.fontes.transcription_ids.length > 1 && (
                        <> · <span className="text-primary">{m.fontes.transcription_ids.length} fontes</span></>
                      )}
                    </p>
                  </div>
                  <Button size="icon" variant="ghost" onClick={(e) => { e.stopPropagation(); apagar(m.id); }}>
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!sourceOpen} onOpenChange={(o) => !o && setSourceOpen(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <FileText className="w-4 h-4" />
              {openSource?.filename || "Transcrição-fonte"}
              {openSource && labelMap.get(openSource.id)?.label && (
                <Badge variant="secondary" className="text-[10px]">{labelMap.get(openSource.id)?.label}</Badge>
              )}
            </DialogTitle>
            <DialogDescription>
              Conteúdo integral usado pela IA para gerar esta matéria.
              {openSource?.created_at && ` Capturada em ${new Date(openSource.created_at).toLocaleString("pt-BR")}.`}
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-y-auto flex-1 -mx-6 px-6">
            <pre className="whitespace-pre-wrap text-sm leading-relaxed font-sans text-foreground">
              {openSource?.full_text || "(sem conteúdo)"}
            </pre>
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                if (openSource?.full_text) {
                  navigator.clipboard.writeText(openSource.full_text);
                  toast.success("Transcrição copiada!");
                }
              }}
            >
              <Copy className="w-3.5 h-3.5 mr-1.5" /> Copiar transcrição
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSourceOpen(null)}>Fechar</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={reprocessOpen} onOpenChange={setReprocessOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <RefreshCw className="w-4 h-4" /> Reprocessar matéria
            </DialogTitle>
            <DialogDescription>
              A versão atual será salva no histórico. A IA escolhida vai re-extrair a memória da transcrição inteira e reescrever a matéria.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Orientação de correção (opcional)</Label>
              <Textarea
                value={refineInstructions}
                onChange={(e) => setRefineInstructions(e.target.value)}
                rows={4}
                placeholder={`Ex: Evite frases vagas como "o candidato agradeceu" ou "reafirmou seu compromisso". Use só fatos concretos da transcrição (números, locais, nomes). Comece com lead direto.`}
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Diretrizes que a IA deve seguir na reescrita. Ela tem prioridade sobre o briefing original.
              </p>
            </div>
            <div>
              <Label>Provider</Label>
              <Select value={reprocessProvider} onValueChange={(v) => { setReprocessProvider(v); setReprocessModel(""); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PROVIDERS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Modelo (opcional)</Label>
              <Input
                value={reprocessModel}
                onChange={(e) => setReprocessModel(e.target.value)}
                placeholder={PROVIDERS.find((p) => p.value === reprocessProvider)?.defaultModel || "default"}
              />
              <p className="text-[11px] text-muted-foreground mt-1">Vazio = modelo padrão do provider.</p>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button size="sm" variant="ghost" onClick={() => setReprocessOpen(false)} disabled={reprocessLoading}>Cancelar</Button>
            <Button size="sm" onClick={reprocessar} disabled={reprocessLoading}>
              {reprocessLoading ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 mr-1.5" />}
              Reprocessar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={versionsOpen} onOpenChange={setVersionsOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <History className="w-4 h-4" /> Histórico de versões
            </DialogTitle>
            <DialogDescription>Versões anteriores desta matéria, antes de cada reprocessamento.</DialogDescription>
          </DialogHeader>
          <div className="overflow-y-auto flex-1 space-y-2">
            {versions.map((v) => (
              <div key={v.id} className="border rounded-md p-3 hover:bg-accent/40 cursor-pointer" onClick={() => setVersionPreview(v)}>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px]">v{v.versao}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {new Date(v.created_at).toLocaleString("pt-BR")}
                    {v.provider && ` · ${v.provider}${v.model ? "/" + v.model : ""}`}
                  </span>
                </div>
                <p className="text-sm font-medium mt-1 truncate">{v.titulo}</p>
              </div>
            ))}
            {versions.length === 0 && <p className="text-sm text-muted-foreground">Sem versões anteriores.</p>}
          </div>
          {versionPreview && (
            <div className="border-t pt-3 mt-2 max-h-[40vh] overflow-y-auto">
              <p className="text-xs text-muted-foreground mb-1">v{versionPreview.versao} · {versionPreview.provider}{versionPreview.model && "/" + versionPreview.model}</p>
              <h4 className="font-semibold text-sm mb-2">{versionPreview.titulo}</h4>
              <pre className="whitespace-pre-wrap text-xs font-sans text-foreground/90">{versionPreview.corpo}</pre>
              <Button size="sm" variant="outline" className="mt-2" onClick={() => { navigator.clipboard.writeText(versionPreview.corpo); toast.success("Copiado!"); }}>
                <Copy className="w-3.5 h-3.5 mr-1.5" /> Copiar esta versão
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}