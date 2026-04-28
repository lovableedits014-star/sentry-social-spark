-- Endurece o trigger para só criar 'pessoa' a partir de um supporter
-- quando houver dados mínimos (telefone). Isso impede cadastros fantasma
-- gerados por login social (Google) quando o usuário não preenche o formulário.

CREATE OR REPLACE FUNCTION public.ensure_pessoa_from_supporter()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  extracted_phone text;
  v_phone text;
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.pessoas WHERE supporter_id = NEW.id
  ) THEN
    RETURN NEW;
  END IF;

  -- Tenta extrair telefone das notas no formato "Tel: ..."
  extracted_phone := NULLIF(regexp_replace(COALESCE(substring(NEW.notes from 'Tel: ([^|]+)'), ''), '\s+$', ''), '');

  -- Telefone efetivo: coluna `telefone` do supporter ou o extraído das notas
  v_phone := COALESCE(NULLIF(NEW.telefone, ''), extracted_phone);

  -- Sem telefone => não cria pessoa fantasma. O cadastro completo no
  -- formulário (SupporterRegister) ou na criação manual via CRM
  -- preencherá o telefone e disparará a criação corretamente.
  IF v_phone IS NULL OR length(public.only_digits(v_phone)) < 10 THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.pessoas (
    client_id,
    nome,
    telefone,
    tipo_pessoa,
    nivel_apoio,
    origem_contato,
    supporter_id,
    notas_internas
  ) VALUES (
    NEW.client_id,
    NEW.name,
    v_phone,
    'apoiador'::public.tipo_pessoa,
    'apoiador'::public.nivel_apoio,
    'formulario'::public.origem_contato,
    NEW.id,
    NEW.notes
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'ensure_pessoa_from_supporter failed for supporter %, error: %, state: %', NEW.id, SQLERRM, SQLSTATE;
  RETURN NEW;  -- não bloqueia a criação do supporter por causa disso
END;
$function$;