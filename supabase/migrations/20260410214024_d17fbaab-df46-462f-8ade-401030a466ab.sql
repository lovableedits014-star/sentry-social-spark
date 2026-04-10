
-- Add per-client WhatsApp bridge configuration
ALTER TABLE public.clients
ADD COLUMN IF NOT EXISTS whatsapp_bridge_url text,
ADD COLUMN IF NOT EXISTS whatsapp_bridge_api_key text;

-- Add comment for documentation
COMMENT ON COLUMN public.clients.whatsapp_bridge_url IS 'URL do endpoint da Ponte WhatsApp API específica deste cliente';
COMMENT ON COLUMN public.clients.whatsapp_bridge_api_key IS 'Chave de autenticação da Ponte WhatsApp API específica deste cliente';
