CREATE TABLE public.ic_transcriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL,
  user_id UUID,
  filename TEXT NOT NULL,
  duration_sec NUMERIC,
  language TEXT,
  model TEXT,
  full_text TEXT,
  segments JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ic_transcriptions_client ON public.ic_transcriptions(client_id, created_at DESC);

ALTER TABLE public.ic_transcriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ic_transcriptions_owner_all" ON public.ic_transcriptions
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = ic_transcriptions.client_id AND c.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = ic_transcriptions.client_id AND c.user_id = auth.uid()));

CREATE POLICY "ic_transcriptions_team_all" ON public.ic_transcriptions
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.team_members tm WHERE tm.client_id = ic_transcriptions.client_id AND tm.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.team_members tm WHERE tm.client_id = ic_transcriptions.client_id AND tm.user_id = auth.uid()));

CREATE TRIGGER trg_ic_transcriptions_updated
  BEFORE UPDATE ON public.ic_transcriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();