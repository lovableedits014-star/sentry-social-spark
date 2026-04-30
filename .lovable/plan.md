## Visão geral

Sistema de inteligência alimentado por **3 fontes vivas** (transcrições, posts/comentários, dados do CRM/território) que devolve valor em **3 superfícies**:

1. **Memória viva do candidato** (knowledge base)
2. **Redator de matérias + Coringa** (bot global do sistema)
3. **Disparos territoriais inteligentes** ← novo destaque dessa rodada

```text
TRANSCRIÇÕES ─┐
POSTS+COMMENTS ─┤ ► MEMÓRIA VIVA ─► Redator de Matérias
CRM/PESSOAS  ─┤   (knowledge      ─► Coringa (bot global)
TERRITÓRIO   ─┘    base)          ─► Disparos Territoriais Sugeridos
```

---

## Parte 1 — Memória viva (multi-fonte)

Pipeline de extração que roda em **toda nova transcrição E todo novo post publicado**. Salva fatos estruturados em `candidate_knowledge`:

- **Promessas / propostas concretas** ("3 creches no Aero Rancho")
- **Bandeiras / pautas** (saúde, segurança, mobilidade)
- **Bairros e localidades citadas** (com normalização para bater com `pessoas.bairro`)
- **Pessoas citadas** (lideranças, adversários, apoiadores)
- **Histórias e bordões** (frases marcantes)
- **Números e dados** ("60% das escolas...")
- **Eventos passados** ("ontem visitei...")
- **Adversários e ataques recebidos**

**Fontes que alimentam:**

- `ic_transcriptions` → fatos da fala
- **Posts publicados** (texto do post) → fatos do que já foi comunicado
- **Comentários do candidato** (respostas como page owner) → tom e posicionamentos
- **Reações dos comentários** (sentimento agregado por tema) → o que pega ou não pega

Cada fato guarda: origem (transcrição/post/comentário com link), data, tema normalizado, bairros mencionados (jsonb), confiança, aprovado (humano pode editar/rejeitar).

A memória passa a alimentar: DNA editorial, geração de resposta a comentários, geração de post, redator de matérias, sugestões de missões, Coringa.

---

## Parte 2 — Redator de Matérias

Nova aba **"Matérias"** em Inteligência de Conteúdo. Tipos: release de imprensa, matéria para portal/blog, nota oficial, artigo de opinião, texto institucional, **boletim semanal automático** (segunda 7h).

Você dá tema + ângulo. A IA puxa da memória viva: propostas reais, citações entre aspas (das transcrições), visitas territoriais, métricas de engajamento sobre o tema. Botões de regerar mais técnico / mais emocional / mais curto.

---

## Parte 3 — Coringa (bot global)

Botão flutuante em todas as páginas. Chat lateral com streaming. Tem ferramentas tipadas (sem SQL bruto) para consultar pessoas, comentários, métricas, memória, território, crises, calendário, militância — e ações com confirmação para criar missão, ideia, agendar disparo, gerar texto.

Exemplos: *"quantos apoiadores no Aero Rancho?"*, *"o candidato já falou sobre tarifa de ônibus?"*, *"escreve um release sobre a visita de ontem"*, *"sugere 3 pautas pra essa semana"*.

---

## Parte 4 — Disparos Territoriais Inteligentes (a inovação)

Quando você sobe uma transcrição (ou publica um post) que menciona **melhoria/proposta para uma região específica**, o sistema detecta automaticamente e **sugere um disparo de WhatsApp segmentado para os apoiadores daquele bairro/região**.

### Como funciona

1. Extrator identifica fatos do tipo `proposta` ou `promessa` com `entidades.bairros = ["Aero Rancho"]`.
2. Cruza com a tabela `pessoas` filtrando por `bairro ILIKE 'Aero Rancho'` + `whatsapp_confirmado = true`.
3. Se encontrar **≥ N pessoas** (configurável, padrão 5), gera uma **sugestão de disparo** em nova tabela `disparo_sugestoes`:
   - Bairro/região
   - Tema (ex: "creches")
   - Quantidade estimada de destinatários
   - **Mensagem-template já redigida pela IA** usando o DNA do candidato + a fala original
   - Link para a fonte (transcrição ou post)
4. **Aparece em 3 lugares:**
   - **Card no Dashboard** ("3 disparos territoriais sugeridos")
   - **Aba nova "Sugestões"** dentro de Disparos
   - **Notificação no Coringa** ("detectei oportunidade de disparo no Aero Rancho")
5. Você revisa, edita a mensagem, ajusta destinatários e **confirma** — daí entra no fluxo normal de `whatsapp_dispatches` que já existe (com níveis Conservador/Moderado/Agressivo).

### Mensagem gerada (exemplo)

> "Olá [primeiro_nome]! Como morador(a) do Aero Rancho, queria te contar pessoalmente: estive lá ontem e me comprometi a lutar pela construção de 3 novas creches no bairro. Você que vive a realidade da região, sua opinião importa muito. Conta com você? 🙏"

Variáveis automáticas: `[primeiro_nome]`, `[bairro]`. Personalização leve por pessoa para reduzir cara-de-spam.

### Outros gatilhos de sugestão (mesmo motor)

- **Pessoa citada nominalmente** numa transcrição → sugere mandar mensagem pessoal pra ela ("o candidato te mencionou na live de ontem").
- **Pauta que o público está cobrando** (muitos comentários sobre tema X) + **candidato acabou de falar sobre X** → sugere disparo para apoiadores que comentaram sobre X.
- **Aniversariante de bairro visitado essa semana** → cruza aniversário + visita.
- **Apoiadores 🔥 em região com baixo engajamento** → sugere ativação.

Tudo isso vira itens em `disparo_sugestoes` com `tipo` (territorial, pessoal, tematico, ativacao) e `score` de oportunidade.

---

## Aplicações cruzadas (ganhos automáticos)

- **Resposta a comentários**: passa a citar promessas reais ("como o candidato disse na live de 14/04...").
- **Geração de post**: usa frases reais do candidato + evita contradições.
- **DNA editorial**: enriquecido com bordões reais extraídos.
- **Missões IA**: nova categoria "amplificar fala do candidato em [bairro]".
- **Dashboard**: widget "O que o candidato anda falando" + "Sugestões de disparo territorial".
- **Telemarketing**: scripts ganham aba "argumentos do próprio candidato".
- **Narrativa Política**: campos de perfil ganham auto-sugestão.

---

## Detalhes técnicos

**Novas tabelas**
- `candidate_knowledge` — fatos extraídos (tipo, tema, texto, contexto, entidades jsonb, source_type ∈ transcription|post|comment, source_id, confidence, aprovado).
- `disparo_sugestoes` — sugestões pendentes (tipo, tema, bairro, mensagem_sugerida, total_estimado, fonte_id, fonte_tipo, score, status ∈ pendente|aprovado|descartado|enviado, expires_at).
- `materias_geradas` — histórico de matérias.
- `coringa_conversations` + `coringa_messages` — histórico do bot.

Todas com RLS por `client_id`.

**Novas Edge Functions**
- `ic-extract-knowledge` — extrai fatos. Chamada em fire-and-forget no fim de `ic-transcribe` e em trigger pós-sync de posts (`fetch-meta-comments`).
- `ic-suggest-dispatches` — varre fatos novos com bairros/pessoas, cruza com `pessoas`, gera sugestões em `disparo_sugestoes`. Roda após cada extração + cron diário 8h.
- `ic-write-materia` — gera matérias com contexto da memória viva.
- `coringa-chat` — bot streaming SSE com tool calling (via `llm-router`).
- `coringa-cron-boletim` — boletim semanal segunda 7h.

**Normalização de bairros** (crítico pra cruzar fala vs CRM)
- Função utilitária `normalizeBairro()` (lowercase, sem acento, sem "vila/jardim/parque" como prefixo opcional).
- Comparação fuzzy com `pessoas.bairro` (ILIKE + similaridade pg_trgm já disponível).
- Fallback: se não bater nenhum bairro, sugere disparo por cidade.

**UI**
- Aba **"Memória"** em InteligenciaConteudo (lista fatos, filtra, edita).
- Aba **"Matérias"** em InteligenciaConteudo.
- Aba **"Sugestões"** em Disparos (cards com pré-visualização da mensagem, contagem de destinatários, botões Aprovar/Editar/Descartar).
- Card **"Sugestões de disparo"** no DashboardOverview.
- Widget **"O que o candidato anda falando"** no DashboardOverview.
- Componente global **`<CoringaButton />`** + **`<CoringaDrawer />`** em DashboardLayout.

**LLM**: tudo via `llm-router` existente (respeita config do cliente). Tool calling para extração estruturada e Coringa.

---

## O que NÃO muda

- Fluxo atual de transcrição/legenda/post de feed continua igual — só ganha pipeline em background.
- `whatsapp_dispatches` continua o mesmo — sugestões só geram pré-rascunhos que entram nesse fluxo após sua aprovação.
- Sem novas integrações externas, sem novas dependências.

---

## Ordem de implementação

1. **Fase 1 — Memória viva multi-fonte**: tabela + extrator (transcrições + posts) + aba "Memória" + integração em DNA e respostas.
2. **Fase 2 — Disparos territoriais sugeridos** ← inovação que você pediu: tabela `disparo_sugestoes` + função `ic-suggest-dispatches` + aba "Sugestões" em Disparos + card no Dashboard.
3. **Fase 3 — Redator de Matérias** + boletim semanal automático.
4. **Fase 4 — Coringa (bot global)**: leitura primeiro, streaming, ferramentas de consulta.
5. **Fase 5 — Coringa avançado** (ações com confirmação) + outros gatilhos de sugestão (pessoa citada, pauta cobrada, ativação de bairro frio).

Sugiro **emendar Fase 1 + 2 num bloco só** já que a parte 2 só faz sentido com a memória rodando. Topa começar por aí?