
-- Restrict anon UPDATE to only telemarketing-relevant columns
DROP POLICY IF EXISTS "Public can update indicados for telemarketing" ON public.contratado_indicados;

CREATE POLICY "Public can update indicados for telemarketing"
  ON public.contratado_indicados
  FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (
    ligacao_status IS NOT NULL 
    AND operador_nome IS NOT NULL
  );
