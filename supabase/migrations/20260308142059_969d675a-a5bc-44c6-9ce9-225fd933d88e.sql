
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
  v_social jsonb;
BEGIN
  -- Verify client exists
  IF NOT EXISTS (SELECT 1 FROM clients WHERE id = p_client_id) THEN
    RAISE EXCEPTION 'Client not found';
  END IF;

  -- Insert pessoa
  INSERT INTO pessoas (
    client_id, nome, telefone, email, cidade, bairro, endereco,
    tipo_pessoa, nivel_apoio, origem_contato, notas_internas
  ) VALUES (
    p_client_id, p_nome, p_telefone, p_email, p_cidade, p_bairro, p_endereco,
    p_tipo_pessoa, 'simpatizante', 'formulario', p_notas
  )
  RETURNING id INTO v_pessoa_id;

  -- Insert social profiles
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
