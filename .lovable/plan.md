
# 🛡️ Sistema Anti-Banimento WhatsApp Multi-Instância

## Visão Geral
Transformar o sistema atual (1 chip por cliente) em um **pool de instâncias** com rotação inteligente baseada em saúde, failover automático e respeito a janela de horário humano (08h-22h).

---

## 1. Banco de Dados — Nova Tabela `whatsapp_instances`

Criar tabela para suportar **N chips por cliente** (substitui campos `whatsapp_bridge_url` / `whatsapp_bridge_api_key` da `clients` — esses ficam como fallback/legado).

**Colunas principais:**
- `id`, `client_id`, `created_at`, `updated_at`
- `apelido` (text) — ex: "Chip Principal", "Chip Backup 1"
- `bridge_url`, `bridge_api_key` (cada chip tem seu próprio par)
- `phone_number` (text, nullable) — preenchido após conectar
- `status` (text): `disconnected | connecting | connected | banned | paused`
- `is_active` (boolean) — se entra ou não no pool de rotação
- `last_health_check_at` (timestamptz)
- `last_send_at` (timestamptz) — base para "tempo de descanso"
- `messages_sent_today` (int, default 0) — reseta diariamente
- `messages_sent_last_24h` (int) — janela móvel calculada
- `success_rate_24h` (numeric) — % de entrega nas últimas 24h
- `total_sent` / `total_failed` (bigint)
- `health_score` (int 0-100) — calculado: 70%(rest score) + 30%(success rate)
- `connected_since` (timestamptz) — para indicador "chip novo vs antigo"
- `notes` (text) — anotações manuais

**Tabela auxiliar `whatsapp_instance_send_log`** (rolling 24h):
- `instance_id`, `sent_at`, `success` (bool), `dispatch_id` (nullable)
- Limpeza diária via cron (mantém só últimos 7 dias)

**RLS:** owner do client gerencia tudo; team_members só select.

**Migração de dados:** se cliente já tem `clients.whatsapp_bridge_url`, criar 1 row em `whatsapp_instances` com apelido "Chip Principal" automaticamente (script de backfill).

---

## 2. Configurações Globais — Estender `clients` ou nova `whatsapp_settings`

Adicionar à `clients` (ou tabela nova de preferências):
- `whatsapp_window_start` (time, default `08:00`)
- `whatsapp_window_end` (time, default `22:00`)
- `whatsapp_window_enabled` (bool, default `true`)
- `whatsapp_rotation_strategy` (text, default `health_random`) — futuro: round_robin, etc.
- `whatsapp_inter_instance_delay_min` (int, default 1) e `_max` (int, default 3) — delay extra ao trocar de chip

---

## 3. UI — Painel de Gestão de Instâncias

### Tela: **Configurações → WhatsApp → Instâncias**
Substitui o card único atual por um **gerenciador de pool**:

**Header da seção:**
- Título: "Pool de Instâncias WhatsApp"
- Texto explicativo (autoexplicativo, conforme diretriz): "Conecte vários números (chips) para distribuir disparos automaticamente e reduzir risco de banimento. O sistema escolhe o chip mais 'descansado' a cada envio."
- Botão "+ Adicionar Instância"

**Lista de cards (1 por chip):**
Cada card mostra:
- 🟢/🟡/🔴 Indicador de saúde (cor + score 0-100)
- Apelido editável + número conectado
- Status badge: Conectado | Desconectado | Em descanso | Banido
- Métricas hoje: `87 enviados | 95% entrega`
- Tempo desde último envio: "última msg há 12 min"
- Sparkline de uso 24h (mini-gráfico)
- Botões: **Conectar (QR)**, **Desconectar**, **Pausar/Ativar no pool**, **Configurar URL/Key**, **Excluir**
- Toggle "Incluir no pool de rotação"

**Painel resumo no topo:**
- Total de chips ativos / Total
- Mensagens enviadas hoje (soma de todas instâncias)
- Saúde média do pool
- Janela ativa/inativa agora (mostra "Em janela ativa" verde ou "Fora de janela 22h-08h" cinza)

**Configurações da janela horária** (componente colapsável):
- Toggle ativar/desativar
- Time inputs início/fim
- Aviso: "Disparos iniciados fora da janela ficam em pausa e retomam automaticamente."

---

## 4. Algoritmo de Rotação — "Aleatória por Saúde"

A cada mensagem, função pura `pickHealthiestInstance(client_id)`:

1. SELECT todas instâncias do cliente onde:
   - `is_active = true`
   - `status = 'connected'`
   - NÃO bateu ban (status != 'banned')
2. Calcula peso por instância:
   - `rest_weight` = min(1, segundos_desde_last_send / 60) — favorece chips parados há mais tempo
   - `success_weight` = success_rate_24h / 100 (default 1 se sem histórico)
   - `peso_final` = rest_weight × 0.7 + success_weight × 0.3
3. Sorteio ponderado (random weighted) entre as candidatas
4. Retorna a instância escolhida + atualiza `last_send_at`

Se **nenhuma** instância elegível → retorna `null` → dispatch entra em estado `aguardando_instancia` e tenta de novo em 60s.

---

## 5. Edge Function — `send-whatsapp-dispatch` (refatorada)

Mudanças principais no loop de envio:

```ts
// Pseudo-fluxo
for (cada destinatário) {
  // 1. Checa janela horária
  if (!dentroJanela()) {
    marcar dispatch como 'pausado_janela';
    sair (cron retoma depois);
  }

  // 2. Escolhe instância
  const inst = await pickHealthiestInstance(client_id);
  if (!inst) {
    marcar item 'aguardando_instancia';
    sleep(60s); continue;
  }

  // 3. Envia via aquele bridge específico
  const result = await fetchBridgeSend({
    bridgeUrl: inst.bridge_url,
    bridgeApiKey: inst.bridge_api_key,
    phone, message
  });

  // 4. Failover: se 401/connection error → marca instância como 'disconnected' e retry com OUTRA
  if (result.connectionError) {
    await markInstanceDisconnected(inst.id);
    // re-tenta esse mesmo destinatário com outra instância
    continue (mesmo recipient);
  }

  // 5. Registra log + atualiza contadores da instância
  await logInstanceSend(inst.id, success, dispatch_id);

  // 6. Delay normal entre envios
  await sleep(randomDelay(min, max));

  // 7. Delay EXTRA se próxima msg vai para chip diferente
  // (calculado preditivamente checando qual seria o próximo)
}
```

**Nova tabela `whatsapp_dispatches` ganha colunas:**
- `paused_until` (timestamptz, nullable) — usado quando fora da janela
- `status` ganha valor `pausado_janela`

---

## 6. Cron Job — Retomar Disparos Pausados

Edge function nova: **`resume-paused-dispatches`** (executa a cada 10 min via `pg_cron`):
- Busca dispatches com `status = 'pausado_janela'`
- Para cada um, checa se cliente está dentro da janela agora
- Se sim → invoca `send-whatsapp-dispatch-resume` para continuar de onde parou
- Failover de chips banidos: detecta padrões (5+ falhas seguidas) e marca `status='banned'`

---

## 7. Edge Function `manage-whatsapp-instance` — Atualizar

Adicionar suporte a `instance_id` no body de TODAS as ações (`generate_qr`, `instance_status`, `disconnect`, `send`):
- Se `instance_id` informado → usa bridge daquela instância
- Se ausente → fallback para `clients.whatsapp_bridge_*` (compatibilidade)

Novas ações:
- `list_instances` — retorna todas com health
- `create_instance` — cria nova row
- `update_instance` — edita apelido/url/key
- `delete_instance` — soft delete (marca inactive + remove)
- `toggle_pool` — liga/desliga participação no pool

---

## 8. Frontend — Componente `WhatsAppPoolManager.tsx`

Substitui parcialmente `WhatsAppInstanceCard.tsx`. Estrutura:

```
src/components/settings/
  WhatsAppPoolManager.tsx          # Container principal
  WhatsAppInstanceCard.tsx         # Card individual (refatorado)
  WhatsAppPoolSummary.tsx          # Header com totais
  WhatsAppWindowSettings.tsx       # Config janela horária
  AddInstanceDialog.tsx            # Modal criar nova instância
```

Hook novo: `useWhatsAppInstances(clientId)` — React Query com `staleTime: 30s` + polling do health a cada 30s quando aba ativa.

---

## 9. Atualizar Outros Pontos do Sistema

Funções que enviam WhatsApp também precisam usar o pool:
- `send-birthday-messages/index.ts` — passa a usar `pickHealthiestInstance`
- `main/index.ts` (dispatchNormalizePhone + envio de missões) — idem
- `WhatsAppInstanceCard` (botão "Enviar Teste") — ganha dropdown "testar com qual chip?"

A normalização do 9º dígito (já corrigida) permanece igual.

---

## 10. Indicadores Visuais & UX

- Tooltip em "Health Score": "Combina tempo de descanso (70%) e taxa de entrega 24h (30%). >70 = saudável, 40-70 = atenção, <40 = em risco."
- Badge "Chip novo" se `connected_since < 7 dias` (sugere uso moderado, mas sem bloquear conforme sua escolha)
- Aviso visual no painel de Disparos: "Apenas 1 chip ativo — considere adicionar mais para melhor distribuição"
- Log de Disparo (modal existente) ganha coluna "Enviado por" mostrando qual chip enviou cada msg

---

## 11. Migração & Compatibilidade

Etapas de rollout sem quebrar nada:
1. Migration cria tabela + backfill (cria 1 instance por cliente que já tem bridge configurada)
2. Edge functions aceitam tanto modo legado (sem instance_id) quanto novo
3. UI nova substitui antiga, mas mantém fluxo de "1 chip" funcional para quem só tem 1
4. Após validação, podemos descontinuar campos `clients.whatsapp_bridge_*` em release futura

---

## 📦 Entregáveis

**Backend:**
1. Migration: tabela `whatsapp_instances` + `whatsapp_instance_send_log` + colunas em `clients` e `whatsapp_dispatches` + RLS + backfill
2. Edge function `manage-whatsapp-instance` refatorada (multi-instance)
3. Edge function `send-whatsapp-dispatch` refatorada (rotação + janela + failover)
4. Edge function nova `resume-paused-dispatches` + cron a cada 10min
5. Edge functions `send-birthday-messages` e `main` adaptadas

**Frontend:**
6. `WhatsAppPoolManager` + `WhatsAppInstanceCard` (novo) + `WhatsAppPoolSummary` + `WhatsAppWindowSettings` + `AddInstanceDialog`
7. Hook `useWhatsAppInstances`
8. Atualização do `DispatchLogDialog` mostrando chip de origem
9. Aviso no painel `/disparos` quando há só 1 chip ativo

**Memória:**
10. Salvar memória nova `tecnico/pool-whatsapp-multi-instancia` documentando arquitetura

---

## ⚠️ Pontos de Atenção

- **Custo de chips**: cada instância adicional consome 1 número/chip real e ocupa slot na sua API UAZAPI. Confirmar que sua infra suporta múltiplas instâncias ativas.
- **Sem limite diário** (sua escolha): o sistema vai monitorar e exibir alertas visuais quando um chip ultrapassar 300 msg/dia (limiar empírico de risco), mas **não bloqueará envios**.
- **Janela horária 08h-22h** é por timezone do servidor (UTC). Vou converter para America/Sao_Paulo (UTC-3) na lógica.
- O fluxo de **conectar QR** continuará igual (botão por chip), só multiplicado.

---

Após sua aprovação, eu implemento em 3 fases ordenadas:
**Fase 1** (backend): migration + edge functions
**Fase 2** (frontend): UI de gestão do pool
**Fase 3** (integração): cron + ajustes nos demais envios + log com origem
