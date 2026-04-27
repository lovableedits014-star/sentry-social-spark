CREATE TABLE public.media_saved_searches (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  terms JSONB NOT NULL DEFAULT '[]'::jsonb,
  uf TEXT,
  municipio TEXT,
  timespan TEXT NOT NULL DEFAULT '7d',
  country TEXT NOT NULL DEFAULT 'BR',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_media_saved_searches_client ON public.media_saved_searches(client_id, created_at DESC);

ALTER TABLE public.media_saved_searches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users view own client saved searches"
ON public.media_saved_searches FOR SELECT TO authenticated
USING (client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid()));

CREATE POLICY "users insert own saved searches"
ON public.media_saved_searches FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid())
);

CREATE POLICY "users update own saved searches"
ON public.media_saved_searches FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "users delete own saved searches"
ON public.media_saved_searches FOR DELETE TO authenticated
USING (user_id = auth.uid());

CREATE TRIGGER update_media_saved_searches_updated_at
BEFORE UPDATE ON public.media_saved_searches
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();