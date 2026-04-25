-- Tabela de molduras
CREATE TABLE public.campaign_frames (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  image_url TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_campaign_frames_client ON public.campaign_frames(client_id, is_active, display_order);

ALTER TABLE public.campaign_frames ENABLE ROW LEVEL SECURITY;

-- Leitura pública (portal não exige login)
CREATE POLICY "Anyone can view active campaign frames"
ON public.campaign_frames
FOR SELECT
USING (is_active = true);

-- Dono do cliente gerencia
CREATE POLICY "Client owner can view all own frames"
ON public.campaign_frames
FOR SELECT
TO authenticated
USING (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND c.user_id = auth.uid()));

CREATE POLICY "Client owner can insert frames"
ON public.campaign_frames
FOR INSERT
TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND c.user_id = auth.uid()));

CREATE POLICY "Client owner can update frames"
ON public.campaign_frames
FOR UPDATE
TO authenticated
USING (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND c.user_id = auth.uid()));

CREATE POLICY "Client owner can delete frames"
ON public.campaign_frames
FOR DELETE
TO authenticated
USING (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND c.user_id = auth.uid()));

-- Trigger updated_at
CREATE TRIGGER trg_campaign_frames_updated_at
BEFORE UPDATE ON public.campaign_frames
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Bucket público
INSERT INTO storage.buckets (id, name, public)
VALUES ('campaign-frames', 'campaign-frames', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "Public can read campaign frame files"
ON storage.objects FOR SELECT
USING (bucket_id = 'campaign-frames');

CREATE POLICY "Authenticated can upload campaign frame files"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'campaign-frames');

CREATE POLICY "Authenticated can update campaign frame files"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'campaign-frames');

CREATE POLICY "Authenticated can delete campaign frame files"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'campaign-frames');