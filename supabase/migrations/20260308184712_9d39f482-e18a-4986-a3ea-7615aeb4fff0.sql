-- Allow client owner to delete contratado checkins
CREATE POLICY "Client owner can delete checkins"
ON public.contratado_checkins
FOR DELETE
USING (EXISTS (
  SELECT 1 FROM clients WHERE clients.id = contratado_checkins.client_id AND clients.user_id = auth.uid()
));