
-- Bucket privado para uploads manuais do TSE
INSERT INTO storage.buckets (id, name, public)
VALUES ('tse-imports', 'tse-imports', false)
ON CONFLICT (id) DO NOTHING;

-- Apenas o super-admin (pelo email) pode enviar/ler/atualizar/deletar
DROP POLICY IF EXISTS "Super-admin lê tse-imports" ON storage.objects;
CREATE POLICY "Super-admin lê tse-imports"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'tse-imports'
  AND (auth.jwt() ->> 'email') = 'lovableedits014@gmail.com'
);

DROP POLICY IF EXISTS "Super-admin envia tse-imports" ON storage.objects;
CREATE POLICY "Super-admin envia tse-imports"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'tse-imports'
  AND (auth.jwt() ->> 'email') = 'lovableedits014@gmail.com'
);

DROP POLICY IF EXISTS "Super-admin atualiza tse-imports" ON storage.objects;
CREATE POLICY "Super-admin atualiza tse-imports"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'tse-imports'
  AND (auth.jwt() ->> 'email') = 'lovableedits014@gmail.com'
);

DROP POLICY IF EXISTS "Super-admin remove tse-imports" ON storage.objects;
CREATE POLICY "Super-admin remove tse-imports"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'tse-imports'
  AND (auth.jwt() ->> 'email') = 'lovableedits014@gmail.com'
);
