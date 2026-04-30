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
import { Loader2, FileText, Copy, Trash2, Sparkles } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

interface Props { clientId: string }

export function MateriasPanel({ clientId }: Props) {
  const [tipo, setTipo] = useState("press_release");
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
          </div>
          <div>
            <Label>Tipo</Label>
            <Select value={tipo} onValueChange={setTipo}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="press_release">Press release</SelectItem>
                <SelectItem value="blog">Post de blog</SelectItem>
                <SelectItem value="nota_oficial">Nota oficial</SelectItem>
                <SelectItem value="boletim">Boletim semanal</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
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
          </div>
          <div>
            <Label>Tema (opcional)</Label>
            <Input placeholder="ex: saude, educacao, mobilidade" value={tema} onChange={(e) => setTema(e.target.value)} />
          </div>
          <div>
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
          </div>
          <Button onClick={gerar} disabled={loading} className="w-full">
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
            Gerar matéria
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
              {sourceTranscripts.length > 0 && (
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
              <div className="prose prose-sm max-w-none whitespace-pre-wrap">{selected.corpo}</div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(`${selected.titulo}\n\n${selected.corpo}`); toast.success("Copiado!"); }}>
                  <Copy className="w-3.5 h-3.5 mr-1.5" /> Copiar
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setSelected(null)}>Voltar</Button>
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
    </div>
  );
}