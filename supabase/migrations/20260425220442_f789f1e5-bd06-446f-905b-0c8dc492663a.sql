CREATE OR REPLACE FUNCTION public.confirm_whatsapp_by_phone(
  p_client_id uuid,
  p_phone text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_digits text;
  v_last10 text;
  v_pessoa_count int := 0;
  v_account_count int := 0;
  v_func_count int := 0;
  v_contr_count int := 0;
BEGIN
  v_digits := regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g');
  IF length(v_digits) < 10 THEN
    RETURN jsonb_build_object('matched', false, 'reason', 'phone too short');
  END IF;
  v_last10 := right(v_digits, 10);

  WITH updated AS (
    UPDATE pessoas
    SET whatsapp_confirmado = true, updated_at = NOW()
    WHERE client_id = p_client_id
      AND whatsapp_confirmado = false
      AND telefone IS NOT NULL
      AND right(regexp_replace(telefone, '\D', '', 'g'), 10) = v_last10
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
      AND right(regexp_replace(p.telefone, '\D', '', 'g'), 10) = v_last10
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
        AND right(regexp_replace(p.telefone, '\D', '', 'g'), 10) = v_last10
    );
  GET DIAGNOSTICS v_account_count = ROW_COUNT;

  UPDATE funcionarios
  SET whatsapp_confirmado = true, updated_at = NOW()
  WHERE client_id = p_client_id
    AND whatsapp_confirmado = false
    AND telefone IS NOT NULL
    AND right(regexp_replace(telefone, '\D', '', 'g'), 10) = v_last10;
  GET DIAGNOSTICS v_func_count = ROW_COUNT;

  UPDATE contratados
  SET whatsapp_confirmado = true, updated_at = NOW()
  WHERE client_id = p_client_id
    AND whatsapp_confirmado = false
    AND telefone IS NOT NULL
    AND right(regexp_replace(telefone, '\D', '', 'g'), 10) = v_last10;
  GET DIAGNOSTICS v_contr_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'matched', (v_pessoa_count + v_account_count + v_func_count + v_contr_count) > 0,
    'phone_normalized', v_last10,
    'pessoas_updated', v_pessoa_count,
    'supporter_accounts_updated', v_account_count,
    'funcionarios_updated', v_func_count,
    'contratados_updated', v_contr_count
  );
END;
$$;