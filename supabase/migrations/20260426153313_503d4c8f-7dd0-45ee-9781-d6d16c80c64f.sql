
-- ============================================================
-- 1. Função de normalização de telefone (Brasil)
-- ============================================================
CREATE OR REPLACE FUNCTION public.normalize_br_phone(p_raw text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  digits text;
  ddd text;
  local_part text;
BEGIN
  IF p_raw IS NULL THEN RETURN NULL; END IF;
  digits := regexp_replace(p_raw, '\D', '', 'g');
  IF digits = '' THEN RETURN NULL; END IF;

  -- Remove DDI 55 se presente
  IF length(digits) = 13 AND left(digits, 2) = '55' THEN
    digits := substring(digits from 3);
  ELSIF length(digits) = 12 AND left(digits, 2) = '55' THEN
    digits := substring(digits from 3);
  END IF;

  -- Agora deve ter 10 (fixo) ou 11 (celular) dígitos
  IF length(digits) NOT IN (10, 11) THEN
    -- formato inválido — devolve só dígitos para não perder dado
    RETURN digits;
  END IF;

  ddd := left(digits, 2);
  local_part := substring(digits from 3);

  -- Garante 9 na frente para celular (8 dígitos -> 9)
  IF length(local_part) = 8 AND left(local_part, 1) IN ('6','7','8','9') THEN
    local_part := '9' || local_part;
  END IF;

  RETURN '55' || ddd || local_part;
END;
$$;

-- ============================================================
-- 2. Trigger genérico para normalizar telefone em INSERT/UPDATE
-- ============================================================
CREATE OR REPLACE FUNCTION public.trg_normalize_telefone()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.telefone IS NOT NULL THEN
    NEW.telefone := public.normalize_br_phone(NEW.telefone);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS normalize_telefone_pessoas ON public.pessoas;
CREATE TRIGGER normalize_telefone_pessoas
BEFORE INSERT OR UPDATE OF telefone ON public.pessoas
FOR EACH ROW EXECUTE FUNCTION public.trg_normalize_telefone();

DROP TRIGGER IF EXISTS normalize_telefone_funcionarios ON public.funcionarios;
CREATE TRIGGER normalize_telefone_funcionarios
BEFORE INSERT OR UPDATE OF telefone ON public.funcionarios
FOR EACH ROW EXECUTE FUNCTION public.trg_normalize_telefone();

DROP TRIGGER IF EXISTS normalize_telefone_contratados ON public.contratados;
CREATE TRIGGER normalize_telefone_contratados
BEFORE INSERT OR UPDATE OF telefone ON public.contratados
FOR EACH ROW EXECUTE FUNCTION public.trg_normalize_telefone();

-- ============================================================
-- 3. Backfill: normaliza telefones existentes
-- ============================================================
UPDATE public.pessoas SET telefone = public.normalize_br_phone(telefone)
WHERE telefone IS NOT NULL AND telefone <> public.normalize_br_phone(telefone);

UPDATE public.funcionarios SET telefone = public.normalize_br_phone(telefone)
WHERE telefone IS NOT NULL AND telefone <> public.normalize_br_phone(telefone);

UPDATE public.contratados SET telefone = public.normalize_br_phone(telefone)
WHERE telefone IS NOT NULL AND telefone <> public.normalize_br_phone(telefone);

-- ============================================================
-- 4. Auto-resume de disparos pausados via pg_cron
--    Marca disparos "pausado_timeout" mais antigos que 30s para retomada
--    e invoca a edge function send-whatsapp-dispatch em modo resume.
-- ============================================================
-- Garantir extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Função que dispara o resume via HTTP
CREATE OR REPLACE FUNCTION public.resume_paused_whatsapp_dispatches()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  v_url text;
  v_key text;
BEGIN
  -- Lê config (mesmo padrão usado em outros cron jobs do projeto)
  SELECT value INTO v_url FROM public.platform_config WHERE key = 'supabase_url';
  SELECT value INTO v_key FROM public.platform_config WHERE key = 'service_role_key';

  IF v_url IS NULL OR v_key IS NULL THEN
    RAISE NOTICE 'platform_config supabase_url/service_role_key ausente — resume desativado';
    RETURN;
  END IF;

  FOR r IN
    SELECT id FROM public.whatsapp_dispatches
    WHERE status = 'pausado_timeout'
      AND (paused_until IS NULL OR paused_until <= now())
    ORDER BY created_at ASC
    LIMIT 5
  LOOP
    -- marca como "enviando" antes pra evitar dupla execução
    UPDATE public.whatsapp_dispatches
       SET status = 'enviando', updated_at = now()
     WHERE id = r.id AND status = 'pausado_timeout';

    PERFORM net.http_post(
      url := v_url || '/functions/v1/send-whatsapp-dispatch',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_key
      ),
      body := jsonb_build_object('resume_dispatch_id', r.id)
    );
  END LOOP;
END;
$$;

-- Agenda cron job a cada minuto (remove anterior se existir)
DO $$
DECLARE
  jid bigint;
BEGIN
  SELECT jobid INTO jid FROM cron.job WHERE jobname = 'resume-whatsapp-dispatches';
  IF jid IS NOT NULL THEN
    PERFORM cron.unschedule(jid);
  END IF;
END $$;

SELECT cron.schedule(
  'resume-whatsapp-dispatches',
  '* * * * *',
  $$ SELECT public.resume_paused_whatsapp_dispatches(); $$
);
