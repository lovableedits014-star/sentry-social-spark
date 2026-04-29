-- Enum nível de cargo
DO $$ BEGIN
  CREATE TYPE public.nivel_parlamentar AS ENUM ('federal_deputado', 'federal_senador', 'estadual_deputado', 'municipal_vereador');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ===== TABELAS =====
CREATE TABLE public.adversarios_politicos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  nome_parlamentar TEXT,
  nivel public.nivel_parlamentar NOT NULL,
  partido TEXT,
  uf TEXT,
  municipio TEXT,
  cargo TEXT,
  id_camara_federal INTEGER,
  id_senado_federal INTEGER,
  id_assembleia_estadual TEXT,
  url_camara_municipal TEXT,
  legislatura_atual INTEGER,
  foto_url TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_adversarios_client ON public.adversarios_politicos(client_id);

CREATE TABLE public.parlamentar_presenca (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  adversario_id UUID NOT NULL REFERENCES public.adversarios_politicos(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  data_sessao DATE NOT NULL,
  tipo_sessao TEXT,
  presente BOOLEAN NOT NULL,
  justificada BOOLEAN NOT NULL DEFAULT false,
  motivo_ausencia TEXT,
  legislatura INTEGER,
  id_externo TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_presenca_adv_data ON public.parlamentar_presenca(adversario_id, data_sessao DESC);
CREATE UNIQUE INDEX idx_presenca_dedup ON public.parlamentar_presenca(adversario_id, id_externo) WHERE id_externo IS NOT NULL;

CREATE TABLE public.parlamentar_votacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  adversario_id UUID NOT NULL REFERENCES public.adversarios_politicos(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  data_votacao TIMESTAMPTZ NOT NULL,
  proposicao_codigo TEXT,
  proposicao_ementa TEXT,
  tema TEXT,
  voto TEXT NOT NULL,
  resultado_geral TEXT,
  id_externo TEXT,
  url_detalhes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_votacoes_adv_data ON public.parlamentar_votacoes(adversario_id, data_votacao DESC);
CREATE INDEX idx_votacoes_tema ON public.parlamentar_votacoes(client_id, tema);
CREATE UNIQUE INDEX idx_votacoes_dedup ON public.parlamentar_votacoes(adversario_id, id_externo) WHERE id_externo IS NOT NULL;

CREATE TABLE public.parlamentar_proposicoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  adversario_id UUID NOT NULL REFERENCES public.adversarios_politicos(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL,
  numero TEXT,
  ano INTEGER,
  ementa TEXT,
  situacao TEXT,
  data_apresentacao DATE,
  tema TEXT,
  url_detalhes TEXT,
  id_externo TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_proposicoes_adv ON public.parlamentar_proposicoes(adversario_id, data_apresentacao DESC);
CREATE UNIQUE INDEX idx_proposicoes_dedup ON public.parlamentar_proposicoes(adversario_id, id_externo) WHERE id_externo IS NOT NULL;

CREATE TABLE public.parlamentar_sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  adversario_id UUID REFERENCES public.adversarios_politicos(id) ON DELETE CASCADE,
  fonte TEXT NOT NULL,
  tipo_dado TEXT NOT NULL,
  status TEXT NOT NULL,
  registros_inseridos INTEGER DEFAULT 0,
  registros_atualizados INTEGER DEFAULT 0,
  erro_mensagem TEXT,
  duracao_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_sync_log_client ON public.parlamentar_sync_log(client_id, created_at DESC);

CREATE TABLE public.municipios_indicadores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo_ibge INTEGER NOT NULL UNIQUE,
  nome TEXT NOT NULL,
  uf TEXT NOT NULL,
  populacao INTEGER,
  populacao_ano INTEGER,
  pib_per_capita NUMERIC,
  pib_total NUMERIC,
  pib_ano INTEGER,
  idh NUMERIC,
  idh_ano INTEGER,
  renda_media NUMERIC,
  mortalidade_infantil NUMERIC,
  cobertura_sus_pct NUMERIC,
  leitos_sus_total INTEGER,
  datasus_ano INTEGER,
  ideb_anos_iniciais NUMERIC,
  ideb_anos_finais NUMERIC,
  ideb_ensino_medio NUMERIC,
  ideb_ano INTEGER,
  num_escolas INTEGER,
  ultima_atualizacao TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_municipios_uf ON public.municipios_indicadores(uf);
CREATE INDEX idx_municipios_nome ON public.municipios_indicadores(nome);

CREATE TABLE public.municipios_sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fonte TEXT NOT NULL,
  municipios_processados INTEGER DEFAULT 0,
  status TEXT NOT NULL,
  erro_mensagem TEXT,
  duracao_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_adversarios_updated_at
  BEFORE UPDATE ON public.adversarios_politicos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ===== RLS =====
ALTER TABLE public.adversarios_politicos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parlamentar_presenca ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parlamentar_votacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parlamentar_proposicoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parlamentar_sync_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.municipios_indicadores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.municipios_sync_log ENABLE ROW LEVEL SECURITY;

-- Adversários: dono do cliente
CREATE POLICY "adv_owner_all" ON public.adversarios_politicos FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.clients WHERE clients.id = adversarios_politicos.client_id AND clients.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.clients WHERE clients.id = adversarios_politicos.client_id AND clients.user_id = auth.uid()));

CREATE POLICY "pres_owner_all" ON public.parlamentar_presenca FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.clients WHERE clients.id = parlamentar_presenca.client_id AND clients.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.clients WHERE clients.id = parlamentar_presenca.client_id AND clients.user_id = auth.uid()));

CREATE POLICY "vot_owner_all" ON public.parlamentar_votacoes FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.clients WHERE clients.id = parlamentar_votacoes.client_id AND clients.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.clients WHERE clients.id = parlamentar_votacoes.client_id AND clients.user_id = auth.uid()));

CREATE POLICY "prop_owner_all" ON public.parlamentar_proposicoes FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.clients WHERE clients.id = parlamentar_proposicoes.client_id AND clients.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.clients WHERE clients.id = parlamentar_proposicoes.client_id AND clients.user_id = auth.uid()));

CREATE POLICY "synclog_owner_all" ON public.parlamentar_sync_log FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.clients WHERE clients.id = parlamentar_sync_log.client_id AND clients.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.clients WHERE clients.id = parlamentar_sync_log.client_id AND clients.user_id = auth.uid()));

-- Indicadores municipais: dados públicos (leitura para autenticados)
CREATE POLICY "municipios_select_auth" ON public.municipios_indicadores FOR SELECT TO authenticated USING (true);
CREATE POLICY "municipios_sync_select_auth" ON public.municipios_sync_log FOR SELECT TO authenticated USING (true);