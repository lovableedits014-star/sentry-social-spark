## Objetivo

No box "Responder" dos comentários (`CommentItem.tsx`), adicionar:

1. **Respostas Rápidas Positivas** — grid 3×4 (12 botões) que preenchem o textarea com 1 clique, com botão **"Gerar novas respostas"** que troca todas via IA.
2. **Contatos de Encaminhamento** — chips de telefones + texto contextual cadastrados pelo próprio usuário, que ao clicar acrescentam o trecho ao final da resposta.

---

## 1. Respostas Rápidas (com gerador IA)

### Pool inicial (hardcoded em `src/lib/quick-replies.ts`)
12 frases padrão:
- "Muito obrigado pelo carinho! 🙏"
- "Agradeço o apoio, conte sempre comigo!"
- "Que bom ter você com a gente! 💪"
- "Seu apoio faz toda a diferença, obrigado!"
- "Obrigado pela força! Seguimos juntos."
- "Valeu demais pelo comentário! 🙌"
- "Gratidão pelo seu carinho!"
- "Obrigado, é por pessoas como você que seguimos firmes!"
- "Recebido com muito carinho, obrigado!"
- "Muito obrigado, abraço!"
- "Agradeço de coração 💚"
- "Obrigado, conte sempre comigo!"

### UI
- Grid `grid-cols-3 gap-1.5` com 12 botões `outline` (texto truncado, `title` mostra completo).
- 1 clique → `setManualText(frase)` (substitui o conteúdo).
- Botão "Gerar novas respostas" (ícone Sparkles, à direita do título da seção).
- Estado local guarda o pool atual; ao gerar, substitui as 12 e mantém em memória durante a sessão. (Sem persistir em DB — o usuário pediu para "sempre trocar".)

### Backend — nova Edge Function `generate-quick-replies`
- Usa o LLM já configurado do cliente (`getClientLLMConfig` + `callLLM`, mesmo padrão de `generate-response`).
- **Prompt do sistema (interno, fixo):**

> "Você gera respostas curtas e positivas para comentários de apoiadores em redes sociais de um político brasileiro. Gere exatamente 12 frases distintas, cada uma com no máximo 80 caracteres, em português coloquial brasileiro, tom caloroso e agradecido. Varie a estrutura (algumas com emoji, outras sem; algumas começando com 'Obrigado', outras com 'Gratidão', 'Que bom', 'Valeu', etc). Evite repetir palavras de abertura. Não use hashtags, não mencione política, não faça promessas. Retorne via tool call."

- Estruturado via tool calling (schema `{ replies: string[12] }`) — padrão já recomendado no projeto.
- Recebe `clientId`, valida ownership (igual `generate-response`).
- Retorna `{ success: true, replies: [...] }`.
- Opcional: passar `currentReplies` para o prompt orientar variação ("evite estas frases já usadas: ...").

### Frontend
- Hook `useQuickReplies(clientId)` — estado local com o array de 12 + função `regenerate()` que invoca a edge function via `supabase.functions.invoke`.
- Toast de sucesso/erro; loader no botão durante a geração.

---

## 2. Contatos de Encaminhamento (com texto contextual)

### Schema — nova tabela `quick_contacts`
- `id uuid pk default gen_random_uuid()`
- `client_id uuid not null` (FK clients, RLS)
- `label text not null` (ex: "Indicações")
- `phone text not null` (livre, exibido como digitado)
- `context_message text` (texto pronto que acompanha o telefone — **novo campo solicitado**)
- `display_order int default 0`
- `created_at`, `updated_at`

RLS: SELECT/INSERT/UPDATE/DELETE para usuários do mesmo `client_id` (mesmo padrão das demais tabelas).

### UI — chips abaixo das respostas rápidas
- Cada contato vira um botão pequeno com o `label` (ex: "Indicações").
- Hover mostra tooltip com o texto que será inserido.
- Clicar **acrescenta ao final** do textarea atual (não substitui), com quebra de linha:

  ```
  {texto atual}

  {context_message}
  Telefone: {phone}
  ```

  Exemplo cadastrado:
  - label: "Agendamentos"
  - phone: "(67) 99999-9999"
  - context_message: "Para agendar uma visita ou audiência, fale com nossa equipe:"

  Resultado inserido:
  ```
  Para agendar uma visita ou audiência, fale com nossa equipe:
  Telefone: (67) 99999-9999
  ```

- Botão **+** abre popover (Dialog pequeno) com 3 campos: Rótulo, Telefone, Texto de contexto (textarea curta).
- Ícone de lápis em cada chip (no hover) → editar / remover.

### Hook
`src/hooks/useQuickContacts.ts` — React Query (`staleTime: Infinity`), invalidação após criar/editar/deletar.

---

## Arquivos a criar/editar

**Criar:**
- `src/lib/quick-replies.ts` — pool padrão das 12 frases.
- `src/hooks/useQuickReplies.ts` — estado + chamada à edge function.
- `src/hooks/useQuickContacts.ts` — CRUD via Supabase.
- `src/components/comments/QuickRepliesGrid.tsx` — grid 3×4 + botão "Gerar novas".
- `src/components/comments/QuickContactsBar.tsx` — chips + popover de cadastro/edição.
- `supabase/functions/generate-quick-replies/index.ts` — edge function com prompt fixo + tool calling.
- `supabase/migrations/<timestamp>_quick_contacts.sql` — tabela + RLS + trigger updated_at.

**Editar:**
- `src/components/CommentItem.tsx` — incluir os dois componentes dentro do bloco `showManualReply`, recebendo `manualText`/`setManualText` e `clientId`.

---

## Observações técnicas

- Geração das respostas usa o **mesmo LLM já configurado por cliente** (não consome chave nova) — segue padrão de `generate-response`.
- O prompt da geração fica **fixo dentro da edge function** (você não precisa configurar nada).
- Pool gerado vive só na sessão atual — recarregando a página, volta para o pool padrão. Se quiser persistir o último pool gerado por usuário, posso usar `localStorage` (me avise).
- Contatos rápidos são por `client_id` — toda a equipe do mesmo cliente compartilha os atalhos.
- Nenhuma mudança no fluxo de envio nem nas funções de WhatsApp/Meta — é só composição de texto local.