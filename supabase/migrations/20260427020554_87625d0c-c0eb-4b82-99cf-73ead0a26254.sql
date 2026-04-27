-- Cache genérico para integrações externas grátis (TSE, IBGE, GDELT, Nager.Date, Open-Meteo, CEMADEN, INMET)
CREATE TABLE IF NOT EXISTS public.api_cache (
  endpoint_key text PRIMARY KEY,
  source text NOT NULL,
  payload jsonb NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_api_cache_source ON public.api_cache(source);
CREATE INDEX IF NOT EXISTS idx_api_cache_expires ON public.api_cache(expires_at);

ALTER TABLE public.api_cache ENABLE ROW LEVEL SECURITY;

-- Leitura pública: dados em cache são todos de fontes públicas (TSE, IBGE, feriados, clima)
CREATE POLICY "api_cache_public_read"
  ON public.api_cache FOR SELECT
  USING (true);

-- Escrita: somente service role (edge functions) — sem policy de INSERT/UPDATE/DELETE significa bloqueado para auth/anon