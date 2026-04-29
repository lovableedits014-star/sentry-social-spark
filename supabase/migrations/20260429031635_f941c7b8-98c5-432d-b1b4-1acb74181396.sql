ALTER TABLE public.municipios_indicadores
  ADD COLUMN IF NOT EXISTS indicadores JSONB DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_municipios_indicadores_jsonb
  ON public.municipios_indicadores USING GIN(indicadores);