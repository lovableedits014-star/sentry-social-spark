
CREATE TABLE IF NOT EXISTS public.tse_votacao_local (
  id BIGSERIAL PRIMARY KEY,
  ano INT NOT NULL,
  turno INT NOT NULL,
  cargo TEXT NOT NULL,
  cod_municipio INT NOT NULL,
  municipio TEXT NOT NULL,
  uf TEXT NOT NULL,
  zona INT NOT NULL,
  nr_local INT NOT NULL,
  nome_local TEXT,
  endereco TEXT,
  numero INT NOT NULL,
  nome_candidato TEXT,
  votos INT NOT NULL DEFAULT 0,
  UNIQUE (ano, turno, cargo, cod_municipio, zona, nr_local, numero)
);

CREATE INDEX IF NOT EXISTS idx_tse_local_municipio ON public.tse_votacao_local (cod_municipio, cargo, turno);
CREATE INDEX IF NOT EXISTS idx_tse_local_zona ON public.tse_votacao_local (zona, nr_local);

ALTER TABLE public.tse_votacao_local ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read TSE local data"
ON public.tse_votacao_local FOR SELECT
TO public USING (true);
