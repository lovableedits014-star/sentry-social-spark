
ALTER TABLE public.tse_votacao_local ADD COLUMN IF NOT EXISTS bairro TEXT;
CREATE INDEX IF NOT EXISTS idx_tse_local_bairro ON public.tse_votacao_local (bairro) WHERE bairro IS NOT NULL;

DROP FUNCTION IF EXISTS public.get_tse_locais_summary(text, int);

CREATE FUNCTION public.get_tse_locais_summary(p_cargo text, p_turno int)
RETURNS TABLE (zona int, nr_local int, nome_local text, endereco text, bairro text, total_votos bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $$
  SELECT zona, nr_local, MAX(nome_local) AS nome_local, MAX(endereco) AS endereco, MAX(bairro) AS bairro, SUM(votos)::bigint AS total_votos
  FROM public.tse_votacao_local
  WHERE cargo = p_cargo AND turno = p_turno
  GROUP BY zona, nr_local
  ORDER BY total_votos DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_tse_locais_summary(text, int) TO anon, authenticated;

GRANT UPDATE (bairro) ON public.tse_votacao_local TO sandbox_exec;
DROP POLICY IF EXISTS "seed_geocode_bairro" ON public.tse_votacao_local;
CREATE POLICY "seed_geocode_bairro" ON public.tse_votacao_local FOR UPDATE TO sandbox_exec USING (true) WITH CHECK (true);
