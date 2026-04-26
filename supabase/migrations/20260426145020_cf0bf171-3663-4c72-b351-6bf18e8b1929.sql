CREATE OR REPLACE FUNCTION public.ensure_account_supporter()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_redes jsonb := '[]'::jsonb;
  v_normalized_name text;
BEGIN
  IF NEW.supporter_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.instagram_username IS NOT NULL AND NEW.instagram_username <> '' THEN
    v_redes := v_redes || jsonb_build_object('plataforma','instagram','usuario',NEW.instagram_username);
  END IF;
  IF NEW.facebook_username IS NOT NULL AND NEW.facebook_username <> '' THEN
    v_redes := v_redes || jsonb_build_object('plataforma','facebook','usuario',NEW.facebook_username);
  END IF;

  IF jsonb_array_length(v_redes) = 0 THEN
    RETURN NEW;
  END IF;

  v_normalized_name := lower(regexp_replace(unaccent(trim(NEW.name)), '\s+', ' ', 'g'));

  SELECT s.id INTO v_id
  FROM public.supporters s
  WHERE s.client_id = NEW.client_id
    AND lower(regexp_replace(unaccent(trim(s.name)), '\s+', ' ', 'g')) = v_normalized_name
  ORDER BY s.created_at DESC
  LIMIT 1;

  IF v_id IS NULL THEN
    v_id := public.ensure_supporter_for_entity(NEW.client_id, NEW.name, v_redes);
  ELSE
    INSERT INTO public.supporter_profiles (supporter_id, platform, platform_user_id, platform_username)
    SELECT v_id,
           COALESCE(rede->>'plataforma', rede->>'platform'),
           COALESCE(rede->>'usuario', rede->>'username', rede->>'handle'),
           COALESCE(rede->>'usuario', rede->>'username', rede->>'handle')
    FROM jsonb_array_elements(v_redes) AS rede
    WHERE COALESCE(rede->>'plataforma', rede->>'platform') IS NOT NULL
      AND COALESCE(rede->>'usuario', rede->>'username', rede->>'handle') IS NOT NULL
      AND COALESCE(rede->>'usuario', rede->>'username', rede->>'handle') <> ''
    ON CONFLICT DO NOTHING;
  END IF;

  NEW.supporter_id := v_id;
  RETURN NEW;
END;
$$;