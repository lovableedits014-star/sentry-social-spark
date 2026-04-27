---
name: Estilos de Sugestão de Tema (Calendário)
description: Filtro por estilos (cívico, religioso, social, familiar, comemorativo) personalizável por usuário no widget e na página de Calendário Político
type: feature
---
Cada usuário pode escolher quais estilos de sugestão de tema político visualizar — Cívico, Religioso, Social, Familiar, Comemorativo. Preferência salva em `localStorage` (`calendario-politico:estilos-tema`) via hook `useEstilosTema`. Componente `EstilosTemaSelector` (popover com checkboxes) aparece tanto no `FeriadosWidget` (modo compacto) quanto na página `CalendarioPolitico`. Catálogo central em `src/lib/sugestoes-tema.ts` (sugestões por feriado e temas mensais multi-estilo). 100% visual — sem disparos. Sempre garante pelo menos 1 estilo ativo e 1 tema mensal visível.