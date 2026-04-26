
-- Substitui a função de resume para usar a anon key (pública) — a edge function valida internamente
INSERT INTO public.platform_config (key, value) VALUES
  ('anon_key', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFoZXJjbHNjYXFieHl0bGdidW5sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA5NzE4NTYsImV4cCI6MjA4NjU0Nzg1Nn0.3X2TICQF5fIhuwcH2Pf46-MjeODR1A1kwXF-PUBv4k8')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

CREATE OR REPLACE FUNCTION public.resume_paused_whatsapp_dispatches()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  v_url text;
  v_key text;
BEGIN
  SELECT value INTO v_url FROM public.platform_config WHERE key = 'supabase_url';
  SELECT value INTO v_key FROM public.platform_config WHERE key = 'anon_key';

  IF v_url IS NULL OR v_key IS NULL THEN
    RAISE NOTICE 'platform_config supabase_url/anon_key ausente — resume desativado';
    RETURN;
  END IF;

  FOR r IN
    SELECT id FROM public.whatsapp_dispatches
    WHERE status = 'pausado_timeout'
      AND (paused_until IS NULL OR paused_until <= now())
    ORDER BY created_at ASC
    LIMIT 5
  LOOP
    UPDATE public.whatsapp_dispatches
       SET status = 'enviando', updated_at = now()
     WHERE id = r.id AND status = 'pausado_timeout';

    PERFORM net.http_post(
      url := v_url || '/functions/v1/send-whatsapp-dispatch',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_key,
        'apikey', v_key
      ),
      body := jsonb_build_object('resume_dispatch_id', r.id)
    );
  END LOOP;
END;
$$;
