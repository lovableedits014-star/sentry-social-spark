
-- Configuração por cliente
CREATE TABLE public.engagement_autoresolve_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL UNIQUE REFERENCES public.clients(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  frequency text NOT NULL DEFAULT 'daily' CHECK (frequency IN ('daily','weekly')),
  hour_utc smallint NOT NULL DEFAULT 11 CHECK (hour_utc BETWEEN 0 AND 23),
  weekday smallint NOT NULL DEFAULT 1 CHECK (weekday BETWEEN 0 AND 6), -- 0=domingo
  resolve_invalid_ids boolean NOT NULL DEFAULT true,
  relink_orphans boolean NOT NULL DEFAULT true,
  last_run_at timestamptz,
  last_run_status text,
  last_run_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.engagement_autoresolve_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner can view autoresolve config"
  ON public.engagement_autoresolve_config FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND c.user_id = auth.uid())
    OR public.is_super_admin()
  );

CREATE POLICY "Owner can insert autoresolve config"
  ON public.engagement_autoresolve_config FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND c.user_id = auth.uid())
    OR public.is_super_admin()
  );

CREATE POLICY "Owner can update autoresolve config"
  ON public.engagement_autoresolve_config FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND c.user_id = auth.uid())
    OR public.is_super_admin()
  );

CREATE POLICY "Owner can delete autoresolve config"
  ON public.engagement_autoresolve_config FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND c.user_id = auth.uid())
    OR public.is_super_admin()
  );

CREATE TRIGGER trg_autoresolve_config_updated_at
  BEFORE UPDATE ON public.engagement_autoresolve_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Histórico de execuções
CREATE TABLE public.engagement_autoresolve_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  ran_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL,
  linked_count integer NOT NULL DEFAULT 0,
  resolved_count integer NOT NULL DEFAULT 0,
  message text,
  triggered_by text NOT NULL DEFAULT 'cron'
);

CREATE INDEX idx_autoresolve_runs_client_ran ON public.engagement_autoresolve_runs(client_id, ran_at DESC);

ALTER TABLE public.engagement_autoresolve_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner can view autoresolve runs"
  ON public.engagement_autoresolve_runs FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND c.user_id = auth.uid())
    OR public.is_super_admin()
  );
