-- Helper RLS predicate replicado no padrão existente do projeto:
-- (EXISTS clients owner) OR (EXISTS team_members) OR is_super_admin()

-- 1) Perfil do candidato
CREATE TABLE public.narrativa_perfil_candidato (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  nome_candidato TEXT,
  cargo_pretendido TEXT,
  partido TEXT,
  bandeiras JSONB NOT NULL DEFAULT '[]'::jsonb,
  tom_voz TEXT DEFAULT 'popular',
  estilo_discurso TEXT,
  publico_alvo TEXT,
  proposta_central TEXT,
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(client_id)
);

ALTER TABLE public.narrativa_perfil_candidato ENABLE ROW LEVEL SECURITY;

CREATE POLICY "narrativa_perfil_all" ON public.narrativa_perfil_candidato
  FOR ALL TO authenticated
  USING (
    public.is_super_admin()
    OR EXISTS (SELECT 1 FROM clients c WHERE c.id = narrativa_perfil_candidato.client_id AND c.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM team_members tm WHERE tm.client_id = narrativa_perfil_candidato.client_id AND tm.user_id = auth.uid())
  )
  WITH CHECK (
    public.is_super_admin()
    OR EXISTS (SELECT 1 FROM clients c WHERE c.id = narrativa_perfil_candidato.client_id AND c.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM team_members tm WHERE tm.client_id = narrativa_perfil_candidato.client_id AND tm.user_id = auth.uid())
  );

CREATE TRIGGER trg_narrativa_perfil_updated
  BEFORE UPDATE ON public.narrativa_perfil_candidato
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Dossiês de cidade
CREATE TABLE public.narrativa_dossies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  uf TEXT NOT NULL,
  municipio TEXT NOT NULL,
  ibge_code TEXT,
  dados_brutos JSONB NOT NULL DEFAULT '{}'::jsonb,
  analise JSONB NOT NULL DEFAULT '{}'::jsonb,
  conteudos JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pendente',
  erro_msg TEXT,
  collected_at TIMESTAMPTZ,
  analyzed_at TIMESTAMPTZ,
  generated_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_narrativa_dossies_client ON public.narrativa_dossies(client_id);
CREATE INDEX idx_narrativa_dossies_municipio ON public.narrativa_dossies(client_id, uf, municipio);
CREATE INDEX idx_narrativa_dossies_created ON public.narrativa_dossies(client_id, created_at DESC);

ALTER TABLE public.narrativa_dossies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "narrativa_dossies_all" ON public.narrativa_dossies
  FOR ALL TO authenticated
  USING (
    public.is_super_admin()
    OR EXISTS (SELECT 1 FROM clients c WHERE c.id = narrativa_dossies.client_id AND c.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM team_members tm WHERE tm.client_id = narrativa_dossies.client_id AND tm.user_id = auth.uid())
  )
  WITH CHECK (
    public.is_super_admin()
    OR EXISTS (SELECT 1 FROM clients c WHERE c.id = narrativa_dossies.client_id AND c.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM team_members tm WHERE tm.client_id = narrativa_dossies.client_id AND tm.user_id = auth.uid())
  );

CREATE TRIGGER trg_narrativa_dossies_updated
  BEFORE UPDATE ON public.narrativa_dossies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) Memória de campanha
CREATE TABLE public.narrativa_visitas_realizadas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  dossie_id UUID REFERENCES public.narrativa_dossies(id) ON DELETE SET NULL,
  uf TEXT NOT NULL,
  municipio TEXT NOT NULL,
  data_visita DATE NOT NULL DEFAULT CURRENT_DATE,
  temas_abordados JSONB NOT NULL DEFAULT '[]'::jsonb,
  bairros_visitados JSONB NOT NULL DEFAULT '[]'::jsonb,
  observacoes TEXT,
  resultado_percebido TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_narrativa_visitas_client ON public.narrativa_visitas_realizadas(client_id, data_visita DESC);
CREATE INDEX idx_narrativa_visitas_municipio ON public.narrativa_visitas_realizadas(client_id, uf, municipio);

ALTER TABLE public.narrativa_visitas_realizadas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "narrativa_visitas_all" ON public.narrativa_visitas_realizadas
  FOR ALL TO authenticated
  USING (
    public.is_super_admin()
    OR EXISTS (SELECT 1 FROM clients c WHERE c.id = narrativa_visitas_realizadas.client_id AND c.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM team_members tm WHERE tm.client_id = narrativa_visitas_realizadas.client_id AND tm.user_id = auth.uid())
  )
  WITH CHECK (
    public.is_super_admin()
    OR EXISTS (SELECT 1 FROM clients c WHERE c.id = narrativa_visitas_realizadas.client_id AND c.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM team_members tm WHERE tm.client_id = narrativa_visitas_realizadas.client_id AND tm.user_id = auth.uid())
  );

CREATE TRIGGER trg_narrativa_visitas_updated
  BEFORE UPDATE ON public.narrativa_visitas_realizadas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();