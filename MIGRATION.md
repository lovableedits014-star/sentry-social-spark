# Migração para Supabase Self-Hosted

Guia passo a passo para migrar o Sentinelle do Lovable Cloud para `https://supabase.easychain.com.br`.

---

## Pré-requisitos

- Acesso SSH à VPS com Supabase self-hosted rodando.
- `psql` e `pg_dump` instalados localmente (versão ≥ 15).
- `node` ≥ 18 e `bun` instalados.
- [Supabase CLI](https://supabase.com/docs/guides/cli) instalado: `npm i -g supabase`.
- Coletar do painel do seu Supabase self-hosted:
  - **`SERVICE_ROLE_KEY`**
  - **DB connection string** (formato `postgres://postgres:<senha>@db.easychain.com.br:5432/postgres`)
  - **Project ref** (slug do projeto self-hosted)

---

## Etapa 1 — Preparar a VPS

No SQL Editor do Supabase self-hosted, rode:

```sql
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
```

> Se `pg_cron` falhar, verifique no `docker-compose.yml` do Supabase se `shared_preload_libraries` inclui `pg_cron`. Se não, adicione e reinicie o Postgres.

---

## Etapa 2 — Exportar do Lovable Cloud

```bash
export SOURCE_DB_URL="<obter no painel Lovable Cloud>"

pg_dump "$SOURCE_DB_URL" --schema-only --schema=public --schema=auth \
  --no-owner --no-privileges > schema.sql

pg_dump "$SOURCE_DB_URL" --data-only --schema=public \
  --disable-triggers --no-owner > data.sql

pg_dump "$SOURCE_DB_URL" --data-only --schema=auth \
  -t auth.users -t auth.identities \
  --disable-triggers --no-owner > auth.sql
```

> `--disable-triggers` é importante para evitar conflitos com triggers (`handle_new_user`, etc.) durante o import.

---

## Etapa 3 — Importar na VPS

```bash
export DEST_DB_URL="postgres://postgres:<senha>@db.easychain.com.br:5432/postgres"

# 3.1 Schema (tabelas, RLS, functions, triggers)
psql "$DEST_DB_URL" < schema.sql

# 3.2 Auth users (preserva UUIDs e senhas hasheadas)
psql "$DEST_DB_URL" < auth.sql

# 3.3 Dados das tabelas públicas
psql "$DEST_DB_URL" < data.sql

# 3.4 Realtime + cron + extensões
psql "$DEST_DB_URL" < scripts/post-migration-fixes.sql
```

> Antes de rodar `post-migration-fixes.sql`, abra o arquivo e substitua `<YOUR_SERVICE_ROLE_KEY>` pela service-role real.

---

## Etapa 4 — Migrar Storage

```bash
export SOURCE_URL="https://qherclscaqbxytlgbunl.supabase.co"
export SOURCE_SERVICE_KEY="<service-role do Lovable Cloud>"
export DEST_URL="https://supabase.easychain.com.br"
export DEST_SERVICE_KEY="<service-role do easychain>"

node scripts/migrate-storage.mjs
```

Buckets migrados por padrão: `client-logos`, `birthday-images`. Para incluir outros: `BUCKETS=bucket1,bucket2 node scripts/migrate-storage.mjs`.

---

## Etapa 5 — Deploy das Edge Functions

```bash
supabase login
supabase link --project-ref <ref-do-easychain>

# Copia .env.example -> .env e preenche os valores
cp .env.example .env
# (edite .env)

# Sobe os secrets
supabase secrets set --env-file .env

# Deploy de todas as functions
supabase functions deploy
```

### Secrets obrigatórios

| Secret | Quando é obrigatório |
|---|---|
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` | Sempre |
| `WHATSAPP_BRIDGE_TOKEN` / `WHATSAPP_BRIDGE_URL` | Para envio de WhatsApp |
| `META_WEBHOOK_VERIFY_TOKEN` | Para webhook do Meta |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_EMAIL` | Para push notifications |
| `DEFAULT_LLM_PROVIDER` + `DEFAULT_LLM_API_KEY` (+ `DEFAULT_LLM_MODEL`) | Recomendado — fallback global de IA quando o cliente não configura no painel |
| `LOVABLE_API_KEY` | **Não obrigatório** após a migração |

---

## Etapa 6 — Frontend

```bash
# Atualiza .env do frontend
cat > .env <<'ENV'
VITE_SUPABASE_URL=https://supabase.easychain.com.br
VITE_SUPABASE_PUBLISHABLE_KEY=<anon-key>
VITE_SUPABASE_PROJECT_ID=<ref-do-easychain>
ENV

bun install
bun run build

# Sobe dist/ para Nginx, Caddy, EasyPanel, Vercel, etc.
```

---

## Etapa 7 — Reapontar integrações externas

1. **Meta (Facebook/Instagram)** — no Meta App Dashboard, troque a Webhook URL para:
   `https://supabase.easychain.com.br/functions/v1/fetch-meta-comments`
2. **WhatsApp Bridge (UAZAPI)** — atualize a callback URL no painel do provedor.
3. **Cron jobs** — confirme que `cron.job` lista o `send-birthday-messages-daily`.
4. **Configuração de IA por cliente** — cada admin entra em **Configurações > Integrações** e seleciona seu provider (Groq, OpenAI, etc.). Quem não configurar usa o `DEFAULT_LLM_*`.

---

## Validação

- [ ] Login funciona (Auth)
- [ ] Comentários sincronizam (Meta)
- [ ] Análise de sentimento responde (LLM router)
- [ ] Detector de Crise gera resumo (`analyze-crisis`)
- [ ] Sugestão de missões funciona (`suggest-missions`)
- [ ] Disparos WhatsApp enviam (Bridge)
- [ ] Push notifications chegam (VAPID)
- [ ] Cron de aniversário disparou ao menos 1 vez (verificar `action_logs`)
- [ ] Realtime atualiza o dashboard sem F5

---

## Pontos sensíveis

| Risco | Mitigação |
|---|---|
| Cliente sem provider de IA | Defina `DEFAULT_LLM_PROVIDER` + `DEFAULT_LLM_API_KEY` |
| Senhas dos usuários não funcionam | O dump de `auth.users` preserva hashes — use a mesma versão de Postgres no destino |
| RLS quebra | UUIDs preservados pelo dump — não deve quebrar |
| `pg_cron` indisponível | Verificar `shared_preload_libraries` no `postgresql.conf` do container |
| Edge runtime antigo | Validar Supabase Edge Runtime ≥ 1.50 (suporte a `npm:` imports) |
| URLs antigas no banco | Rodar `UPDATE` comentado no `post-migration-fixes.sql` |

---

## Rollback

Se algo der errado, o Lovable Cloud original continua no ar. Basta voltar a apontar o frontend para `VITE_SUPABASE_URL=https://qherclscaqbxytlgbunl.supabase.co` e os webhooks externos para a URL antiga.
