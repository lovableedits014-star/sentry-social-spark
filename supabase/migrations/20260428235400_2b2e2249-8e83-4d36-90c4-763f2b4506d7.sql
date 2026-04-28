INSERT INTO storage.buckets (id, name, public)
VALUES ('whatsapp-media', 'whatsapp-media', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DO $$ BEGIN
  CREATE POLICY "whatsapp-media public read" ON storage.objects
    FOR SELECT USING (bucket_id = 'whatsapp-media');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "whatsapp-media service write" ON storage.objects
    FOR INSERT WITH CHECK (bucket_id = 'whatsapp-media');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;