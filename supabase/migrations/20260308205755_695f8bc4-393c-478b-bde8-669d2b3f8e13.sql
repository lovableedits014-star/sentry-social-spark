
ALTER TABLE public.contratado_indicados 
  ADD COLUMN IF NOT EXISTS ligacao_status text DEFAULT 'pendente',
  ADD COLUMN IF NOT EXISTS vota_candidato text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS candidato_alternativo text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS operador_nome text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS ligacao_em timestamp with time zone DEFAULT NULL;

-- RLS policy: allow public (anon) to read indicados for telemarketing
CREATE POLICY "Public can read indicados for telemarketing"
  ON public.contratado_indicados
  FOR SELECT
  TO anon
  USING (true);

-- RLS policy: allow public (anon) to update indicados for telemarketing
CREATE POLICY "Public can update indicados for telemarketing"
  ON public.contratado_indicados
  FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);
