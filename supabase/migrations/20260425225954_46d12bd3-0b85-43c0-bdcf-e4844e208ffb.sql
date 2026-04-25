CREATE OR REPLACE FUNCTION public.whatsapp_phone_variants(p_phone text)
RETURNS text[]
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_digits text;
  v_no_country text;
  v_variants text[] := ARRAY[]::text[];
BEGIN
  v_digits := regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g');

  IF v_digits = '' THEN
    RETURN ARRAY[]::text[];
  END IF;

  v_variants := array_append(v_variants, v_digits);

  IF left(v_digits, 2) = '55' AND length(v_digits) > 11 THEN
    v_no_country := substring(v_digits from 3);
    v_variants := array_append(v_variants, v_no_country);
  ELSE
    v_no_country := v_digits;
    IF length(v_no_country) >= 10 THEN
      v_variants := array_append(v_variants, '55' || v_no_country);
    END IF;
  END IF;

  IF length(v_no_country) = 11 AND substring(v_no_country from 3 for 1) = '9' THEN
    v_variants := array_append(v_variants, substring(v_no_country from 1 for 2) || substring(v_no_country from 4));
    v_variants := array_append(v_variants, '55' || substring(v_no_country from 1 for 2) || substring(v_no_country from 4));
  ELSIF length(v_no_country) = 10 THEN
    v_variants := array_append(v_variants, substring(v_no_country from 1 for 2) || '9' || substring(v_no_country from 3));
    v_variants := array_append(v_variants, '55' || substring(v_no_country from 1 for 2) || '9' || substring(v_no_country from 3));
  END IF;

  RETURN ARRAY(SELECT DISTINCT v FROM unnest(v_variants) AS v WHERE length(v) >= 10);
END;
$$;

CREATE OR REPLACE FUNCTION public.confirm_whatsapp_by_phone(p_client_id uuid, p_phone text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_digits text;
  v_variants text[];
  v_pessoa_count int := 0;
  v_account_count int := 0;
  v_func_count int := 0;
  v_contr_count int := 0;
BEGIN
  v_digits := regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g');
  v_variants := public.whatsapp_phone_variants(p_phone);

  IF COALESCE(array_length(v_variants, 1), 0) = 0 THEN
    RETURN jsonb_build_object('matched', false, 'reason', 'phone too short');
  END IF;

  WITH updated AS (
    UPDATE pessoas
    SET whatsapp_confirmado = true, updated_at = NOW()
    WHERE client_id = p_client_id
      AND whatsapp_confirmado = false
      AND telefone IS NOT NULL
      AND public.whatsapp_phone_variants(telefone) && v_variants
    RETURNING id
  )
  SELECT COUNT(*) INTO v_pessoa_count FROM updated;

  IF v_pessoa_count > 0 THEN
    INSERT INTO interacoes_pessoa (client_id, pessoa_id, tipo_interacao, descricao, criado_por)
    SELECT p_client_id, p.id, 'whatsapp',
           'WhatsApp confirmado automaticamente — mensagem recebida no número oficial.',
           '00000000-0000-0000-0000-000000000000'::uuid
    FROM pessoas p
    WHERE p.client_id = p_client_id
      AND p.telefone IS NOT NULL
      AND public.whatsapp_phone_variants(p.telefone) && v_variants
      AND p.whatsapp_confirmado = true;
  END IF;

  UPDATE supporter_accounts sa
  SET whatsapp_confirmado = true, updated_at = NOW()
  WHERE sa.client_id = p_client_id
    AND sa.whatsapp_confirmado = false
    AND EXISTS (
      SELECT 1 FROM pessoas p
      WHERE p.client_id = p_client_id
        AND p.supporter_id = sa.supporter_id
        AND p.telefone IS NOT NULL
        AND public.whatsapp_phone_variants(p.telefone) && v_variants
    );
  GET DIAGNOSTICS v_account_count = ROW_COUNT;

  UPDATE funcionarios
  SET whatsapp_confirmado = true, updated_at = NOW()
  WHERE client_id = p_client_id
    AND whatsapp_confirmado = false
    AND telefone IS NOT NULL
    AND public.whatsapp_phone_variants(telefone) && v_variants;
  GET DIAGNOSTICS v_func_count = ROW_COUNT;

  UPDATE contratados
  SET whatsapp_confirmado = true, updated_at = NOW()
  WHERE client_id = p_client_id
    AND whatsapp_confirmado = false
    AND telefone IS NOT NULL
    AND public.whatsapp_phone_variants(telefone) && v_variants;
  GET DIAGNOSTICS v_contr_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'matched', (v_pessoa_count + v_account_count + v_func_count + v_contr_count) > 0,
    'phone_normalized', v_digits,
    'phone_variants', v_variants,
    'pessoas_updated', v_pessoa_count,
    'supporter_accounts_updated', v_account_count,
    'funcionarios_updated', v_func_count,
    'contratados_updated', v_contr_count
  );
END;
$$;