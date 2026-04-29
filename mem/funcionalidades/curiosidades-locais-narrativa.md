---
name: Curiosidades & Cultura Local (substitui Roteiro Estratégico)
description: Aba e seção do dossiê com fatos reais sobre a cidade (história, cultura, economia, personalidades, gastronomia) extraídos da Wikipedia para o candidato chegar conhecendo o lugar.
type: feature
---
# Curiosidades & Cultura Local

## Decisão
A aba "Roteiro Estratégico" do dossiê de Narrativa Política foi REMOVIDA e substituída por "Curiosidades & Cultura". Bloqueio prévio que exigia dados zonais TSE para gerar narrativa também foi removido (era exclusivo do roteiro).

## Como funciona
- `supabase/functions/municipio-contexto-web/index.ts` agora também busca SEÇÕES da Wikipedia (História, Cultura, Economia, Gastronomia, Personalidades, Geografia, Religião, Esportes, Etimologia, Turismo) via API `action=parse&prop=sections|wikitext`. Inclui um `limparWikitext()` que remove templates, refs, links e tags.
- `narrativa-gerar`:
  - Schema do tool: substituiu `roteiro_visita` + `roteiro_estrategico` por `curiosidades_locais[]` (5–10 itens com `categoria`, `titulo`, `fato`, `uso_politico`).
  - Prompt: injeta seções Wikipedia em `📚 Páginas de conhecimento local` e exige que TODA curiosidade venha do contexto web (proibido inventar).
  - Removida toda a validação/sanitização de bairros TSE.
- UI (`NarrativaPolitica.tsx`): aba "Curiosidades & Cultura" renderiza grid 2-col com cards categorizados (ícone + cor por categoria) e bloco "Como usar na campanha". Botão "Copiar tudo".
- PDF: bloco visual de Curiosidades em `buildDossiePdf` (cabeçalho preto + corpo + caixa azul "Como usar").

## Categorias suportadas
historia, cultura, economia, geografia, personalidades, gastronomia, religiao, esporte, curiosidade, etimologia.

## Dossiês legados
Dossiês antigos com `roteiro_estrategico` ainda existem no banco mas a UI não renderiza mais — basta regerar para criar `curiosidades_locais`.
