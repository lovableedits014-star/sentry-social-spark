## Plano: Exportar banco para migração

Gerar 3 arquivos `.sql` em `/mnt/documents/` para você baixar pela aba **Files** e enviar ao outro projeto.

### Passos

1. Descobrir a connection string do Postgres a partir das variáveis `PG*` já disponíveis no sandbox (`PGHOST`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`).
2. Rodar `pg_dump` 3 vezes:
   - `schema.sql` → estrutura completa: `--schema-only --schema=public --schema=auth --no-owner --no-privileges`
   - `data.sql` → dados das tabelas públicas: `--data-only --schema=public --disable-triggers --no-owner`
   - `auth.sql` → usuários: `--data-only --schema=auth -t auth.users -t auth.identities --disable-triggers --no-owner`
3. Listar tamanhos dos arquivos gerados e expor via `<lov-artifact>` para você baixar.
4. Lembrete sobre Storage: os buckets (`client-logos`, `birthday-images`, etc.) NÃO entram nesses dumps — migração separada via `scripts/migrate-storage.mjs` precisa das service-role keys dos dois lados.

### Observações técnicas

- Se `pg_dump` local não estiver no PATH ou versão for incompatível com Postgres do servidor, instalo via `nix run nixpkgs#postgresql_15`.
- Se a connection string só tiver pooler (porta 6543), uso a porta direta 5432 para `pg_dump` (pooler não suporta).
- Arquivos podem ficar grandes (>10MB para `data.sql`); se passar do limite de download da aba Files, comprimo com `gzip`.

### Entrega

Após rodar, você verá os 3 artifacts na aba Files:
- `schema.sql`
- `data.sql`
- `auth.sql`
