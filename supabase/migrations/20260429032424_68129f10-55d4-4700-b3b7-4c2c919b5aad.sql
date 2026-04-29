-- Função que calcula estatísticas estaduais por indicador a partir do JSONB
CREATE OR REPLACE FUNCTION public.municipios_ranking_uf(p_uf text)
RETURNS TABLE (
  codigo_ibge integer,
  nome text,
  indicador_id text,
  indicador_label text,
  area text,
  unidade text,
  ano integer,
  fonte text,
  valor numeric,
  higher_is_worse boolean,
  media_uf numeric,
  mediana_uf numeric,
  min_uf numeric,
  max_uf numeric,
  posicao integer,
  total_uf integer,
  percentil numeric,
  delta_vs_media numeric,
  delta_pct numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH expandido AS (
    SELECT
      m.codigo_ibge,
      m.nome,
      m.uf,
      kv.key AS indicador_id,
      (kv.value->>'label')::text AS indicador_label,
      (kv.value->>'area')::text AS area,
      (kv.value->>'unidade')::text AS unidade,
      NULLIF(kv.value->>'ano','')::int AS ano,
      (kv.value->>'fonte')::text AS fonte,
      NULLIF(kv.value->>'valor','')::numeric AS valor,
      COALESCE((kv.value->>'higher_is_worse')::boolean, false) AS higher_is_worse,
      COALESCE((kv.value->>'outdated')::boolean, false) AS outdated
    FROM public.municipios_indicadores m
    CROSS JOIN LATERAL jsonb_each(COALESCE(m.indicadores, '{}'::jsonb)) AS kv
    WHERE m.uf = upper(p_uf)
      AND COALESCE((kv.value->>'outdated')::boolean, false) = false
      AND NULLIF(kv.value->>'valor','') IS NOT NULL
  ),
  estat AS (
    SELECT
      indicador_id,
      AVG(valor)::numeric AS media_uf,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY valor)::numeric AS mediana_uf,
      MIN(valor)::numeric AS min_uf,
      MAX(valor)::numeric AS max_uf,
      COUNT(*)::int AS total_uf
    FROM expandido
    GROUP BY indicador_id
  ),
  ranqueado AS (
    SELECT
      e.*,
      st.media_uf,
      st.mediana_uf,
      st.min_uf,
      st.max_uf,
      st.total_uf,
      -- Para indicadores onde "maior é pior" (pobreza, gini, mortalidade), posição 1 = pior
      -- Para indicadores onde "maior é melhor" (IDH, IDEB), posição 1 = melhor
      CASE WHEN e.higher_is_worse
        THEN RANK() OVER (PARTITION BY e.indicador_id ORDER BY e.valor DESC)::int
        ELSE RANK() OVER (PARTITION BY e.indicador_id ORDER BY e.valor DESC)::int
      END AS posicao
    FROM expandido e
    JOIN estat st USING (indicador_id)
  )
  SELECT
    r.codigo_ibge,
    r.nome,
    r.indicador_id,
    r.indicador_label,
    r.area,
    r.unidade,
    r.ano,
    r.fonte,
    r.valor,
    r.higher_is_worse,
    ROUND(r.media_uf, 4) AS media_uf,
    ROUND(r.mediana_uf, 4) AS mediana_uf,
    r.min_uf,
    r.max_uf,
    r.posicao,
    r.total_uf,
    ROUND( (1.0 - (r.posicao::numeric - 1) / NULLIF(r.total_uf - 1, 0)) * 100, 1) AS percentil,
    ROUND(r.valor - r.media_uf, 4) AS delta_vs_media,
    ROUND( ((r.valor - r.media_uf) / NULLIF(r.media_uf, 0)) * 100, 2) AS delta_pct
  FROM ranqueado r;
$$;

GRANT EXECUTE ON FUNCTION public.municipios_ranking_uf(text) TO authenticated, anon;

-- Função compacta: pega só o ranking de UM município (mais leve para UI)
CREATE OR REPLACE FUNCTION public.municipio_ranking(p_codigo_ibge integer)
RETURNS TABLE (
  indicador_id text,
  indicador_label text,
  area text,
  unidade text,
  ano integer,
  fonte text,
  valor numeric,
  higher_is_worse boolean,
  media_uf numeric,
  min_uf numeric,
  max_uf numeric,
  posicao integer,
  total_uf integer,
  percentil numeric,
  delta_pct numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    indicador_id, indicador_label, area, unidade, ano, fonte, valor, higher_is_worse,
    media_uf, min_uf, max_uf, posicao, total_uf, percentil, delta_pct
  FROM public.municipios_ranking_uf(
    (SELECT uf FROM public.municipios_indicadores WHERE codigo_ibge = p_codigo_ibge LIMIT 1)
  )
  WHERE codigo_ibge = p_codigo_ibge;
$$;

GRANT EXECUTE ON FUNCTION public.municipio_ranking(integer) TO authenticated, anon;