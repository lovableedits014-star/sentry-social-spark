
-- ===== TABELA: midia_portais (lista global editável de portais) =====
CREATE TABLE IF NOT EXISTS public.midia_portais (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  url text NOT NULL UNIQUE,
  camada text NOT NULL DEFAULT 'estadual',
  uf text,
  municipio text,
  ativo boolean NOT NULL DEFAULT true,
  ordem integer NOT NULL DEFAULT 0,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.midia_portais ENABLE ROW LEVEL SECURITY;

CREATE POLICY "midia_portais_select_authenticated"
  ON public.midia_portais FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "midia_portais_admin_all"
  ON public.midia_portais FOR ALL
  TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- ===== TABELA: midia_alvos_monitoramento =====
CREATE TABLE IF NOT EXISTS public.midia_alvos_monitoramento (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  termo text NOT NULL,
  tipo text NOT NULL DEFAULT 'candidato',
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, termo)
);

CREATE INDEX IF NOT EXISTS idx_midia_alvos_client ON public.midia_alvos_monitoramento(client_id, ativo);

ALTER TABLE public.midia_alvos_monitoramento ENABLE ROW LEVEL SECURITY;

CREATE POLICY "midia_alvos_all"
  ON public.midia_alvos_monitoramento FOR ALL
  TO authenticated
  USING (
    public.is_super_admin()
    OR EXISTS (SELECT 1 FROM public.clients c WHERE c.id = midia_alvos_monitoramento.client_id AND c.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.team_members tm WHERE tm.client_id = midia_alvos_monitoramento.client_id AND tm.user_id = auth.uid())
  )
  WITH CHECK (
    public.is_super_admin()
    OR EXISTS (SELECT 1 FROM public.clients c WHERE c.id = midia_alvos_monitoramento.client_id AND c.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.team_members tm WHERE tm.client_id = midia_alvos_monitoramento.client_id AND tm.user_id = auth.uid())
  );

-- ===== TABELA: midia_noticias =====
CREATE TABLE IF NOT EXISTS public.midia_noticias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  portal_id uuid REFERENCES public.midia_portais(id) ON DELETE SET NULL,
  portal_nome text,
  url text NOT NULL,
  titulo text NOT NULL,
  resumo text,
  conteudo_md text,
  data_publicacao timestamptz,
  data_coleta timestamptz NOT NULL DEFAULT now(),
  sentimento text,
  sentimento_score numeric,
  relevancia_politica integer,
  alvos_mencionados text[] DEFAULT '{}',
  tags_assunto text[] DEFAULT '{}',
  resumo_ia text,
  alerta_critico boolean NOT NULL DEFAULT false,
  raw_metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, url)
);

CREATE INDEX IF NOT EXISTS idx_midia_noticias_client_data ON public.midia_noticias(client_id, data_publicacao DESC);
CREATE INDEX IF NOT EXISTS idx_midia_noticias_client_alerta ON public.midia_noticias(client_id, alerta_critico) WHERE alerta_critico = true;
CREATE INDEX IF NOT EXISTS idx_midia_noticias_client_sentimento ON public.midia_noticias(client_id, sentimento);
CREATE INDEX IF NOT EXISTS idx_midia_noticias_alvos ON public.midia_noticias USING GIN (alvos_mencionados);

ALTER TABLE public.midia_noticias ENABLE ROW LEVEL SECURITY;

CREATE POLICY "midia_noticias_all"
  ON public.midia_noticias FOR ALL
  TO authenticated
  USING (
    public.is_super_admin()
    OR EXISTS (SELECT 1 FROM public.clients c WHERE c.id = midia_noticias.client_id AND c.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.team_members tm WHERE tm.client_id = midia_noticias.client_id AND tm.user_id = auth.uid())
  )
  WITH CHECK (
    public.is_super_admin()
    OR EXISTS (SELECT 1 FROM public.clients c WHERE c.id = midia_noticias.client_id AND c.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.team_members tm WHERE tm.client_id = midia_noticias.client_id AND tm.user_id = auth.uid())
  );

-- ===== TABELA: midia_coleta_log =====
CREATE TABLE IF NOT EXISTS public.midia_coleta_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  iniciado_em timestamptz NOT NULL DEFAULT now(),
  finalizado_em timestamptz,
  portais_processados integer DEFAULT 0,
  noticias_novas integer DEFAULT 0,
  noticias_analisadas integer DEFAULT 0,
  creditos_firecrawl integer DEFAULT 0,
  erros jsonb,
  status text NOT NULL DEFAULT 'rodando'
);

CREATE INDEX IF NOT EXISTS idx_midia_log_client ON public.midia_coleta_log(client_id, iniciado_em DESC);

ALTER TABLE public.midia_coleta_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "midia_log_all"
  ON public.midia_coleta_log FOR ALL
  TO authenticated
  USING (
    public.is_super_admin()
    OR EXISTS (SELECT 1 FROM public.clients c WHERE c.id = midia_coleta_log.client_id AND c.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.team_members tm WHERE tm.client_id = midia_coleta_log.client_id AND tm.user_id = auth.uid())
  )
  WITH CHECK (
    public.is_super_admin()
    OR EXISTS (SELECT 1 FROM public.clients c WHERE c.id = midia_coleta_log.client_id AND c.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.team_members tm WHERE tm.client_id = midia_coleta_log.client_id AND tm.user_id = auth.uid())
  );

-- ===== Trigger updated_at =====
CREATE TRIGGER trg_midia_portais_updated_at
  BEFORE UPDATE ON public.midia_portais
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ===== SEED: 5 portais padrão =====
INSERT INTO public.midia_portais (nome, url, camada, uf, ordem, observacoes) VALUES
  ('G1 Política', 'https://g1.globo.com/politica/', 'nacional', NULL, 1, 'Pauta nacional - define narrativa do país'),
  ('Correio do Estado', 'https://correiodoestado.com.br/politica', 'estadual', 'MS', 2, 'Tradicional MS - peso institucional'),
  ('Midiamax', 'https://www.midiamax.com.br/politica', 'estadual', 'MS', 3, 'Digital MS - cobertura ágil de bastidor'),
  ('Campo Grande News', 'https://www.campograndenews.com.br/politica', 'municipal', 'MS', 4, 'Forte em Campo Grande - cobertura municipal'),
  ('TopMídiaNews', 'https://www.topmidianews.com.br/politica', 'bastidor', 'MS', 5, 'Bastidor e colunismo político MS')
ON CONFLICT (url) DO NOTHING;
