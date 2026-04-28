ALTER TABLE public.whatsapp_instance_send_log
  ADD COLUMN IF NOT EXISTS preflight_status text,
  ADD COLUMN IF NOT EXISTS preflight_reconnected boolean NOT NULL DEFAULT false;

-- Atualiza log_whatsapp_send para aceitar e gravar a telemetria de preflight
CREATE OR REPLACE FUNCTION public.log_whatsapp_send(
  p_instance_id uuid,
  p_client_id uuid,
  p_dispatch_id uuid,
  p_success boolean,
  p_error_message text DEFAULT NULL,
  p_preflight_status text DEFAULT NULL,
  p_preflight_reconnected boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO whatsapp_instance_send_log (
    instance_id, client_id, dispatch_id, success, error_message,
    preflight_status, preflight_reconnected
  )
  VALUES (
    p_instance_id, p_client_id, p_dispatch_id, p_success, p_error_message,
    p_preflight_status, COALESCE(p_preflight_reconnected, false)
  );

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