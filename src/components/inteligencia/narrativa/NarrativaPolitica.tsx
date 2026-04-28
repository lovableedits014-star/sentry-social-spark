import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import {
  Megaphone, Target, Flame, Users, MapPin, Newspaper, Sparkles, RefreshCw, Settings,
  AlertTriangle, History, Copy, Loader2, Search,
} from "lucide-react";

type Dossie = {
  id: string;
  client_id: string;
  uf: string;
  municipio: string;
  ibge_code: string | null;
  status: string;
  erro_msg: string | null;
  dados_brutos: any;
  analise: any;
  conteudos: any;
  collected_at: string | null;
  analyzed_at: string | null;
  generated_at: string | null;
  created_at: string;
};

type Perfil = {
  id?: string;
  client_id: string;
  nome_candidato: string | null;
  cargo_pretendido: string | null;
  partido: string | null;
  bandeiras: string[];
  tom_voz: string | null;
  estilo_discurso: string | null;
  publico_alvo: string | null;
  proposta_central: string | null;
  observacoes: string | null;
};

const PAIN_COLORS: Record<string, string> = {
  explosiva: "bg-destructive text-destructive-foreground",
  latente: "bg-orange-500 text-white",
  silenciosa: "bg-muted text-muted-foreground",
};

const AREA_LABEL: Record<string, string> = {
  saude: "Saúde", educacao: "Educação", seguranca: "Segurança",
  infra: "Infraestrutura", economia: "Economia",
};

function copyText(t: string) {
  navigator.clipboard.writeText(t);
  toast({ title: "Copiado", description: "Texto copiado para a área de transferência." });
}

const NarrativaPolitica = () => {
  const qc = useQueryClient();
  const [clientId, setClientId] = useState<string | null>(null);

  // Descobre client_id (clients.user_id == auth.uid)
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: c } = await supabase
        .from("clients").select("id").eq("user_id", user.id).maybeSingle();
      if (c?.id) { setClientId(c.id); return; }
      const { data: tm } = await supabase
        .from("team_members" as any).select("client_id").eq("user_id", user.id).maybeSingle();
      const tmRow = tm as any;
      if (tmRow?.client_id) setClientId(tmRow.client_id);
    })();
  }, []);

  // Lista de dossiês recentes
  const { data: dossies } = useQuery({
    queryKey: ["narrativa-dossies", clientId],
    enabled: !!clientId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("narrativa_dossies" as any)
        .select("*")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data || []) as unknown as Dossie[];
    },
  });

  // Perfil do candidato
  const { data: perfil } = useQuery({
    queryKey: ["narrativa-perfil", clientId],
    enabled: !!clientId,
    staleTime: Infinity,
    queryFn: async () => {
      const { data } = await supabase
        .from("narrativa_perfil_candidato" as any)
        .select("*")
        .eq("client_id", clientId)
        .maybeSingle();
      return (data as unknown as Perfil) || null;
    },
  });

  // Lista municípios disponíveis no banco TSE para autocomplete (UF + município únicos)
  const { data: municipios } = useQuery({
    queryKey: ["narrativa-municipios"],
    staleTime: Infinity,
    queryFn: async () => {
      const { data } = await supabase.rpc("get_tse_municipios" as any);
      return (data || []) as { uf: string; municipio: string }[];
    },
  });

  // Form de busca
  const [uf, setUf] = useState<string>("MS");
  const [municipio, setMunicipio] = useState<string>("");
  const [activeDossieId, setActiveDossieId] = useState<string | null>(null);

  const ufs = useMemo(
    () => Array.from(new Set((municipios || []).map((m) => m.uf))).sort(),
    [municipios],
  );
  const municipiosUf = useMemo(
    () => (municipios || []).filter((m) => m.uf === uf).map((m) => m.municipio).sort(),
    [municipios, uf],
  );

  // Pipeline: coleta -> analise -> gerar
  const runPipeline = useMutation({
    mutationFn: async ({ uf, municipio }: { uf: string; municipio: string }) => {
      if (!clientId) throw new Error("Cliente não identificado");
      // 1) coleta
      const r1 = await supabase.functions.invoke("narrativa-coleta", {
        body: { client_id: clientId, uf, municipio },
      });
      if (r1.error) throw r1.error;
      const dossie_id = (r1.data as any)?.dossie_id;
      setActiveDossieId(dossie_id);
      // 2) analise
      const r2 = await supabase.functions.invoke("narrativa-analise", { body: { dossie_id } });
      if (r2.error) throw r2.error;
      // 3) gerar
      const r3 = await supabase.functions.invoke("narrativa-gerar", { body: { dossie_id } });
      if (r3.error) throw r3.error;
      return dossie_id;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["narrativa-dossies", clientId] });
      toast({ title: "Pronto!", description: "Dossiê político gerado com sucesso." });
    },
    onError: (e: any) => {
      toast({ title: "Erro", description: e?.message || "Falha ao gerar dossiê", variant: "destructive" });
    },
  });

  // Salvar perfil
  const savePerfil = useMutation({
    mutationFn: async (p: Partial<Perfil>) => {
      if (!clientId) throw new Error("sem cliente");
      const payload = { ...p, client_id: clientId };
      const { error } = await supabase
        .from("narrativa_perfil_candidato" as any)
        .upsert(payload as any, { onConflict: "client_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["narrativa-perfil", clientId] });
      toast({ title: "Perfil salvo" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const activeDossie = useMemo(
    () => (dossies || []).find((d) => d.id === activeDossieId) || dossies?.[0] || null,
    [dossies, activeDossieId],
  );

  return (
    <div className="space-y-4">
      {/* Header explicativo */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Megaphone className="w-5 h-5 text-primary" /> Narrativa Política
          </CardTitle>
          <CardDescription>
            Escolha uma cidade, gere o <b>dossiê de dor</b> em segundos e receba <b>3 versões de discurso</b>,
            ataques 3-camadas, manchetes para reels e roteiro de visita estratégica — tudo baseado em
            dados reais do IBGE, TSE e mídia (GDELT). Munição pronta para a campanha do dia.
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Linha de ação: busca + perfil */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card className="md:col-span-2">
          <CardHeader className="pb-2"><CardTitle className="text-sm">Cidade do dia</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <div>
                <Label className="text-xs">UF</Label>
                <Select value={uf} onValueChange={setUf}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    {ufs.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="md:col-span-2">
                <Label className="text-xs">Município</Label>
                <Select value={municipio} onValueChange={setMunicipio}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    {municipiosUf.slice(0, 200).map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                disabled={!municipio || runPipeline.isPending}
                onClick={() => runPipeline.mutate({ uf, municipio })}
              >
                {runPipeline.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
                Gerar dossiê político
              </Button>
              {runPipeline.isPending && (
                <span className="text-xs text-muted-foreground">
                  Coletando IBGE, TSE e mídia… isso pode levar até 30s.
                </span>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Perfil candidato */}
        <PerfilCard perfil={perfil} onSave={(p) => savePerfil.mutate(p)} />
      </div>

      {/* Histórico curto */}
      {dossies && dossies.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2"><History className="w-4 h-4" /> Histórico recente</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {dossies.slice(0, 12).map((d) => (
                <Button
                  key={d.id}
                  variant={activeDossie?.id === d.id ? "default" : "outline"}
                  size="sm"
                  onClick={() => setActiveDossieId(d.id)}
                >
                  {d.municipio}/{d.uf}
                  <Badge variant="secondary" className="ml-2 text-[10px]">{d.status}</Badge>
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Resultado */}
      {activeDossie ? <DossieView dossie={activeDossie} /> : (
        <Card><CardContent className="p-8 text-center text-muted-foreground text-sm">
          Nenhum dossiê ainda. Selecione uma cidade acima e gere o primeiro.
        </CardContent></Card>
      )}
    </div>
  );
};

/* ----------------- Perfil ----------------- */
const PerfilCard = ({ perfil, onSave }: { perfil: Perfil | null; onSave: (p: Partial<Perfil>) => void }) => {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Partial<Perfil>>({
    nome_candidato: "", cargo_pretendido: "", partido: "",
    bandeiras: [], tom_voz: "popular", estilo_discurso: "",
    publico_alvo: "", proposta_central: "", observacoes: "",
  });
  useEffect(() => { if (perfil) setForm(perfil); }, [perfil]);

  const bandeirasStr = (form.bandeiras || []).join(", ");

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2"><Settings className="w-4 h-4" /> Perfil do candidato</CardTitle>
        <CardDescription className="text-xs">Define o tom e bandeiras usados pela IA.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="text-xs space-y-1">
          <div><b>{perfil?.nome_candidato || "—"}</b> · {perfil?.cargo_pretendido || "—"}</div>
          <div className="text-muted-foreground">Tom: {perfil?.tom_voz || "—"}</div>
          <div className="text-muted-foreground">Bandeiras: {(perfil?.bandeiras || []).join(", ") || "—"}</div>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" className="mt-3 w-full">Editar perfil</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Perfil do candidato</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div><Label className="text-xs">Nome</Label>
                  <Input value={form.nome_candidato || ""} onChange={(e) => setForm({ ...form, nome_candidato: e.target.value })} /></div>
                <div><Label className="text-xs">Cargo pretendido</Label>
                  <Input value={form.cargo_pretendido || ""} onChange={(e) => setForm({ ...form, cargo_pretendido: e.target.value })} /></div>
                <div><Label className="text-xs">Partido</Label>
                  <Input value={form.partido || ""} onChange={(e) => setForm({ ...form, partido: e.target.value })} /></div>
                <div><Label className="text-xs">Tom de voz</Label>
                  <Select value={form.tom_voz || "popular"} onValueChange={(v) => setForm({ ...form, tom_voz: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="popular">Popular</SelectItem>
                      <SelectItem value="tecnico">Técnico</SelectItem>
                      <SelectItem value="emocional">Emocional</SelectItem>
                      <SelectItem value="combativo">Combativo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div><Label className="text-xs">Bandeiras (separadas por vírgula)</Label>
                <Input value={bandeirasStr}
                  onChange={(e) => setForm({ ...form, bandeiras: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} />
              </div>
              <div><Label className="text-xs">Proposta central</Label>
                <Textarea rows={2} value={form.proposta_central || ""} onChange={(e) => setForm({ ...form, proposta_central: e.target.value })} /></div>
              <div><Label className="text-xs">Estilo de discurso</Label>
                <Input value={form.estilo_discurso || ""} onChange={(e) => setForm({ ...form, estilo_discurso: e.target.value })} /></div>
              <div><Label className="text-xs">Público-alvo</Label>
                <Input value={form.publico_alvo || ""} onChange={(e) => setForm({ ...form, publico_alvo: e.target.value })} /></div>
              <div><Label className="text-xs">Observações</Label>
                <Textarea rows={2} value={form.observacoes || ""} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} /></div>
            </div>
            <DialogFooter>
              <Button onClick={() => { onSave(form); setOpen(false); }}>Salvar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
};

/* ----------------- Resultado / Dossiê ----------------- */
const DossieView = ({ dossie }: { dossie: Dossie }) => {
  const ibge = dossie.dados_brutos?.ibge;
  const analise = dossie.analise;
  const conteudos = dossie.conteudos;
  const dores = analise?.dores || [];
  const oportunidade = analise?.oportunidade;
  const midia = dossie.dados_brutos?.midia_gdelt;

  return (
    <div className="space-y-4">
      {/* RAIO-X */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <MapPin className="w-4 h-4 text-primary" /> Raio-X · {dossie.municipio}/{dossie.uf}
          </CardTitle>
          <CardDescription className="text-xs">
            Status: <b>{dossie.status}</b>{dossie.erro_msg && <> · <span className="text-destructive">{dossie.erro_msg}</span></>}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <Stat label="População" value={ibge?.populacao?.val ? Number(ibge.populacao.val).toLocaleString("pt-BR") : "—"} sub={ibge?.populacao?.ano ? `est. ${ibge.populacao.ano}` : ""} />
            <Stat label="Área (km²)" value={ibge?.area_km2 ? Number(ibge.area_km2).toLocaleString("pt-BR") : "—"} />
            <Stat label="PIB per capita" value={ibge?.pib_per_capita?.val ? `R$ ${Number(ibge.pib_per_capita.val).toLocaleString("pt-BR")}` : "—"} sub={ibge?.pib_per_capita?.ano ? `${ibge.pib_per_capita.ano}` : ""} />
            <Stat label="Tom da mídia" value={midia?.tom_medio != null ? Number(midia.tom_medio).toFixed(2) : "—"} sub={`${midia?.total ?? 0} artigos`} />
          </div>
        </CardContent>
      </Card>

      {/* MAPA DE DOR + OPORTUNIDADE */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="md:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2"><Flame className="w-4 h-4 text-destructive" /> Mapa de Dor</CardTitle>
            <CardDescription className="text-xs">Cada área é classificada em Explosiva (campanha), Latente (vigiar) ou Silenciosa.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {dores.length === 0 && <p className="text-sm text-muted-foreground">Sem dados de dor.</p>}
            {dores.map((d: any) => (
              <div key={d.area} className="flex items-center justify-between p-2 rounded border">
                <div>
                  <div className="font-medium text-sm">{AREA_LABEL[d.area] || d.area}</div>
                  <div className="text-xs text-muted-foreground">{d.mencoes_midia} menções na mídia</div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-2xl font-bold tabular-nums">{d.pain_score}</div>
                  <Badge className={PAIN_COLORS[d.classificacao]}>{d.classificacao}</Badge>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2"><Target className="w-4 h-4 text-primary" /> Oportunidade política</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold tabular-nums">{oportunidade?.oportunidade_score ?? "—"}</div>
            <Badge className="mt-1">{oportunidade?.nivel || "—"}</Badge>
            <Separator className="my-3" />
            <div className="text-xs space-y-1">
              <div><b>Dor principal:</b> {AREA_LABEL[oportunidade?.dor_principal] || oportunidade?.dor_principal || "—"}</div>
              <div><b>Força do gestor atual:</b> {oportunidade?.forca_gestor_atual ?? "—"}%</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* CONTEÚDOS GERADOS */}
      {conteudos && Object.keys(conteudos).length > 0 ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2"><Sparkles className="w-4 h-4 text-primary" /> Munição gerada pela IA</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="discursos">
              <TabsList>
                <TabsTrigger value="discursos">Discursos (3 versões)</TabsTrigger>
                <TabsTrigger value="ataques">Ataques 3-camadas</TabsTrigger>
                <TabsTrigger value="reels">Manchetes / Reels</TabsTrigger>
                <TabsTrigger value="visita">Roteiro de visita</TabsTrigger>
              </TabsList>

              <TabsContent value="discursos" className="mt-4 space-y-3">
                {(["popular", "tecnico", "emocional"] as const).map((k) => (
                  <Card key={k}>
                    <CardHeader className="pb-2 flex flex-row items-center justify-between">
                      <CardTitle className="text-sm capitalize">{k}</CardTitle>
                      <Button size="sm" variant="ghost" onClick={() => copyText(conteudos.discursos?.[k] || "")}>
                        <Copy className="w-3 h-3 mr-1" /> Copiar
                      </Button>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm whitespace-pre-wrap">{conteudos.discursos?.[k] || "—"}</p>
                    </CardContent>
                  </Card>
                ))}
              </TabsContent>

              <TabsContent value="ataques" className="mt-4 space-y-3">
                {(conteudos.ataques_3_camadas || []).map((a: any, i: number) => (
                  <Card key={i}>
                    <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-destructive" /> {a.tema}</CardTitle></CardHeader>
                    <CardContent className="text-sm space-y-2">
                      <div><b>Falha do gestor:</b> {a.falha_do_gestor}</div>
                      <div><b>Sua solução:</b> {a.solucao_proposta}</div>
                    </CardContent>
                  </Card>
                ))}
              </TabsContent>

              <TabsContent value="reels" className="mt-4">
                <ul className="space-y-2">
                  {(conteudos.manchetes_reels || []).map((m: string, i: number) => (
                    <li key={i} className="flex items-center justify-between p-2 border rounded">
                      <span className="text-sm">{m}</span>
                      <Button size="sm" variant="ghost" onClick={() => copyText(m)}><Copy className="w-3 h-3" /></Button>
                    </li>
                  ))}
                </ul>
              </TabsContent>

              <TabsContent value="visita" className="mt-4">
                <Card>
                  <CardContent className="pt-4 text-sm space-y-2">
                    <div><b>Foco:</b> {conteudos.roteiro_visita?.foco}</div>
                    <div><b>Emoção alvo:</b> {conteudos.roteiro_visita?.emocao_alvo}</div>
                    <div><b>Bairro sugerido:</b> {conteudos.roteiro_visita?.bairro_sugerido}</div>
                    <Separator />
                    <div><b>Primeira frase:</b> "{conteudos.roteiro_visita?.primeira_frase}"</div>
                    <div><b>Mensagem central:</b> {conteudos.roteiro_visita?.mensagem_central}</div>
                    <div><b>Chamada para ação:</b> {conteudos.roteiro_visita?.chamada_acao}</div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      ) : (
        <Card><CardContent className="p-6 text-sm text-muted-foreground text-center">
          Os conteúdos de IA aparecem aqui após a geração concluir.
        </CardContent></Card>
      )}

      {/* MÍDIA */}
      {midia?.artigos?.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2"><Newspaper className="w-4 h-4" /> Manchetes recentes (GDELT)</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1 text-xs">
              {midia.artigos.slice(0, 10).map((a: any, i: number) => (
                <li key={i}>
                  <a href={a.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                    <b>{a.fonte}</b> — {a.titulo}
                  </a>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

const Stat = ({ label, value, sub }: { label: string; value: string | number; sub?: string }) => (
  <div className="p-2 rounded border">
    <div className="text-xs text-muted-foreground">{label}</div>
    <div className="text-lg font-semibold tabular-nums">{value}</div>
    {sub && <div className="text-[10px] text-muted-foreground">{sub}</div>}
  </div>
);

export default NarrativaPolitica;