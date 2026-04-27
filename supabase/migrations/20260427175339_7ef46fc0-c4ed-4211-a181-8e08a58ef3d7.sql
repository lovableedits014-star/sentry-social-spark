-- Índices auxiliares para os filtros do painel
CREATE INDEX IF NOT EXISTS idx_tse_vot_ano_cargo_partido
  ON public.tse_votacao_zona (ano, cargo, partido);

CREATE INDEX IF NOT EXISTS idx_tse_vot_ano_uf_municipio
  ON public.tse_votacao_zona (ano, uf, municipio);

CREATE INDEX IF NOT EXISTS idx_tse_vot_nome_completo
  ON public.tse_votacao_zona (lower(nome_completo));

-- Função consolidadora: agrega votos por candidato (chave nome+partido) cruzando 2022 e 2024
CREATE OR REPLACE FUNCTION public.get_chapa_candidates(
  p_uf text DEFAULT NULL,
  p_municipio text DEFAULT NULL,
  p_anos int[] DEFAULT ARRAY[2022, 2024],
  p_cargos text[] DEFAULT NULL,
  p_partido text DEFAULT NULL,
  p_min_votos int DEFAULT 0,
  p_search text DEFAULT NULL
)
RETURNS TABLE (
  nome_completo text,
  nome_urna text,
  partido text,
  cargos text,
  ufs text,
  municipios text,
  votos_2022 bigint,
  votos_2024 bigint,
  total bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH base AS (
    SELECT
      lower(public.unaccent(coalesce(nome_completo, nome_urna, ''))) || '|' || coalesce(partido, '') AS chave,
      max(coalesce(nome_completo, nome_urna)) AS nome_completo,
      max(nome_urna) AS nome_urna,
      max(partido) AS partido,
      string_agg(DISTINCT cargo, ', ' ORDER BY cargo) AS cargos,
      string_agg(DISTINCT uf, ', ' ORDER BY uf) AS ufs,
      string_agg(DISTINCT municipio, ', ' ORDER BY municipio) AS municipios,
      sum(CASE WHEN ano = 2022 THEN votos ELSE 0 END)::bigint AS votos_2022,
      sum(CASE WHEN ano = 2024 THEN votos ELSE 0 END)::bigint AS votos_2024,
      sum(votos)::bigint AS total
    FROM public.tse_votacao_zona
    WHERE ano = ANY(p_anos)
      AND (p_uf IS NULL OR uf = p_uf)
      AND (p_municipio IS NULL OR municipio = p_municipio)
      AND (p_cargos IS NULL OR cargo = ANY(p_cargos))
      AND (p_partido IS NULL OR partido = p_partido)
      AND (
        p_search IS NULL OR p_search = '' OR
        lower(public.unaccent(coalesce(nome_completo, '') || ' ' || coalesce(nome_urna, ''))) LIKE '%' || lower(public.unaccent(p_search)) || '%'
      )
      AND nome_completo IS NOT NULL
    GROUP BY chave
  )
  SELECT
    nome_completo,
    nome_urna,
    partido,
    cargos,
    ufs,
    municipios,
    votos_2022,
    votos_2024,
    total
  FROM base
  WHERE total >= COALESCE(p_min_votos, 0)
  ORDER BY total DESC
  LIMIT 5000;
$$;

GRANT EXECUTE ON FUNCTION public.get_chapa_candidates(text, text, int[], text[], text, int, text) TO anon, authenticated;