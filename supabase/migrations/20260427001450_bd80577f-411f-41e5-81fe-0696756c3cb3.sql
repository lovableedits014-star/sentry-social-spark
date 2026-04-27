-- 1) Trigger de normalização de localidade em supporter_accounts
CREATE OR REPLACE FUNCTION public.normalize_supporter_locality()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.city IS NOT NULL THEN
    NEW.city := public.normalize_locality(NEW.city);
  END IF;
  IF NEW.neighborhood IS NOT NULL THEN
    NEW.neighborhood := public.normalize_locality(NEW.neighborhood);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_locality_supporter_accounts ON public.supporter_accounts;
CREATE TRIGGER trg_normalize_locality_supporter_accounts
BEFORE INSERT OR UPDATE OF city, neighborhood ON public.supporter_accounts
FOR EACH ROW
EXECUTE FUNCTION public.normalize_supporter_locality();

-- 2) Policy: dono do client pode atualizar/excluir supporter_accounts da sua campanha
DROP POLICY IF EXISTS "Client owner can update supporter_accounts" ON public.supporter_accounts;
CREATE POLICY "Client owner can update supporter_accounts"
ON public.supporter_accounts
FOR UPDATE
TO authenticated
USING (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = supporter_accounts.client_id AND c.user_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = supporter_accounts.client_id AND c.user_id = auth.uid()));

DROP POLICY IF EXISTS "Client owner can select supporter_accounts" ON public.supporter_accounts;
CREATE POLICY "Client owner can select supporter_accounts"
ON public.supporter_accounts
FOR SELECT
TO authenticated
USING (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = supporter_accounts.client_id AND c.user_id = auth.uid()));

-- 3) Reaplica normalização nos registros existentes
UPDATE public.supporter_accounts
SET city = public.normalize_locality(city)
WHERE city IS NOT NULL AND city <> public.normalize_locality(city);

UPDATE public.supporter_accounts
SET neighborhood = public.normalize_locality(neighborhood)
WHERE neighborhood IS NOT NULL AND neighborhood <> public.normalize_locality(neighborhood);
