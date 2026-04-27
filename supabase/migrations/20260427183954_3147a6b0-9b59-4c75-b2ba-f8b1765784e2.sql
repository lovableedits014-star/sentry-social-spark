CREATE OR REPLACE FUNCTION public.get_votos_por_municipio(
  p_anos integer[] DEFAULT ARRAY[2022, 2024],
  p_partido text DEFAULT NULL,
  p_uf text DEFAULT NULL,
  p_cargo text DEFAULT NULL
)
RETURNS TABLE(
  uf text,
  municipio text,
  votos_2022 bigint,
  votos_2024 bigint,
  total bigint,
  candidatos bigint,
  partidos bigint
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    uf,
    municipio,
    COALESCE(SUM(CASE WHEN ano = 2022 THEN votos END), 0)::bigint AS votos_2022,
    COALESCE(SUM(CASE WHEN ano = 2024 THEN votos END), 0)::bigint AS votos_2024,
    SUM(votos)::bigint AS total,
    COUNT(DISTINCT lower(public.unaccent(coalesce(nome_completo, nome_urna, ''))))::bigint AS candidatos,
    COUNT(DISTINCT partido)::bigint AS partidos
  FROM public.tse_votacao_zona
  WHERE ano = ANY(p_anos)
    AND (p_partido IS NULL OR partido = p_partido)
    AND (p_uf IS NULL OR uf = p_uf)
    AND (p_cargo IS NULL OR cargo = p_cargo)
    AND uf IS NOT NULL
    AND municipio IS NOT NULL
  GROUP BY uf, municipio
  ORDER BY total DESC
  LIMIT 5000;
$$;