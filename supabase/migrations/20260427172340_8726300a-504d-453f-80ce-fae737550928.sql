-- Tabela: identidade do candidato (logo única por cliente)
CREATE TABLE public.candidate_identity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL UNIQUE REFERENCES public.clients(id) ON DELETE CASCADE,
  logo_url text,
  logo_path text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.candidate_identity ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team members manage candidate_identity"
ON public.candidate_identity
FOR ALL
TO authenticated
USING (
  client_id IN (SELECT tm.client_id FROM public.team_members tm WHERE tm.user_id = auth.uid() AND tm.status = 'active')
  OR public.is_super_admin()
)
WITH CHECK (
  client_id IN (SELECT tm.client_id FROM public.team_members tm WHERE tm.user_id = auth.uid() AND tm.status = 'active')
  OR public.is_super_admin()
);

CREATE TRIGGER trg_candidate_identity_updated_at
BEFORE UPDATE ON public.candidate_identity
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Tabela: galeria de fotos do candidato (até 10 por cliente)
CREATE TABLE public.candidate_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  photo_url text NOT NULL,
  photo_path text NOT NULL,
  label text,
  description text,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_candidate_photos_client ON public.candidate_photos(client_id);

ALTER TABLE public.candidate_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team members manage candidate_photos"
ON public.candidate_photos
FOR ALL
TO authenticated
USING (
  client_id IN (SELECT tm.client_id FROM public.team_members tm WHERE tm.user_id = auth.uid() AND tm.status = 'active')
  OR public.is_super_admin()
)
WITH CHECK (
  client_id IN (SELECT tm.client_id FROM public.team_members tm WHERE tm.user_id = auth.uid() AND tm.status = 'active')
  OR public.is_super_admin()
);

CREATE TRIGGER trg_candidate_photos_updated_at
BEFORE UPDATE ON public.candidate_photos
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Limite de 10 fotos por cliente
CREATE OR REPLACE FUNCTION public.enforce_candidate_photos_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  SELECT COUNT(*) INTO v_count FROM public.candidate_photos WHERE client_id = NEW.client_id;
  IF v_count >= 10 THEN
    RAISE EXCEPTION 'Limite de 10 fotos por candidato atingido' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_enforce_candidate_photos_limit
BEFORE INSERT ON public.candidate_photos
FOR EACH ROW EXECUTE FUNCTION public.enforce_candidate_photos_limit();

-- Bucket público
INSERT INTO storage.buckets (id, name, public)
VALUES ('candidate-identity', 'candidate-identity', true)
ON CONFLICT (id) DO NOTHING;

-- Storage: leitura pública (a IA precisa baixar os arquivos por URL)
CREATE POLICY "Public read candidate-identity"
ON storage.objects FOR SELECT
USING (bucket_id = 'candidate-identity');

-- Storage: upload/edit/delete restritos à equipe do cliente. Path = {client_id}/...
CREATE POLICY "Team upload candidate-identity"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'candidate-identity'
  AND (
    (storage.foldername(name))[1] IN (
      SELECT tm.client_id::text FROM public.team_members tm WHERE tm.user_id = auth.uid() AND tm.status = 'active'
    )
    OR public.is_super_admin()
  )
);

CREATE POLICY "Team update candidate-identity"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'candidate-identity'
  AND (
    (storage.foldername(name))[1] IN (
      SELECT tm.client_id::text FROM public.team_members tm WHERE tm.user_id = auth.uid() AND tm.status = 'active'
    )
    OR public.is_super_admin()
  )
);

CREATE POLICY "Team delete candidate-identity"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'candidate-identity'
  AND (
    (storage.foldername(name))[1] IN (
      SELECT tm.client_id::text FROM public.team_members tm WHERE tm.user_id = auth.uid() AND tm.status = 'active'
    )
    OR public.is_super_admin()
  )
);