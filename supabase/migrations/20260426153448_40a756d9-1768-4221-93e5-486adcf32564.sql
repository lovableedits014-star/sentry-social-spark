
INSERT INTO public.platform_config (key, value) VALUES
  ('supabase_url', 'https://qherclscaqbxytlgbunl.supabase.co')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

-- service_role_key precisa ser configurada manualmente. Tentamos via setting do banco.
-- Se já existir uma config "supabase_service_role_key" usada por outras funções, copia.
DO $$
DECLARE
  v_existing text;
BEGIN
  SELECT value INTO v_existing FROM public.platform_config 
  WHERE key IN ('supabase_service_role_key','service_role_key') 
  LIMIT 1;
  IF v_existing IS NOT NULL THEN
    INSERT INTO public.platform_config (key, value) VALUES ('service_role_key', v_existing)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
  END IF;
END $$;
