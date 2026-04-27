-- ============ media_alert_rules ============
CREATE TABLE public.media_alert_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  -- Filtros de busca
  keywords TEXT[] NOT NULL DEFAULT '{}',
  uf TEXT,
  municipio TEXT,
  country TEXT NOT NULL DEFAULT 'BR',
  language TEXT,
  domains TEXT[] DEFAULT '{}',
  exclude_terms TEXT[] DEFAULT '{}',
  -- Janela de avaliação (timespan GDELT: ex 1h, 6h, 24h)
  timespan TEXT NOT NULL DEFAULT '6h',
  -- Limiares
  alert_type TEXT NOT NULL DEFAULT 'both' CHECK (alert_type IN ('volume','sentiment','both')),
  min_volume INTEGER NOT NULL DEFAULT 10, -- mínimo de artigos para considerar pico
  volume_growth_pct NUMERIC NOT NULL DEFAULT 100, -- crescimento % vs janela anterior
  negative_tone_threshold NUMERIC NOT NULL DEFAULT -2.0, -- tom médio igual ou abaixo dispara
  negative_ratio_threshold NUMERIC NOT NULL DEFAULT 0.5, -- proporção mínima de artigos negativos (0-1)
  -- Controle de cooldown (em minutos) para evitar spam
  cooldown_minutes INTEGER NOT NULL DEFAULT 120,
  last_checked_at TIMESTAMPTZ,
  last_triggered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_media_alert_rules_client ON public.media_alert_rules(client_id);
CREATE INDEX idx_media_alert_rules_active ON public.media_alert_rules(is_active) WHERE is_active = true;

ALTER TABLE public.media_alert_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see their client's media rules"
ON public.media_alert_rules FOR SELECT
USING (
  client_id IN (SELECT client_id FROM public.profiles WHERE id = auth.uid())
  OR public.is_super_admin()
);

CREATE POLICY "Users manage their client's media rules"
ON public.media_alert_rules FOR ALL
USING (
  client_id IN (SELECT client_id FROM public.profiles WHERE id = auth.uid())
  OR public.is_super_admin()
)
WITH CHECK (
  client_id IN (SELECT client_id FROM public.profiles WHERE id = auth.uid())
  OR public.is_super_admin()
);

CREATE TRIGGER trg_media_alert_rules_updated_at
BEFORE UPDATE ON public.media_alert_rules
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ media_alert_events ============
CREATE TABLE public.media_alert_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  rule_id UUID NOT NULL REFERENCES public.media_alert_rules(id) ON DELETE CASCADE,
  rule_name TEXT NOT NULL,
  triggered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  trigger_kind TEXT NOT NULL CHECK (trigger_kind IN ('volume_spike','negative_sentiment','both')),
  severity TEXT NOT NULL DEFAULT 'aviso' CHECK (severity IN ('info','aviso','critico')),
  -- Métricas observadas
  total_articles INTEGER NOT NULL DEFAULT 0,
  previous_articles INTEGER,
  growth_pct NUMERIC,
  avg_tone NUMERIC,
  negatives INTEGER NOT NULL DEFAULT 0,
  positives INTEGER NOT NULL DEFAULT 0,
  neutrals INTEGER NOT NULL DEFAULT 0,
  negative_ratio NUMERIC,
  -- Snapshot da query e amostras
  query_snapshot TEXT,
  sample_articles JSONB DEFAULT '[]'::jsonb,
  -- Status
  is_read BOOLEAN NOT NULL DEFAULT false,
  read_at TIMESTAMPTZ,
  read_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_media_alert_events_client ON public.media_alert_events(client_id, triggered_at DESC);
CREATE INDEX idx_media_alert_events_rule ON public.media_alert_events(rule_id, triggered_at DESC);
CREATE INDEX idx_media_alert_events_unread ON public.media_alert_events(client_id, is_read) WHERE is_read = false;

ALTER TABLE public.media_alert_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see their client's media events"
ON public.media_alert_events FOR SELECT
USING (
  client_id IN (SELECT client_id FROM public.profiles WHERE id = auth.uid())
  OR public.is_super_admin()
);

CREATE POLICY "Users update their client's media events"
ON public.media_alert_events FOR UPDATE
USING (
  client_id IN (SELECT client_id FROM public.profiles WHERE id = auth.uid())
  OR public.is_super_admin()
);

CREATE POLICY "Users delete their client's media events"
ON public.media_alert_events FOR DELETE
USING (
  client_id IN (SELECT client_id FROM public.profiles WHERE id = auth.uid())
  OR public.is_super_admin()
);

-- Inserts são feitos pela edge function com service role (bypass RLS).