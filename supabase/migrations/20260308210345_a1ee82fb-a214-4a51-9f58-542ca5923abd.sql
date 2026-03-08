
ALTER TABLE public.contratados 
  ADD COLUMN IF NOT EXISTS ligacao_status text DEFAULT 'pendente',
  ADD COLUMN IF NOT EXISTS vota_candidato text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS candidato_alternativo text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS operador_nome text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS ligacao_em timestamp with time zone DEFAULT NULL;

-- RLS: allow anon to read contratados for telemarketing
CREATE POLICY "Public can read contratados for telemarketing"
  ON public.contratados
  FOR SELECT
  TO anon
  USING (true);

-- RLS: allow anon to update contratados for telemarketing
CREATE POLICY "Public can update contratados for telemarketing"
  ON public.contratados
  FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (
    ligacao_status IS NOT NULL 
    AND operador_nome IS NOT NULL
  );
