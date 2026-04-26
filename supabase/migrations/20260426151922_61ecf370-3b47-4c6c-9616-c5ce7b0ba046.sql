ALTER TABLE public.supporter_accounts ADD COLUMN IF NOT EXISTS phone text;

CREATE OR REPLACE FUNCTION public.sync_pessoa_from_supporter_account()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.supporter_id IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE public.pessoas
  SET 
    cidade = COALESCE(cidade, NEW.city),
    bairro = COALESCE(bairro, NEW.neighborhood),
    email = COALESCE(email, NEW.email),
    telefone = COALESCE(telefone, NULLIF(regexp_replace(COALESCE(NEW.phone,''), '\D', '', 'g'), '')),
    updated_at = now()
  WHERE supporter_id = NEW.supporter_id
    AND (
      (cidade IS NULL AND NEW.city IS NOT NULL)
      OR (bairro IS NULL AND NEW.neighborhood IS NOT NULL)
      OR (email IS NULL AND NEW.email IS NOT NULL)
      OR (telefone IS NULL AND NEW.phone IS NOT NULL)
    );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'sync_pessoa_from_supporter_account failed for account %, error: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_pessoa_from_supporter_account_trigger ON public.supporter_accounts;
CREATE TRIGGER sync_pessoa_from_supporter_account_trigger
AFTER INSERT OR UPDATE OF city, neighborhood, email, phone, supporter_id
ON public.supporter_accounts
FOR EACH ROW
EXECUTE FUNCTION public.sync_pessoa_from_supporter_account();