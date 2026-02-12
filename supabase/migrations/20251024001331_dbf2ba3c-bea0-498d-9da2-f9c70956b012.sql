-- Create logs table for action tracking
CREATE TABLE IF NOT EXISTS public.action_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  action TEXT NOT NULL,
  status TEXT NOT NULL,
  details JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.action_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own logs"
  ON public.action_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.clients
      WHERE clients.id = action_logs.client_id
      AND clients.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert their own logs"
  ON public.action_logs
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.clients
      WHERE clients.id = action_logs.client_id
      AND clients.user_id = auth.uid()
    )
  );

-- Add index for better performance
CREATE INDEX idx_action_logs_client_id ON public.action_logs(client_id);
CREATE INDEX idx_action_logs_created_at ON public.action_logs(created_at DESC);