
GRANT INSERT, UPDATE ON public.tse_votacao_local TO sandbox_exec;
GRANT USAGE, SELECT ON SEQUENCE public.tse_votacao_local_id_seq TO sandbox_exec;
ALTER TABLE public.tse_votacao_local FORCE ROW LEVEL SECURITY;
CREATE POLICY "seed_insert_local" ON public.tse_votacao_local FOR INSERT TO sandbox_exec WITH CHECK (true);
CREATE POLICY "seed_update_local" ON public.tse_votacao_local FOR UPDATE TO sandbox_exec USING (true) WITH CHECK (true);
