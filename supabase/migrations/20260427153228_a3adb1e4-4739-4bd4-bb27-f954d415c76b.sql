
DROP POLICY IF EXISTS "seed_insert_local" ON public.tse_votacao_local;
DROP POLICY IF EXISTS "seed_update_local" ON public.tse_votacao_local;
REVOKE INSERT, UPDATE ON public.tse_votacao_local FROM sandbox_exec;
REVOKE USAGE, SELECT ON SEQUENCE public.tse_votacao_local_id_seq FROM sandbox_exec;
