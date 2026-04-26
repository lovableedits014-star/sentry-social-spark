-- Helper: keep only digits
CREATE OR REPLACE FUNCTION public.only_digits(input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE WHEN input IS NULL THEN NULL
              ELSE NULLIF(regexp_replace(input, '[^0-9]', '', 'g'), '')
         END;
$$;

-- Validate CPF (11 digits, not all the same, valid check digits)
CREATE OR REPLACE FUNCTION public.is_valid_cpf(cpf text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  d text;
  i int;
  sum1 int := 0;
  sum2 int := 0;
  dig1 int;
  dig2 int;
BEGIN
  IF cpf IS NULL THEN RETURN true; END IF;
  d := public.only_digits(cpf);
  IF d IS NULL OR length(d) <> 11 THEN RETURN false; END IF;
  IF d ~ '^(\d)\1{10}$' THEN RETURN false; END IF;
  FOR i IN 1..9 LOOP
    sum1 := sum1 + (substr(d, i, 1)::int) * (11 - i);
  END LOOP;
  dig1 := (sum1 * 10) % 11;
  IF dig1 = 10 THEN dig1 := 0; END IF;
  IF dig1 <> substr(d, 10, 1)::int THEN RETURN false; END IF;
  FOR i IN 1..10 LOOP
    sum2 := sum2 + (substr(d, i, 1)::int) * (12 - i);
  END LOOP;
  dig2 := (sum2 * 10) % 11;
  IF dig2 = 10 THEN dig2 := 0; END IF;
  RETURN dig2 = substr(d, 11, 1)::int;
END;
$$;

-- ============================================================
-- PESSOAS
-- ============================================================
ALTER TABLE public.pessoas ADD COLUMN IF NOT EXISTS cpf text;

CREATE OR REPLACE FUNCTION public.normalize_pessoa_dedup()
RETURNS trigger
LANGUAGE plpgsql
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

DROP TRIGGER IF EXISTS trg_normalize_pessoa_dedup ON public.pessoas;
CREATE TRIGGER trg_normalize_pessoa_dedup
BEFORE INSERT OR UPDATE ON public.pessoas
FOR EACH ROW EXECUTE FUNCTION public.normalize_pessoa_dedup();

CREATE UNIQUE INDEX IF NOT EXISTS pessoas_client_cpf_unique
  ON public.pessoas (client_id, cpf)
  WHERE cpf IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS pessoas_client_telefone_unique
  ON public.pessoas (client_id, telefone)
  WHERE telefone IS NOT NULL;

-- ============================================================
-- CONTRATADOS
-- ============================================================
ALTER TABLE public.contratados ADD COLUMN IF NOT EXISTS cpf text;

CREATE OR REPLACE FUNCTION public.normalize_contratado_dedup()
RETURNS trigger
LANGUAGE plpgsql
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

DROP TRIGGER IF EXISTS trg_normalize_contratado_dedup ON public.contratados;
CREATE TRIGGER trg_normalize_contratado_dedup
BEFORE INSERT OR UPDATE ON public.contratados
FOR EACH ROW EXECUTE FUNCTION public.normalize_contratado_dedup();

CREATE UNIQUE INDEX IF NOT EXISTS contratados_client_cpf_unique
  ON public.contratados (client_id, cpf)
  WHERE cpf IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS contratados_client_telefone_unique
  ON public.contratados (client_id, telefone)
  WHERE telefone IS NOT NULL;

-- ============================================================
-- FUNCIONARIOS
-- ============================================================
ALTER TABLE public.funcionarios ADD COLUMN IF NOT EXISTS cpf text;

CREATE OR REPLACE FUNCTION public.normalize_funcionario_dedup()
RETURNS trigger
LANGUAGE plpgsql
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

DROP TRIGGER IF EXISTS trg_normalize_funcionario_dedup ON public.funcionarios;
CREATE TRIGGER trg_normalize_funcionario_dedup
BEFORE INSERT OR UPDATE ON public.funcionarios
FOR EACH ROW EXECUTE FUNCTION public.normalize_funcionario_dedup();

CREATE UNIQUE INDEX IF NOT EXISTS funcionarios_client_cpf_unique
  ON public.funcionarios (client_id, cpf)
  WHERE cpf IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS funcionarios_client_telefone_unique
  ON public.funcionarios (client_id, telefone)
  WHERE telefone IS NOT NULL;

-- ============================================================
-- SUPPORTER_ACCOUNTS
-- ============================================================
ALTER TABLE public.supporter_accounts ADD COLUMN IF NOT EXISTS cpf text;

CREATE OR REPLACE FUNCTION public.normalize_supporter_account_dedup()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.cpf := public.only_digits(NEW.cpf);
  NEW.phone := public.only_digits(NEW.phone);
  IF NEW.cpf IS NOT NULL AND NOT public.is_valid_cpf(NEW.cpf) THEN
    RAISE EXCEPTION 'CPF inválido' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_supporter_account_dedup ON public.supporter_accounts;
CREATE TRIGGER trg_normalize_supporter_account_dedup
BEFORE INSERT OR UPDATE ON public.supporter_accounts
FOR EACH ROW EXECUTE FUNCTION public.normalize_supporter_account_dedup();

CREATE UNIQUE INDEX IF NOT EXISTS supporter_accounts_client_cpf_unique
  ON public.supporter_accounts (client_id, cpf)
  WHERE cpf IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS supporter_accounts_client_phone_unique
  ON public.supporter_accounts (client_id, phone)
  WHERE phone IS NOT NULL;

-- ============================================================
-- FUNCIONARIO_REFERRALS (normaliza telefone só)
-- ============================================================
CREATE OR REPLACE FUNCTION public.normalize_funcionario_referral_phone()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.referred_phone := public.only_digits(NEW.referred_phone);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_funcionario_referral_phone ON public.funcionario_referrals;
CREATE TRIGGER trg_normalize_funcionario_referral_phone
BEFORE INSERT OR UPDATE ON public.funcionario_referrals
FOR EACH ROW EXECUTE FUNCTION public.normalize_funcionario_referral_phone();