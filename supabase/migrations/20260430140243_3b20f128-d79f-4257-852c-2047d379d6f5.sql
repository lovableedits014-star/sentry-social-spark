-- =========================================================
-- Inteligência de Conteúdo: tabelas base
-- =========================================================

-- 1) DNA editorial do candidato (1 por client)
CREATE TABLE IF NOT EXISTS public.content_dna (
  client_id UUID PRIMARY KEY REFERENCES public.clients(id) ON DELETE CASCADE,
  tom TEXT,
  vocabulario TEXT[],
  estruturas JSONB DEFAULT '{}'::jsonb,
  emojis_assinatura TEXT[],
  tamanho_ideal JSONB DEFAULT '{}'::jsonb,
  horarios_pico JSONB DEFAULT '{}'::jsonb,
  sample_size INT DEFAULT 0,
  auto_apply BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.content_dna ENABLE ROW LEVEL SECURITY;

CREATE POLICY "content_dna client members select"
  ON public.content_dna FOR SELECT
  USING (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.client_id = content_dna.client_id AND tm.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = content_dna.client_id AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "content_dna client members write"
  ON public.content_dna FOR ALL
  USING (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.client_id = content_dna.client_id AND tm.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = content_dna.client_id AND c.user_id = auth.uid()
    )
  )
  WITH CHECK (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.client_id = content_dna.client_id AND tm.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = content_dna.client_id AND c.user_id = auth.uid()
    )
  );

CREATE TRIGGER trg_content_dna_updated_at
BEFORE UPDATE ON public.content_dna
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- 2) Banco de ideias
CREATE TABLE IF NOT EXISTS public.content_ideas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL,
  descricao TEXT,
  tema TEXT,
  tipo TEXT,
  origem TEXT,
  score INT NOT NULL DEFAULT 50,
  status TEXT NOT NULL DEFAULT 'pendente',
  source_refs JSONB DEFAULT '{}'::jsonb,
  generated_text JSONB,
  projection JSONB,
  user_feedback TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_content_ideas_client_status
  ON public.content_ideas(client_id, status, created_at DESC);

ALTER TABLE public.content_ideas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "content_ideas client members select"
  ON public.content_ideas FOR SELECT
  USING (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.client_id = content_ideas.client_id AND tm.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = content_ideas.client_id AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "content_ideas client members write"
  ON public.content_ideas FOR ALL
  USING (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.client_id = content_ideas.client_id AND tm.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = content_ideas.client_id AND c.user_id = auth.uid()
    )
  )
  WITH CHECK (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.client_id = content_ideas.client_id AND tm.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = content_ideas.client_id AND c.user_id = auth.uid()
    )
  );

CREATE TRIGGER trg_content_ideas_updated_at
BEFORE UPDATE ON public.content_ideas
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- 3) Snapshot diário do radar
CREATE TABLE IF NOT EXISTS public.content_radar_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
  hot_topics JSONB DEFAULT '[]'::jsonb,
  open_questions JSONB DEFAULT '[]'::jsonb,
  hostile_narratives JSONB DEFAULT '[]'::jsonb,
  mobilizing_pautas JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(client_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_content_radar_client_date
  ON public.content_radar_snapshots(client_id, snapshot_date DESC);

ALTER TABLE public.content_radar_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "content_radar client members select"
  ON public.content_radar_snapshots FOR SELECT
  USING (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.client_id = content_radar_snapshots.client_id AND tm.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = content_radar_snapshots.client_id AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "content_radar client members write"
  ON public.content_radar_snapshots FOR ALL
  USING (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.client_id = content_radar_snapshots.client_id AND tm.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = content_radar_snapshots.client_id AND c.user_id = auth.uid()
    )
  )
  WITH CHECK (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.client_id = content_radar_snapshots.client_id AND tm.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = content_radar_snapshots.client_id AND c.user_id = auth.uid()
    )
  );