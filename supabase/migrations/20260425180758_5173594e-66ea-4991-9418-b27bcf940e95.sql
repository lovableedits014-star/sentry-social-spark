-- 1. Add composition column (JSONB) to campaign_frames
ALTER TABLE public.campaign_frames
  ADD COLUMN IF NOT EXISTS composition jsonb,
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'composition';

-- 2. Migrate existing PNG-only frames into composition format
-- Default circle: centered at 540,540 with radius 380 (fits 1080x1080)
-- The existing image_url becomes the top overlay layer
UPDATE public.campaign_frames
SET
  kind = 'composition',
  composition = jsonb_build_object(
    'canvas', jsonb_build_object('width', 1080, 'height', 1080),
    'background', jsonb_build_object('type', 'color', 'color', '#ffffff'),
    'photoCircle', jsonb_build_object('cx', 540, 'cy', 540, 'r', 380),
    'layers', jsonb_build_array(
      jsonb_build_object(
        'id', gen_random_uuid()::text,
        'name', 'Moldura',
        'imageUrl', image_url,
        'x', 540,
        'y', 540,
        'scale', 1,
        'rotation', 0,
        'opacity', 1
      )
    )
  )
WHERE composition IS NULL;

-- 3. Create storage bucket for composition assets (backgrounds + extra elements)
INSERT INTO storage.buckets (id, name, public)
VALUES ('campaign-frame-assets', 'campaign-frame-assets', true)
ON CONFLICT (id) DO NOTHING;

-- 4. Storage policies for the new bucket
DROP POLICY IF EXISTS "Anyone can view campaign frame assets" ON storage.objects;
CREATE POLICY "Anyone can view campaign frame assets"
ON storage.objects FOR SELECT
USING (bucket_id = 'campaign-frame-assets');

DROP POLICY IF EXISTS "Authenticated can upload campaign frame assets" ON storage.objects;
CREATE POLICY "Authenticated can upload campaign frame assets"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'campaign-frame-assets');

DROP POLICY IF EXISTS "Authenticated can update campaign frame assets" ON storage.objects;
CREATE POLICY "Authenticated can update campaign frame assets"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'campaign-frame-assets');

DROP POLICY IF EXISTS "Authenticated can delete campaign frame assets" ON storage.objects;
CREATE POLICY "Authenticated can delete campaign frame assets"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'campaign-frame-assets');