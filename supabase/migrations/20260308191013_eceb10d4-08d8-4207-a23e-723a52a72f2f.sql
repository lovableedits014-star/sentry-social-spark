
CREATE POLICY "Contratado can update own whatsapp_confirmado"
ON public.contratados
FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());
