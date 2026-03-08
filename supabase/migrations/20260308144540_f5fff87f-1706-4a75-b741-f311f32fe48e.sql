
CREATE OR REPLACE FUNCTION public.ensure_pessoa_supporter()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pessoa RECORD;
  v_supporter_id uuid;
BEGIN
  -- Get the pessoa record
  SELECT * INTO v_pessoa FROM pessoas WHERE id = NEW.pessoa_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  -- If pessoa already has a supporter, just add the profile
  IF v_pessoa.supporter_id IS NOT NULL THEN
    INSERT INTO supporter_profiles (supporter_id, platform, platform_user_id, platform_username)
    VALUES (v_pessoa.supporter_id, NEW.plataforma, COALESCE(NEW.usuario, ''), NEW.usuario)
    ON CONFLICT DO NOTHING;
    RETURN NEW;
  END IF;

  -- Create supporter
  INSERT INTO supporters (client_id, name, classification, first_contact_date, engagement_score)
  VALUES (v_pessoa.client_id, v_pessoa.nome, 'neutro', NOW(), 0)
  RETURNING id INTO v_supporter_id;

  -- Link to pessoa
  UPDATE pessoas SET supporter_id = v_supporter_id WHERE id = NEW.pessoa_id;

  -- Create supporter profile
  INSERT INTO supporter_profiles (supporter_id, platform, platform_user_id, platform_username)
  VALUES (v_supporter_id, NEW.plataforma, COALESCE(NEW.usuario, ''), NEW.usuario);

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_ensure_pessoa_supporter
  AFTER INSERT ON pessoa_social
  FOR EACH ROW
  EXECUTE FUNCTION ensure_pessoa_supporter();
