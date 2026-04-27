GRANT UPDATE ON public.tse_votacao_zona TO sandbox_exec;
CREATE POLICY "tse_vot_seed_update"
  ON public.tse_votacao_zona FOR UPDATE
  TO public
  USING (true) WITH CHECK (true);
DELETE FROM public.tse_votacao_zona WHERE cargo = 'Test';