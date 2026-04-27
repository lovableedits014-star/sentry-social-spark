-- Ranking comparativo de partidos 2022 vs 2024
CREATE OR REPLACE FUNCTION public.get_partido_evolucao(
  p_uf text DEFAULT NULL,
  p_cargo text DEFAULT NULL
)
RETURNS TABLE (
  partido text,
  votos_2022 bigint,
  votos_2024 bigint,
  candidatos_2022 bigint,
  candidatos_2024 bigint,
  municipios_2022 bigint,
  municipios_2024 bigint,
  variacao_votos bigint,
  variacao_pct numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH base AS (
    SELECT
      partido,
      ano,
      sum(votos)::bigint AS votos,
      count(DISTINCT lower(unaccent(coalesce(nome_completo, nome_urna, '')))) AS candidatos,
      count(DISTINCT municipio) AS municipios
    FROM public.tse_votacao_zona
    WHERE partido IS NOT NULL AND partido <> ''
      AND ano IN (2022, 2024)
      AND (p_uf IS NULL OR uf = p_uf)
      AND (p_cargo IS NULL OR cargo = p_cargo)
    GROUP BY partido, ano
  ),
  agg AS (
    SELECT
      partido,
      coalesce(sum(CASE WHEN ano = 2022 THEN votos END), 0)::bigint AS votos_2022,
      coalesce(sum(CASE WHEN ano = 2024 THEN votos END), 0)::bigint AS votos_2024,
      coalesce(sum(CASE WHEN ano = 2022 THEN candidatos END), 0)::bigint AS candidatos_2022,
      coalesce(sum(CASE WHEN ano = 2024 THEN candidatos END), 0)::bigint AS candidatos_2024,
      coalesce(sum(CASE WHEN ano = 2022 THEN municipios END), 0)::bigint AS municipios_2022,
      coalesce(sum(CASE WHEN ano = 2024 THEN municipios END), 0)::bigint AS municipios_2024
    FROM base
    GROUP BY partido
  )
  SELECT
    partido,
    votos_2022,
    votos_2024,
    candidatos_2022,
    candidatos_2024,
    municipios_2022,
    municipios_2024,
    (votos_2024 - votos_2022)::bigint AS variacao_votos,
    CASE
      WHEN votos_2022 = 0 AND votos_2024 > 0 THEN NULL
      WHEN votos_2022 = 0 THEN 0
      ELSE round(((votos_2024 - votos_2022)::numeric / votos_2022::numeric) * 100, 2)
    END AS variacao_pct
  FROM agg
  ORDER BY (votos_2022 + votos_2024) DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_partido_evolucao(text, text) TO anon, authenticated;

-- Detector de migrações partidárias entre 2022 e 2024
CREATE OR REPLACE FUNCTION public.get_migracoes_partidarias(
  p_uf text DEFAULT NULL,
  p_min_votos integer DEFAULT 100
)
RETURNS TABLE (
  nome_completo text,
  partido_2022 text,
  partido_2024 text,
  cargo_2022 text,
  cargo_2024 text,
  votos_2022 bigint,
  votos_2024 bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH base AS (
    SELECT
      lower(unaccent(coalesce(nome_completo, nome_urna, ''))) AS chave,
      max(coalesce(nome_completo, nome_urna)) AS nome_completo,
      ano,
      partido,
      string_agg(DISTINCT cargo, ', ' ORDER BY cargo) AS cargos,
      sum(votos)::bigint AS votos
    FROM public.tse_votacao_zona
    WHERE partido IS NOT NULL AND partido <> ''
      AND ano IN (2022, 2024)
      AND nome_completo IS NOT NULL
      AND (p_uf IS NULL OR uf = p_uf)
    GROUP BY chave, ano, partido
  ),
  pivot AS (
    SELECT
      chave,
      max(nome_completo) AS nome_completo,
      max(CASE WHEN ano = 2022 THEN partido END) AS partido_2022,
      max(CASE WHEN ano = 2024 THEN partido END) AS partido_2024,
      max(CASE WHEN ano = 2022 THEN cargos END) AS cargo_2022,
      max(CASE WHEN ano = 2024 THEN cargos END) AS cargo_2024,
      coalesce(sum(CASE WHEN ano = 2022 THEN votos END), 0)::bigint AS votos_2022,
      coalesce(sum(CASE WHEN ano = 2024 THEN votos END), 0)::bigint AS votos_2024
    FROM base
    GROUP BY chave
  )
  SELECT
    nome_completo, partido_2022, partido_2024, cargo_2022, cargo_2024, votos_2022, votos_2024
  FROM pivot
  WHERE partido_2022 IS NOT NULL
    AND partido_2024 IS NOT NULL
    AND partido_2022 <> partido_2024
    AND (votos_2022 + votos_2024) >= COALESCE(p_min_votos, 0)
  ORDER BY (votos_2022 + votos_2024) DESC
  LIMIT 2000;
$$;

GRANT EXECUTE ON FUNCTION public.get_migracoes_partidarias(text, integer) TO anon, authenticated;