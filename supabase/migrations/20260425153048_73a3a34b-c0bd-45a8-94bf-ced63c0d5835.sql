
-- ============================================================
-- 1. ADAPTAR whatsapp_instances ao novo modelo
-- ============================================================
-- Torna instance_name opcional e adiciona todas as novas colunas
ALTER TABLE public.whatsapp_instances
  ALTER COLUMN instance_name DROP NOT NULL;

ALTER TABLE public.whatsapp_instances
  ADD COLUMN IF NOT EXISTS apelido TEXT,
  ADD COLUMN IF NOT EXISTS bridge_url TEXT,
  ADD COLUMN IF NOT EXISTS bridge_api_key TEXT,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS last_health_check_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_send_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS messages_sent_today INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS messages_sent_today_date DATE NOT NULL DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS total_sent BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_failed BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS consecutive_failures INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS connected_since TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS notes TEXT;

-- Copia instance_name para apelido se apelido estiver vazio
UPDATE public.whatsapp_instances
SET apelido = COALESCE(NULLIF(apelido, ''), instance_name, 'Chip Principal')
WHERE apelido IS NULL OR apelido = '';

-- Define apelido como obrigatório agora que está populado
ALTER TABLE public.whatsapp_instances
  ALTER COLUMN apelido SET NOT NULL,
  ALTER COLUMN apelido SET DEFAULT 'Nova Instância';

CREATE INDEX IF NOT EXISTS idx_whatsapp_instances_client ON public.whatsapp_instances(client_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_instances_pool ON public.whatsapp_instances(client_id, is_active, status);

ALTER TABLE public.whatsapp_instances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Client owner can manage whatsapp_instances" ON public.whatsapp_instances;
CREATE POLICY "Client owner can manage whatsapp_instances"
ON public.whatsapp_instances
FOR ALL
USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = whatsapp_instances.client_id AND clients.user_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM clients WHERE clients.id = whatsapp_instances.client_id AND clients.user_id = auth.uid()));

DROP POLICY IF EXISTS "Team members can view whatsapp_instances" ON public.whatsapp_instances;
CREATE POLICY "Team members can view whatsapp_instances"
ON public.whatsapp_instances
FOR SELECT
USING (EXISTS (SELECT 1 FROM team_members tm WHERE tm.client_id = whatsapp_instances.client_id AND tm.user_id = auth.uid()));

DROP TRIGGER IF EXISTS update_whatsapp_instances_updated_at ON public.whatsapp_instances;
CREATE TRIGGER update_whatsapp_instances_updated_at
BEFORE UPDATE ON public.whatsapp_instances
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 2. SEND LOG
-- ============================================================
CREATE TABLE IF NOT EXISTS public.whatsapp_instance_send_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  instance_id UUID NOT NULL REFERENCES public.whatsapp_instances(id) ON DELETE CASCADE,
  client_id UUID NOT NULL,
  dispatch_id UUID,
  success BOOLEAN NOT NULL,
  error_message TEXT,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_send_log_instance_time ON public.whatsapp_instance_send_log(instance_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_send_log_client_time ON public.whatsapp_instance_send_log(client_id, sent_at DESC);

ALTER TABLE public.whatsapp_instance_send_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Client owner can view send logs" ON public.whatsapp_instance_send_log;
CREATE POLICY "Client owner can view send logs"
ON public.whatsapp_instance_send_log
FOR SELECT
USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = whatsapp_instance_send_log.client_id AND clients.user_id = auth.uid()));

DROP POLICY IF EXISTS "Client owner can insert send logs" ON public.whatsapp_instance_send_log;
CREATE POLICY "Client owner can insert send logs"
ON public.whatsapp_instance_send_log
FOR INSERT
WITH CHECK (EXISTS (SELECT 1 FROM clients WHERE clients.id = whatsapp_instance_send_log.client_id AND clients.user_id = auth.uid()));

DROP POLICY IF EXISTS "Team members can view send logs" ON public.whatsapp_instance_send_log;
CREATE POLICY "Team members can view send logs"
ON public.whatsapp_instance_send_log
FOR SELECT
USING (EXISTS (SELECT 1 FROM team_members tm WHERE tm.client_id = whatsapp_instance_send_log.client_id AND tm.user_id = auth.uid()));

-- ============================================================
-- 3. CONFIGURAÇÕES EM CLIENTS
-- ============================================================
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS whatsapp_window_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS whatsapp_window_start TIME NOT NULL DEFAULT '08:00:00',
  ADD COLUMN IF NOT EXISTS whatsapp_window_end TIME NOT NULL DEFAULT '22:00:00',
  ADD COLUMN IF NOT EXISTS whatsapp_rotation_strategy TEXT NOT NULL DEFAULT 'health_random',
  ADD COLUMN IF NOT EXISTS whatsapp_inter_instance_delay_min INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS whatsapp_inter_instance_delay_max INTEGER NOT NULL DEFAULT 3;

-- ============================================================
-- 4. PAUSA EM WHATSAPP_DISPATCHES
-- ============================================================
ALTER TABLE public.whatsapp_dispatches
  ADD COLUMN IF NOT EXISTS paused_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pause_reason TEXT;

-- ============================================================
-- 5. FUNÇÃO: pickHealthiestInstance
-- ============================================================
CREATE OR REPLACE FUNCTION public.pick_healthy_whatsapp_instance(p_client_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_chosen_id UUID;
BEGIN
  WITH candidates AS (
    SELECT
      i.id,
      LEAST(1.0, EXTRACT(EPOCH FROM (now() - COALESCE(i.last_send_at, now() - INTERVAL '1 day'))) / 60.0) AS rest_score,
      COALESCE((
        SELECT CASE WHEN COUNT(*) = 0 THEN 1.0
                    ELSE SUM(CASE WHEN success THEN 1.0 ELSE 0.0 END) / COUNT(*)::numeric
               END
        FROM whatsapp_instance_send_log l
        WHERE l.instance_id = i.id
          AND l.sent_at >= now() - INTERVAL '24 hours'
      ), 1.0) AS success_rate
    FROM whatsapp_instances i
    WHERE i.client_id = p_client_id
      AND i.is_active = true
      AND i.status = 'connected'
      AND i.bridge_url IS NOT NULL
      AND i.bridge_api_key IS NOT NULL
  )
  SELECT id INTO v_chosen_id
  FROM candidates
  ORDER BY (rest_score * 0.7 + success_rate * 0.3) DESC, random()
  LIMIT 1;

  IF v_chosen_id IS NOT NULL THEN
    UPDATE whatsapp_instances SET last_send_at = now() WHERE id = v_chosen_id;
  END IF;

  RETURN v_chosen_id;
END;
$$;

-- ============================================================
-- 6. FUNÇÃO: log_whatsapp_send
-- ============================================================
CREATE OR REPLACE FUNCTION public.log_whatsapp_send(
  p_instance_id UUID,
  p_client_id UUID,
  p_dispatch_id UUID,
  p_success BOOLEAN,
  p_error_message TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO whatsapp_instance_send_log (instance_id, client_id, dispatch_id, success, error_message)
  VALUES (p_instance_id, p_client_id, p_dispatch_id, p_success, p_error_message);

  UPDATE whatsapp_instances
  SET
    total_sent = total_sent + CASE WHEN p_success THEN 1 ELSE 0 END,
    total_failed = total_failed + CASE WHEN p_success THEN 0 ELSE 1 END,
    consecutive_failures = CASE WHEN p_success THEN 0 ELSE consecutive_failures + 1 END,
    messages_sent_today = CASE
      WHEN messages_sent_today_date = CURRENT_DATE THEN messages_sent_today + CASE WHEN p_success THEN 1 ELSE 0 END
      ELSE CASE WHEN p_success THEN 1 ELSE 0 END
    END,
    messages_sent_today_date = CURRENT_DATE,
    last_send_at = now(),
    updated_at = now()
  WHERE id = p_instance_id;
END;
$$;

-- ============================================================
-- 7. BACKFILL: cria 1 instância por cliente com bridge configurada
-- ============================================================
INSERT INTO public.whatsapp_instances (client_id, apelido, bridge_url, bridge_api_key, status, is_active, connected_since)
SELECT
  c.id,
  'Chip Principal',
  c.whatsapp_bridge_url,
  c.whatsapp_bridge_api_key,
  'connected',
  true,
  now()
FROM public.clients c
WHERE c.whatsapp_bridge_url IS NOT NULL
  AND c.whatsapp_bridge_api_key IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.whatsapp_instances wi WHERE wi.client_id = c.id
  );

-- Para instâncias antigas que já existiam mas sem bridge_url, preenche com a do client
UPDATE public.whatsapp_instances wi
SET
  bridge_url = c.whatsapp_bridge_url,
  bridge_api_key = c.whatsapp_bridge_api_key
FROM public.clients c
WHERE wi.client_id = c.id
  AND wi.bridge_url IS NULL
  AND c.whatsapp_bridge_url IS NOT NULL
  AND c.whatsapp_bridge_api_key IS NOT NULL;
