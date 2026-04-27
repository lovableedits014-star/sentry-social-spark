---
name: APIs públicas — uso visual apenas
description: Integrações com APIs públicas externas (Nager.Date, IBGE, GDELT, Open-Meteo, CEMADEN, INMET) servem para visualização e gestão. NUNCA acionam disparos automáticos no WhatsApp.
type: constraint
---
Diretriz definida pelo usuário no roadmap de integrações:

- Feriados (Nager.Date), clima (Open-Meteo/CEMADEN/INMET), contexto socioeconômico (IBGE) e menções na imprensa (GDELT) são **somente visuais** — pintam o calendário, alimentam painéis, mostram badges.
- **Proibido**: usar essas integrações para disparar mensagens automáticas no WhatsApp Bridge. Isso sobrecarrega a operação e gera risco de banimento.
- Toda chamada externa deve passar pela tabela `api_cache` (TTL por fonte) — nunca chamar API externa direto do frontend.
- **Por quê**: o usuário quer apoio à decisão e visibilidade para o gestor planejar manualmente, não automação cega de comunicação.