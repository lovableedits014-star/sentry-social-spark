CREATE OR REPLACE FUNCTION public.ensure_pessoa_from_supporter()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  extracted_phone text;
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.pessoas WHERE supporter_id = NEW.id
  ) THEN
    RETURN NEW;
  END IF;

  extracted_phone := NULLIF(regexp_replace(COALESCE(substring(NEW.notes from 'Tel: ([^|]+)'), ''), '\s+$', ''), '');

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
    extracted_phone,
    'apoiador'::public.tipo_pessoa,
    'apoiador'::public.nivel_apoio,
    'formulario'::public.origem_contato,
    NEW.id,
    NEW.notes
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'ensure_pessoa_from_supporter failed for supporter %, error: %, state: %', NEW.id, SQLERRM, SQLSTATE;
  RAISE;
END;
$$;

DROP TRIGGER IF EXISTS ensure_pessoa_from_supporter_on_insert ON public.supporters;

CREATE TRIGGER ensure_pessoa_from_supporter_on_insert
AFTER INSERT ON public.supporters
FOR EACH ROW
EXECUTE FUNCTION public.ensure_pessoa_from_supporter();