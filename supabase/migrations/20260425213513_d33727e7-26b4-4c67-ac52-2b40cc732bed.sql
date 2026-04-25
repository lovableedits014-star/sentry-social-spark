ALTER TABLE public.supporter_accounts
ADD COLUMN IF NOT EXISTS whatsapp_confirmado boolean NOT NULL DEFAULT false;

ALTER TABLE public.funcionarios
ADD COLUMN IF NOT EXISTS whatsapp_confirmado boolean NOT NULL DEFAULT false;