-- 1) Backfill: copiar cidade, bairro e e-mail de supporter_accounts para pessoas
UPDATE public.pessoas p
SET 
  cidade = COALESCE(p.cidade, sa.city),
  bairro = COALESCE(p.bairro, sa.neighborhood),
  email = COALESCE(p.email, sa.email),
  updated_at = now()
FROM public.supporter_accounts sa
WHERE p.supporter_id = sa.supporter_id
  AND (
    (p.cidade IS NULL AND sa.city IS NOT NULL)
    OR (p.bairro IS NULL AND sa.neighborhood IS NOT NULL)
    OR (p.email IS NULL AND sa.email IS NOT NULL)
  );

-- 2) Trigger no supporter_accounts: ao criar/atualizar conta, sincroniza pessoa
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
    updated_at = now()
  WHERE supporter_id = NEW.supporter_id
    AND (
      (cidade IS NULL AND NEW.city IS NOT NULL)
      OR (bairro IS NULL AND NEW.neighborhood IS NOT NULL)
      OR (email IS NULL AND NEW.email IS NOT NULL)
    );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'sync_pessoa_from_supporter_account failed for account %, error: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_pessoa_from_supporter_account_trigger ON public.supporter_accounts;
CREATE TRIGGER sync_pessoa_from_supporter_account_trigger
AFTER INSERT OR UPDATE OF city, neighborhood, email, supporter_id
ON public.supporter_accounts
FOR EACH ROW
EXECUTE FUNCTION public.sync_pessoa_from_supporter_account();