-- Add token expiration tracking to integrations
ALTER TABLE public.integrations 
ADD COLUMN IF NOT EXISTS meta_token_expires_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS meta_token_type text DEFAULT 'short_lived';