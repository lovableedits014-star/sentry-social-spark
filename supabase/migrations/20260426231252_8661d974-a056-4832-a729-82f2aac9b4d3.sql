-- Extensão para remover acentos
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA public;

-- =========================================================================
-- Helper: normalização de nome
-- =========================================================================
CREATE OR REPLACE FUNCTION public.normalize_person_name(p_name text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
BEGIN
  IF p_name IS NULL THEN RETURN NULL; END IF;
  RETURN regexp_replace(
           lower(public.unaccent(p_name)),
           '\s+', ' ', 'g'
         );
END;
$$;

-- =========================================================================
-- Trigger: auto_create_engagement_action com fallback por nome
-- =========================================================================
CREATE OR REPLACE FUNCTION public.auto_create_engagement_action()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_supporter_id UUID;
  v_profile_id UUID;
  v_is_registered BOOLEAN := false;
  v_norm_author text;
BEGIN
  IF NEW.is_page_owner = true THEN RETURN NEW; END IF;
  IF NEW.platform_user_id IS NULL OR NEW.platform_user_id = '' THEN RETURN NEW; END IF;
  IF NEW.text = '__post_stub__' THEN RETURN NEW; END IF;

  -- 1) Match por platform_user_id exato
  SELECT sp.supporter_id, sp.id INTO v_supporter_id, v_profile_id
  FROM supporter_profiles sp
  WHERE sp.platform = NEW.platform AND sp.platform_user_id = NEW.platform_user_id
  LIMIT 1;

  -- 2) Fallback: por username
  IF v_supporter_id IS NULL AND NEW.author_name IS NOT NULL THEN
    SELECT sp.supporter_id, sp.id INTO v_supporter_id, v_profile_id
    FROM supporter_profiles sp
    WHERE sp.platform = NEW.platform
      AND LOWER(TRIM(BOTH '@' FROM COALESCE(sp.platform_username, ''))) = LOWER(TRIM(BOTH '@' FROM NEW.platform_user_id))
    LIMIT 1;
  END IF;

  -- 3) NOVO Fallback: por NOME normalizado
  IF v_supporter_id IS NULL AND NEW.author_name IS NOT NULL THEN
    v_norm_author := public.normalize_person_name(NEW.author_name);
    IF v_norm_author IS NOT NULL AND length(v_norm_author) >= 5 THEN
      SELECT s.id, sp.id INTO v_supporter_id, v_profile_id
      FROM supporters s
      JOIN supporter_profiles sp ON sp.supporter_id = s.id AND sp.platform = NEW.platform
      WHERE s.client_id = NEW.client_id
        AND public.normalize_person_name(s.name) = v_norm_author
      ORDER BY
        CASE WHEN sp.platform_user_id IS NULL OR sp.platform_user_id !~ '^\d+$' THEN 0 ELSE 1 END,
        sp.created_at ASC
      LIMIT 1;

      IF v_profile_id IS NOT NULL THEN
        UPDATE supporter_profiles
        SET platform_user_id = NEW.platform_user_id,
            platform_username = COALESCE(NEW.author_name, platform_username)
        WHERE id = v_profile_id
          AND (platform_user_id IS DISTINCT FROM NEW.platform_user_id);
      END IF;
    END IF;
  END IF;

  IF v_supporter_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM pessoas WHERE supporter_id = v_supporter_id
    UNION ALL SELECT 1 FROM funcionarios WHERE supporter_id = v_supporter_id
    UNION ALL SELECT 1 FROM supporter_accounts WHERE supporter_id = v_supporter_id
  ) INTO v_is_registered;

  IF NOT v_is_registered THEN
    RETURN NEW;
  END IF;

  INSERT INTO engagement_actions (
    client_id, supporter_id, platform, platform_user_id, platform_username,
    action_type, comment_id, post_id, action_date
  ) VALUES (
    NEW.client_id, v_supporter_id, COALESCE(NEW.platform, 'facebook'),
    NEW.platform_user_id, NEW.author_name, 'comment',
    NEW.comment_id, NEW.post_id,
    COALESCE(NEW.comment_created_time, NEW.created_at, NOW())
  ) ON CONFLICT DO NOTHING;

  PERFORM calculate_engagement_score(v_supporter_id);
  RETURN NEW;
END;
$$;

-- =========================================================================
-- link_orphan_engagement_actions com fallback por nome
-- =========================================================================
CREATE OR REPLACE FUNCTION public.link_orphan_engagement_actions(p_client_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_linked INTEGER := 0;
  v_step INTEGER := 0;
BEGIN
  -- Match 1: por platform_user_id exato
  UPDATE engagement_actions ea
  SET supporter_id = sp.supporter_id
  FROM supporter_profiles sp
  WHERE ea.client_id = p_client_id
    AND ea.supporter_id IS NULL
    AND ea.platform_user_id IS NOT NULL
    AND sp.platform = ea.platform
    AND sp.platform_user_id = ea.platform_user_id;
  GET DIAGNOSTICS v_step = ROW_COUNT;
  v_linked := v_linked + v_step;

  -- Match 2: por platform_username
  UPDATE engagement_actions ea
  SET supporter_id = sp.supporter_id
  FROM supporter_profiles sp
  WHERE ea.client_id = p_client_id
    AND ea.supporter_id IS NULL
    AND ea.platform_username IS NOT NULL
    AND sp.platform = ea.platform
    AND sp.platform_username IS NOT NULL
    AND LOWER(TRIM(BOTH '@' FROM sp.platform_username)) = LOWER(TRIM(BOTH '@' FROM ea.platform_username));
  GET DIAGNOSTICS v_step = ROW_COUNT;
  v_linked := v_linked + v_step;

  -- Match 3 (NOVO): por NOME normalizado, promovendo o ID real
  WITH cand AS (
    SELECT DISTINCT
      ea.platform,
      ea.platform_user_id,
      ea.platform_username,
      public.normalize_person_name(ea.platform_username) AS norm_name
    FROM engagement_actions ea
    WHERE ea.client_id = p_client_id
      AND ea.supporter_id IS NULL
      AND ea.platform_user_id IS NOT NULL
      AND ea.platform_username IS NOT NULL
      AND length(coalesce(ea.platform_username,'')) >= 5
  ),
  matches AS (
    SELECT DISTINCT ON (sp.id)
      sp.id AS profile_id,
      c.platform_user_id AS new_user_id,
      c.platform_username AS new_username
    FROM cand c
    JOIN supporters s
      ON s.client_id = p_client_id
     AND public.normalize_person_name(s.name) = c.norm_name
    JOIN supporter_profiles sp
      ON sp.supporter_id = s.id
     AND sp.platform = c.platform
    ORDER BY sp.id,
             CASE WHEN sp.platform_user_id IS NULL OR sp.platform_user_id !~ '^\d+$' THEN 0 ELSE 1 END
  )
  UPDATE supporter_profiles sp
  SET platform_user_id = m.new_user_id,
      platform_username = COALESCE(m.new_username, sp.platform_username)
  FROM matches m
  WHERE sp.id = m.profile_id
    AND sp.platform_user_id IS DISTINCT FROM m.new_user_id;

  -- Religar engagement_actions órfãs após promoção
  UPDATE engagement_actions ea
  SET supporter_id = sp.supporter_id
  FROM supporter_profiles sp
  WHERE ea.client_id = p_client_id
    AND ea.supporter_id IS NULL
    AND ea.platform_user_id IS NOT NULL
    AND sp.platform = ea.platform
    AND sp.platform_user_id = ea.platform_user_id;
  GET DIAGNOSTICS v_step = ROW_COUNT;
  v_linked := v_linked + v_step;

  -- Atualiza last_interaction_date
  UPDATE supporters s
  SET last_interaction_date = sub.max_date,
      updated_at = NOW()
  FROM (
    SELECT ea.supporter_id, MAX(ea.action_date) AS max_date
    FROM engagement_actions ea
    WHERE ea.client_id = p_client_id
      AND ea.supporter_id IS NOT NULL
    GROUP BY ea.supporter_id
  ) sub
  WHERE s.id = sub.supporter_id
    AND s.client_id = p_client_id
    AND (s.last_interaction_date IS NULL OR s.last_interaction_date < sub.max_date);

  -- Recalcula scores
  PERFORM calculate_engagement_score(s.id)
  FROM supporters s
  WHERE s.client_id = p_client_id;

  RETURN v_linked;
END;
$function$;