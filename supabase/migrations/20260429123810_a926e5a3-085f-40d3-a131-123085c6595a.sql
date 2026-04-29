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

  RETURN v_chosen_id;
END;
$$;