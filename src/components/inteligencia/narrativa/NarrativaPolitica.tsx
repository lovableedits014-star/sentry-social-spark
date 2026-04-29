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
  AlertTriangle, History, Copy, Loader2, Search, FileDown, Send, MapPinned, Star, Pencil, Check, X,
} from "lucide-react";
import jsPDF from "jspdf";

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
  infra: "Infraestrutura", economia: "Economia", social: "Social",
};

function copyText(t: string) {
  navigator.clipboard.writeText(t);
  toast({ title: "Copiado", description: "Texto copiado para a área de transferência." });
}

/* ----------------- Exportações ----------------- */
function buildDossieMarkdown(dossie: any): string {
  const c = dossie.conteudos || {};
  const a = dossie.analise || {};
  const top = a.top_locais_criticos || [];
  const lines: string[] = [];
  lines.push(`# Dossiê político — ${dossie.municipio}/${dossie.uf}`);
  lines.push(`Gerado em ${new Date(dossie.generated_at || dossie.created_at).toLocaleString("pt-BR")}`);
  lines.push("");
  lines.push(`## Oportunidade política: ${a.oportunidade?.nivel || "—"} (score ${a.oportunidade?.oportunidade_score || "—"})`);
  lines.push(`- Dor principal: ${a.oportunidade?.dor_principal || "—"}`);
  lines.push(`- Força do gestor atual: ${a.oportunidade?.forca_gestor_atual ?? "—"}%`);
  lines.push("");
  lines.push(`## Mapa de Dor`);
  for (const d of (a.dores || [])) {
    lines.push(`### ${d.area.toUpperCase()} — ${d.classificacao} (score ${d.pain_score})`);
    for (const e of (d.evidencias || [])) {
      const cmp = e.valor_estado != null ? ` vs ${Number(e.valor_estado).toFixed(2)} média ${dossie.uf} (${e.delta_pct > 0 ? "+" : ""}${e.delta_pct?.toFixed(1)}%)` : "";
      lines.push(`- ${e.titulo}: ${e.valor_cidade} ${e.unidade}${cmp} [${e.fonte}, ${e.ano}]`);
    }
    lines.push("");
  }
  if (top.length > 0) {
    lines.push(`## Top 10 locais críticos (zonas onde o prefeito atual foi mais fraco)`);
    for (const l of top) {
      lines.push(`${l.rank}. ${l.bairro} — ${l.nome_local || "—"} (zona ${l.zona}, eleito ${l.pct_eleito_zona ?? "?"}%)`);
      if (l.endereco) lines.push(`   ${l.endereco}`);
    }
    lines.push("");
  }
  if (c.discursos) {
    for (const k of ["popular", "tecnico", "emocional"]) {
      lines.push(`## Discurso — ${k}`);
      lines.push(c.discursos[k] || "—");
      lines.push("");
    }
  }
  if (c.ataques_3_camadas) {
    lines.push(`## Ataques 3-camadas`);
    for (const at of c.ataques_3_camadas) {
      lines.push(`### ${at.tema}`);
      lines.push(`- Falha do gestor: ${at.falha_do_gestor}`);
      lines.push(`- Solução: ${at.solucao_proposta}`);
    }
    lines.push("");
  }
  if (c.manchetes_reels) {
    lines.push(`## Manchetes/Reels`);
    for (const m of c.manchetes_reels) lines.push(`- ${m}`);
    lines.push("");
  }
  if (c.roteiro_visita) {
    lines.push(`## Roteiro de visita`);
    lines.push(`- Foco: ${c.roteiro_visita.foco}`);
    lines.push(`- Emoção: ${c.roteiro_visita.emocao_alvo}`);
    lines.push(`- Bairro: ${c.roteiro_visita.bairro_sugerido}`);
    lines.push(`- Primeira frase: "${c.roteiro_visita.primeira_frase}"`);
    lines.push(`- Mensagem central: ${c.roteiro_visita.mensagem_central}`);
    lines.push(`- Chamada: ${c.roteiro_visita.chamada_acao}`);
  }
  return lines.join("\n");
}

// Gera o PDF do dossiê com layout profissional. Se `download=true`, baixa.
// Sempre devolve o documento jsPDF para reuso (ex: enviar via WhatsApp).
function buildDossiePdf(dossie: any, download = true) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 48;
  const contentW = pageW - margin * 2;

  // Paleta (RGB)
  const C = {
    primary: [15, 23, 42] as [number, number, number],       // slate-900
    accent:  [59, 130, 246] as [number, number, number],     // blue-500
    danger:  [220, 38, 38] as [number, number, number],      // red-600
    warn:    [234, 88, 12] as [number, number, number],      // orange-600
    muted:   [100, 116, 139] as [number, number, number],    // slate-500
    light:   [241, 245, 249] as [number, number, number],    // slate-100
    border:  [226, 232, 240] as [number, number, number],    // slate-200
    success: [22, 163, 74] as [number, number, number],      // green-600
    text:    [30, 41, 59] as [number, number, number],       // slate-800
    white:   [255, 255, 255] as [number, number, number],
  };
  const setFill = (c: number[]) => doc.setFillColor(c[0], c[1], c[2]);
  const setStroke = (c: number[]) => doc.setDrawColor(c[0], c[1], c[2]);
  const setText = (c: number[]) => doc.setTextColor(c[0], c[1], c[2]);

  let y = margin;
  let pageNum = 1;

  const a = dossie.analise || {};
  const c = dossie.conteudos || {};
  const ibge = dossie.dados_brutos?.ibge_municipios?.[0]?.dados || {};
  const midia = dossie.dados_brutos?.midia_gdelt;
  const cidade = dossie.municipio || "";
  const uf = dossie.uf || "";
  const dataGer = new Date(dossie.generated_at || dossie.created_at).toLocaleDateString("pt-BR", {
    day: "2-digit", month: "long", year: "numeric"
  });

  // ---------- Helpers ----------
  const drawHeader = () => {
    if (pageNum === 1) return; // capa não tem cabeçalho
    setFill(C.primary);
    doc.rect(0, 0, pageW, 28, "F");
    setText(C.white);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text(`DOSSIÊ ESTRATÉGICO · ${cidade.toUpperCase()}/${uf}`, margin, 18);
    doc.setFont("helvetica", "normal");
    doc.text(dataGer, pageW - margin, 18, { align: "right" });
  };
  const drawFooter = () => {
    setText(C.muted);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text("Gerado pela plataforma de Inteligência Eleitoral", margin, pageH - 18);
    doc.text(`Página ${pageNum}`, pageW - margin, pageH - 18, { align: "right" });
  };
  const newPage = () => {
    drawFooter();
    doc.addPage();
    pageNum++;
    drawHeader();
    y = pageNum === 1 ? margin : 56;
  };
  const ensure = (h: number) => { if (y + h > pageH - 40) newPage(); };

  const sectionTitle = (title: string, accent: number[] = C.accent) => {
    ensure(38);
    setFill(accent);
    doc.rect(margin, y, 4, 18, "F");
    setText(C.primary);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text(title, margin + 12, y + 14);
    y += 28;
  };

  const paragraph = (text: string, opts: { size?: number; color?: number[]; bold?: boolean } = {}) => {
    const size = opts.size ?? 10;
    setText(opts.color ?? C.text);
    doc.setFont("helvetica", opts.bold ? "bold" : "normal");
    doc.setFontSize(size);
    const wrapped = doc.splitTextToSize(text, contentW);
    for (const w of wrapped) {
      ensure(size + 4);
      doc.text(w, margin, y);
      y += size + 4;
    }
  };

  const card = (title: string, value: string, sub: string, x: number, w: number, accent = C.accent) => {
    const h = 56;
    setFill(C.light);
    setStroke(C.border);
    doc.roundedRect(x, y, w, h, 4, 4, "FD");
    // barra lateral
    setFill(accent);
    doc.rect(x, y, 3, h, "F");
    setText(C.muted);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text(title.toUpperCase(), x + 10, y + 14);
    setText(C.primary);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    const vWrapped = doc.splitTextToSize(value, w - 20);
    doc.text(vWrapped[0] || "—", x + 10, y + 32);
    if (sub) {
      setText(C.muted);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.text(sub, x + 10, y + 48);
    }
  };

  const pill = (text: string, x: number, py: number, color: number[]): number => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    const tw = doc.getTextWidth(text) + 14;
    setFill(color);
    doc.roundedRect(x, py - 9, tw, 14, 7, 7, "F");
    setText(C.white);
    doc.text(text, x + 7, py);
    return tw;
  };

  // ---------- CAPA ----------
  setFill(C.primary);
  doc.rect(0, 0, pageW, 220, "F");
  setFill(C.accent);
  doc.rect(0, 220, pageW, 4, "F");

  setText(C.white);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("INTELIGÊNCIA ELEITORAL · DOSSIÊ ESTRATÉGICO", margin, 70);

  doc.setFontSize(34);
  const titleWrap = doc.splitTextToSize(`${cidade}`, contentW);
  doc.text(titleWrap, margin, 120);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(16);
  setText(C.light);
  doc.text(`${uf} · ${dataGer}`, margin, 152);

  // Resumo executivo na capa
  const op = a.oportunidade || {};
  const opNivel = String(op.nivel || "").toLowerCase();
  const opColor = opNivel === "alta" ? C.success : opNivel === "media" || opNivel === "média" ? C.warn : C.muted;
  setFill(C.white);
  setStroke(C.border);
  doc.roundedRect(margin, 250, contentW, 180, 6, 6, "FD");
  setText(C.muted);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("RESUMO EXECUTIVO", margin + 16, 274);

  setText(C.primary);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Oportunidade política:", margin + 16, 296);
  pill((op.nivel || "—").toString().toUpperCase(), margin + 145, 296, opColor);
  doc.setFont("helvetica", "normal");
  doc.text(`Score: ${op.oportunidade_score ?? "—"}`, margin + 16, 316);
  doc.text(`Dor principal: ${op.dor_principal || "—"}`, margin + 16, 332);
  doc.text(`Força do gestor atual: ${op.forca_gestor_atual ?? "—"}%`, margin + 16, 348);

  // KPIs na capa
  y = 380;
  const kpiW = (contentW - 20) / 3;
  const kpiX = margin;
  // Reposiciono porque card usa `y` global
  const yKpi = 380;
  y = yKpi;
  card("População", ibge?.populacao?.val ? Number(ibge.populacao.val).toLocaleString("pt-BR") : "—", ibge?.populacao?.ano ? `Estimativa ${ibge.populacao.ano}` : "", margin, kpiW, C.accent);
  y = yKpi;
  card("PIB per capita", ibge?.pib_per_capita?.val ? `R$ ${Number(ibge.pib_per_capita.val).toLocaleString("pt-BR")}` : "—", ibge?.pib_per_capita?.ano ? `${ibge.pib_per_capita.ano}` : "", margin + kpiW + 10, kpiW, C.success);
  y = yKpi;
  card("Tom da mídia", midia?.tom_medio != null ? Number(midia.tom_medio).toFixed(2) : "—", `${midia?.total ?? 0} artigos`, margin + (kpiW + 10) * 2, kpiW, C.warn);

  drawFooter();

  // ---------- PÁGINAS DE CONTEÚDO ----------
  doc.addPage();
  pageNum++;
  drawHeader();
  y = 56;

  // MAPA DE DOR
  if ((a.dores || []).length > 0) {
    sectionTitle("Mapa de Dor", C.danger);
    paragraph("Cada área foi classificada em Explosiva (pronta para campanha), Latente (vigiar) ou Silenciosa.", { size: 9, color: C.muted });
    y += 6;

    for (const d of a.dores) {
      ensure(70);
      const cls = String(d.classificacao || "").toLowerCase();
      const color = cls === "explosiva" ? C.danger : cls === "latente" ? C.warn : C.muted;
      setFill(C.light);
      setStroke(C.border);
      doc.roundedRect(margin, y, contentW, 24, 3, 3, "FD");
      setFill(color);
      doc.rect(margin, y, 3, 24, "F");
      setText(C.primary);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      const areaName = (AREA_LABEL[d.area] || d.area || "—").toString().toUpperCase();
      doc.text(areaName, margin + 12, y + 16);
      pill(String(d.classificacao || "—").toUpperCase(), margin + 130, y + 16, color);
      setText(C.muted);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.text(`Score: ${d.pain_score ?? "—"}`, pageW - margin - 60, y + 16);
      y += 30;

      for (const e of (d.evidencias || []).slice(0, 4)) {
        const cmp = e.valor_estado != null
          ? ` vs ${Number(e.valor_estado).toFixed(2)} (média ${uf}, ${e.delta_pct > 0 ? "+" : ""}${Number(e.delta_pct ?? 0).toFixed(1)}%)`
          : "";
        const txt = `• ${e.titulo}: ${e.valor_cidade} ${e.unidade || ""}${cmp}`;
        const src = `   ${e.fonte || ""} · ${e.ano || ""}`;
        paragraph(txt, { size: 9 });
        paragraph(src, { size: 8, color: C.muted });
      }
      y += 6;
    }
  }

  // TOP LOCAIS CRÍTICOS
  const top = a.top_locais_criticos || [];
  if (top.length > 0) {
    y += 8;
    sectionTitle("Top Locais Críticos", C.warn);
    paragraph("Zonas onde o atual gestor teve desempenho mais fraco — prioridades para visita.", { size: 9, color: C.muted });
    y += 6;

    // Cabeçalho de tabela
    ensure(24);
    setFill(C.primary);
    doc.rect(margin, y, contentW, 20, "F");
    setText(C.white);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("#", margin + 8, y + 14);
    doc.text("BAIRRO / LOCAL", margin + 30, y + 14);
    doc.text("ZONA", margin + 320, y + 14);
    doc.text("% ELEITO", margin + 380, y + 14);
    y += 20;

    top.slice(0, 10).forEach((l: any, idx: number) => {
      ensure(28);
      if (idx % 2 === 0) {
        setFill(C.light);
        doc.rect(margin, y, contentW, 24, "F");
      }
      setText(C.text);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.text(String(l.rank ?? idx + 1), margin + 8, y + 15);
      doc.setFont("helvetica", "bold");
      const nome = `${l.bairro || "—"}${l.nome_local ? ` — ${l.nome_local}` : ""}`;
      const truncated = doc.splitTextToSize(nome, 280)[0];
      doc.text(truncated, margin + 30, y + 15);
      doc.setFont("helvetica", "normal");
      doc.text(String(l.zona ?? "—"), margin + 320, y + 15);
      doc.text(`${l.pct_eleito_zona ?? "?"}%`, margin + 380, y + 15);
      y += 24;
    });
  }

  // DISCURSOS
  if (c.discursos) {
    y += 12;
    sectionTitle("Discursos Recomendados", C.accent);
    const labels: Record<string, string> = { popular: "Popular", tecnico: "Técnico", emocional: "Emocional" };
    for (const k of ["popular", "tecnico", "emocional"]) {
      if (!c.discursos[k]) continue;
      ensure(40);
      setText(C.accent);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text(labels[k] || k, margin, y);
      y += 14;
      paragraph(c.discursos[k], { size: 10 });
      y += 6;
    }
  }

  // ATAQUES
  if ((c.ataques_3_camadas || []).length > 0) {
    y += 8;
    sectionTitle("Estratégia de Ataques (3 camadas)", C.danger);
    for (const at of c.ataques_3_camadas) {
      ensure(70);
      setFill(C.light);
      setStroke(C.border);
      doc.roundedRect(margin, y, contentW, 18, 3, 3, "FD");
      setText(C.primary);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text(at.tema || "—", margin + 8, y + 12);
      y += 24;
      paragraph(`Falha do gestor: ${at.falha_do_gestor || "—"}`, { size: 9 });
      paragraph(`Solução proposta: ${at.solucao_proposta || "—"}`, { size: 9, color: C.success });
      y += 6;
    }
  }

  // MANCHETES
  if ((c.manchetes_reels || []).length > 0) {
    y += 8;
    sectionTitle("Manchetes / Reels Sugeridos", C.accent);
    for (const m of c.manchetes_reels) {
      paragraph(`▸ ${m}`, { size: 10 });
    }
  }

  // ROTEIRO DE VISITA
  if (c.roteiro_visita) {
    y += 12;
    sectionTitle("Roteiro de Visita", C.success);
    const r = c.roteiro_visita;
    ensure(140);
    setFill(C.light);
    setStroke(C.border);
    doc.roundedRect(margin, y, contentW, 120, 6, 6, "FD");
    const inner = margin + 14;
    let yi = y + 20;
    const kv = (k: string, v: string) => {
      setText(C.muted);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.text(k.toUpperCase(), inner, yi);
      setText(C.primary);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      const wrapped = doc.splitTextToSize(v || "—", contentW - 28);
      doc.text(wrapped[0] || "—", inner, yi + 12);
      yi += 28;
    };
    kv("Foco", r.foco || "—");
    kv("Bairro sugerido", r.bairro_sugerido || "—");
    kv("Mensagem central", r.mensagem_central || "—");
    kv("Chamada para ação", r.chamada_acao || "—");
    y += 130;

    if (r.primeira_frase) {
      ensure(40);
      setFill(C.primary);
      doc.roundedRect(margin, y, contentW, 38, 4, 4, "F");
      setText(C.white);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.text("PRIMEIRA FRASE", margin + 12, y + 14);
      doc.setFont("helvetica", "italic");
      doc.setFontSize(11);
      const fr = doc.splitTextToSize(`"${r.primeira_frase}"`, contentW - 28);
      doc.text(fr[0] || "", margin + 12, y + 30);
      y += 48;
    }
  }

  drawFooter();

  if (download) doc.save(`dossie-${cidade}-${uf}.pdf`);
  return doc;
}

function exportDossiePdf(dossie: any) {
  buildDossiePdf(dossie, true);
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
      {activeDossie ? <DossieView dossie={activeDossie} clientId={clientId} /> : (
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
const DossieView = ({ dossie, clientId }: { dossie: Dossie; clientId: string | null }) => {
  const ibge = dossie.dados_brutos?.ibge;
  const analise = dossie.analise;
  const conteudos = dossie.conteudos;
  const dores = analise?.dores || [];
  const oportunidade = analise?.oportunidade;
  const midia = dossie.dados_brutos?.midia_gdelt;
  const topLocais = analise?.top_locais_criticos || [];
  const [waOpen, setWaOpen] = useState(false);
  const [waPhone, setWaPhone] = useState("");
  const [waSending, setWaSending] = useState(false);
  // Número padrão salvo por cliente (localStorage). Permite "1 clique" para enviar.
  const defaultPhoneKey = clientId ? `wa_default_phone:${clientId}` : "wa_default_phone:_anon_";
  const [defaultPhone, setDefaultPhone] = useState<string>("");
  const [editingDefault, setEditingDefault] = useState(false);
  const [editPhoneValue, setEditPhoneValue] = useState("");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(defaultPhoneKey) || "";
      setDefaultPhone(saved);
      if (saved && !waPhone) setWaPhone(saved);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultPhoneKey]);

  // Quando abre o diálogo, pré-preenche com o padrão (se houver)
  useEffect(() => {
    if (waOpen && defaultPhone && !waPhone) setWaPhone(defaultPhone);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waOpen]);

  const formatPhoneDisplay = (digits: string): string => {
    const d = digits.replace(/\D/g, "");
    if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
    if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    if (d.length === 13 && d.startsWith("55")) return `+55 (${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`;
    return d;
  };

  const saveAsDefault = () => {
    const d = waPhone.replace(/\D/g, "");
    if (d.length < 10) {
      toast({ title: "Número inválido", description: "Informe DDD + número.", variant: "destructive" });
      return;
    }
    try {
      localStorage.setItem(defaultPhoneKey, d);
      setDefaultPhone(d);
      toast({ title: "Número padrão salvo", description: formatPhoneDisplay(d) });
    } catch {
      toast({ title: "Erro ao salvar", variant: "destructive" });
    }
  };

  const clearDefault = () => {
    try {
      localStorage.removeItem(defaultPhoneKey);
      setDefaultPhone("");
      toast({ title: "Número padrão removido" });
    } catch {}
  };

  const startEditDefault = () => {
    setEditPhoneValue(defaultPhone);
    setEditingDefault(true);
  };

  const confirmEditDefault = () => {
    const d = editPhoneValue.replace(/\D/g, "");
    if (d.length < 10) {
      toast({ title: "Número inválido", variant: "destructive" });
      return;
    }
    try {
      localStorage.setItem(defaultPhoneKey, d);
      setDefaultPhone(d);
      setWaPhone(d);
      setEditingDefault(false);
      toast({ title: "Padrão atualizado", description: formatPhoneDisplay(d) });
    } catch {}
  };

  const sendWhatsApp = async () => {
    if (!waPhone) {
      toast({ title: "Informe o número", variant: "destructive" });
      return;
    }
    setWaSending(true);
    try {
      if (!clientId) throw new Error("Cliente não identificado");

      // 1) Gera o PDF em memória
      const pdfDoc = buildDossiePdf(dossie, false);
      const pdfBlob = pdfDoc.output("blob") as Blob;
      const slug = (dossie.municipio || "municipio").toString()
        .toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[^\w]+/g, "-").replace(/^-+|-+$/g, "");
      const filename = `dossie-${slug}-${(dossie.uf || "").toLowerCase()}.pdf`;
      // Caminho com TTL: dispatches/<client_id>/<timestamp>-<filename>
      // Os arquivos são removidos automaticamente após 7 dias por cron job.
      const objectPath = `dispatches/${clientId}/${Date.now()}-${filename}`;

      // 2) Upload para o bucket público `whatsapp-media`
      const up = await supabase.storage
        .from("whatsapp-media")
        .upload(objectPath, pdfBlob, {
          contentType: "application/pdf",
          upsert: true,
        });
      if (up.error) throw up.error;

      const { data: pub } = supabase.storage
        .from("whatsapp-media")
        .getPublicUrl(objectPath);
      const downloadUrl = pub?.publicUrl;
      if (!downloadUrl) throw new Error("Falha ao gerar link público do PDF");

      // 3) Mensagem de texto com link
      const message =
        `📊 *Dossiê Estratégico — ${dossie.municipio || ""} / ${dossie.uf || ""}*\n\n` +
        `Resumo, dores, oportunidades e roteiro de visita no PDF abaixo:\n\n` +
        `📎 ${downloadUrl}\n\n` +
        `_O link fica disponível por 7 dias._`;

      // Normaliza para formato 13 dígitos (55 + DDD + número)
      let phone = waPhone.replace(/\D/g, "");
      if (phone.length === 11) phone = "55" + phone;
      else if (phone.length === 10) phone = "55" + phone;

      // 4) Escolhe instância saudável do pool
      const { data: instanceId, error: pickErr } = await supabase
        .rpc("pick_healthy_whatsapp_instance", { p_client_id: clientId });
      if (pickErr) throw pickErr;
      if (!instanceId) {
        throw new Error("Nenhum chip WhatsApp ativo no pool. Configure em Settings → Pool de Instâncias.");
      }

      // 5) Envia mensagem de texto com o link
      const r = await supabase.functions.invoke("manage-whatsapp-instance", {
        body: {
          action: "send",
          phone,
          message,
          instance_id: instanceId,
          client_id: clientId,
        },
      });
      if (r.error) throw r.error;
      if (r.data?.success === false || r.data?.error) {
        throw new Error(r.data?.error || "Falha no envio pela bridge");
      }
      toast({
        title: "Dossiê enviado",
        description: `Link do PDF enviado para ${phone}. Disponível por 7 dias.`,
      });
      setWaOpen(false);
    } catch (e: any) {
      toast({ title: "Falha ao enviar", description: e?.message || "Erro", variant: "destructive" });
    } finally {
      setWaSending(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Barra de ações: PDF + WhatsApp */}
      {conteudos && Object.keys(conteudos).length > 0 && (
        <div className="flex flex-wrap gap-2 justify-end">
          <Button size="sm" variant="outline" onClick={() => exportDossiePdf(dossie)}>
            <FileDown className="w-4 h-4 mr-2" /> Exportar PDF
          </Button>
          <Dialog open={waOpen} onOpenChange={setWaOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline">
                <Send className="w-4 h-4 mr-2" /> Enviar por WhatsApp
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Enviar dossiê via WhatsApp</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label className="text-xs">Número (com DDD, só dígitos)</Label>
                  <Input
                    placeholder="ex: 67999999999"
                    value={waPhone}
                    onChange={(e) => setWaPhone(e.target.value.replace(/\D/g, ""))}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  O dossiê completo será enviado como <b>link clicável</b> para download do PDF, via uma instância saudável do pool. O link permanece disponível por <b>7 dias</b>.
                </p>
              </div>
              <DialogFooter>
                <Button onClick={sendWhatsApp} disabled={waSending}>
                  {waSending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                  Enviar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      )}

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
              <div key={d.area} className="p-2 rounded border space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-sm">{AREA_LABEL[d.area] || d.area}</div>
                    <div className="text-xs text-muted-foreground">
                      {d.tem_dados ? `${d.evidencias?.length || 0} indicador(es) reais` : "sem dados numéricos"} · {d.mencoes_midia} menções
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-2xl font-bold tabular-nums">{d.pain_score}</div>
                    <Badge className={PAIN_COLORS[d.classificacao]}>{d.classificacao}</Badge>
                  </div>
                </div>
                {d.evidencias && d.evidencias.length > 0 && (
                  <ul className="text-[11px] space-y-1 pl-2 border-l-2 border-muted">
                    {d.evidencias.slice(0, 4).map((e: any, i: number) => (
                      <li key={i} className="text-muted-foreground">
                        <span className="font-medium text-foreground">{e.titulo}:</span>{" "}
                        <span className="tabular-nums">{e.valor_cidade} {e.unidade}</span>
                        {e.valor_estado != null && (
                          <span> · média {dossie.uf}: <span className="tabular-nums">{Number(e.valor_estado).toFixed(2)}</span>
                            {e.delta_pct != null && (
                              <span className={e.delta_pct > 5 ? "text-destructive ml-1" : e.delta_pct < -5 ? "text-emerald-600 ml-1" : "ml-1"}>
                                ({e.delta_pct > 0 ? "+" : ""}{e.delta_pct.toFixed(1)}%)
                              </span>
                            )}
                          </span>
                        )}
                        <span className="ml-1 opacity-60">[{e.fonte}, {e.ano}]</span>
                      </li>
                    ))}
                  </ul>
                )}
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

      {/* TOP 10 LOCAIS CRÍTICOS */}
      {topLocais.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <MapPinned className="w-4 h-4 text-primary" /> Top 10 locais críticos
            </CardTitle>
            <CardDescription className="text-xs">
              Bairros/escolas das zonas TSE onde o prefeito eleito em 2024 teve <b>menor desempenho</b> —
              esses são os pontos de maior oportunidade política para visita e mobilização.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {topLocais.map((l: any) => (
                <div key={`${l.zona}-${l.rank}`} className="flex items-start gap-3 p-2 border rounded">
                  <div className="text-2xl font-bold tabular-nums w-8 text-center text-muted-foreground">{l.rank}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{l.bairro}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {l.nome_local || "—"}{l.endereco ? ` · ${l.endereco}` : ""}
                    </div>
                    <div className="text-[11px] mt-1 text-destructive">{l.motivo}</div>
                  </div>
                  <Badge variant="outline" className="shrink-0">Zona {l.zona}</Badge>
                  {l.pct_eleito_zona != null && (
                    <Badge className="shrink-0 bg-destructive/10 text-destructive border-destructive/30">
                      {l.pct_eleito_zona}%
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

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