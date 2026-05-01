## Otimização de Custos do Lovable Cloud

Após inspeção do projeto, identifiquei que **não existe sync automático da Meta via cron** (toda sync hoje é manual via botão). O consumo Cloud vem principalmente de:

1. Instância base (~$8/mês — fixo)
2. Cron jobs ativos rodando 24/7 (8 jobs, alguns a cada 1–5 min)
3. Crescimento da tabela `comments` (5,6 MB / 1.014 linhas hoje)
4. Logs e edge function invocations

A maior alavanca real é **reduzir frequência dos crons que rodam o tempo todo** + **limpeza periódica** + **proteger sync manual contra abuso**.

### O que vou fazer

**1. Reduzir frequência de crons agressivos**
- `resume-whatsapp-dispatches`: hoje roda a cada **1 minuto** (1.440x/dia) → mudar para a cada **5 minutos** (288x/dia). Economia: ~80% de invocações.
- `whatsapp-resume-on-reconnect`: hoje a cada **2 min** → manter (é leve, função SQL local).
- `keepalive-whatsapp-instances`: hoje a cada **5 min** → manter (necessário para evitar desconexão).
- `engagement-autoresolve-hourly`: hoje **toda hora** → mudar para **a cada 6 horas** (a função internamente já filtra `shouldRunNow` por dia). Economia: 24x → 4x/dia.
- `gdelt-alerts-hourly`: hoje **toda hora** → mudar para **a cada 3 horas**. Economia: ~66%.

**2. Throttle no botão "Sincronizar Meta"**
- Hoje o usuário pode clicar várias vezes seguidas, cada clique custa Cloud (egress + DB writes).
- Adicionar verificação: se a última sync foi há menos de **5 minutos**, mostrar aviso "Aguarde X minutos antes de sincronizar novamente" em vez de chamar a função.
- Aplicado em: `src/pages/Dashboard.tsx`, `src/pages/Comments.tsx`, `src/components/engagement/PortalMissionsPanel.tsx`.

**3. Retenção de dados (limpeza automática)**
- Criar cron diário que apaga `comments` com `created_at` > **180 dias** e `is_processed = true` sem ações vinculadas.
- Apagar `action_logs` > 90 dias.
- Apagar `dispatch_items` em status final > 60 dias.
- Roda 1x por dia às 4h UTC (custo desprezível, libera espaço de DB).

**4. Painel de Consumo (Super Admin)**
- Adicionar aviso visível em `UsageEstimatePanel` quando o saldo estimado < $5, com link direto para Settings → Cloud & AI balance.
- Mostrar contagem de invocações do dia para o usuário ter feedback.

### Impacto esperado

| Item | Antes (mês) | Depois (mês) |
|---|---|---|
| Invocações cron | ~50.000 | ~12.000 |
| Crescimento DB | sem limite | estabilizado em ~30 MB |
| Sync Meta abusiva | possível | bloqueada (5 min) |
| Custo total estimado | $12–18 | **$9–11** |

### Detalhes técnicos

- Mudanças de cron via `cron.unschedule` + `cron.schedule` (migração SQL).
- Throttle no frontend usando `localStorage` por `clientId` para registrar `lastSyncAt`.
- Limpeza via nova edge function `cleanup-old-data` chamada por novo cron `cleanup-old-data-daily`.
- Nenhum dado relevante é perdido (mantém comentários recentes + tudo com vínculo de ação/engajamento).

### Sobre o crédito gratuito

Confirmando: o crédito mensal de **$25 Cloud + $1 AI é por workspace** e está garantido **até o início de 2026**. Depois disso a Lovable anunciou que será descontinuado e o custo passa a ser inteiramente usage-based. Para adicionar saldo manual hoje você já precisa estar no plano **Pro ou superior** (Settings → Cloud & AI balance).

Aprove para eu aplicar as otimizações.