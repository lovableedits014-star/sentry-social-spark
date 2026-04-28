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
    WHERE d.status = 'pausado_sem_instancia'
       OR (d.status = 'pausado_janela' AND d.pause_reason ILIKE '%instância%')
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
      UPDATE public.whatsapp_send_retry_queue
        SET next_attempt_at = now() + INTERVAL '5 minutes',
            updated_at = now()
      WHERE id = q.id;
      CONTINUE;
    END IF;

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