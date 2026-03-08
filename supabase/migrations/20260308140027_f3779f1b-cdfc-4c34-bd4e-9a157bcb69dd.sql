CREATE POLICY "Public can insert pessoa_social via registration"
ON public.pessoa_social
FOR INSERT
TO anon, authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM pessoas p
    JOIN clients c ON c.id = p.client_id
    WHERE p.id = pessoa_social.pessoa_id
  )
);