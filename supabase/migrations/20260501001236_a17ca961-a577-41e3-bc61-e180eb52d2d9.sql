DROP POLICY IF EXISTS "Team members can view client materias" ON public.materias_geradas;
DROP POLICY IF EXISTS "Team members can create client materias" ON public.materias_geradas;
DROP POLICY IF EXISTS "Team members can update client materias" ON public.materias_geradas;
DROP POLICY IF EXISTS "Team members can delete client materias" ON public.materias_geradas;

CREATE POLICY "Team members can view client materias"
ON public.materias_geradas
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.team_members tm
    WHERE tm.client_id = materias_geradas.client_id
      AND tm.user_id = auth.uid()
      AND tm.status = 'active'
  )
);

CREATE POLICY "Team members can create client materias"
ON public.materias_geradas
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.team_members tm
    WHERE tm.client_id = materias_geradas.client_id
      AND tm.user_id = auth.uid()
      AND tm.status = 'active'
  )
);

CREATE POLICY "Team members can update client materias"
ON public.materias_geradas
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.team_members tm
    WHERE tm.client_id = materias_geradas.client_id
      AND tm.user_id = auth.uid()
      AND tm.status = 'active'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.team_members tm
    WHERE tm.client_id = materias_geradas.client_id
      AND tm.user_id = auth.uid()
      AND tm.status = 'active'
  )
);

CREATE POLICY "Team members can delete client materias"
ON public.materias_geradas
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.team_members tm
    WHERE tm.client_id = materias_geradas.client_id
      AND tm.user_id = auth.uid()
      AND tm.status = 'active'
  )
);

DROP POLICY IF EXISTS "Team members can view materia versions" ON public.materias_versions;
DROP POLICY IF EXISTS "Team members can create materia versions" ON public.materias_versions;

CREATE POLICY "Team members can view materia versions"
ON public.materias_versions
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.team_members tm
    WHERE tm.client_id = materias_versions.client_id
      AND tm.user_id = auth.uid()
      AND tm.status = 'active'
  )
);

CREATE POLICY "Team members can create materia versions"
ON public.materias_versions
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.team_members tm
    WHERE tm.client_id = materias_versions.client_id
      AND tm.user_id = auth.uid()
      AND tm.status = 'active'
  )
);

DROP POLICY IF EXISTS "Team members can view client knowledge" ON public.candidate_knowledge;
CREATE POLICY "Team members can view client knowledge"
ON public.candidate_knowledge
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.team_members tm
    WHERE tm.client_id = candidate_knowledge.client_id
      AND tm.user_id = auth.uid()
      AND tm.status = 'active'
  )
);