## O que vamos construir

Duas frentes complementares dentro de **Inteligência Eleitoral**:

### 1. Importador automático do TSE 2022 (todos cargos de MS)
Uma Edge Function (`import-tse-results`) que baixa do repositório aberto do TSE (`https://cdn.tse.jus.br/estatistica/sead/odsele/votacao_candidato_munzona/`) o ZIP oficial `votacao_candidato_munzona_2022.zip`, descompacta em memória, lê o CSV `votacao_candidato_munzona_2022_MS.csv` e popula `tse_votacao_zona` com `ano = 2022`. Cobre os 5 cargos: **Presidente, Governador, Senador, Deputado Federal, Deputado Estadual**.

Botão "Importar dados 2022 (MS)" exibido apenas para Super-Admin numa nova seção da página.

### 2. Nova aba "Composição de Chapa"
Dentro de `/inteligencia-eleitoral`, ao lado das abas atuais (Prefeito 2024, Vereador 2024). Exibe candidatos consolidados de **2022 + 2024** com filtros poderosos.

```text
┌─ Inteligência Eleitoral ──────────────────────────────┐
│ [Prefeito 2024] [Vereador 2024] [Composição de Chapa] │  ← abas no topo
├───────────────────────────────────────────────────────┤
│ FILTROS                                               │
│ Mín. votos: [____]  Ano: [2022+2024▾] Cargo: [▾]      │
│ Partido: [▾]  UF: [MS▾]  Município: [▾]  Buscar: [_] │
├───────────────────────────────────────────────────────┤
│ Ordenar por: [Total votos ▾] [⇅]                      │
├───────────────────────────────────────────────────────┤
│ Nome              Partido Cargo       2022   2024  Σ  │
│ Fulano da Silva   PP      Vereador     —   12.430 …   │
│ Beltrano X.       PL      Dep.Estadual 8.7k    —  …   │
│ ...                                                   │
└───────────────────────────────────────────────────────┘
                                     [Exportar Excel]
```

## Filtros (todos opcionais e combináveis)

- **Mínimo de votos** — input numérico; filtra candidatos cuja soma dos votos (no escopo do filtro de ano) seja ≥ valor
- **Ano** — `2022 + 2024 (todos)` | `Somente 2022` | `Somente 2024`
- **Cargo** — multi-select (Prefeito, Vereador, Presidente, Governador, Senador, Dep. Federal, Dep. Estadual)
- **Partido** — dropdown populado dinamicamente
- **UF** — dropdown (hoje só MS, mas estrutura pronta)
- **Município** — dropdown dependente da UF
- **Busca livre** por nome (debounced)

## Ordenação

Cabeçalhos de coluna clicáveis + dropdown de ordenação rápida:
- Total de votos (soma 2022+2024)
- Votos em 2024
- Votos em 2022
- Nome (A→Z / Z→A)
- Partido (A→Z / Z→A)

## Cruzamento de candidatos entre anos

Como o TSE não usa um ID estável entre eleições, agrupamos por chave normalizada:
`lower(unaccent(nome_completo)) + '|' + partido` (fallback: só nome). Quando o mesmo candidato aparece em 2022 e 2024 — mesmo em cargos diferentes — aparece numa linha só com colunas separadas por ano e a soma total.

## Detalhes técnicos

**Banco**
- Sem mudança de schema (já temos `ano, cargo, uf, municipio, partido, nome_completo, votos` em `tse_votacao_zona`).
- Nova migração só adiciona índices: `(ano, cargo, partido)` e `(ano, uf, municipio)` para filtros rápidos.
- Nova função SQL `get_chapa_candidates(p_uf, p_municipio, p_anos int[], p_cargos text[], p_partido, p_min_votos)` que retorna candidatos agregados por nome+partido com colunas `votos_2022`, `votos_2024`, `total`. Faz o agrupamento server-side para não puxar 100k linhas pro front.

**Edge Function `import-tse-results`** (~150 linhas)
- Input: `{ ano: 2022, uf: "MS" }`
- Baixa ZIP do TSE com `fetch` + descompacta com `jsr:@zip-js/zip-js`
- Lê CSV (latin1, separador `;`), filtra colunas necessárias
- Insere em lotes de 1.000 com `upsert` na unique key `(ano, turno, cargo, cod_municipio, zona, numero)`
- Reporta progresso ao retornar `{ inserted, skipped, total }`
- Restrita a Super-Admin via verificação de JWT

**Frontend**
- Nova aba `<TabsContent value="chapa">` em `InteligenciaEleitoral.tsx` (refatorando para `Tabs` se ainda não usar — já usa)
- Componente `ComposicaoChapa.tsx` isolado
- React Query com `staleTime: Infinity` (segue padrão do projeto)
- Exportação Excel via `xlsx-js-style` (já importado na página)

**Acesso**
- Página existente já é restrita à equipe; nova aba herda o controle.
- Botão "Importar 2022" só aparece para `lovableedits014@gmail.com` (Super-Admin).

## Limitações honestas

- O cruzamento entre anos é **heurístico por nome+partido**. Político que mudou de partido entre 2022 e 2024 vai aparecer em 2 linhas. Vou expor um botão "Mesclar manualmente" (fase 2) se virar problema.
- Cada importação 2022 do MS = ~30k–50k linhas. A Edge Function tem limite de 60s, mas inserção em lotes paralelos resolve folgadamente.
- Dados do TSE são públicos e abertos — sem necessidade de credenciais.

## Entregáveis

1. Migração SQL: índices + função `get_chapa_candidates`
2. Edge Function `import-tse-results`
3. Componente `src/components/inteligencia/ComposicaoChapa.tsx`
4. Atualização de `src/pages/InteligenciaEleitoral.tsx` adicionando a aba e o botão de importação
5. Botão de exportar Excel da chapa filtrada