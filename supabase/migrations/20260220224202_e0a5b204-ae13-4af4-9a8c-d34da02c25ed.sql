
-- Tabela de fila de disparos de notificações push
CREATE TABLE public.push_dispatch_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  title TEXT,
  message TEXT,
  url TEXT,
  -- status do job
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'done', 'failed', 'partial')),
  -- contadores
  total_subscribers INTEGER DEFAULT 0,
  sent_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  skipped_count INTEGER DEFAULT 0,
  expired_removed INTEGER DEFAULT 0,
  error_message TEXT,
  elapsed_seconds INTEGER DEFAULT 0,
  -- timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

-- Índices para consultas frequentes
CREATE INDEX idx_push_dispatch_jobs_client ON public.push_dispatch_jobs(client_id, created_at DESC);
CREATE INDEX idx_push_dispatch_jobs_status ON public.push_dispatch_jobs(status) WHERE status IN ('pending', 'processing');

-- RLS
ALTER TABLE public.push_dispatch_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own dispatch jobs"
  ON public.push_dispatch_jobs FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.clients
    WHERE clients.id = push_dispatch_jobs.client_id
      AND clients.user_id = auth.uid()
  ));

CREATE POLICY "Users can insert own dispatch jobs"
  ON public.push_dispatch_jobs FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.clients
    WHERE clients.id = push_dispatch_jobs.client_id
      AND clients.user_id = auth.uid()
  ));

CREATE POLICY "Service role can update dispatch jobs"
  ON public.push_dispatch_jobs FOR UPDATE
  USING (true);

-- Realtime para polling em tempo real
ALTER PUBLICATION supabase_realtime ADD TABLE public.push_dispatch_jobs;
