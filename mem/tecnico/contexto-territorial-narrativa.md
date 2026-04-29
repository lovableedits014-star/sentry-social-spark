---
name: Contexto Territorial e Filtro Anti-Antigo da Narrativa
description: Coletor municipios-indicadores-sync usa o mesmo Painel IBGE Cidades da narrativa (20 indicadores em JSONB), e narrativa-gerar descarta dados >3 anos.
type: feature
---
# Contexto Territorial unificado + Narrativa fresca

## Coletor unificado
- `municipios-indicadores-sync` agora puxa os MESMOS 20 indicadores do Painel IBGE Cidades que `narrativa-coleta` usa (IDs hardcoded em ambos — manter sincronizado).
- Armazena em `municipios_indicadores.indicadores` (JSONB) com `{ valor, ano, label, area, fonte, outdated, idade_anos }` por indicador.
- Mantém colunas top-level legadas (populacao, pib_per_capita, idh, ideb_*) por compatibilidade — extraídas do JSONB.

## Filtro anti-antigo (narrativa-gerar)
- `ANO_LIMITE = ano_atual - 3`. Indicadores com `ano < ANO_LIMITE` são descartados do prompt e listados como "Descartados por serem antigos demais".
- Prompt agora EXIGE citação do ano e PROÍBE menções a censos ≤2010.

## UI ContextoTerritorial
- Cards agrupam indicadores recentes por área (saúde/educação/economia/social/infra/demografia).
- Seção separada "Dados antigos" mostra indicadores >3 anos com aviso de que NÃO entram na narrativa.
