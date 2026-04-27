-- Adiciona campos no supporter_accounts (conta de login do apoiador)
ALTER TABLE public.supporter_accounts
  ADD COLUMN IF NOT EXISTS cpf text,
  ADD COLUMN IF NOT EXISTS birth_date date,
  ADD COLUMN IF NOT EXISTS endereco text;

-- Adiciona campos no supporters (entidade de engajamento)
ALTER TABLE public.supporters
  ADD COLUMN IF NOT EXISTS cpf text,
  ADD COLUMN IF NOT EXISTS telefone text,
  ADD COLUMN IF NOT EXISTS birth_date date,
  ADD COLUMN IF NOT EXISTS endereco text,
  ADD COLUMN IF NOT EXISTS cidade text,
  ADD COLUMN IF NOT EXISTS bairro text;

-- Trigger para normalizar/validar CPF e telefone em supporters
CREATE OR REPLACE FUNCTION public.normalize_supporter_dedup()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  NEW.cpf := public.only_digits(NEW.cpf);
  NEW.telefone := public.only_digits(NEW.telefone);
  IF NEW.cpf IS NOT NULL AND NOT public.is_valid_cpf(NEW.cpf) THEN
    RAISE EXCEPTION 'CPF inválido' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_supporter_dedup ON public.supporters;
CREATE TRIGGER trg_normalize_supporter_dedup
BEFORE INSERT OR UPDATE ON public.supporters
FOR EACH ROW EXECUTE FUNCTION public.normalize_supporter_dedup();

-- Índice único parcial para CPF por cliente (em supporter_accounts)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_supporter_accounts_client_cpf
  ON public.supporter_accounts (client_id, cpf)
  WHERE cpf IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_supporters_client_cpf
  ON public.supporters (client_id, cpf)
  WHERE cpf IS NOT NULL;
