---
name: Prompt de arte para feriados/datas comemorativas
description: Botão "Copiar prompt" institucional para cada feriado e tema do mês, com contexto do candidato persistido (localStorage). Sem geração interna.
type: feature
---
Cada feriado nacional (no `FeriadosWidget` e na página `CalendarioPolitico`) e cada tema do mês ganha um botão "Prompt de arte" que abre um diálogo com prompt institucional pronto para colar no ChatGPT/DALL·E/Midjourney/Nano Banana. Catálogo visual por feriado em `src/lib/prompt-arte-feriado.ts` (cenário, símbolos, tom). Estilo padrão fixo: institucional/candidato — foto-realista sóbrio, com 20% inferior reservado para nome + logo. Contexto opcional do candidato (nome, cargo, cidade, paleta) é editado no diálogo e salvo em `localStorage` via `useContextoArte` (chave `calendario-politico:contexto-arte`). NENHUMA geração de imagem é feita pela plataforma — apenas copy-to-clipboard, conforme decisão do usuário (zero custo de créditos).