import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Sparkles, RefreshCw, Loader2, Copy, ThumbsUp, ThumbsDown, Wand2, Brain, Flame, HelpCircle, AlertTriangle, Heart } from "lucide-react";
import { toast } from "sonner";
import { useCurrentClientId } from "@/hooks/ic/useCurrentClientId";
import { useIdeias, useUpdateIdeaStatus, useCreateIdea } from "@/hooks/ic/useIdeias";

const FUNC_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

async function invoke(fn: string, body: any) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(`${FUNC_BASE}/${fn}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session?.access_token ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
    },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || `Falha (${res.status})`);
  return json;
}

function copyText(text: string) {
  navigator.clipboard.writeText(text);
  toast.success("Copiado");
}

export default function InteligenciaConteudo() {
  const { data: clientId } = useCurrentClientId();
  const [tab, setTab] = useState("radar");

  return (
    <div className="container mx-auto p-4 sm:p-6 max-w-7xl">
      <header className="mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Inteligência de Conteúdo</h1>
            <p className="text-sm text-muted-foreground">
              Co-piloto consultivo: ideias, textos e projeções com base nos seus dados. Você decide e produz manualmente.
            </p>
          </div>
        </div>
      </header>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid grid-cols-4 w-full max-w-2xl">
          <TabsTrigger value="radar"><Flame className="w-4 h-4 mr-1.5" />Radar</TabsTrigger>
          <TabsTrigger value="ideias"><Sparkles className="w-4 h-4 mr-1.5" />Ideias</TabsTrigger>
          <TabsTrigger value="estudio"><Wand2 className="w-4 h-4 mr-1.5" />Estúdio</TabsTrigger>
          <TabsTrigger value="dna"><Brain className="w-4 h-4 mr-1.5" />DNA</TabsTrigger>
        </TabsList>

        <TabsContent value="radar" className="mt-4">
          <RadarPanel clientId={clientId} onSeed={() => setTab("ideias")} />
        </TabsContent>
        <TabsContent value="ideias" className="mt-4">
          <IdeiasPanel clientId={clientId} onOpen={() => setTab("estudio")} />
        </TabsContent>
        <TabsContent value="estudio" className="mt-4">
          <EstudioPanel clientId={clientId} />
        </TabsContent>
        <TabsContent value="dna" className="mt-4">
          <DnaPanel clientId={clientId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ---------- Radar ---------- */
function RadarPanel({ clientId, onSeed }: { clientId: string | null | undefined; onSeed: () => void }) {
  const { data, isLoading, refetch, error } = useQuery({
    queryKey: ["ic-radar", clientId],
    queryFn: async () => {
      if (!clientId) return null;
      return invoke("ic-radar", { clientId });
    },
    enabled: !!clientId,
    staleTime: Infinity,
    retry: false,
  });

  const refresh = useMutation({
    mutationFn: async () => invoke("ic-radar", { clientId, force: true }),
    onSuccess: () => { toast.success("Radar atualizado"); refetch(); },
    onError: (e: any) => toast.error(e.message ?? "Falha ao atualizar radar"),
  });

  const create = useCreateIdea();
  async function saveAsIdea(titulo: string, descricao: string, tema: string, tipo: string) {
    if (!clientId) return;
    await create.mutateAsync({ client_id: clientId, titulo, descricao, tema, tipo, origem: "radar", score: 70 });
    toast.success("Salva no Banco de Ideias");
    onSeed();
  }

  if (!clientId) return <Card><CardContent className="py-10 text-center text-muted-foreground">Carregando…</CardContent></Card>;
  if (isLoading) return <Card><CardContent className="py-10 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></CardContent></Card>;
  if (error) return (
    <Card>
      <CardContent className="py-8 text-center space-y-3">
        <AlertTriangle className="w-6 h-6 text-destructive mx-auto" />
        <p className="text-sm text-muted-foreground">Não foi possível gerar o radar agora.</p>
        <p className="text-xs text-muted-foreground max-w-md mx-auto">{(error as Error).message}</p>
        <Button size="sm" variant="outline" onClick={() => refresh.mutate()}>
          <RefreshCw className="w-4 h-4 mr-2" />Tentar novamente
        </Button>
      </CardContent>
    </Card>
  );

  const snap = data?.snapshot;
  const sections: Array<{ key: string; title: string; icon: any; color: string; items: any[]; render: (it: any) => { titulo: string; desc: string; tema: string; tipo: string } }> = [
    {
      key: "hot", title: "Temas quentes", icon: Flame, color: "text-orange-500",
      items: snap?.hot_topics ?? [],
      render: (it) => ({ titulo: `Post sobre ${it.tema}`, desc: `Tema com ${it.volume ?? "?"} menções (${it.sentimento_predominante ?? "—"})`, tema: it.tema, tipo: "oportunidade" }),
    },
    {
      key: "questions", title: "Perguntas em aberto", icon: HelpCircle, color: "text-blue-500",
      items: snap?.open_questions ?? [],
      render: (it) => ({ titulo: `Responder: ${it.pergunta}`, desc: `Pergunta repetida ${it.frequencia ?? "?"}x`, tema: "dúvidas", tipo: "pergunta" }),
    },
    {
      key: "hostile", title: "Narrativas hostis", icon: AlertTriangle, color: "text-destructive",
      items: snap?.hostile_narratives ?? [],
      render: (it) => ({ titulo: `Contra-narrativa: ${it.narrativa}`, desc: `${it.autores_count ?? "?"} autores propagando`, tema: "defesa", tipo: "contra-narrativa" }),
    },
    {
      key: "mob", title: "Pautas que mobilizam", icon: Heart, color: "text-pink-500",
      items: snap?.mobilizing_pautas ?? [],
      render: (it) => ({ titulo: `Mobilizar: ${it.pauta}`, desc: `${it.defensores_engajados ?? "?"} defensores engajados`, tema: it.pauta, tipo: "mobilizacao" }),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{snap?.snapshot_date ? `Snapshot de ${snap.snapshot_date}` : "Sem snapshot"} {data?.cached ? "(cache)" : ""}</p>
        <Button size="sm" variant="outline" onClick={() => refresh.mutate()} disabled={refresh.isPending}>
          {refresh.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          <span className="ml-2">Atualizar agora</span>
        </Button>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {sections.map((s) => {
          const Icon = s.icon;
          return (
            <Card key={s.key}>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base"><Icon className={`w-4 h-4 ${s.color}`} />{s.title}</CardTitle>
              </CardHeader>
              <CardContent>
                {s.items.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">Nada relevante detectado.</p>
                ) : (
                  <ul className="space-y-2">
                    {s.items.slice(0, 5).map((it: any, i: number) => {
                      const r = s.render(it);
                      return (
                        <li key={i} className="border rounded-lg p-3 text-sm">
                          <p className="font-medium">{r.titulo}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{r.desc}</p>
                          {it.exemplos?.[0] && <p className="text-xs italic mt-1 text-muted-foreground">"{it.exemplos[0]}"</p>}
                          <Button size="sm" variant="ghost" className="mt-2 h-7" onClick={() => saveAsIdea(r.titulo, r.desc, r.tema, r.tipo)}>
                            <Sparkles className="w-3 h-3 mr-1" />Salvar como ideia
                          </Button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- Ideias ---------- */
function IdeiasPanel({ clientId, onOpen }: { clientId: string | null | undefined; onOpen: () => void }) {
  const [filterStatus, setFilterStatus] = useState<string>("pendente");
  const { data: ideas = [], isLoading, refetch } = useIdeias(clientId, filterStatus === "all" ? undefined : filterStatus);
  const update = useUpdateIdeaStatus();

  const generateDaily = useMutation({
    mutationFn: async () => invoke("ic-daily-ideas", { clientId }),
    onSuccess: () => { toast.success("Novas ideias geradas"); refetch(); },
    onError: (e: any) => toast.error(e.message ?? "Falha"),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex gap-2">
          {["pendente", "aprovada", "descartada", "all"].map((s) => (
            <Button key={s} size="sm" variant={filterStatus === s ? "default" : "outline"} onClick={() => setFilterStatus(s)}>
              {s === "all" ? "Todas" : s.charAt(0).toUpperCase() + s.slice(1)}
            </Button>
          ))}
        </div>
        <Button size="sm" onClick={() => generateDaily.mutate()} disabled={generateDaily.isPending}>
          {generateDaily.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          <span className="ml-2">Gerar 5 novas ideias</span>
        </Button>
      </div>

      {isLoading ? (
        <Card><CardContent className="py-10 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></CardContent></Card>
      ) : ideas.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-muted-foreground text-sm">Nenhuma ideia neste filtro. Use "Gerar 5 novas ideias" ou salve do Radar.</CardContent></Card>
      ) : (
        <div className="grid md:grid-cols-2 gap-3">
          {ideas.map((idea) => (
            <Card key={idea.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h3 className="font-semibold text-sm">{idea.titulo}</h3>
                  <Badge variant="outline" className="shrink-0">{idea.score}</Badge>
                </div>
                {idea.descricao && <p className="text-xs text-muted-foreground mb-2">{idea.descricao}</p>}
                <div className="flex flex-wrap gap-1 mb-3">
                  {idea.tema && <Badge variant="secondary" className="text-[10px]">{idea.tema}</Badge>}
                  {idea.tipo && <Badge variant="outline" className="text-[10px]">{idea.tipo}</Badge>}
                  {idea.origem && <Badge variant="outline" className="text-[10px]">{idea.origem}</Badge>}
                </div>
                {idea.status === "pendente" && (
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="flex-1" onClick={() => update.mutate({ id: idea.id, status: "aprovada" })}>
                      <ThumbsUp className="w-3 h-3 mr-1" />Aprovar
                    </Button>
                    <Button size="sm" variant="outline" className="flex-1" onClick={() => update.mutate({ id: idea.id, status: "descartada" })}>
                      <ThumbsDown className="w-3 h-3 mr-1" />Descartar
                    </Button>
                    <Button size="sm" variant="default" onClick={() => { sessionStorage.setItem("ic-estudio-seed", JSON.stringify({ tema: idea.tema, angulo: idea.titulo })); onOpen(); }}>
                      <Wand2 className="w-3 h-3 mr-1" />Abrir
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- Estúdio ---------- */
function EstudioPanel({ clientId }: { clientId: string | null | undefined }) {
  const seed = (() => {
    try { return JSON.parse(sessionStorage.getItem("ic-estudio-seed") ?? "{}"); } catch { return {}; }
  })();
  const [tema, setTema] = useState(seed.tema ?? "");
  const [angulo, setAngulo] = useState(seed.angulo ?? "");
  const [cta, setCta] = useState("");
  const [out, setOut] = useState<any>(null);

  const generate = useMutation({
    mutationFn: async () => invoke("ic-generate-text", { clientId, tema, angulo, cta }),
    onSuccess: (r) => { setOut(r.generated); toast.success("Conteúdo gerado"); },
    onError: (e: any) => toast.error(e.message ?? "Falha"),
  });

  return (
    <div className="grid md:grid-cols-[1fr_1.4fr] gap-4">
      <Card>
        <CardHeader><CardTitle className="text-base">Briefing</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div>
            <label className="text-xs font-medium">Tema *</label>
            <Input value={tema} onChange={(e) => setTema(e.target.value)} placeholder="Ex: saúde pública" />
          </div>
          <div>
            <label className="text-xs font-medium">Ângulo</label>
            <Input value={angulo} onChange={(e) => setAngulo(e.target.value)} placeholder="Ex: nova UPA no bairro X" />
          </div>
          <div>
            <label className="text-xs font-medium">CTA</label>
            <Input value={cta} onChange={(e) => setCta(e.target.value)} placeholder="Ex: compartilhe se concorda" />
          </div>
          <Button className="w-full" onClick={() => generate.mutate()} disabled={!tema || generate.isPending}>
            {generate.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Wand2 className="w-4 h-4 mr-2" />}
            Gerar variantes
          </Button>
          <p className="text-[11px] text-muted-foreground">A ferramenta apenas sugere. Você publica manualmente onde quiser.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Sugestões</CardTitle></CardHeader>
        <CardContent>
          {!out ? (
            <p className="text-sm text-muted-foreground text-center py-10">Preencha o briefing e clique em Gerar.</p>
          ) : (
            <div className="space-y-4">
              {(["facebook", "instagram", "roteiro_falado", "brief_visual", "resposta_padrao"] as const).map((k) => out[k] && (
                <div key={k} className="border rounded-lg p-3">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{k.replace("_", " ")}</p>
                    <Button size="sm" variant="ghost" className="h-7" onClick={() => copyText(out[k])}><Copy className="w-3 h-3 mr-1" />Copiar</Button>
                  </div>
                  <p className="text-sm whitespace-pre-wrap">{out[k]}</p>
                  {k === "instagram" && out.hashtags?.length > 0 && (
                    <p className="text-xs text-primary mt-2">{out.hashtags.map((h: string) => `#${h.replace(/^#/, "")}`).join(" ")}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ---------- DNA ---------- */
function DnaPanel({ clientId }: { clientId: string | null | undefined }) {
  const { data: dna, isLoading, refetch } = useQuery({
    queryKey: ["ic-dna", clientId],
    queryFn: async () => {
      if (!clientId) return null;
      const { data } = await (supabase as any).from("content_dna").select("*").eq("client_id", clientId).maybeSingle();
      return data;
    },
    enabled: !!clientId,
    staleTime: Infinity,
  });

  const recalibrar = useMutation({
    mutationFn: async () => invoke("ic-dna-analyzer", { clientId }),
    onSuccess: () => { toast.success("DNA recalibrado"); refetch(); },
    onError: (e: any) => toast.error(e.message ?? "Falha"),
  });

  if (isLoading) return <Card><CardContent className="py-10 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></CardContent></Card>;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">DNA Editorial</CardTitle>
          <Button size="sm" onClick={() => recalibrar.mutate()} disabled={recalibrar.isPending}>
            {recalibrar.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RefreshCw className="w-4 h-4 mr-2" />}
            Recalibrar (analisa últimos 90d)
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {!dna ? (
          <p className="text-sm text-muted-foreground text-center py-8">DNA ainda não calibrado. Clique em "Recalibrar" para analisar seus posts próprios.</p>
        ) : (
          <dl className="grid sm:grid-cols-2 gap-4 text-sm">
            <div><dt className="text-xs font-semibold text-muted-foreground">Tom</dt><dd>{dna.tom ?? "—"}</dd></div>
            <div><dt className="text-xs font-semibold text-muted-foreground">Amostra</dt><dd>{dna.sample_size} posts</dd></div>
            <div className="sm:col-span-2"><dt className="text-xs font-semibold text-muted-foreground">Vocabulário</dt><dd className="flex flex-wrap gap-1 mt-1">{(dna.vocabulario ?? []).map((v: string) => <Badge key={v} variant="secondary">{v}</Badge>)}</dd></div>
            <div><dt className="text-xs font-semibold text-muted-foreground">Emojis</dt><dd className="text-xl">{(dna.emojis_assinatura ?? []).join(" ") || "—"}</dd></div>
            <div><dt className="text-xs font-semibold text-muted-foreground">Tamanho ideal</dt><dd className="text-xs">{JSON.stringify(dna.tamanho_ideal)}</dd></div>
            <div className="sm:col-span-2"><dt className="text-xs font-semibold text-muted-foreground">Estruturas</dt><dd className="text-xs">{JSON.stringify(dna.estruturas)}</dd></div>
            <div className="sm:col-span-2"><dt className="text-xs font-semibold text-muted-foreground">Horários de pico</dt><dd className="text-xs">{JSON.stringify(dna.horarios_pico)}</dd></div>
          </dl>
        )}
      </CardContent>
    </Card>
  );
}