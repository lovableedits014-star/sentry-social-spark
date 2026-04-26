ALTER FUNCTION public.only_digits(text) SET search_path = public;
ALTER FUNCTION public.is_valid_cpf(text) SET search_path = public;
ALTER FUNCTION public.normalize_pessoa_dedup() SET search_path = public;
ALTER FUNCTION public.normalize_contratado_dedup() SET search_path = public;
ALTER FUNCTION public.normalize_funcionario_dedup() SET search_path = public;
ALTER FUNCTION public.normalize_supporter_account_dedup() SET search_path = public;
ALTER FUNCTION public.normalize_funcionario_referral_phone() SET search_path = public;