CREATE POLICY "Public can read basic client info"
ON public.clients
FOR SELECT
TO anon
USING (true);