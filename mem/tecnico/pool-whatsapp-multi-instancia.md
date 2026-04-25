---
name: Pool WhatsApp multi-instância (anti-banimento)
description: Arquitetura de múltiplos chips WhatsApp com rotação por saúde, janela horária e failover automático
type: feature
---
O envio de WhatsApp utiliza um **pool de instâncias** (`whatsapp_instances`) por cliente, substituindo o modelo de chip único (campos `clients.whatsapp_bridge_*` mantidos como legado/fallback).

**Rotação:** função `pick_healthy_whatsapp_instance(client_id)` escolhe a instância com maior score = `rest_score(70%) + success_rate_24h(30%)` entre as ativas e conectadas.

**Janela horária:** `clients.whatsapp_window_start/end/enabled` definem horário humano de disparo (padrão 08h-22h America/Sao_Paulo). Disparos fora da janela ficam com status `pausado_janela` e `paused_until`.

**Failover:** ao detectar erro de conexão (401/network), `send-whatsapp-dispatch` marca a instância como `disconnected` e re-tenta o mesmo destinatário com outro chip do pool.

**UI:** `WhatsAppPoolManager` (Settings) exibe summary (chips ativos, saúde média, janela), cards individuais (`WhatsAppInstancePoolCard`) com health score, métricas 24h, QR Code, toggle pool, ações conectar/desconectar/testar/excluir e collapsible de janela horária.

**Edge function `manage-whatsapp-instance`** suporta ações: `list_instances`, `create_instance_record`, `update_instance_record`, `delete_instance_record` + ações legadas (`create_instance`, `disconnect`, `instance_status`, `send`, `reconnect`) que aceitam `instance_id` opcional.