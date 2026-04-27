CREATE TABLE IF NOT EXISTS public.tse_votacao_zona (
  id BIGSERIAL PRIMARY KEY,
  ano INT NOT NULL,
  turno INT NOT NULL,
  cargo TEXT NOT NULL,
  cod_municipio INT NOT NULL,
  municipio TEXT NOT NULL,
  uf TEXT NOT NULL,
  zona INT NOT NULL,
  numero INT,
  nome_urna TEXT,
  nome_completo TEXT,
  partido TEXT,
  situacao TEXT,
  votos INT NOT NULL DEFAULT 0,
  UNIQUE (ano, turno, cargo, cod_municipio, zona, numero)
);

CREATE INDEX IF NOT EXISTS idx_tse_vot_mun_cargo ON public.tse_votacao_zona(cod_municipio, ano, cargo, turno);
CREATE INDEX IF NOT EXISTS idx_tse_vot_uf ON public.tse_votacao_zona(uf, ano);

ALTER TABLE public.tse_votacao_zona ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tse_vot_public_read"
  ON public.tse_votacao_zona FOR SELECT
  USING (true);