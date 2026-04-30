
-- ========================================
-- 1) social_militants
-- ========================================
CREATE TABLE public.social_militants (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('facebook','instagram')),
  platform_user_id TEXT NOT NULL,
  author_name TEXT,
  avatar_url TEXT,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  total_comments INTEGER NOT NULL DEFAULT 0,
  total_positive INTEGER NOT NULL DEFAULT 0,
  total_negative INTEGER NOT NULL DEFAULT 0,
  total_neutral INTEGER NOT NULL DEFAULT 0,
  total_30d_positive INTEGER NOT NULL DEFAULT 0,
  total_30d_negative INTEGER NOT NULL DEFAULT 0,
  current_badge TEXT,
  promoted_to_supporter_id UUID,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (client_id, platform, platform_user_id)
);

CREATE INDEX idx_social_militants_client_platform ON public.social_militants (client_id, platform);
CREATE INDEX idx_social_militants_badge ON public.social_militants (client_id, platform, current_badge);
CREATE INDEX idx_social_militants_last_seen ON public.social_militants (client_id, last_seen_at DESC);

ALTER TABLE public.social_militants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Client owners view militants"
  ON public.social_militants FOR SELECT
  USING (
    client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid())
    OR client_id IN (SELECT client_id FROM public.team_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Client owners update militants"
  ON public.social_militants FOR UPDATE
  USING (
    client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid())
    OR client_id IN (SELECT client_id FROM public.team_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Client owners insert militants"
  ON public.social_militants FOR INSERT
  WITH CHECK (
    client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid())
    OR client_id IN (SELECT client_id FROM public.team_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Client owners delete militants"
  ON public.social_militants FOR DELETE
  USING (
    client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid())
    OR client_id IN (SELECT client_id FROM public.team_members WHERE user_id = auth.uid())
  );

-- ========================================
-- 2) sentiment_corrections
-- ========================================
CREATE TABLE public.sentiment_corrections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL,
  comment_id TEXT,
  comment_text TEXT NOT NULL,
  ai_predicted TEXT,
  human_corrected TEXT NOT NULL,
  corrected_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sentiment_corrections_client_recent ON public.sentiment_corrections (client_id, created_at DESC);

ALTER TABLE public.sentiment_corrections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Client owners view corrections"
  ON public.sentiment_corrections FOR SELECT
  USING (
    client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid())
    OR client_id IN (SELECT client_id FROM public.team_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Client owners insert corrections"
  ON public.sentiment_corrections FOR INSERT
  WITH CHECK (
    client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid())
    OR client_id IN (SELECT client_id FROM public.team_members WHERE user_id = auth.uid())
  );

-- ========================================
-- 3) comments — novas colunas
-- ========================================
ALTER TABLE public.comments
  ADD COLUMN IF NOT EXISTS sentiment_source TEXT NOT NULL DEFAULT 'ai' CHECK (sentiment_source IN ('ai','human')),
  ADD COLUMN IF NOT EXISTS sentiment_confidence NUMERIC,
  ADD COLUMN IF NOT EXISTS needs_review BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_comments_needs_review ON public.comments (client_id, needs_review) WHERE needs_review = true;

-- ========================================
-- 4) Função de cálculo de selo
-- ========================================
CREATE OR REPLACE FUNCTION public.compute_militant_badge(
  p_total_pos INTEGER,
  p_total_neg INTEGER,
  p_total_comments INTEGER,
  p_30d_pos INTEGER,
  p_30d_neg INTEGER,
  p_first_seen TIMESTAMPTZ,
  p_last_seen TIMESTAMPTZ
) RETURNS TEXT
LANGUAGE plpgsql IMMUTABLE
AS $$
BEGIN
  IF p_total_neg >= 10 THEN RETURN 'hater'; END IF;
  IF p_30d_neg >= 3 THEN RETURN 'critico'; END IF;
  IF p_total_comments >= 3 AND p_last_seen < (now() - INTERVAL '60 days') THEN RETURN 'sumido'; END IF;
  IF p_total_pos >= 15 AND p_total_neg = 0 THEN RETURN 'elite'; END IF;
  IF p_30d_pos >= 5 THEN RETURN 'defensor'; END IF;
  IF p_total_comments >= 10 THEN RETURN 'engajado'; END IF;
  IF p_first_seen >= (now() - INTERVAL '7 days') THEN RETURN 'novo'; END IF;
  RETURN 'observador';
END;
$$;

-- ========================================
-- 5) Função de recálculo de militante
-- ========================================
CREATE OR REPLACE FUNCTION public.recompute_militant(
  p_client_id UUID,
  p_platform TEXT,
  p_platform_user_id TEXT
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_total_pos INTEGER := 0;
  v_total_neg INTEGER := 0;
  v_total_neu INTEGER := 0;
  v_total_all INTEGER := 0;
  v_30d_pos INTEGER := 0;
  v_30d_neg INTEGER := 0;
  v_first TIMESTAMPTZ;
  v_last TIMESTAMPTZ;
  v_name TEXT;
  v_avatar TEXT;
  v_badge TEXT;
BEGIN
  SELECT
    COUNT(*) FILTER (WHERE sentiment = 'positive'),
    COUNT(*) FILTER (WHERE sentiment = 'negative'),
    COUNT(*) FILTER (WHERE sentiment = 'neutral'),
    COUNT(*),
    COUNT(*) FILTER (WHERE sentiment = 'positive' AND COALESCE(comment_created_time, created_at) >= (now() - INTERVAL '30 days')),
    COUNT(*) FILTER (WHERE sentiment = 'negative' AND COALESCE(comment_created_time, created_at) >= (now() - INTERVAL '30 days')),
    MIN(COALESCE(comment_created_time, created_at)),
    MAX(COALESCE(comment_created_time, created_at)),
    (array_agg(author_name ORDER BY created_at DESC) FILTER (WHERE author_name IS NOT NULL))[1],
    (array_agg(author_profile_picture ORDER BY created_at DESC) FILTER (WHERE author_profile_picture IS NOT NULL))[1]
  INTO v_total_pos, v_total_neg, v_total_neu, v_total_all, v_30d_pos, v_30d_neg, v_first, v_last, v_name, v_avatar
  FROM public.comments
  WHERE client_id = p_client_id
    AND platform = p_platform
    AND platform_user_id = p_platform_user_id
    AND is_page_owner = false
    AND text <> '__post_stub__';

  IF v_total_all = 0 THEN RETURN; END IF;

  v_badge := public.compute_militant_badge(v_total_pos, v_total_neg, v_total_all, v_30d_pos, v_30d_neg, v_first, v_last);

  INSERT INTO public.social_militants (
    client_id, platform, platform_user_id, author_name, avatar_url,
    first_seen_at, last_seen_at,
    total_comments, total_positive, total_negative, total_neutral,
    total_30d_positive, total_30d_negative, current_badge, updated_at
  ) VALUES (
    p_client_id, p_platform, p_platform_user_id, v_name, v_avatar,
    v_first, v_last,
    v_total_all, v_total_pos, v_total_neg, v_total_neu,
    v_30d_pos, v_30d_neg, v_badge, now()
  )
  ON CONFLICT (client_id, platform, platform_user_id) DO UPDATE SET
    author_name = COALESCE(EXCLUDED.author_name, social_militants.author_name),
    avatar_url = COALESCE(EXCLUDED.avatar_url, social_militants.avatar_url),
    first_seen_at = LEAST(social_militants.first_seen_at, EXCLUDED.first_seen_at),
    last_seen_at = GREATEST(social_militants.last_seen_at, EXCLUDED.last_seen_at),
    total_comments = EXCLUDED.total_comments,
    total_positive = EXCLUDED.total_positive,
    total_negative = EXCLUDED.total_negative,
    total_neutral = EXCLUDED.total_neutral,
    total_30d_positive = EXCLUDED.total_30d_positive,
    total_30d_negative = EXCLUDED.total_30d_negative,
    current_badge = EXCLUDED.current_badge,
    updated_at = now();
END;
$$;

-- ========================================
-- 6) Trigger: upsert em insert
-- ========================================
CREATE OR REPLACE FUNCTION public.trg_militant_on_comment_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.is_page_owner = true THEN RETURN NEW; END IF;
  IF NEW.platform_user_id IS NULL OR NEW.platform_user_id = '' THEN RETURN NEW; END IF;
  IF NEW.text = '__post_stub__' THEN RETURN NEW; END IF;
  IF NEW.platform NOT IN ('facebook','instagram') THEN RETURN NEW; END IF;
  PERFORM public.recompute_militant(NEW.client_id, NEW.platform, NEW.platform_user_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_militant_upsert_on_comment ON public.comments;
CREATE TRIGGER trg_militant_upsert_on_comment
  AFTER INSERT ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.trg_militant_on_comment_insert();

-- ========================================
-- 7) Trigger: recompute em mudança de sentiment
-- ========================================
CREATE OR REPLACE FUNCTION public.trg_militant_on_sentiment_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.is_page_owner = true THEN RETURN NEW; END IF;
  IF NEW.platform_user_id IS NULL OR NEW.platform_user_id = '' THEN RETURN NEW; END IF;
  IF NEW.platform NOT IN ('facebook','instagram') THEN RETURN NEW; END IF;
  IF OLD.sentiment IS DISTINCT FROM NEW.sentiment THEN
    PERFORM public.recompute_militant(NEW.client_id, NEW.platform, NEW.platform_user_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_militant_recompute_on_sentiment ON public.comments;
CREATE TRIGGER trg_militant_recompute_on_sentiment
  AFTER UPDATE OF sentiment ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.trg_militant_on_sentiment_change();

-- ========================================
-- 8) Trigger: proteger sentimento humano + log
-- ========================================
CREATE OR REPLACE FUNCTION public.trg_protect_and_log_sentiment()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.sentiment_source = 'human'
     AND NEW.sentiment_source = 'ai'
     AND NEW.sentiment IS DISTINCT FROM OLD.sentiment THEN
    NEW.sentiment := OLD.sentiment;
    NEW.sentiment_source := 'human';
    NEW.sentiment_confidence := OLD.sentiment_confidence;
    NEW.needs_review := false;
  END IF;

  IF NEW.sentiment_source = 'human'
     AND NEW.sentiment IS DISTINCT FROM OLD.sentiment
     AND NEW.text IS NOT NULL
     AND NEW.text <> '__post_stub__' THEN
    NEW.needs_review := false;
    INSERT INTO public.sentiment_corrections (
      client_id, comment_id, comment_text, ai_predicted, human_corrected, corrected_by
    ) VALUES (
      NEW.client_id, NEW.comment_id, NEW.text, OLD.sentiment, NEW.sentiment, auth.uid()
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_human_sentiment ON public.comments;
CREATE TRIGGER trg_protect_human_sentiment
  BEFORE UPDATE OF sentiment, sentiment_source ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.trg_protect_and_log_sentiment();

-- ========================================
-- 9) updated_at
-- ========================================
DROP TRIGGER IF EXISTS trg_social_militants_updated_at ON public.social_militants;
CREATE TRIGGER trg_social_militants_updated_at
  BEFORE UPDATE ON public.social_militants
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ========================================
-- 10) BACKFILL
-- ========================================
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT client_id, platform, platform_user_id
    FROM public.comments
    WHERE is_page_owner = false
      AND platform_user_id IS NOT NULL
      AND platform_user_id <> ''
      AND platform IN ('facebook','instagram')
      AND text <> '__post_stub__'
  LOOP
    PERFORM public.recompute_militant(r.client_id, r.platform, r.platform_user_id);
  END LOOP;
END $$;
