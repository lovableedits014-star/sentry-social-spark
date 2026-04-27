
CREATE OR REPLACE FUNCTION public.get_tse_locais_summary(p_cargo text, p_turno int)
RETURNS TABLE (zona int, nr_local int, nome_local text, endereco text, total_votos bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $$
  SELECT zona, nr_local, MAX(nome_local) AS nome_local, MAX(endereco) AS endereco, SUM(votos)::bigint AS total_votos
  FROM public.tse_votacao_local
  WHERE cargo = p_cargo AND turno = p_turno
  GROUP BY zona, nr_local
  ORDER BY total_votos DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_tse_locais_summary(text, int) TO anon, authenticated;
