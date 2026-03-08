-- Contratado can view own record
CREATE POLICY "Contratado can view own record"
ON public.contratados
FOR SELECT
USING (user_id = auth.uid());

-- Contratado can view portal_missions for their client
CREATE POLICY "Contratado can view portal missions"
ON public.portal_missions
FOR SELECT
USING (EXISTS (
  SELECT 1 FROM contratados
  WHERE contratados.client_id = portal_missions.client_id
  AND contratados.user_id = auth.uid()
));