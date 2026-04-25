-- 1. Remover unique constraint em client_id (permite múltiplas instâncias)
ALTER TABLE public.whatsapp_instances 
  DROP CONSTRAINT IF EXISTS whatsapp_instances_client_id_key;

-- 2. Adicionar coluna is_primary
ALTER TABLE public.whatsapp_instances 
  ADD COLUMN IF NOT EXISTS is_primary BOOLEAN NOT NULL DEFAULT false;

-- 3. Garantir que a primeira instância existente de cada client vire principal
UPDATE public.whatsapp_instances wi
SET is_primary = true
WHERE wi.id IN (
  SELECT DISTINCT ON (client_id) id
  FROM public.whatsapp_instances
  ORDER BY client_id, created_at ASC
)
AND NOT EXISTS (
  SELECT 1 FROM public.whatsapp_instances wi2
  WHERE wi2.client_id = wi.client_id AND wi2.is_primary = true
);

-- 4. Índice único parcial: apenas 1 principal por cliente
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_instances_one_primary_per_client
  ON public.whatsapp_instances (client_id)
  WHERE is_primary = true;

-- 5. Trigger: ao marcar uma instância como principal, desmarca as outras do mesmo client
CREATE OR REPLACE FUNCTION public.ensure_single_primary_whatsapp_instance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_primary = true THEN
    UPDATE public.whatsapp_instances
    SET is_primary = false
    WHERE client_id = NEW.client_id
      AND id <> NEW.id
      AND is_primary = true;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ensure_single_primary_whatsapp ON public.whatsapp_instances;
CREATE TRIGGER trg_ensure_single_primary_whatsapp
  BEFORE INSERT OR UPDATE OF is_primary ON public.whatsapp_instances
  FOR EACH ROW
  WHEN (NEW.is_primary = true)
  EXECUTE FUNCTION public.ensure_single_primary_whatsapp_instance();

-- 6. Trigger: se a primária for deletada, promove a mais antiga restante
CREATE OR REPLACE FUNCTION public.promote_next_primary_whatsapp_instance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.is_primary = true THEN
    UPDATE public.whatsapp_instances
    SET is_primary = true
    WHERE id = (
      SELECT id FROM public.whatsapp_instances
      WHERE client_id = OLD.client_id
      ORDER BY created_at ASC
      LIMIT 1
    );
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_promote_next_primary_whatsapp ON public.whatsapp_instances;
CREATE TRIGGER trg_promote_next_primary_whatsapp
  AFTER DELETE ON public.whatsapp_instances
  FOR EACH ROW
  EXECUTE FUNCTION public.promote_next_primary_whatsapp_instance();