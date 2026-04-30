---
name: Respostas Rápidas e Contatos de Encaminhamento
description: Box "Responder" do CommentItem inclui grid 3x4 de respostas rápidas (12 frases, regeneráveis via IA) e chips de contatos cadastráveis (label + telefone + texto de contexto) na tabela quick_contacts
type: feature
---
- Pool padrão das 12 frases em `src/lib/quick-replies.ts`.
- Hook `useQuickReplies` chama Edge Function `generate-quick-replies` (prompt fixo interno, usa LLM do cliente via `getClientLLMConfig`).
- Pool gerado vive só na sessão (não persiste).
- Tabela `quick_contacts` (client_id, label, phone, context_message, display_order) com RLS por dono do client OU team_member.
- Hook `useQuickContacts` (React Query, `staleTime: Infinity`) faz CRUD.
- `QuickRepliesGrid` substitui o textarea ao clicar; `QuickContactsBar` acrescenta `{context_message}\nTelefone: {phone}` ao final.
- Componentes em `src/components/comments/`.