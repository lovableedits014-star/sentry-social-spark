---
name: Contexto Web em Tempo Real para Narrativa
description: Edge function municipio-contexto-web busca Wikipedia + Google News + sites .gov.br ao vivo (sem persistência) e narrativa-gerar injeta no prompt da IA.
type: feature
---
# Contexto Web na geração de narrativa

## Por que existe
Indicadores oficiais (IBGE/Atlas/INEP/DATASUS) têm defasagem de 1–3 anos. Para narrativa política viva, a IA precisa saber dos acontecimentos das ÚLTIMAS SEMANAS na cidade.

## Como funciona
- `supabase/functions/municipio-contexto-web/index.ts` — busca em paralelo, sem API key:
  - Wikipedia REST API (resumo enciclopédico, tenta variações `Cidade (UF)` → `Cidade, UF` → `Cidade`)
  - Google News RSS com `when:90d` (últimos 90 dias)
  - Bing News RSS (cobertura adicional)
  - Google News RSS com `site:gov.br` (decretos, portais oficiais)
- `narrativa-gerar` chama essa function ANTES de montar o prompt e injeta `CONTEXTO RECENTE DA WEB` no `buildUserPrompt`.
- **Sem persistência** — tudo em memória. Cada geração de narrativa puxa fresh.

## Regras do prompt
- IA é OBRIGADA a amarrar pelo menos 1 ataque ou discurso a um acontecimento real do contexto web.
- IA é PROIBIDA de inventar notícia ou citar fonte que não esteja na lista.

## Custos
- Zero — todas as fontes (Wikipedia REST, Google News RSS, Bing RSS) são gratuitas e sem chave.
- Latência adicional ~2-4s por geração (4 fetches em paralelo).

## Filtros
- Notícias com pubDate > 120 dias são descartadas no parser RSS.
- Dedup por título (primeiros 80 chars).