
-- 1) Tabela de fila de retentativas para envios individuais automáticos
CREATE TABLE IF NOT EXISTS public.whatsapp_send_retry_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  telefone TEXT NOT NULL,
  nome TEXT,
  mensagem TEXT NOT NULL,
  origem TEXT NOT NULL DEFAULT 'automatico', -- 'aniversario', 'crise', 'manual', etc.
  origem_ref UUID, -- referência opcional ao registro de origem (pessoa_id, alert_id, etc.)
  status TEXT NOT NULL DEFAULT 'pendente', -- pendente | enviado | falha_definitiva | descartado
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 8,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_error TEXT,
  last_attempt_at TIMESTAMPTZ,
  enviado_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wa_retry_queue_pending
  ON public.whatsapp_send_retry_queue (status, next_attempt_at)
  WHERE status = 'pendente';

CREATE INDEX IF NOT EXISTS idx_wa_retry_queue_client
  ON public.whatsapp_send_retry_queue (client_id, status);

CREATE TRIGGER trg_wa_retry_queue_updated_at
  BEFORE UPDATE ON public.whatsapp_send_retry_queue
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.whatsapp_send_retry_queue ENABLE ROW LEVEL SECURITY;

-- Mesma regra de visibilidade dos dispatches: membros da equipe do cliente
CREATE POLICY "team_can_view_retry_queue"
  ON public.whatsapp_send_retry_queue
  FOR SELECT
  USING (
    public.is_super_admin()
    OR client_id IN (
      SELECT client_id FROM public.profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "team_can_manage_retry_queue"
  ON public.whatsapp_send_retry_queue
  FOR ALL
  USING (
    public.is_super_admin()
    OR client_id IN (
      SELECT client_id FROM public.profiles WHERE id = auth.uid()
    )
  )
  WITH CHECK (
    public.is_super_admin()
    OR client_id IN (
      SELECT client_id FROM public.profiles WHERE id = auth.uid()
    )
  );

-- 2) Função para enfileirar um envio (usada por edge functions / triggers)
CREATE OR REPLACE FUNCTION public.enqueue_whatsapp_retry(
  p_client_id UUID,
  p_telefone TEXT,
  p_mensagem TEXT,
  p_nome TEXT DEFAULT NULL,
  p_origem TEXT DEFAULT 'automatico',
  p_origem_ref UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO public.whatsapp_send_retry_queue (
    client_id, telefone, nome, mensagem, origem, origem_ref
  ) VALUES (
    p_client_id, public.only_digits(p_telefone), p_nome, p_mensagem, p_origem, p_origem_ref
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- 3) Função única para reprocessamento ao detectar reconexão
CREATE OR REPLACE FUNCTION public.resume_whatsapp_on_reconnect()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  q RECORD;
  v_url text;
  v_key text;
  v_has_connected boolean;
BEGIN
  SELECT value INTO v_url FROM public.platform_config WHERE key = 'supabase_url';
  SELECT value INTO v_key FROM public.platform_config WHERE key = 'anon_key';

  IF v_url IS NULL OR v_key IS NULL THEN
    RAISE NOTICE 'platform_config supabase_url/anon_key ausente — resume desativado';
    RETURN;
  END IF;

  -- A) Religa dispatches em massa pausados por falta de instância
  FOR r IN
    SELECT d.id, d.client_id
    FROM public.whatsapp_dispatches d
    WHERE d.status IN ('pausado_sem_instancia', 'pausado_janela')
      AND d.pause_reason ILIKE '%instância%'
    ORDER BY d.updated_at ASC
    LIMIT 10
  LOOP
    SELECT EXISTS(
      SELECT 1 FROM public.whatsapp_instances
      WHERE client_id = r.client_id
        AND is_active = true
        AND status = 'connected'
    ) INTO v_has_connected;

    IF v_has_connected THEN
      UPDATE public.whatsapp_dispatches
        SET status = 'enviando', pause_reason = NULL, updated_at = now()
      WHERE id = r.id;

      PERFORM net.http_post(
        url := v_url || '/functions/v1/send-whatsapp-dispatch',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || v_key,
          'apikey', v_key
        ),
        body := jsonb_build_object('resume_dispatch_id', r.id)
      );
    END IF;
  END LOOP;

  -- B) Reprocessa fila de retentativas individuais
  FOR q IN
    SELECT *
    FROM public.whatsapp_send_retry_queue
    WHERE status = 'pendente'
      AND next_attempt_at <= now()
    ORDER BY next_attempt_at ASC
    LIMIT 50
  LOOP
    SELECT EXISTS(
      SELECT 1 FROM public.whatsapp_instances
      WHERE client_id = q.client_id
        AND is_active = true
        AND status = 'connected'
    ) INTO v_has_connected;

    IF NOT v_has_connected THEN
      -- Sem instância: reagenda 5 minutos depois sem consumir tentativa
      UPDATE public.whatsapp_send_retry_queue
        SET next_attempt_at = now() + INTERVAL '5 minutes',
            updated_at = now()
      WHERE id = q.id;
      CONTINUE;
    END IF;

    -- Marca como em processamento (otimista) e dispara via send-whatsapp-dispatch
    UPDATE public.whatsapp_send_retry_queue
      SET attempts = attempts + 1,
          last_attempt_at = now(),
          updated_at = now()
    WHERE id = q.id;

    PERFORM net.http_post(
      url := v_url || '/functions/v1/send-whatsapp-dispatch',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_key,
        'apikey', v_key
      ),
      body := jsonb_build_object(
        'retry_queue_id', q.id,
        'client_id', q.client_id,
        'mensagem', q.mensagem,
        'recipients', jsonb_build_array(jsonb_build_object('telefone', q.telefone, 'nome', COALESCE(q.nome, '')))
      )
    );
  END LOOP;
END;
$$;
