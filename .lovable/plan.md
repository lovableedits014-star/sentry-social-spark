
# Militância Digital v3 — Plano Final

Sistema autônomo que rastreia automaticamente quem comenta nas redes, classifica esses perfis com selos visíveis no próprio comentário, protege suas correções manuais e faz a IA aprender com elas ao longo do tempo.

## O que muda na sua experiência

1. **Toda vez que alguém comenta**, o perfil é cadastrado automaticamente num "radar de militância" (sem você clicar em nada).
2. **Ao lado do nome do autor no comentário**, aparece **1 selo** mostrando quem é aquela pessoa (ex: 🔥 Defensor, ⚔️ Crítico, 🆕 Novo Rosto). Você bate o olho e já sabe se é amigo ou hater.
3. **Quando você corrige um sentimento manualmente** (ex: muda de "negativo" para "positivo"), aquela classificação fica **travada** — a IA nunca mais vai sobrescrever.
4. **A IA aprende com suas correções**: as próximas análises usam suas últimas 20 correções como exemplo, ficando mais precisa com o tempo.
5. **Nova aba "Revisar IA"** em /comments com os comentários onde a IA ficou em dúvida — você corrige em mutirão.
6. **Clicando no nome do autor** no comentário abre um drawer com os últimos 20 comentários daquela pessoa, pra você ter contexto.
7. **Nova página /militancia** com **abas separadas Facebook e Instagram** — KPIs, filtros e busca isolados por rede, mais botão "Promover ao CRM" pra puxar pra dentro de Pessoas (com telefone obrigatório).

## Página /militancia — estrutura de abas

```text
┌─ Militância Digital ─────────────────────────────┐
│  [ Facebook (1.2k) ]  [ Instagram (340) ]        │  ← Tabs principais
├──────────────────────────────────────────────────┤
│  KPIs da rede ativa: 🔥 Defensores | ⚔️ Críticos │
│  | 🆕 Novos | 💎 Elite                           │
│                                                  │
│  [Busca]  [Filtro: Todos|Defensores|Críticos|…]  │
│                                                  │
│  ┌─ Card ─┐ ┌─ Card ─┐ ┌─ Card ─┐                │
│  │ avatar │ │ avatar │ │ avatar │  …             │
│  │ selo   │ │ selo   │ │ selo   │                │
│  │ contadores + Promover ao CRM  │                │
│  └────────┘ └────────┘ └────────┘                │
└──────────────────────────────────────────────────┘
```

KPIs e listas re-renderizam ao trocar de aba (filtro `platform` aplicado em todas as queries).

## Selos automáticos

| Selo | Condição |
|---|---|
| 🔥 Defensor | 5+ positivos nos últimos 30 dias |
| 💎 Tropa de Elite | 15+ positivos, 0 negativos historicamente |
| 📣 Engajado | 10+ comentários totais, mistos |
| 🆕 Novo Rosto | 1º comentário nos últimos 7 dias |
| ⚔️ Crítico Recorrente | 3+ negativos nos últimos 30 dias |
| 🎯 Hater Persistente | 10+ negativos historicamente |
| 💤 Sumido | Era ativo, 60+ dias sem aparecer |

Mostra **só o mais relevante** no card (prioridade Hater > Crítico > Defensor > Elite > Engajado > Novo > Sumido).

## Banco de dados — novas tabelas

```text
social_militants                    sentiment_corrections (memória de aprendizado)
├─ client_id                        ├─ client_id
├─ platform (fb/ig) ◄── filtro     ├─ comment_text
├─ platform_user_id     das abas    ├─ ai_predicted (positive/negative/neutral)
├─ author_name                      ├─ human_corrected
├─ avatar_url                       ├─ corrected_by
├─ first_seen_at                    └─ created_at
├─ last_seen_at
├─ total_comments                   comments (alterações)
├─ total_positive                   ├─ + sentiment_source (ai|human)
├─ total_negative                   ├─ + sentiment_confidence (0-1)
├─ total_neutral                    └─ + needs_review (bool)
├─ total_30d_positive
├─ total_30d_negative               supporter_id (FK opcional, preenchido
├─ current_badge                     quando "Promover ao CRM")
├─ promoted_to_supporter_id
└─ updated_at
```

## Triggers automáticos

- **`trg_militant_upsert_on_comment`** (AFTER INSERT em `comments`): cria/atualiza o perfil em `social_militants`, incrementa contadores, recalcula `current_badge`.
- **`trg_militant_recompute_on_sentiment`** (AFTER UPDATE OF sentiment em `comments`): recalcula contadores quando o sentimento muda.
- **`trg_protect_human_sentiment`** (BEFORE UPDATE em `comments`): bloqueia a IA de sobrescrever quando `sentiment_source = 'human'`.
- **`trg_log_sentiment_correction`** (AFTER UPDATE em `comments`): quando humano corrige, salva em `sentiment_corrections` pra alimentar o few-shot da IA.

## Mudanças na IA de sentimento (`analyze-sentiment`)

1. Antes de classificar, busca as **últimas 20 correções humanas** do cliente em `sentiment_corrections` e injeta como exemplos no prompt.
2. Retorna **score de confiança 0-1**. Se < 0.7 → marca `needs_review = true`.
3. Nunca toca em comentários com `sentiment_source = 'human'`.

## UI — onde mexe

| Arquivo | Mudança |
|---|---|
| `src/components/CommentItem.tsx` | `<MilitantBadge />` ao lado do nome + clique no nome abre `<AuthorHistoryDrawer />` + ícone ⚠️ se `needs_review` |
| `src/components/comments/MilitantBadge.tsx` | **NOVO** — selo do `social_militants`, emoji + tooltip |
| `src/components/comments/AuthorHistoryDrawer.tsx` | **NOVO** — Sheet lateral com últimos 20 comentários do autor |
| `src/pages/Comments.tsx` | Aba **"Revisar IA"** ao lado de Pendentes/Ignorados/Todos (filtra `needs_review = true`) |
| `src/pages/MilitanciaDigital.tsx` | **NOVA página** — `<Tabs>` Facebook/Instagram com KPIs, busca e grid filtrados por `platform` |
| `src/components/militancia/MilitantCard.tsx` | **NOVO** — card com avatar, selo, contadores, "Promover ao CRM" |
| `src/components/militancia/PromoteToCRMDialog.tsx` | **NOVO** — formulário Pessoa pré-preenchido, telefone obrigatório |
| `src/components/DashboardLayout.tsx` | Link "Militância Digital" no menu (seção Redes Sociais) |
| `src/App.tsx` | Rota `/militancia` |

## Edge functions

- **`analyze-sentiment`** — modificada (few-shot + confiança).
- **`batch-analyze-sentiments`** — propaga as mudanças.

## Performance

- UPSERT com índice composto `(client_id, platform, platform_user_id)`.
- Drawer histórico usa `idx_comments_platform_user_id` (existente) — <100ms.
- Selo no comentário: 1 query batch ao carregar a lista.
- KPIs por aba: `count: exact, head: true` filtrado por `platform`.
- React Query com `staleTime: Infinity`, refetch manual ao trocar de aba.
- RLS por `client_id` em `social_militants` e `sentiment_corrections`.

## Fora de escopo agora (fase futura, anotado)

- **Produção de Conteúdo**: análise de posts + comentários pra sugerir ideias. Vai reaproveitar a base criada aqui.
- Reanálise em lote retroativa de todos os comentários antigos.

## Migrações

1. Criar `social_militants` + RLS + índices.
2. Criar `sentiment_corrections` + RLS.
3. Adicionar colunas em `comments`: `sentiment_source`, `sentiment_confidence`, `needs_review`.
4. Criar função `recompute_militant_badge(militant_id)`.
5. Criar 4 triggers descritos acima.
6. Backfill inicial: popular `social_militants` a partir dos comentários existentes.

---

**Tudo certo? Aprovando, eu já saio implementando nessa ordem.**
