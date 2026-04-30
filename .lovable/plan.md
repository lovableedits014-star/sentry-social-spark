
# Inteligência de Conteúdo — co-piloto consultivo

Módulo que **municia o usuário com ideias, textos, projeções e briefings**. Não publica, não gera imagem/vídeo, não agenda execução. Você decide e produz tudo manualmente.

**Fonte de IA:** SEMPRE o provedor configurado pelo cliente (`_shared/llm-router.ts` → Settings → Integrações). Nunca Lovable AI (reservado ao Calendário Político).

---

## Arquitetura

**Rota:** `/inteligencia-conteudo`
**Acesso:** admin + `gestor_social` (atualizar `src/lib/access-control.ts`)
**Cache:** React Query `staleTime: Infinity`, sync manual (padrão do projeto)

```text
┌──── /inteligencia-conteudo ────────────────────────┐
│ 1.Radar  2.Banco de Ideias  3.Estúdio de Texto    │
│ 4.Projeção  5.Calendário  6.Insights Militância   │
│ 7.Resposta a Crise  8.Modo Adversário  9.DNA      │
└────────────────────────────────────────────────────┘
        │
        ├── ic-radar             (extrai temas/perguntas/ataques)
        ├── ic-generate-text     (texto FB/IG + roteiro falado + brief visual)
        ├── ic-project           (projeção qualitativa de reação)
        ├── ic-daily-ideas       (cron 06:00 — 5 ideias/dia/cliente)
        ├── ic-dna-analyzer      (recalibra DNA editorial)
        ├── ic-crisis-brief      (3 abordagens de resposta a crise)
        ├── ic-adversary-sim     (contra-argumentos prováveis)
        └── ic-insights-militancia (cruza militantes × temas)

Todas usam callLLM(getClientLLMConfig(supabase, clientId), ...)
```

**Dados consumidos (somente leitura):**
`comments` · `social_militants` · `ied_scores` · `candidate_identity` · `municipios_indicadores` · `sentiment_corrections` · `pessoas` · `midia_noticias` · `narrativa_perfil_candidato` · `adversarios_politicos`

---

## Banco de dados (migration)

```sql
-- DNA editorial do candidato (descobre seu jeito de escrever)
create table content_dna (
  client_id uuid primary key references clients(id) on delete cascade,
  tom text,                       -- ex: "combativo-empático"
  vocabulario text[],
  estruturas jsonb,               -- {pergunta_retorica:0.4,...}
  emojis_assinatura text[],
  tamanho_ideal jsonb,            -- {facebook:300, instagram:120}
  horarios_pico jsonb,            -- {seg:[19,20], ter:[12]}  (informativo, não dispara nada)
  sample_size int,
  updated_at timestamptz default now()
);

-- Banco de ideias (sugestões + manuais)
create table content_ideas (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  titulo text not null,
  descricao text,
  tema text,
  tipo text,                      -- 'oportunidade'|'pergunta'|'contra-narrativa'|'mobilizacao'|'data'
  origem text,                    -- 'radar'|'ai-daily'|'manual'|'crise'
  score int default 50,           -- 0-100 relevância
  status text default 'pendente', -- pendente|aprovada|descartada|usada
  source_refs jsonb,              -- {comment_ids:[], post_ids:[], militant_ids:[]}
  generated_text jsonb,           -- {facebook:'', instagram:'', roteiro_falado:'', brief_visual:''}
  projection jsonb,               -- saída de ic-project
  user_feedback text,             -- nota do usuário ao aprovar/descartar
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index on content_ideas(client_id, status, created_at desc);

-- Snapshot diário do radar (cache)
create table content_radar_snapshots (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null,
  snapshot_date date default current_date,
  hot_topics jsonb,
  open_questions jsonb,
  hostile_narratives jsonb,
  mobilizing_pautas jsonb,
  created_at timestamptz default now(),
  unique(client_id, snapshot_date)
);

-- RLS multi-tenant por client_id em todas as 3 tabelas (padrão do projeto)
```

**Sem tabela `content_outcomes`** — o módulo não fecha loop com publicação real (nada é publicado pela ferramenta).

---

## As 9 abas (todas consultivas)

### 1. Radar de Oportunidade
4 cards (top 5 cada), atualizados por snapshot diário + refresh manual:
- 🔥 **Temas quentes** (clusters dos comentários últimos 7d)
- ❓ **Perguntas em aberto** (perguntas frequentes sem resposta nos comentários)
- ⚠️ **Narrativas hostis** (recorrência em comentários de `social_militants` badge `hater`/`critico`)
- ❤️ **Pautas que mobilizam** (temas que mais ativaram defensores 🔥)

Cada item: **"Salvar como ideia"** · **"Abrir no Estúdio"**.

### 2. Banco de Ideias
Lista filtrável (origem/status/tema). Cada card:
- Título · tema · score · origem · fontes (links pros comentários/posts originais)
- Ações: **👍 Aprovar** · **👎 Descartar** · **✏️ Abrir no Estúdio**
- Feedback alimenta DNA implicitamente (aprovadas reforçam padrão).

Cron `ic-daily-ideas` insere 5 sugestões toda manhã.

### 3. Estúdio de Texto (gerador consultivo)
Layout split:
- **Esquerda:** briefing (tema, ângulo, CTA, tom override, plataformas-alvo)
- **Direita:** abas com sugestões geradas
  - Texto Facebook (longo)
  - Caption Instagram + sugestão de hashtags + CTA
  - **Roteiro falado** (script de ~30s p/ Reels/Stories — você grava manualmente)
  - **Brief visual** (descrição em texto pra você/designer criar a arte — sem geração de imagem)
  - Sugestão de resposta padrão pra comentários sobre o tema

Botões: **Regenerar variante** · **Aplicar DNA** · **Enviar pra Projeção** · **Copiar texto** · **Salvar como ideia**.

### 4. Projeção de Reação (qualitativa)
Cole um rascunho → IA analisa contra histórico:
- 📈 **Engajamento esperado** (range qualitativo: baixo/médio/alto, com justificativa baseada em posts similares)
- 🎯 **Sentimento provável** (% pos/neg/neu — barra)
- ⚠️ **Risco de crise** (0-100 + palavras-gatilho destacadas)
- 👥 **Quem deve reagir** (defensores/críticos/novos rostos — usa `social_militants`)
- ✏️ 3 sugestões de ajuste com botão **"Aplicar ao texto"**

Sem comparação retroativa com publicação real.

### 5. Calendário Editorial Sugestivo
Grid semanal **informativo** (não agenda execução):
- IA sugere **quando** seria bom postar cada ideia aprovada (com base em `horarios_pico` do DNA)
- Sugere **sequência narrativa** ("nesta semana foque em saúde — 3 posts encadeados")
- Marca ganchos: aniversários, datas locais, agenda do candidato
- Drag & drop pra reorganizar a lista mental — **nada é disparado**, é só um quadro de planejamento

### 6. Insights da Militância
Cruza `social_militants` × `comments`:
- "🔥 Defensores comentam mais em posts sobre **{tema}**"
- "⚔️ Críticos atacam mais quando você fala de **{tema}** — sugestão: blindar narrativa"
- "Novos rostos chegam quando posta **{formato}**"
Cada insight: botão **"Gerar texto pra aproveitar"** → abre Estúdio.

### 7. Resposta a Crise (briefing)
Quando detector de crise (existente) sinaliza severidade ≥ aviso:
- Banner: "Crise ativa: {tema}" com link **"Abrir briefing"**
- 3 abordagens lado a lado:
  - **Institucional** (fato + serenidade)
  - **Empática** (ouvir + reconhecer)
  - **Contra-ataque factual** (refutação com dados)
- Cada uma com projeção de impacto + botão **"Copiar"**

### 8. Modo Adversário
Cole seu rascunho → IA simula:
- Como `adversarios_politicos` cadastrados poderiam reagir
- 3-5 contra-argumentos prováveis
- Sugestão de refutação preventiva pra você incluir antes

### 9. DNA de Conteúdo
- Card mostrando DNA atual (tom, vocabulário top 20, estruturas %, emojis, tamanho ideal por plataforma, horários de pico)
- Botão **"Recalibrar DNA"** → roda `ic-dna-analyzer` sobre últimos 90d de posts próprios (`is_page_owner=true`)
- Toggle **"Aplicar DNA automaticamente nas sugestões"** (default: on)

---

## Edge Functions

Todas seguem `getClientLLMConfig(supabase, clientId)` + `callLLM(...)` (provedor do cliente).

| Função | Trigger | Resumo |
|---|---|---|
| `ic-radar` | manual + cron diário 05:30 | Lê 7d de comments, clusteriza temas, extrai perguntas/ataques, salva snapshot |
| `ic-daily-ideas` | cron 06:00 | Gera 5 ideias usando radar + IED + agenda local |
| `ic-generate-text` | manual | Texto FB/IG + roteiro falado + brief visual + resposta padrão |
| `ic-project` | manual | Projeção qualitativa (engajamento/sentimento/risco/quem reage) |
| `ic-dna-analyzer` | manual + cron semanal | Atualiza `content_dna` |
| `ic-crisis-brief` | manual (do banner crise) | 3 abordagens de contenção |
| `ic-adversary-sim` | manual | Contra-argumentos prováveis dos adversários |
| `ic-insights-militancia` | manual | Cruza militantes × temas → insights acionáveis |

JSON estruturado via parse defensivo (mesmo padrão do `suggest-missions`), sem depender de tool calling do provedor (provedores variam).

Crons via `pg_cron` (insert tool, padrão do projeto).

**Tratamento de erro:** se o provedor do cliente não estiver configurado, mostra mensagem amigável com link para Settings → Integrações.

---

## Frontend

```
src/pages/InteligenciaConteudo.tsx
src/components/ic/
  RadarPanel.tsx · RadarCard.tsx
  IdeiasFeed.tsx · IdeiaCard.tsx
  EstudioEditor.tsx · EstudioOutputTabs.tsx
  ProjecaoPanel.tsx · ProjecaoChart.tsx
  CalendarioGrid.tsx
  MilitanciaInsights.tsx
  CriseBriefingPanel.tsx
  AdversarioPanel.tsx
  DnaCard.tsx · DnaRecalibrar.tsx

src/hooks/ic/
  useRadar.ts · useIdeias.ts · useGenerate.ts
  useProject.ts · useDna.ts · useCrisisFeed.ts
```

Bibliotecas já no projeto: `recharts`, `react-markdown`, shadcn/ui.

**Botões de ação visíveis em todo lugar:** "Copiar texto" e "Salvar como ideia". **Nenhum botão "publicar", "agendar disparo" ou "gerar imagem"**.

---

## Navegação

- Sidebar (`DashboardLayout.tsx`): novo item **"Inteligência de Conteúdo"** ícone `Sparkles`, dentro de Redes Sociais
- Badge: número de ideias pendentes não revisadas
- `App.tsx`: rota `/inteligencia-conteudo`
- `access-control.ts`: liberar admin + `gestor_social`
- Banner global de crise (existente) ganha link **"Abrir briefing →"** que leva pra aba 7

---

## Memórias a salvar antes de implementar

1. **`mem/funcionalidades/inteligencia-conteudo-consultiva.md`** — módulo é consultivo: gera texto, ideias, projeções, briefings. Nunca publica, agenda execução ou gera imagem/vídeo.
2. **Reforçar core no `mem/index.md`:** "IA do projeto = provedor configurado pelo cliente via `_shared/llm-router.ts`. Lovable AI restrito ao Calendário Político."

---

## Entrega

Tudo numa branch só, ordem de implementação:

1. Migration (3 tabelas + RLS) + crons
2. 8 edge functions (todas via llm-router)
3. Página + sidebar + access-control
4. Abas 1, 2, 3, 9 (núcleo: Radar, Ideias, Estúdio, DNA)
5. Abas 4, 6 (Projeção, Insights Militância)
6. Abas 5, 7, 8 (Calendário, Crise, Adversário)
7. Memórias atualizadas

---

Aprovado? Sigo direto pra implementação assim que confirmar.
