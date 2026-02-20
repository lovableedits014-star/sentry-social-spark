
-- Tabela de convites para cadastro controlado de admins
CREATE TABLE public.invite_tokens (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  created_by UUID NOT NULL, -- super-admin que gerou
  used_by UUID NULL,         -- user_id de quem usou
  used_at TIMESTAMP WITH TIME ZONE NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now() + INTERVAL '7 days',
  note TEXT NULL,            -- ex: "Cliente João Silva - campanha 2026"
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.invite_tokens ENABLE ROW LEVEL SECURITY;

-- Só o super-admin pode ver e criar convites (RLS via função auxiliar)
-- Usaremos email check via função security definer
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = auth.uid()
    AND email = 'saintmarq@gmail.com'
  )
$$;

-- Super-admin pode ver todos os convites
CREATE POLICY "Super admin can view invites"
ON public.invite_tokens
FOR SELECT
USING (public.is_super_admin());

-- Super-admin pode criar convites
CREATE POLICY "Super admin can create invites"
ON public.invite_tokens
FOR INSERT
WITH CHECK (public.is_super_admin());

-- Super-admin pode deletar convites
CREATE POLICY "Super admin can delete invites"
ON public.invite_tokens
FOR DELETE
USING (public.is_super_admin());

-- Qualquer pessoa pode usar um token válido (para registrar-se) — lida na edge function com service role
-- Convite pode ser marcado como usado por qualquer um autenticado (para o fluxo de cadastro)
CREATE POLICY "Authenticated can mark invite as used"
ON public.invite_tokens
FOR UPDATE
USING (used_by IS NULL AND expires_at > now())
WITH CHECK (auth.uid() = used_by);

-- Storage bucket para logos dos clientes
INSERT INTO storage.buckets (id, name, public)
VALUES ('client-logos', 'client-logos', true)
ON CONFLICT (id) DO NOTHING;

-- RLS para storage: cada cliente só faz upload na sua pasta
CREATE POLICY "Client can upload own logo"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'client-logos'
  AND auth.uid() IS NOT NULL
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Client can update own logo"
ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'client-logos'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Client can delete own logo"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'client-logos'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Anyone can view client logos"
ON storage.objects
FOR SELECT
USING (bucket_id = 'client-logos');
