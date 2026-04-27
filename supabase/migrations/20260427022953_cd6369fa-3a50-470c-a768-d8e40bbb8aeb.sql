DROP POLICY IF EXISTS "tse_vot_seed_insert" ON public.tse_votacao_zona;
DROP POLICY IF EXISTS "tse_vot_seed_update" ON public.tse_votacao_zona;
REVOKE INSERT, UPDATE ON public.tse_votacao_zona FROM sandbox_exec;
REVOKE USAGE, SELECT ON SEQUENCE public.tse_votacao_zona_id_seq FROM sandbox_exec;