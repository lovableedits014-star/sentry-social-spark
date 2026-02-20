-- Tabela para armazenar os tokens de push notification dos apoiadores
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  supporter_account_id UUID NOT NULL REFERENCES public.supporter_accounts(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(endpoint)
);

-- Enable RLS
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Apoiador pode inserir/atualizar sua própria subscription
CREATE POLICY "Supporter can insert own push subscription"
ON public.push_subscriptions
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.supporter_accounts
    WHERE supporter_accounts.id = push_subscriptions.supporter_account_id
      AND supporter_accounts.user_id = auth.uid()
  )
);

CREATE POLICY "Supporter can update own push subscription"
ON public.push_subscriptions
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.supporter_accounts
    WHERE supporter_accounts.id = push_subscriptions.supporter_account_id
      AND supporter_accounts.user_id = auth.uid()
  )
);

CREATE POLICY "Supporter can delete own push subscription"
ON public.push_subscriptions
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.supporter_accounts
    WHERE supporter_accounts.id = push_subscriptions.supporter_account_id
      AND supporter_accounts.user_id = auth.uid()
  )
);

CREATE POLICY "Supporter can view own push subscription"
ON public.push_subscriptions
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.supporter_accounts
    WHERE supporter_accounts.id = push_subscriptions.supporter_account_id
      AND supporter_accounts.user_id = auth.uid()
  )
);

-- Client owner can view subscriptions for their client (to count/send)
CREATE POLICY "Client owner can view push subscriptions"
ON public.push_subscriptions
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.clients
    WHERE clients.id = push_subscriptions.client_id
      AND clients.user_id = auth.uid()
  )
);

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION public.update_push_subscriptions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER update_push_subscriptions_updated_at
BEFORE UPDATE ON public.push_subscriptions
FOR EACH ROW
EXECUTE FUNCTION public.update_push_subscriptions_updated_at();