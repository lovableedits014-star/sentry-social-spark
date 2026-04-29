---
name: Comparativo Estadual de Indicadores Municipais
description: Usa RPC municipios_ranking_uf para gerar média estadual, ranking e percentil por indicador a partir do JSONB de municípios
type: feature
---
- Coletor `municipios-indicadores-sync` puxa 30+ indicadores do Painel IBGE Cidades (Atlas Brasil, INEP, DATASUS, SNIS via IBGE).
- Cada indicador no JSONB `municipios_indicadores.indicadores` armazena também `tendencia` (último vs anterior).
- RPC `public.municipios_ranking_uf(p_uf text)` calcula média/min/max/posição/percentil/delta% por indicador da UF inteira a partir do JSONB.
- RPC `public.municipio_ranking(p_codigo_ibge int)` é o atalho compacto para 1 município.
- "higher_is_worse" controla cor do delta na UI e direção do ranking ("1º = pior" para pobreza/Gini/mortalidade; "1º = melhor" para IDH/IDEB).
- UI `ContextoTerritorial` busca o ranking só quando há filtro UF ativo, e exibe posição + delta % no pill de cada indicador.
- `narrativa-gerar` chama `municipio_ranking` por código IBGE para injetar comparativo estadual fresco no prompt da IA (substitui `indicadores_estado` legado).
