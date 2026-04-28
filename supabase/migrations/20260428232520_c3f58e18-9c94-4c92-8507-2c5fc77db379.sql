INSERT INTO public.platform_config (key, value)
VALUES ('whatsapp_keepalive_token', gen_random_uuid()::text)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.keepalive_whatsapp_instances()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url text;
  v_key text;
  v_token text;
BEGIN
  SELECT value INTO v_url FROM public.platform_config WHERE key = 'supabase_url';
  SELECT value INTO v_key FROM public.platform_config WHERE key = 'anon_key';
  SELECT value INTO v_token FROM public.platform_config WHERE key = 'whatsapp_keepalive_token';

  IF v_url IS NULL OR v_key IS NULL OR v_token IS NULL THEN
    RAISE NOTICE 'platform_config supabase_url/anon_key/whatsapp_keepalive_token ausente — keepalive WhatsApp desativado';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := v_url || '/functions/v1/manage-whatsapp-instance',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key,
      'apikey', v_key,
      'X-Keepalive-Token', v_token
    ),
    body := jsonb_build_object('action', 'health_check_all')
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.keepalive_whatsapp_instances() FROM PUBLIC, anon, authenticated;