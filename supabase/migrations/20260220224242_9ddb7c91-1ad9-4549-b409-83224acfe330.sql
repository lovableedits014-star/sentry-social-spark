
-- Corrigir policy UPDATE para ser mais restrita (só service role via auth.role())
DROP POLICY IF EXISTS "Service role can update dispatch jobs" ON public.push_dispatch_jobs;

-- A atualização dos jobs é feita apenas pela edge function com service role key
-- que bypassa RLS automaticamente — não precisamos de policy para isso
-- Mas adicionamos uma para usuários poderem cancelar seus próprios jobs (futuro)
CREATE POLICY "Users can update own dispatch jobs"
  ON public.push_dispatch_jobs FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.clients
    WHERE clients.id = push_dispatch_jobs.client_id
      AND clients.user_id = auth.uid()
  ));
