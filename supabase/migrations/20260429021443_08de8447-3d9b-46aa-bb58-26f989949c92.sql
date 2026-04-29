-- Adiciona seleção de candidato de referência (qualquer cargo) ao perfil de narrativa.
-- Substitui o conceito antigo de "prefeito eleito automaticamente" por escolha manual do usuário.
ALTER TABLE public.narrativa_perfil_candidato
  ADD COLUMN IF NOT EXISTS ref_uf text,
  ADD COLUMN IF NOT EXISTS ref_municipio text,
  ADD COLUMN IF NOT EXISTS ref_cargo text,
  ADD COLUMN IF NOT EXISTS ref_nome text,
  ADD COLUMN IF NOT EXISTS ref_partido text,
  ADD COLUMN IF NOT EXISTS ref_ano integer,
  ADD COLUMN IF NOT EXISTS ref_lado text;
-- ref_lado: 'proprio' (defender/expandir) ou 'adversario' (atacar/conquistar)

COMMENT ON COLUMN public.narrativa_perfil_candidato.ref_nome IS 'Candidato de referência escolhido pelo usuário no TSE — toda análise (top locais críticos, etc) gira em torno dele.';
COMMENT ON COLUMN public.narrativa_perfil_candidato.ref_lado IS 'proprio = mostrar onde sou fraco/forte para reforçar minha base; adversario = mostrar onde ele é fraco para conquistar.';