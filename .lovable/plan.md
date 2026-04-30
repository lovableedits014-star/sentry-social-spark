
## Visão geral

O módulo hoje entrega o básico (Radar, Ideias, Estúdio, DNA) mas opera como 4 caixas isoladas, sem feedback loop, sem proatividade real e sem usar todos os sinais que o sistema já coleta (IED, militância, crises, inteligência eleitoral, calendário). A proposta abaixo transforma o Co-piloto num assistente que **aprende, alerta, projeta e fecha o ciclo** entre escuta → ideia → texto → resultado → próximo ciclo.

São 6 frentes, do maior impacto para o menor. Cada uma é independente — você pode aprovar tudo ou só as primeiras.

---

## 1. Radar++ — escutar tudo, não só comentários da semana

**Hoje:** olha 7 dias de comentários, gera 4 listas estáticas, expira em 24h.

**Proposta:**

- **Fontes adicionais cruzadas no mesmo snapshot:**
  - **Crises ativas** (alertas de sentimento) → vira bloco "Apagar incêndio agora"
  - **Apoiadores 🔥 mais ativos** (top militantes da semana) → bloco "Pautas que seus defensores estão puxando"
  - **Inteligência Eleitoral** (temas em alta no município/região, narrativa política da Onda 3) → bloco "O que está bombando fora da sua bolha"
  - **Calendário Político** (feriados/datas dos próximos 7 dias) → bloco "Datas que pedem post"
  - **Pessoas/CRM** (novos cadastros, picos de check-in por região) → bloco "Sinais da base"
- **Comparação semana vs semana:** cada tema mostra seta ↑↓ e % de variação ("saúde subiu 180% em 3 dias").
- **Score de oportunidade** (0-100) por item, calculado de: volume + crescimento + sentimento + alinhamento ao DNA.
- **Snapshot continua diário** (cache), mas com botão "Análise profunda agora" que ignora cache e amplia janela para 14 dias.

---

## 2. Ciclo fechado de aprendizado — a IA aprende com o que funcionou

**Hoje:** ideias têm aprovar/descartar mas o sinal não volta para a IA.

**Proposta — nova tabela `content_outcomes`:**

- Quando o usuário aprova ou usa uma ideia, ele pode marcar depois: "publiquei", "deu certo 👍", "deu errado 👎", colando opcionalmente o link/print do post real.
- Se o post real for de uma página integrada (Meta), o sistema **busca automaticamente** as métricas reais (likes, comentários, sentimento médio dos comentários) e calcula um `outcome_score`.
- O Radar e o gerador de ideias **passam a usar esse histórico** no prompt: "ideias parecidas com X performaram bem, evite ângulos parecidos com Y".
- Painel "O que funciona com a sua base": top 5 temas/ângulos/CTAs que mais engajam, top 5 que mais dão problema.

---

## 3. Modo Proativo — alertas e ações sugeridas (sem precisar abrir o módulo)

**Hoje:** módulo é totalmente reativo. Usuário tem que entrar para ver algo.

**Proposta:**

- **Cron diário (6h da manhã)** roda `ic-radar` + `ic-daily-ideas` automaticamente.
- **Cron de monitoramento (a cada 2h)** detecta gatilhos:
  - Pergunta nova repetida 5+ vezes em 24h → cria ideia "Responder dúvida X"
  - Crítica nova com 10+ autores → cria ideia "Contra-narrativa Y" com tag urgente
  - Defensor 🔥 elite postou tema novo → cria ideia "Amplificar pauta de [nome]"
- **Widget no Dashboard principal** ("Sugestões de hoje" — 3 cards) com badge vermelho quando tem urgência.
- **Notificação WhatsApp opcional** (usa o `manage-whatsapp-instance` existente) para alertas críticos: "Crise detectada sobre tema X, tem texto pronto no Co-piloto".

---

## 4. Estúdio com superpoderes

**Hoje:** preencher 3 campos e gerar 5 formatos.

**Proposta:**

- **Modo Remix:** colar texto de um post antigo (ou puxar dos seus últimos posts) e pedir variações ("mais combativo", "mais empático", "para Reels", "para LinkedIn", "responder em 1ª pessoa").
- **Modo Resposta de Crise:** colar comentário/print hostil → gera resposta calibrada no DNA + variantes (firme/conciliadora/factual com dados).
- **Variantes A/B:** gerar 2 versões do mesmo post com hipótese diferente ("v1 foca em emoção, v2 foca em dado") para o usuário escolher.
- **Pré-visualização realista** (mock de feed) do FB/IG mostrando como o post vai aparecer.
- **Projeção qualitativa** (já existe em `ic-project`, integrar inline): "Provável reação dos seus 🔥: positiva. Risco de munição para críticos: médio. Tema parecido com X que performou bem".
- **Slot de imagem:** botão "Gerar arte" usa o `generate-arte-feriado` existente (Lovable AI Nano Banana — única exceção permitida) com o brief visual já pronto.

---

## 5. Banco de Ideias virando workflow real

**Hoje:** lista de cards com aprovar/descartar/abrir.

**Proposta:**

- **Status expandido:** Pendente → Aprovada → Em produção → Publicada → Avaliada.
- **Calendário editorial:** drag-and-drop das ideias aprovadas para datas (semana/mês), considerando datas do Calendário Político e horários de pico do DNA.
- **Pin / Prioridade** — ideias com tag "urgente" (vindas de crises) vão para o topo automaticamente.
- **Busca/filtro** por tema, tipo, origem (radar, manual, daily).
- **Exportar pauta** (PDF/CSV) da semana para reunião com a equipe.

---

## 6. DNA evolutivo + Inspiração competitiva

**Hoje:** DNA roda 1 vez nos últimos 90 dias e fica estático.

**Proposta:**

- **Recalibração automática semanal** (cron domingo) em vez de manual.
- **Histórico de evolução do DNA:** ver como o tom mudou ao longo dos meses (ficou mais combativo? mais técnico?).
- **DNA por contexto:** detectar se posts em horário X performam diferente, ou se posts com vocabulário Y mobilizam mais defensores. Mostrar como recomendações específicas.
- **Aba nova "Inspiração":** usar a Inteligência Eleitoral (parlamentares/candidatos já mapeados na onda 3) para mostrar "Posts dos seus pares políticos da região na última semana" — resumido pela IA com tags ("o que copiar", "o que evitar"). Sem scrape novo, só usa o que já existe.

---

## Detalhes técnicos

**Novas tabelas:**
- `content_outcomes` (id, idea_id, client_id, post_url, metrics jsonb, outcome_score int, user_rating, created_at)
- `content_dna_history` (id, client_id, dna_snapshot jsonb, created_at) — versionamento do DNA
- `content_calendar` (id, client_id, idea_id, scheduled_date, scheduled_time, platform, status)

**Novas/edited Edge Functions:**
- `ic-radar` — adicionar fontes (crises, militantes, IE, calendário, CRM) + comparação semana anterior + score
- `ic-outcomes-track` — buscar métricas reais de posts publicados (Meta Graph API)
- `ic-cron-daily` — roda às 6h: radar + 5 ideias + checa gatilhos críticos
- `ic-cron-monitor` — a cada 2h: detecta gatilhos urgentes
- `ic-remix` — modo remix/variantes/A-B
- `ic-crisis-response` — resposta a crítica específica
- `ic-inspiration` — resumo dos pares políticos via IA

**Cron jobs (pg_cron):**
- Daily 06:00 BRT — `ic-cron-daily`
- A cada 2h — `ic-cron-monitor`
- Domingo 03:00 — recalibrar DNA de todos clients ativos

**UI:**
- Widget "Sugestões de hoje" no Dashboard principal (`DashboardOverview.tsx`)
- Nova aba "Calendário" em InteligenciaConteudo
- Nova aba "Aprende" (mostra outcomes + o que funciona)
- Drawer de detalhes em cada ideia com timeline (criada → aprovada → publicada → avaliada)

**Modelo IA:** continua usando o provedor configurado pelo cliente (LLM Router). Lovable AI só na geração de imagem (regra atual mantida).

---

## Ordem de implementação sugerida

1. **Radar++** (Fase 1) — fontes extras + comparação + score. Maior ganho percebido imediato.
2. **Modo Proativo** (Fase 2) — crons + widget no dashboard. Faz o módulo "trabalhar sozinho".
3. **Ciclo de aprendizado** (Fase 3) — outcomes tracking. Faz a IA ficar melhor com o tempo.
4. **Estúdio++** (Fase 4) — remix + crise + A/B + pré-visualização.
5. **Calendário editorial** (Fase 5).
6. **DNA evolutivo + Inspiração** (Fase 6).

Posso começar pela Fase 1 e ir liberando para você validar cada etapa, ou implementar 2-3 fases juntas. Qual prefere?
