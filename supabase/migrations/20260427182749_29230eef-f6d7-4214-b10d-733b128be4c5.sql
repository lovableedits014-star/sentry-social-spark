CREATE OR REPLACE FUNCTION public.get_tse_municipios()
RETURNS TABLE (uf text, municipio text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT uf, municipio
  FROM public.tse_votacao_zona
  WHERE uf IS NOT NULL AND municipio IS NOT NULL
  ORDER BY uf, municipio;
$$;

CREATE OR REPLACE FUNCTION public.get_tse_partidos()
RETURNS TABLE (partido text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT partido
  FROM public.tse_votacao_zona
  WHERE partido IS NOT NULL AND partido <> ''
  ORDER BY partido;
$$;

GRANT EXECUTE ON FUNCTION public.get_tse_municipios() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_tse_partidos() TO anon, authenticated;