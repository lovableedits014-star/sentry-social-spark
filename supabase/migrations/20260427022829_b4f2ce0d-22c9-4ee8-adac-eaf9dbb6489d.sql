CREATE POLICY "tse_vot_seed_insert"
  ON public.tse_votacao_zona FOR INSERT
  TO public
  WITH CHECK (true);