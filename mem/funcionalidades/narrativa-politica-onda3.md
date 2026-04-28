---
name: Narrativa Política — Top Locais e Export
description: Onda 3 do gerador de narrativa — top 10 locais críticos via zonas TSE, export PDF (jspdf) e envio WhatsApp via ação 'send' do manage-whatsapp-instance.
type: feature
---
# Narrativa Política — Onda 3

## Top 10 locais críticos
- `narrativa-coleta` calcula `desempenho_zonas` (% de votos do prefeito eleito 2024 em cada zona TSE) e busca `tse_votacao_local` das 8 zonas mais fracas (escolas/UBS reais com endereço e bairro).
- `narrativa-analise` chama `topLocaisCriticos()` que dedup por bairro e ranqueia pelas zonas com pior pct do incumbente. Salva em `analise.top_locais_criticos`.
- `bairros_inferidos` agora usa SOMENTE bairros vindos dos endereços TSE reais — nunca inventa.
- O prompt do `narrativa-gerar` passa essa lista e proíbe inventar bairros.

## Export
- `buildDossieMarkdown()` monta o dossiê em texto. Reutilizado para PDF (jsPDF) e WhatsApp.
- PDF: client-side via `jspdf`, paginação automática, sem dependência extra de servidor.
- WhatsApp: `manage-whatsapp-instance` com `action: "send"` (NÃO `send_message`), texto truncado em 3800 chars.

## Indicadores adicionados
- 60037 (água canalizada) → `infra`
- 30277 (renda <½ SM) → `social`
