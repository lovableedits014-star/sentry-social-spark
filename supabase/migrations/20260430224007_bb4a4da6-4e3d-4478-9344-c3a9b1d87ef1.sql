-- Histórico de versões de matérias
CREATE TABLE IF NOT EXISTS public.materias_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  materia_id UUID NOT NULL REFERENCES public.materias_geradas(id) ON DELETE CASCADE,
  client_id UUID NOT NULL,
  versao INTEGER NOT NULL,
  provider TEXT,
  model TEXT,
  titulo TEXT NOT NULL,
  subtitulo TEXT,
  corpo TEXT NOT NULL,
  fontes JSONB NOT NULL DEFAULT '{}'::jsonb,
  prompt_input TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_materias_versions_materia ON public.materias_versions(materia_id, versao DESC);
CREATE INDEX IF NOT EXISTS idx_materias_versions_client ON public.materias_versions(client_id, created_at DESC);

ALTER TABLE public.materias_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view their client materia versions"
  ON public.materias_versions FOR SELECT
  USING (
    client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid())
    OR public.is_super_admin()
  );

CREATE POLICY "Users manage their client materia versions"
  ON public.materias_versions FOR ALL
  USING (
    client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid())
    OR public.is_super_admin()
  )
  WITH CHECK (
    client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid())
    OR public.is_super_admin()
  );

-- Rastreio de rodadas de extração de conhecimento (memória)
ALTER TABLE public.candidate_knowledge
  ADD COLUMN IF NOT EXISTS extraction_run_id UUID,
  ADD COLUMN IF NOT EXISTS provider TEXT,
  ADD COLUMN IF NOT EXISTS model TEXT;

CREATE INDEX IF NOT EXISTS idx_ck_extraction_run ON public.candidate_knowledge(client_id, extraction_run_id);

-- Coluna na materia para guardar versão atual e provider corrente
ALTER TABLE public.materias_geradas
  ADD COLUMN IF NOT EXISTS versao INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS provider TEXT,
  ADD COLUMN IF NOT EXISTS model TEXT;