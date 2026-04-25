-- =========================================================================
-- 1) LIMPEZA: remover supporters não vinculados a nenhum cadastro
-- =========================================================================

-- IDs de supporters que ESTÃO vinculados (mantemos)
WITH linked AS (
  SELECT supporter_id FROM public.pessoas WHERE supporter_id IS NOT NULL
  UNION
  SELECT supporter_id FROM public.funcionarios WHERE supporter_id IS NOT NULL
  UNION
  SELECT supporter_id FROM public.supporter_accounts WHERE supporter_id IS NOT NULL
),
to_delete AS (
  SELECT id FROM public.supporters WHERE id NOT IN (SELECT supporter_id FROM linked)
)
DELETE FROM public.engagement_score_history WHERE supporter_id IN (SELECT id FROM to_delete);

WITH linked AS (
  SELECT supporter_id FROM public.pessoas WHERE supporter_id IS NOT NULL
  UNION SELECT supporter_id FROM public.funcionarios WHERE supporter_id IS NOT NULL
  UNION SELECT supporter_id FROM public.supporter_accounts WHERE supporter_id IS NOT NULL
)
DELETE FROM public.engagement_actions
WHERE supporter_id IS NOT NULL
  AND supporter_id NOT IN (SELECT supporter_id FROM linked);

-- Apaga ações órfãs (sem supporter)
DELETE FROM public.engagement_actions WHERE supporter_id IS NULL;

WITH linked AS (
  SELECT supporter_id FROM public.pessoas WHERE supporter_id IS NOT NULL
  UNION SELECT supporter_id FROM public.funcionarios WHERE supporter_id IS NOT NULL
  UNION SELECT supporter_id FROM public.supporter_accounts WHERE supporter_id IS NOT NULL
)
DELETE FROM public.supporter_profiles
WHERE supporter_id NOT IN (SELECT supporter_id FROM linked);

WITH linked AS (
  SELECT supporter_id FROM public.pessoas WHERE supporter_id IS NOT NULL
  UNION SELECT supporter_id FROM public.funcionarios WHERE supporter_id IS NOT NULL
  UNION SELECT supporter_id FROM public.supporter_accounts WHERE supporter_id IS NOT NULL
)
DELETE FROM public.supporters WHERE id NOT IN (SELECT supporter_id FROM linked);

-- =========================================================================
-- 2) NOVA REGRA: auto_create_engagement_action SÓ se houver vínculo
-- =========================================================================

CREATE OR REPLACE FUNCTION public.auto_create_engagement_action()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_supporter_id UUID;
  v_is_registered BOOLEAN := false;
BEGIN
  -- Pular comentários do próprio dono da página, stubs e sem user id
  IF NEW.is_page_owner = true THEN RETURN NEW; END IF;
  IF NEW.platform_user_id IS NULL OR NEW.platform_user_id = '' THEN RETURN NEW; END IF;
  IF NEW.text = '__post_stub__' THEN RETURN NEW; END IF;

  -- Tentar localizar supporter por platform_user_id
  SELECT sp.supporter_id INTO v_supporter_id
  FROM supporter_profiles sp
  WHERE sp.platform = NEW.platform AND sp.platform_user_id = NEW.platform_user_id
  LIMIT 1;

  -- Fallback: por username
  IF v_supporter_id IS NULL AND NEW.author_name IS NOT NULL THEN
    SELECT sp.supporter_id INTO v_supporter_id
    FROM supporter_profiles sp
    WHERE sp.platform = NEW.platform
      AND LOWER(TRIM(BOTH '@' FROM COALESCE(sp.platform_username, ''))) = LOWER(TRIM(BOTH '@' FROM NEW.platform_user_id))
    LIMIT 1;
  END IF;

  -- Se não achou supporter algum: IGNORAR (não rastreia desconhecidos)
  IF v_supporter_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Verificar se este supporter está vinculado a alguma entidade cadastrada
  SELECT EXISTS(
    SELECT 1 FROM pessoas WHERE supporter_id = v_supporter_id
    UNION ALL SELECT 1 FROM funcionarios WHERE supporter_id = v_supporter_id
    UNION ALL SELECT 1 FROM supporter_accounts WHERE supporter_id = v_supporter_id
  ) INTO v_is_registered;

  IF NOT v_is_registered THEN
    RETURN NEW; -- supporter solto: ignora
  END IF;

  -- Inserir engagement_action
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
-- 3) AUTO-CRIAR SUPPORTER ao cadastrar funcionário/contratado/conta
-- =========================================================================

-- Helper: garante supporter para um registro com redes_sociais (jsonb array)
CREATE OR REPLACE FUNCTION public.ensure_supporter_for_entity(
  p_client_id uuid, p_nome text, p_redes jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_supporter_id uuid;
  v_rede jsonb;
  v_plat text;
  v_user text;
BEGIN
  IF p_redes IS NULL OR jsonb_array_length(p_redes) = 0 THEN
    RETURN NULL;
  END IF;

  INSERT INTO supporters (client_id, name, classification, first_contact_date, engagement_score)
  VALUES (p_client_id, p_nome, 'neutro', NOW(), 0)
  RETURNING id INTO v_supporter_id;

  FOR v_rede IN SELECT * FROM jsonb_array_elements(p_redes) LOOP
    v_plat := COALESCE(v_rede->>'plataforma', v_rede->>'platform');
    v_user := COALESCE(v_rede->>'usuario', v_rede->>'username', v_rede->>'handle');
    IF v_plat IS NOT NULL AND v_user IS NOT NULL AND v_user <> '' THEN
      INSERT INTO supporter_profiles (supporter_id, platform, platform_user_id, platform_username)
      VALUES (v_supporter_id, v_plat, v_user, v_user)
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;

  RETURN v_supporter_id;
END;
$$;

-- Trigger funcionarios
CREATE OR REPLACE FUNCTION public.ensure_funcionario_supporter()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF NEW.supporter_id IS NULL AND NEW.redes_sociais IS NOT NULL
     AND jsonb_array_length(NEW.redes_sociais) > 0 THEN
    v_id := public.ensure_supporter_for_entity(NEW.client_id, NEW.nome, NEW.redes_sociais);
    NEW.supporter_id := v_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ensure_funcionario_supporter ON public.funcionarios;
CREATE TRIGGER trg_ensure_funcionario_supporter
  BEFORE INSERT OR UPDATE OF redes_sociais ON public.funcionarios
  FOR EACH ROW EXECUTE FUNCTION public.ensure_funcionario_supporter();

-- Trigger supporter_accounts (usa campos instagram_username / facebook_username)
CREATE OR REPLACE FUNCTION public.ensure_account_supporter()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id uuid;
  v_redes jsonb := '[]'::jsonb;
BEGIN
  IF NEW.supporter_id IS NOT NULL THEN RETURN NEW; END IF;

  IF NEW.instagram_username IS NOT NULL AND NEW.instagram_username <> '' THEN
    v_redes := v_redes || jsonb_build_object('plataforma','instagram','usuario',NEW.instagram_username);
  END IF;
  IF NEW.facebook_username IS NOT NULL AND NEW.facebook_username <> '' THEN
    v_redes := v_redes || jsonb_build_object('plataforma','facebook','usuario',NEW.facebook_username);
  END IF;

  IF jsonb_array_length(v_redes) > 0 THEN
    v_id := public.ensure_supporter_for_entity(NEW.client_id, NEW.name, v_redes);
    NEW.supporter_id := v_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ensure_account_supporter ON public.supporter_accounts;
CREATE TRIGGER trg_ensure_account_supporter
  BEFORE INSERT OR UPDATE OF instagram_username, facebook_username ON public.supporter_accounts
  FOR EACH ROW EXECUTE FUNCTION public.ensure_account_supporter();

-- =========================================================================
-- 4) BACKFILL: criar supporters faltantes para registros já existentes
-- =========================================================================

DO $$
DECLARE r RECORD; v_id uuid;
BEGIN
  -- Funcionarios
  FOR r IN SELECT id, client_id, nome, redes_sociais FROM funcionarios
           WHERE supporter_id IS NULL AND redes_sociais IS NOT NULL
             AND jsonb_array_length(redes_sociais) > 0
  LOOP
    v_id := public.ensure_supporter_for_entity(r.client_id, r.nome, r.redes_sociais);
    IF v_id IS NOT NULL THEN
      UPDATE funcionarios SET supporter_id = v_id WHERE id = r.id;
    END IF;
  END LOOP;

  -- Supporter accounts
  FOR r IN SELECT id, client_id, name, instagram_username, facebook_username FROM supporter_accounts
           WHERE supporter_id IS NULL
             AND ((instagram_username IS NOT NULL AND instagram_username <> '')
                  OR (facebook_username IS NOT NULL AND facebook_username <> ''))
  LOOP
    DECLARE v_redes jsonb := '[]'::jsonb;
    BEGIN
      IF r.instagram_username IS NOT NULL AND r.instagram_username <> '' THEN
        v_redes := v_redes || jsonb_build_object('plataforma','instagram','usuario',r.instagram_username);
      END IF;
      IF r.facebook_username IS NOT NULL AND r.facebook_username <> '' THEN
        v_redes := v_redes || jsonb_build_object('plataforma','facebook','usuario',r.facebook_username);
      END IF;
      v_id := public.ensure_supporter_for_entity(r.client_id, r.name, v_redes);
      IF v_id IS NOT NULL THEN
        UPDATE supporter_accounts SET supporter_id = v_id WHERE id = r.id;
      END IF;
    END;
  END LOOP;
END $$;