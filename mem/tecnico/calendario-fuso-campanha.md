---
name: Fuso fixo do Calendário Político
description: Cálculo de "hoje" e dias restantes ancorado em America/Sao_Paulo para consistência entre usuários em fusos diferentes
type: feature
---
O Calendário Político (widget `FeriadosWidget` e página `CalendarioPolitico`) calcula o "hoje" sempre no fuso `America/Sao_Paulo` via `Intl.DateTimeFormat("en-CA", { timeZone })`, não no fuso do navegador. Utilitários centrais em `src/lib/calendario-datas.ts`: `todayCampaignYMD()`, `diasAteCampanha(dateStr)`, `diasLabelCampanha(dias)`. Isso garante que rótulos "Hoje / Amanhã / Em N dias" e o destaque visual de "Hoje" na grade sejam idênticos para qualquer usuário, mesmo em Lisboa, Tóquio ou Miami. Imune a DST porque a comparação final usa apenas componentes Y/M/D normalizadas em `Date.UTC`.