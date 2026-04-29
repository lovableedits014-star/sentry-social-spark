---
name: Candidato de Referência (Narrativa Política)
description: Seletor TSE substitui auto-detecção do prefeito eleito; toda análise gira em torno do candidato escolhido (qualquer cargo)
type: feature
---
A aba "Narrativa Política" usa um **candidato de referência** escolhido pelo usuário via seletor TSE (cargo + nome), não mais o vencedor automático de Prefeito 2024.

- Tabela: `narrativa_perfil_candidato` ganhou colunas `ref_uf`, `ref_municipio`, `ref_cargo`, `ref_nome`, `ref_partido`, `ref_ano`, `ref_lado` ('proprio' | 'adversario').
- Cargos suportados: Prefeito, Vereador, Deputado Estadual/Federal, Senador, Governador.
- Edge `narrativa-coleta` lê o perfil e calcula `pct_eleito` por zona usando o candidato escolhido. Se nada escolhido, mantém fallback automático no vencedor de Prefeito 2024.
- Dados expostos em `tse_local.candidato_referencia = { nome, cargo, ano, origem: 'manual'|'auto-prefeito-2024' }`.
- UI mostra "{nome} teve X% nesta zona" em vez de "Prefeito eleito teve só X%".
- `ref_lado` define a leitura: próprio → reforçar onde fraco / defender onde forte; adversário → conquistar onde ele é fraco.
