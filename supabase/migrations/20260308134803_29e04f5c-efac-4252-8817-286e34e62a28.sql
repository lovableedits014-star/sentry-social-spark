CREATE POLICY "Public can insert pessoas via registration form"
ON public.pessoas
FOR INSERT
TO anon, authenticated
WITH CHECK (
  origem_contato = 'formulario'
  AND EXISTS (
    SELECT 1 FROM clients WHERE clients.id = pessoas.client_id
  )
);