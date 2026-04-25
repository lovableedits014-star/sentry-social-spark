-- Substituir policies permissivas por versões restritas a donos de clientes
DROP POLICY IF EXISTS "Authenticated can upload campaign frame files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can update campaign frame files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can delete campaign frame files" ON storage.objects;

CREATE POLICY "Client owners can upload campaign frame files"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'campaign-frames'
  AND EXISTS (SELECT 1 FROM public.clients c WHERE c.user_id = auth.uid())
);

CREATE POLICY "Client owners can update campaign frame files"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'campaign-frames'
  AND EXISTS (SELECT 1 FROM public.clients c WHERE c.user_id = auth.uid())
);

CREATE POLICY "Client owners can delete campaign frame files"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'campaign-frames'
  AND EXISTS (SELECT 1 FROM public.clients c WHERE c.user_id = auth.uid())
);