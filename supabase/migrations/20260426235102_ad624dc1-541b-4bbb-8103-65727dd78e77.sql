-- Função para normalizar nomes de localidade (cidade/bairro)
-- Title Case mantendo acentos, colapsa espaços, trim
CREATE OR REPLACE FUNCTION public.normalize_locality(p_input text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_clean text;
  v_word text;
  v_result text := '';
  v_first boolean := true;
  v_lower text;
  -- Palavras que ficam minúsculas no meio do nome (preposições/artigos PT-BR)
  v_minor text[] := ARRAY['de','da','do','das','dos','e','a','o','as','os','di','du'];
BEGIN
  IF p_input IS NULL THEN RETURN NULL; END IF;
  v_clean := btrim(regexp_replace(p_input, '\s+', ' ', 'g'));
  IF v_clean = '' THEN RETURN NULL; END IF;

  FOR v_word IN SELECT unnest(string_to_array(v_clean, ' ')) LOOP
    v_lower := lower(v_word);
    IF NOT v_first AND v_lower = ANY(v_minor) THEN
      v_result := v_result || ' ' || v_lower;
    ELSE
      -- Capitaliza primeira letra, mantém o resto minúsculo (preserva acentos)
      v_result := v_result
        || CASE WHEN v_first THEN '' ELSE ' ' END
        || upper(substr(v_word, 1, 1))
        || lower(substr(v_word, 2));
    END IF;
    v_first := false;
  END LOOP;

  RETURN v_result;
END;
$$;

-- Trigger genérico aplicado a 4 tabelas
CREATE OR REPLACE FUNCTION public.trg_normalize_locality_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  NEW.cidade := public.normalize_locality(NEW.cidade);
  NEW.bairro := public.normalize_locality(NEW.bairro);
  RETURN NEW;
END;
$$;

-- pessoas
DROP TRIGGER IF EXISTS trg_normalize_locality_pessoas ON public.pessoas;
CREATE TRIGGER trg_normalize_locality_pessoas
BEFORE INSERT OR UPDATE OF cidade, bairro ON public.pessoas
FOR EACH ROW EXECUTE FUNCTION public.trg_normalize_locality_fields();

-- contratados
DROP TRIGGER IF EXISTS trg_normalize_locality_contratados ON public.contratados;
CREATE TRIGGER trg_normalize_locality_contratados
BEFORE INSERT OR UPDATE OF cidade, bairro ON public.contratados
FOR EACH ROW EXECUTE FUNCTION public.trg_normalize_locality_fields();

-- contratado_indicados
DROP TRIGGER IF EXISTS trg_normalize_locality_indicados ON public.contratado_indicados;
CREATE TRIGGER trg_normalize_locality_indicados
BEFORE INSERT OR UPDATE OF cidade, bairro ON public.contratado_indicados
FOR EACH ROW EXECUTE FUNCTION public.trg_normalize_locality_fields();

-- funcionarios
DROP TRIGGER IF EXISTS trg_normalize_locality_funcionarios ON public.funcionarios;
CREATE TRIGGER trg_normalize_locality_funcionarios
BEFORE INSERT OR UPDATE OF cidade, bairro ON public.funcionarios
FOR EACH ROW EXECUTE FUNCTION public.trg_normalize_locality_fields();

-- Limpeza retroativa: força recompute disparando os triggers
UPDATE public.pessoas
   SET cidade = cidade
 WHERE cidade IS NOT NULL
    OR bairro IS NOT NULL;

UPDATE public.contratados
   SET cidade = cidade
 WHERE cidade IS NOT NULL
    OR bairro IS NOT NULL;

UPDATE public.contratado_indicados
   SET cidade = cidade
 WHERE cidade IS NOT NULL
    OR bairro IS NOT NULL;

UPDATE public.funcionarios
   SET cidade = cidade
 WHERE cidade IS NOT NULL
    OR bairro IS NOT NULL;