-- Drop both old overloads to replace with single new version
DROP FUNCTION IF EXISTS public.register_pessoa_public(uuid, text, text, text, text, text, text, tipo_pessoa, text, jsonb);
DROP FUNCTION IF EXISTS public.register_pessoa_public(uuid, text, text, text, text, text, text, tipo_pessoa, text, jsonb, date);

CREATE OR REPLACE FUNCTION public.register_pessoa_public(
  p_client_id uuid,
  p_nome text,
  p_telefone text,
  p_email text DEFAULT NULL,
  p_cidade text DEFAULT NULL,
  p_bairro text DEFAULT NULL,
  p_endereco text DEFAULT NULL,
  p_tipo_pessoa tipo_pessoa DEFAULT 'cidadao'::tipo_pessoa,
  p_notas text DEFAULT NULL,
  p_socials jsonb DEFAULT '[]'::jsonb,
  p_data_nascimento date DEFAULT NULL,
  p_cpf text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_pessoa_id uuid;
  v_supporter_id uuid;
  v_social jsonb;
  v_has_socials boolean;
  v_cpf text;
  v_telefone text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM clients WHERE id = p_client_id) THEN
    RAISE EXCEPTION 'Client not found';
  END IF;

  v_cpf := public.only_digits(p_cpf);
  v_telefone := public.only_digits(p_telefone);

  IF v_cpf IS NOT NULL AND NOT public.is_valid_cpf(v_cpf) THEN
    RAISE EXCEPTION 'CPF inválido. Verifique os dígitos informados.' USING ERRCODE = '23514';
  END IF;

  IF v_cpf IS NOT NULL AND EXISTS (
    SELECT 1 FROM pessoas WHERE client_id = p_client_id AND cpf = v_cpf
  ) THEN
    RAISE EXCEPTION 'Este CPF já está cadastrado.' USING ERRCODE = '23505';
  END IF;

  IF v_telefone IS NOT NULL AND EXISTS (
    SELECT 1 FROM pessoas WHERE client_id = p_client_id AND telefone = v_telefone
  ) THEN
    RAISE EXCEPTION 'Este telefone já está cadastrado.' USING ERRCODE = '23505';
  END IF;

  v_has_socials := (jsonb_array_length(p_socials) > 0);

  IF v_has_socials THEN
    INSERT INTO supporters (
      client_id, name, classification, first_contact_date, engagement_score
    ) VALUES (
      p_client_id, p_nome, 'neutro', NOW(), 0
    ) RETURNING id INTO v_supporter_id;

    FOR v_social IN SELECT * FROM jsonb_array_elements(p_socials) LOOP
      INSERT INTO supporter_profiles (
        supporter_id, platform, platform_user_id, platform_username
      ) VALUES (
        v_supporter_id,
        v_social->>'plataforma',
        v_social->>'usuario',
        v_social->>'usuario'
      );
    END LOOP;
  END IF;

  INSERT INTO pessoas (
    client_id, nome, telefone, email, cidade, bairro, endereco,
    tipo_pessoa, nivel_apoio, origem_contato, notas_internas, supporter_id,
    data_nascimento, cpf
  ) VALUES (
    p_client_id, p_nome, v_telefone, p_email, p_cidade, p_bairro, p_endereco,
    p_tipo_pessoa, 'simpatizante', 'formulario', p_notas, v_supporter_id,
    p_data_nascimento, v_cpf
  ) RETURNING id INTO v_pessoa_id;

  IF v_has_socials THEN
    FOR v_social IN SELECT * FROM jsonb_array_elements(p_socials) LOOP
      INSERT INTO pessoa_social (pessoa_id, plataforma, usuario, url_perfil)
      VALUES (
        v_pessoa_id,
        v_social->>'plataforma',
        v_social->>'usuario',
        v_social->>'url_perfil'
      );
    END LOOP;
  END IF;

  RETURN v_pessoa_id;
END;
$function$;