
-- Table to store recurring notification opt-in tokens from Meta Messenger
CREATE TABLE public.recurring_notification_tokens (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  supporter_id UUID NOT NULL REFERENCES public.supporters(id) ON DELETE CASCADE,
  platform_user_id TEXT NOT NULL,
  token TEXT NOT NULL,
  token_status TEXT NOT NULL DEFAULT 'active', -- active, expired, revoked
  frequency TEXT NOT NULL DEFAULT 'daily', -- daily, weekly, monthly
  expires_at TIMESTAMP WITH TIME ZONE,
  opted_in_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  last_used_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(client_id, supporter_id, platform_user_id)
);

-- Enable RLS
ALTER TABLE public.recurring_notification_tokens ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view tokens for their clients"
  ON public.recurring_notification_tokens FOR SELECT
  USING (client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid()));

CREATE POLICY "Users can insert tokens for their clients"
  ON public.recurring_notification_tokens FOR INSERT
  WITH CHECK (client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid()));

CREATE POLICY "Users can update tokens for their clients"
  ON public.recurring_notification_tokens FOR UPDATE
  USING (client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid()));

CREATE POLICY "Users can delete tokens for their clients"
  ON public.recurring_notification_tokens FOR DELETE
  USING (client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid()));

-- Service role needs access from edge functions
CREATE POLICY "Service role full access to recurring tokens"
  ON public.recurring_notification_tokens FOR ALL
  USING (true)
  WITH CHECK (true);

-- Index for quick lookups
CREATE INDEX idx_recurring_tokens_supporter ON public.recurring_notification_tokens(supporter_id, token_status);
CREATE INDEX idx_recurring_tokens_client ON public.recurring_notification_tokens(client_id, token_status);
