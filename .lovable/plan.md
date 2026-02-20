
## Remover Sistema de Envio de Mensagens (Direct/Disparos)

### O que será removido

**Abas da página de Engajamento:**
- Aba **"Central"** (com cards de posts e botão de disparo em massa)
- Aba **"Logs"** (histórico de disparos)
- Aba **"Notificações"** (opt-in de Recurring Notifications)

**Componentes de front-end:**
- `src/components/engagement/EngagementPostCards.tsx` — componente inteiro removido
- `src/components/engagement/DispatchLogsPanel.tsx` — componente inteiro removido
- `src/components/engagement/RecurringNotificationsPanel.tsx` — componente inteiro removido

**Edge Functions de backend:**
- `supabase/functions/send-engagement-messages/` — lógica de disparo em massa
- `supabase/functions/manage-recurring-notifications/` — gestão de opt-in e tokens

---

### O que será mantido

As abas que permanecem na página de Engajamento:
- **Ranking** — score dos apoiadores
- **Histórico** — histórico mensal por mês
- **Inativos** — apoiadores sem interação
- **Config** — configuração de pontos
- **Presenças** — sistema de check-in diário (recém criado)

Os componentes e funções que **não** serão afetados:
- Portal do Apoiador (`/portal/:clientId`)
- Sistema de check-in (`supporter_checkins`)
- Cadastro de apoiadores (`/cadastro/:clientId`)
- Funções de comentários, LLM, Meta token

---

### Mudanças técnicas detalhadas

**1. `src/pages/Engagement.tsx`**
- Remover imports: `EngagementPostCards`, `DispatchLogsPanel`, `RecurringNotificationsPanel`
- Remover imports de ícones não mais usados: `Megaphone`, `FileText`, `BellRing`
- Remover as 3 `TabsTrigger` (Central, Logs, Notificações)
- Remover os 3 `TabsContent` correspondentes
- Manter o `defaultValue` das tabs apontando para `"ranking"` (primeira aba válida restante)

**2. Deletar arquivos de componentes:**
- `src/components/engagement/EngagementPostCards.tsx`
- `src/components/engagement/DispatchLogsPanel.tsx`
- `src/components/engagement/RecurringNotificationsPanel.tsx`

**3. Deletar Edge Functions:**
- `supabase/functions/send-engagement-messages/index.ts`
- `supabase/functions/manage-recurring-notifications/index.ts`
- Chamar a ferramenta de undeploy para removê-las do servidor também

> Nota: As tabelas `message_dispatches`, `dispatch_items` e `recurring_notification_tokens` serão mantidas no banco de dados por segurança — os dados existentes são preservados e a remoção de tabelas exigiria uma migration que pode afetar dados já gravados. O front-end simplesmente deixará de usá-las.
