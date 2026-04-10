

# Plano: Migrar WhatsApp da UAZAPI para Ponte API (Bridge)

## Contexto

Atualmente o sistema usa UAZAPI com endpoints como `/message/sendText/{instanceName}` e autenticação via header `apikey`. Você criou um novo sistema "ponte" em outro projeto Lovable que centraliza o WhatsApp, expondo uma API simples:

- **URL**: `https://vxqvrsaxppbgxookyimz.supabase.co/functions/v1/whatsapp-bridge`
- **Auth**: Header `X-Api-Key`
- **Body**: `{ "action": "send", "phone": "55...", "message": "Texto" }`

## O que muda

### 1. Configuração no banco (platform_config)
Substituir as chaves `uazapi_url` e `uazapi_admin_token` por:
- `whatsapp_bridge_url` (a URL do endpoint bridge)
- `whatsapp_bridge_api_key` (a chave X-Api-Key gerada no outro sistema)

### 2. Edge Functions afetadas (3 arquivos)

**`send-whatsapp-dispatch/index.ts`** (disparos em massa):
- Trocar a chamada `fetch(uazapiUrl/message/sendText/instanceName)` por `fetch(bridgeUrl)` com body `{ action: "send", phone, message }` e header `X-Api-Key`
- Remover dependência de `instance_name` e `instance_token` da UAZAPI
- Manter toda a lógica de batching, delays e anti-banimento

**`send-birthday-messages/index.ts`** (aniversários):
- Mesma migração: trocar chamadas UAZAPI por ponte API
- Para imagens: verificar se a ponte suporta envio de imagem ou adaptar para texto

**`manage-whatsapp-instance/index.ts`**:
- Remover completamente ou simplificar. A instância agora é gerenciada no outro sistema, não mais aqui

### 3. UI do Super Admin
**`UazapiConfigPanel.tsx`**: Renomear para "Ponte WhatsApp API" e trocar os campos para `whatsapp_bridge_url` e `whatsapp_bridge_api_key`

### 4. UI de Settings do cliente
**`WhatsAppInstanceCard.tsx`**: Remover o card de instância UAZAPI (QR code, criar instância etc.) pois a instância é gerenciada no outro sistema. Substituir por um card simples que mostra o status da conexão (se a ponte está configurada)

**`WhatsAppConfigCard.tsx`**: Atualizar o aviso que menciona "mesmo número da instância UAZAPI"

### 5. Settings page
Remover `WhatsAppInstanceCard` e simplificar

## Seção Técnica

```text
Antes (UAZAPI):
  App → Edge Function → UAZAPI API → WhatsApp

Depois (Ponte):
  App → Edge Function → Bridge API (outro projeto) → WhatsApp
```

Chamada antiga:
```
POST {uazapiUrl}/message/sendText/{instanceName}
Header: apikey: {token}
Body: { number, text }
```

Chamada nova:
```
POST {bridgeUrl}
Header: X-Api-Key: {apiKey}
Body: { action: "send", phone: "55...", message: "Texto" }
```

## Resumo das alterações
- 3 edge functions reescritas (dispatch, birthday, manage-instance)
- 2 componentes UI atualizados (UazapiConfigPanel → BridgeConfigPanel, WhatsAppConfigCard)
- 1 componente removido (WhatsAppInstanceCard)
- Settings.tsx e SuperAdmin.tsx atualizados
- Chaves do platform_config migradas

