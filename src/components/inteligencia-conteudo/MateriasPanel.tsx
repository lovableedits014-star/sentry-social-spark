import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
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
  const [transcriptionId, setTranscriptionId] = useState<string>("none");
  const [sourceTranscript, setSourceTranscript] = useState<any>(null);
  const [sourceLoading, setSourceLoading] = useState(false);
  const [sourceOpen, setSourceOpen] = useState(false);

  // Quando seleciona uma matéria, carrega a transcrição-fonte (se houver)
  useEffect(() => {
    const trId = selected?.transcription_id || selected?.fontes?.transcription_id;
    if (!selected || !trId) {
      setSourceTranscript(null);
      return;
    }
    let cancel = false;
    (async () => {
      setSourceLoading(true);
      const { data } = await supabase
        .from("ic_transcriptions")
        .select("id, filename, full_text, created_at, duration_sec")
        .eq("id", trId)
        .maybeSingle();
      if (!cancel) {
        setSourceTranscript(data || null);
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

  const gerar = async () => {
    const hasTranscript = transcriptionId !== "none";
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
          transcriptionId: transcriptionId !== "none" ? transcriptionId : undefined,
        },
      });
      if (error) throw error;
      toast.success("Matéria gerada!");
      setSelected(data?.saved || data?.materia);
      setBriefing("");
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
            <Label>Transcrição-fonte (usa o texto INTEIRO como base)</Label>
            <Select value={transcriptionId} onValueChange={setTranscriptionId}>
              <SelectTrigger><SelectValue placeholder="Nenhuma — usar memória + posts" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nenhuma (usa memória + posts)</SelectItem>
                {transcricoes.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {(t.filename || "transcrição").slice(0, 40)} · {new Date(t.created_at).toLocaleDateString("pt-BR")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground mt-1">
              Quando selecionada, a transcrição inteira vira a fonte principal — sem fragmentação em blocos.
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
              Briefing {transcriptionId !== "none" && <span className="text-muted-foreground font-normal">(opcional — a transcrição já é a base)</span>}
            </Label>
            <Textarea
              placeholder={
                transcriptionId !== "none"
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
              {(selected.transcription_id || selected.fontes?.transcription_id) && (
                <div className="rounded-md border bg-muted/40 p-3 flex items-start gap-2 text-xs">
                  <FileText className="w-4 h-4 mt-0.5 text-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground">Fonte: transcrição integral</p>
                    <p className="text-muted-foreground truncate">
                      {sourceLoading
                        ? "Carregando..."
                        : sourceTranscript?.filename || "Transcrição vinculada"}
                      {sourceTranscript?.created_at && ` · ${new Date(sourceTranscript.created_at).toLocaleDateString("pt-BR")}`}
                      {sourceTranscript?.full_text && ` · ${sourceTranscript.full_text.length.toLocaleString("pt-BR")} caracteres`}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!sourceTranscript?.full_text}
                    onClick={() => setSourceOpen(true)}
                  >
                    Ver transcrição completa
                  </Button>
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
                    <p className="text-xs text-muted-foreground">{new Date(m.created_at).toLocaleString("pt-BR")} · {m.tipo}</p>
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

      <Dialog open={sourceOpen} onOpenChange={setSourceOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <FileText className="w-4 h-4" />
              {sourceTranscript?.filename || "Transcrição-fonte"}
            </DialogTitle>
            <DialogDescription>
              Conteúdo integral usado pela IA para gerar esta matéria.
              {sourceTranscript?.created_at && ` Capturada em ${new Date(sourceTranscript.created_at).toLocaleString("pt-BR")}.`}
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-y-auto flex-1 -mx-6 px-6">
            <pre className="whitespace-pre-wrap text-sm leading-relaxed font-sans text-foreground">
              {sourceTranscript?.full_text || "(sem conteúdo)"}
            </pre>
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                if (sourceTranscript?.full_text) {
                  navigator.clipboard.writeText(sourceTranscript.full_text);
                  toast.success("Transcrição copiada!");
                }
              }}
            >
              <Copy className="w-3.5 h-3.5 mr-1.5" /> Copiar transcrição
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSourceOpen(false)}>Fechar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}