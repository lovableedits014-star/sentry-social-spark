-- 1) Social identity table
CREATE TABLE IF NOT EXISTS public.social_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  platform_user_id TEXT NOT NULL,
  username TEXT,
  display_name TEXT,
  avatar_url TEXT,
  last_seen TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT social_profiles_platform_check CHECK (platform IN ('facebook', 'instagram')),
  CONSTRAINT social_profiles_unique UNIQUE (client_id, platform, platform_user_id)
);

ALTER TABLE public.social_profiles ENABLE ROW LEVEL SECURITY;

-- Policies (match existing multi-tenant model: client owner only)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' AND tablename = 'social_profiles' AND policyname = 'Users can view their own social profiles'
  ) THEN
    CREATE POLICY "Users can view their own social profiles"
    ON public.social_profiles
    FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM public.clients
        WHERE clients.id = social_profiles.client_id
          AND clients.user_id = auth.uid()
      )
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' AND tablename = 'social_profiles' AND policyname = 'Users can insert their own social profiles'
  ) THEN
    CREATE POLICY "Users can insert their own social profiles"
    ON public.social_profiles
    FOR INSERT
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.clients
        WHERE clients.id = social_profiles.client_id
          AND clients.user_id = auth.uid()
      )
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' AND tablename = 'social_profiles' AND policyname = 'Users can update their own social profiles'
  ) THEN
    CREATE POLICY "Users can update their own social profiles"
    ON public.social_profiles
    FOR UPDATE
    USING (
      EXISTS (
        SELECT 1 FROM public.clients
        WHERE clients.id = social_profiles.client_id
          AND clients.user_id = auth.uid()
      )
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' AND tablename = 'social_profiles' AND policyname = 'Users can delete their own social profiles'
  ) THEN
    CREATE POLICY "Users can delete their own social profiles"
    ON public.social_profiles
    FOR DELETE
    USING (
      EXISTS (
        SELECT 1 FROM public.clients
        WHERE clients.id = social_profiles.client_id
          AND clients.user_id = auth.uid()
      )
    );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_social_profiles_lookup
  ON public.social_profiles (client_id, platform, platform_user_id);


-- 2) comments: link to social_profiles + enforce identity for new writes
ALTER TABLE public.comments
  ADD COLUMN IF NOT EXISTS social_profile_id UUID;

ALTER TABLE public.comments
  ADD COLUMN IF NOT EXISTS platform_user_id TEXT;

ALTER TABLE public.comments
  ADD COLUMN IF NOT EXISTS author_unavailable BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.comments
  ADD COLUMN IF NOT EXISTS author_unavailable_reason TEXT;

-- Normalize existing rows to avoid breaking new constraints
UPDATE public.comments
SET platform = 'facebook'
WHERE platform IS NULL;

UPDATE public.comments
SET platform_user_id = author_id
WHERE platform_user_id IS NULL
  AND author_id IS NOT NULL;

UPDATE public.comments
SET platform_user_id = author_name
WHERE platform_user_id IS NULL
  AND platform = 'instagram'
  AND author_name IS NOT NULL
  AND author_name NOT IN ('Usuário Instagram', 'Desconhecido');

-- FK + indexes
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'comments_social_profile_id_fkey'
  ) THEN
    ALTER TABLE public.comments
      ADD CONSTRAINT comments_social_profile_id_fkey
      FOREIGN KEY (social_profile_id)
      REFERENCES public.social_profiles(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_comments_social_profile
  ON public.comments (social_profile_id);

CREATE INDEX IF NOT EXISTS idx_comments_client_post
  ON public.comments (client_id, post_id);

-- Uniqueness for safe upsert
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'comments_unique_platform_comment'
  ) THEN
    ALTER TABLE public.comments
      ADD CONSTRAINT comments_unique_platform_comment
      UNIQUE (client_id, platform, comment_id);
  END IF;
END $$;

-- Enforce for NEW rows/updates (NOT VALID keeps legacy data intact)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'comments_platform_not_null'
  ) THEN
    ALTER TABLE public.comments
      ADD CONSTRAINT comments_platform_not_null
      CHECK (platform IS NOT NULL)
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'comments_identity_min'
  ) THEN
    ALTER TABLE public.comments
      ADD CONSTRAINT comments_identity_min
      CHECK (
        author_unavailable
        OR (platform_user_id IS NOT NULL AND social_profile_id IS NOT NULL)
      )
      NOT VALID;
  END IF;
END $$;