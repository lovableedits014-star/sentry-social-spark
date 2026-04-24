

# Plano: Migração para Supabase Self-Hosted (easychain.com.br)

## Destino confirmado
- **URL:** `https://supabase.easychain.com.br`
- **ANON_KEY:** fornecida ✅
- **Falta coletar antes do deploy** (você pega no painel do seu Supabase self-hosted):
  - `SERVICE_ROLE_KEY` (necessária para as Edge Functions e migração de Storage/Auth)
  - `DB_URL` direto do Postgres (formato `postgres://postgres:<senha>@db.easychain.com.br:5432/postgres`) — necessário para `pg_dump`/`psql`

## Fase 1 — Refatoração do código (faço agora, no projeto)

**1.1 Tornar o LLM router agnóstico**
- Editar `supabase/functions/_shared/llm-router.ts`:
  - Adicionar leitura de env vars globais como fallback: `DEFAULT_LLM_PROVIDER`, `DEFAULT_LLM_API_KEY`, `DEFAULT_LLM_MODEL`.
  - Manter o case `'lovable'` (continua funcionando se a key existir, mas deixa de ser obrigatório).
  - Adicionar campo `usage?: number` em `LLMResponse` extraindo `total_tokens` quando disponível.

**1.2 Refatorar as 2 funções "rebeldes" que ainda chamam Lovable direto**
- `supabase/functions/suggest-missions/index.ts` → trocar fetch direto por `callLLM()` + `getClientLLMConfig(clientId)`.
- `supabase/functions/analyze-crisis/index.ts` → idem.
- Ambas precisarão receber `clientId` no body (hoje não recebem) para buscar a config de IA do cliente.

**1.3 Gerar `.env.example` na raiz**
```
# Supabase (self-hosted)
VITE_SUPABASE_URL=https://supabase.easychain.com.br
VITE_SUPABASE_PUBLISHABLE_KEY=<anon-key>
VITE_SUPABASE_PROJECT_ID=<seu-ref>

# Edge Functions
SUPABASE_URL=https://supabase.easychain.com.br
SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role>
SUPABASE_DB_URL=postgres://...

# IA — defaults globais opcionais (cada cliente sobrescreve no painel)
DEFAULT_LLM_PROVIDER=groq
DEFAULT_LLM_API_KEY=
DEFAULT_LLM_MODEL=llama-3.1-8b-instant

# WhatsApp Bridge
WHATSAPP_BRIDGE_TOKEN=
WHATSAPP_BRIDGE_URL=

# Meta (Facebook/Instagram)
META_WEBHOOK_VERIFY_TOKEN=

# Push Notifications
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_EMAIL=
```

## Fase 2 — Toolkit de migração (faço agora)

Crio na raiz do projeto:

**2.1 `MIGRATION.md`** — guia passo a passo com:
- Comandos `pg_dump` para exportar do Supabase atual (schema + dados + auth).
- Comandos `psql` para importar no `supabase.easychain.com.br`.
- Lista de extensões a habilitar no Postgres da VPS: `pg_cron`, `pg_net`, `pgcrypto`, `uuid-ossp`.
- Comandos `supabase functions deploy` e `supabase secrets set`.
- Checklist de webhooks Meta para reapontar.
- Comandos `pg_cron` para recriar o job de aniversário (08:00 UTC-3).
- SQL para habilitar Realtime nas tabelas necessárias.

**2.2 `scripts/migrate-storage.mjs`** — script Node que:
- Lista todos os arquivos dos buckets `client-logos` e `birthday-images` no Supabase atual.
- Baixa cada arquivo via Storage API.
- Faz upload no Supabase de destino preservando paths.
- Roda com: `node scripts/migrate-storage.mjs`.

**2.3 `scripts/post-migration-fixes.sql`** — SQL pós-importação:
- Habilita Realtime: `ALTER PUBLICATION supabase_realtime ADD TABLE comments, posts, supporters, ...`
- Recria cron job de aniversário.
- Atualiza URLs de storage no banco se necessário.

## Fase 3 — Você executa na VPS (depois do código pronto)

**3.1 Provisionar** o Supabase self-hosted (já feito, está no ar).

**3.2 Habilitar extensões** (rodar no SQL Editor do seu painel):
```sql
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
```

**3.3 Exportar do Lovable Cloud** (rodar localmente com o `SUPABASE_DB_URL` atual):
```bash
pg_dump "$SOURCE_DB_URL" --schema-only --schema=public --schema=auth > schema.sql
pg_dump "$SOURCE_DB_URL" --data-only   --schema=public > data.sql
pg_dump "$SOURCE_DB_URL" --data-only   --schema=auth -t auth.users -t auth.identities > auth.sql
```

**3.4 Importar no easychain**:
```bash
psql "postgres://postgres:<senha>@db.easychain.com.br:5432/postgres" < schema.sql
psql "..." < auth.sql        # preserva UUIDs e senhas hasheadas
psql "..." < data.sql
node scripts/migrate-storage.mjs
psql "..." < scripts/post-migration-fixes.sql
```

**3.5 Deploy das Edge Functions**:
```bash
supabase login
supabase link --project-ref <seu-ref-easychain>
supabase functions deploy
supabase secrets set --env-file .env
```

**3.6 Frontend**:
- Atualizar `.env` com as URLs do easychain.
- `bun run build` → publicar `dist/` no servidor (Nginx/Caddy/EasyPanel).

**3.7 Reconfigurar webhooks externos**:
- Meta: trocar URL para `https://supabase.easychain.com.br/functions/v1/...`
- WhatsApp Bridge: idem.
- Cada cliente preenche sua API key de IA na tela de Configurações > Integrações (já existe).

## Pontos de atenção

| Risco | Mitigação |
|---|---|
| Cliente sem provider de IA configurado | `DEFAULT_LLM_*` no `.env` da VPS faz fallback |
| RLS quebrar | Dump preserva UUIDs de `auth.users` — não quebra |
| Realtime não funcionar | Script `post-migration-fixes.sql` habilita |
| `LOVABLE_API_KEY` faltando | Após Fase 1, deixa de ser obrigatório |
| Edge Runtime do self-hosted desatualizado | Validar versão ≥ 1.50 (suporta `npm:` imports) |
| `pg_cron` não habilitado no Docker | Verificar `docker-compose.yml` do Supabase |

## O que entrego ao aprovar este plano

1. ✅ Refatoração de `suggest-missions` e `analyze-crisis` para usar `callLLM`.
2. ✅ Ajuste do `_shared/llm-router.ts` com fallback via env vars + `usage` no response.
3. ✅ Arquivo `.env.example` na raiz.
4. ✅ Arquivo `MIGRATION.md` completo com todos os comandos.
5. ✅ Script `scripts/migrate-storage.mjs` pronto para rodar.
6. ✅ Script `scripts/post-migration-fixes.sql` para Realtime + cron.

Você executa as Fases 2 e 3 quando estiver pronto, no ritmo que preferir.

