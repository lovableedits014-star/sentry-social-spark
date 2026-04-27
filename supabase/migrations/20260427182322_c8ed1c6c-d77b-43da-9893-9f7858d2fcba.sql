CREATE OR REPLACE FUNCTION public.get_candidate_breakdown(
  p_nome text,
  p_partido text DEFAULT NULL,
  p_anos int[] DEFAULT ARRAY[2022,2024],
  p_uf text DEFAULT NULL,
  p_cargo text DEFAULT NULL
)
RETURNS TABLE (
  uf text,
  municipio text,
  cargo text,
  ano int,
  partido text,
  nome_urna text,
  votos bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    t.uf,
    t.municipio,
    t.cargo,
    t.ano,
    max(t.partido) AS partido,
    max(t.nome_urna) AS nome_urna,
    sum(t.votos)::bigint AS votos
  FROM public.tse_votacao_zona t
  WHERE t.ano = ANY(p_anos)
    AND lower(unaccent(t.nome_completo)) = lower(unaccent(p_nome))
    AND (p_partido IS NULL OR t.partido = p_partido)
    AND (p_uf IS NULL OR t.uf = p_uf)
    AND (p_cargo IS NULL OR t.cargo = p_cargo)
  GROUP BY t.uf, t.municipio, t.cargo, t.ano
  ORDER BY sum(t.votos) DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_candidate_breakdown(text, text, int[], text, text) TO anon, authenticated;