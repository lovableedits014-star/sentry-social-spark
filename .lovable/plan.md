

# Plano de Implementacao: Rede de Multiplicadores + Mapa de Calor Territorial

## Analise de Viabilidade Tecnica

### O que ja temos e podemos aproveitar:
- Tabelas `supporters`, `supporter_accounts`, `supporter_profiles` com sistema de registro completo
- Edge function `register-supporter` com fuzzy match de nomes
- Portal do Apoiador (`/portal/:clientId`) com check-in, missoes e push notifications
- Sistema de engajamento com scores e historico mensal
- Multi-tenancy com RLS por `client_id`
- PWA com push notifications funcionando
- Lovable AI disponivel (sem necessidade de API key externa)

### O que e 100% possivel com o que temos:
- Rede de Multiplicadores: link de convite unico, arvore de influencia, ranking -- tudo com banco de dados + frontend React
- Mapa de Calor: usando dados de localizacao informados pelo apoiador (bairro/cidade) com visualizacao por graficos de barras e cards -- sem necessidade de Google Maps API

### Limitacao realista:
- Mapa geografico interativo (tipo Google Maps com pins) exigiria uma API externa (Google Maps, Mapbox). Podemos substituir por um **painel territorial por bairro/cidade** com barras de progresso e indicadores visuais que entrega o mesmo valor estrategico sem depender de API externa.

---

## FASE 1: Rede de Multiplicadores

### 1.1 Banco de Dados (Migracoes SQL)

**Tabela `referral_codes`** -- codigo unico por apoiador
- `id` UUID PK
- `supporter_account_id` UUID FK -> supporter_accounts
- `client_id` UUID FK -> clients
- `code` TEXT UNIQUE (6 caracteres alfanumerico)
- `created_at` TIMESTAMP

**Tabela `referrals`** -- registro de cada indicacao
- `id` UUID PK
- `client_id` UUID
- `referrer_account_id` UUID (quem indicou)
- `referred_account_id` UUID (quem foi indicado)
- `created_at` TIMESTAMP

**Coluna nova em `supporter_accounts`:**
- `referred_by` UUID (nullable) -- link direto para quem indicou

**Coluna nova em `supporters`:**
- `referral_count` INTEGER DEFAULT 0 -- cache do total de indicados

RLS: isolamento por `client_id` via join com `clients.user_id`, apoiadores podem ver seus proprios dados.

### 1.2 Backend (Edge Function)

Modificar a edge function `register-supporter` para:
- Aceitar parametro opcional `referral_code`
- Ao criar o supporter, registrar na tabela `referrals` quem indicou
- Incrementar `referral_count` no supporter que indicou
- Bonus: somar pontos extras no `engagement_score` do referrer

### 1.3 Frontend -- Registro com Codigo de Indicacao

Modificar `SupporterRegister.tsx`:
- Aceitar query param `?ref=CODIGO` na URL
- Exibir badge "Indicado por [Nome]" quando houver codigo valido
- Enviar `referral_code` para a edge function

### 1.4 Frontend -- Portal do Apoiador (nova aba "Convidar")

No `SupporterPortal.tsx`, adicionar aba "Convidar Amigos":
- Gerar/exibir link unico do apoiador: `/cadastro/:clientId?ref=CODIGO`
- Botao "Copiar Link" e "Compartilhar" (Web Share API para mobile)
- Contador: "Voce ja trouxe X apoiadores!"
- Mini ranking: "Top 10 Multiplicadores" do cliente
- Arvore de influencia simplificada: lista dos indicados diretos com data

### 1.5 Frontend -- Painel Admin (Engajamento)

No `Engagement.tsx`, adicionar secao "Multiplicadores":
- Ranking dos top multiplicadores com total de indicados
- Grafico de crescimento de apoiadores por indicacao vs organico
- Percentual da base que veio por indicacao

---

## FASE 2: Mapa de Calor Territorial

### 2.1 Banco de Dados

**Coluna nova em `supporter_accounts`:**
- `city` TEXT (nullable)
- `neighborhood` TEXT (nullable)
- `state` TEXT (nullable, sigla UF)

**Tabela `territorial_zones`** -- zonas personalizadas pelo admin
- `id` UUID PK
- `client_id` UUID
- `zone_name` TEXT (ex: "Zona Norte", "Bairro X")
- `zone_type` TEXT ('bairro' | 'cidade' | 'regiao')
- `supporter_count` INTEGER DEFAULT 0 (cache)
- `created_at` TIMESTAMP

### 2.2 Frontend -- Registro

Modificar `SupporterRegister.tsx`:
- Adicionar campos opcionais: Cidade, Bairro, Estado (UF)
- Esses dados sao salvos na `supporter_accounts` e/ou `supporters.notes`

Modificar `register-supporter` edge function:
- Aceitar e salvar `city`, `neighborhood`, `state`

### 2.3 Frontend -- Portal do Apoiador

No perfil do apoiador, permitir editar cidade/bairro.

### 2.4 Frontend -- Painel Admin (nova pagina ou secao)

Nova pagina `/territorial` ou secao em Engajamento:
- **Cards por regiao**: cada bairro/cidade com total de apoiadores, score medio, e barra de progresso colorida (verde = zona quente, vermelho = zona fria)
- **Ranking territorial**: lista ordenada por densidade de apoiadores
- **Filtros**: por cidade, bairro, estado
- **Indicador de crescimento**: comparativo com mes anterior
- **Zonas frias**: destaque visual para regioes com poucos apoiadores (oportunidade de expansao)

---

## Secao Tecnica Detalhada

### Migracoes SQL necessarias

```text
1. CREATE TABLE referral_codes (...)
2. CREATE TABLE referrals (...)
3. ALTER TABLE supporter_accounts ADD COLUMN referred_by UUID
4. ALTER TABLE supporter_accounts ADD COLUMN city TEXT
5. ALTER TABLE supporter_accounts ADD COLUMN neighborhood TEXT
6. ALTER TABLE supporter_accounts ADD COLUMN state TEXT
7. ALTER TABLE supporters ADD COLUMN referral_count INTEGER DEFAULT 0
8. CREATE TABLE territorial_zones (...)
9. RLS policies para todas as novas tabelas
10. Indice em referral_codes(code) para busca rapida
```

### Arquivos a criar/modificar

```text
CRIAR:
- src/pages/Territorial.tsx (painel territorial)
- src/components/referral/ReferralPanel.tsx (aba convidar no portal)
- src/components/referral/MultiplierRanking.tsx (ranking admin)

MODIFICAR:
- supabase/functions/register-supporter/index.ts (referral_code + cidade/bairro)
- src/pages/SupporterRegister.tsx (campos novos + ref param)
- src/pages/SupporterPortal.tsx (aba Convidar)
- src/pages/Engagement.tsx (secao multiplicadores)
- src/components/DashboardLayout.tsx (novo item menu Territorial)
- src/App.tsx (rota /territorial)
- supabase/config.toml (sem alteracao necessaria)
```

### Estimativa de complexidade
- Fase 1 (Multiplicadores): ~8-10 interacoes com o Lovable
- Fase 2 (Territorial): ~5-7 interacoes com o Lovable
- Total: ~15 interacoes para o sistema completo

### Riscos e mitigacoes
- **Dados de localizacao depende do apoiador informar**: mitigacao -- campo pre-formatado com sugestoes, tornar o campo mais visivel no registro
- **Codigos de referral duplicados**: mitigacao -- gerar com `nanoid` ou random alfanumerico com retry em caso de colisao
- **Performance do ranking**: mitigacao -- usar `referral_count` como cache em vez de COUNT em tempo real

---

## Ordem de Implementacao Recomendada

1. Migracoes SQL (todas as tabelas e colunas de uma vez)
2. Edge function `register-supporter` atualizada
3. Formulario de registro com campos novos
4. Portal do Apoiador -- aba Convidar
5. Painel Admin -- Ranking Multiplicadores
6. Painel Territorial
7. Testes end-to-end

