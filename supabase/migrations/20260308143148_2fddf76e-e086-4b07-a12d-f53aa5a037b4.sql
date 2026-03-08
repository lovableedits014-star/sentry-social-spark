
-- Add supporter_id to pessoas so we can link them
ALTER TABLE public.pessoas ADD COLUMN IF NOT EXISTS supporter_id uuid REFERENCES public.supporters(id) ON DELETE SET NULL;

-- Update the register function to also create supporter + supporter_profiles
CREATE OR REPLACE FUNCTION public.register_pessoa_public(
  p_client_id uuid,
  p_nome text,
  p_telefone text,
  p_email text DEFAULT NULL,
  p_cidade text DEFAULT NULL,
  p_bairro text DEFAULT NULL,
  p_endereco text DEFAULT NULL,
  p_tipo_pessoa tipo_pessoa DEFAULT 'cidadao',
  p_notas text DEFAULT NULL,
  p_socials jsonb DEFAULT '[]'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pessoa_id uuid;
  v_supporter_id uuid;
  v_social jsonb;
  v_has_socials boolean;
BEGIN
  -- Verify client exists
  IF NOT EXISTS (SELECT 1 FROM clients WHERE id = p_client_id) THEN
    RAISE EXCEPTION 'Client not found';
  END IF;

  v_has_socials := (jsonb_array_length(p_socials) > 0);

  -- Create supporter record if there are social profiles to track
  IF v_has_socials THEN
    INSERT INTO supporters (
      client_id, name, classification, first_contact_date, engagement_score
    ) VALUES (
      p_client_id, p_nome, 'neutro', NOW(), 0
    )
    RETURNING id INTO v_supporter_id;

    -- Create supporter_profiles for engagement matching
    FOR v_social IN SELECT * FROM jsonb_array_elements(p_socials)
    LOOP
      INSERT INTO supporter_profiles (
        supporter_id, platform, platform_user_id, platform_username
      ) VALUES (
        v_supporter_id,
        v_social->>'plataforma',
        v_social->>'usuario',  -- used as ID for matching
        v_social->>'usuario'   -- also as username for fuzzy matching
      );
    END LOOP;
  END IF;

  -- Insert pessoa
  INSERT INTO pessoas (
    client_id, nome, telefone, email, cidade, bairro, endereco,
    tipo_pessoa, nivel_apoio, origem_contato, notas_internas, supporter_id
  ) VALUES (
    p_client_id, p_nome, p_telefone, p_email, p_cidade, p_bairro, p_endereco,
    p_tipo_pessoa, 'simpatizante', 'formulario', p_notas, v_supporter_id
  )
  RETURNING id INTO v_pessoa_id;

  -- Insert pessoa_social records
  FOR v_social IN SELECT * FROM jsonb_array_elements(p_socials)
  LOOP
    INSERT INTO pessoa_social (pessoa_id, plataforma, usuario, url_perfil)
    VALUES (
      v_pessoa_id,
      v_social->>'plataforma',
      v_social->>'usuario',
      v_social->>'url_perfil'
    );
  END LOOP;

  RETURN v_pessoa_id;
END;
$$;
