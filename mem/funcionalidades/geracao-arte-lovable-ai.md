---
name: Geração de Arte com Lovable AI
description: Lovable AI (Nano Banana) é usado APENAS para gerar imagens no Calendário Político. Todo restante da IA do sistema usa o provedor configurado em "Configurações → Provedor de IA".
type: constraint
---
A Edge Function `generate-arte-feriado` é a ÚNICA integração com Lovable AI no sistema.
Ela serve exclusivamente para gerar imagens de divulgação de feriados/temas do mês,
acionada pelo botão "Gerar arte agora" dentro de `PromptArteButton`.

Modelos disponíveis:
- "fast" → google/gemini-2.5-flash-image (Nano Banana padrão, ~$0.039/img)
- "pro" → google/gemini-3.1-flash-image-preview (Nano Banana 2, ~$0.06/img)

**Why:** Manter o provedor de IA configurado pelo cliente como fonte única para
moderação, sentimento, respostas IA e qualquer outro uso conversacional. Lovable
AI fica restrito à geração de imagens (capacidade que o provedor configurado não
oferece nativamente no fluxo).

**How to apply:** Nunca adicionar chamadas a `ai.gateway.lovable.dev` em outros
fluxos. Para texto/análise, sempre usar o provedor configurado em
"Configurações → Provedor de IA".
