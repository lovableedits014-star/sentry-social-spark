
DROP POLICY IF EXISTS "Client owners manage own invite tokens" ON public.lider_invite_tokens;

CREATE POLICY "Client owners insert invite tokens"
ON public.lider_invite_tokens
FOR INSERT
WITH CHECK (
  client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid())
);

CREATE POLICY "Client owners update invite tokens"
ON public.lider_invite_tokens
FOR UPDATE
USING (
  client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid())
)
WITH CHECK (
  client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid())
);

CREATE POLICY "Client owners delete invite tokens"
ON public.lider_invite_tokens
FOR DELETE
USING (
  client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid())
);
