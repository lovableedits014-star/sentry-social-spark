
## Configurar as Chaves VAPID para Push Notifications

### O que são as chaves VAPID?

VAPID (Voluntary Application Server Identification) são chaves criptográficas que identificam seu servidor ao enviar notificações push. Elas garantem que apenas o seu sistema possa enviar notificações para seus apoiadores. São 3 valores:

- **VAPID_PUBLIC_KEY** — chave pública (usada no navegador do apoiador)
- **VAPID_PRIVATE_KEY** — chave privada (usada no servidor para assinar notificações)
- **VAPID_EMAIL** — seu e-mail de contato (ex: `admin@seusite.com`)

---

### Como gerar as chaves (sem instalar nada)

**Passo 1 — Acesse o gerador online:**
Abra esta URL no navegador:
```
https://vapidkeys.com
```
(site gratuito e confiável para gerar VAPID keys)

**Passo 2 — Clique em "Generate"** e copie:
- `Public Key` → será o valor de `VAPID_PUBLIC_KEY`
- `Private Key` → será o valor de `VAPID_PRIVATE_KEY`

**Passo 3 — Defina seu e-mail** para `VAPID_EMAIL` (pode ser qualquer e-mail válido seu, ex: `contato@seusite.com`)

---

### Como adicionar os secrets no Lovable Cloud

Após gerar, você vai preencher 3 campos no painel "Add Secrets":

| Campo (Secret Name) | Valor a colocar |
|---|---|
| `VAPID_PUBLIC_KEY` | A "Public Key" gerada no site |
| `VAPID_PRIVATE_KEY` | A "Private Key" gerada no site |
| `VAPID_EMAIL` | Seu e-mail (ex: admin@seusite.com) |

---

### O que será feito tecnicamente após você inserir os secrets

1. **Adicionar `VAPID_PUBLIC_KEY` também como variável de ambiente no frontend** (`VITE_VAPID_PUBLIC_KEY`) — para que o navegador do apoiador use a mesma chave pública ao se inscrever para receber notificações.
2. **Atualizar `src/hooks/use-push-notifications.ts`** — já referencia `VITE_VAPID_PUBLIC_KEY`, então funcionará automaticamente.
3. **Verificar `supabase/functions/send-push-notifications/index.ts`** — já lê `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` e `VAPID_EMAIL` dos secrets, então também funcionará automaticamente.

> **Nota importante:** A `VAPID_PUBLIC_KEY` precisa ser adicionada tanto como secret (para a edge function) quanto como variável pública no código frontend (`VITE_VAPID_PUBLIC_KEY`). Como ela é uma chave **pública**, é seguro incluí-la diretamente no código.

---

### Resumo dos arquivos que serão alterados

- `src/hooks/use-push-notifications.ts` — confirmar que referencia `VITE_VAPID_PUBLIC_KEY`
- Nenhuma alteração na edge function será necessária (já está pronta)

---

### Como acessar o painel de Secrets

No Lovable, clique em **Cloud** (ícone de nuvem no topo) → **Secrets** → **Add Secret** e preencha um de cada vez:
1. `VAPID_PUBLIC_KEY` + valor da Public Key
2. `VAPID_PRIVATE_KEY` + valor da Private Key  
3. `VAPID_EMAIL` + seu e-mail

Após inserir os 3 secrets, me avise e finalizarei a configuração adicionando a chave pública também no frontend para completar a integração.
