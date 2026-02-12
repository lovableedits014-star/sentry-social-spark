
-- Table to store monthly score snapshots
CREATE TABLE public.engagement_score_history (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  supporter_id uuid NOT NULL REFERENCES public.supporters(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  month_year text NOT NULL, -- format: '2026-02'
  score integer NOT NULL DEFAULT 0,
  action_count integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Unique constraint: one record per supporter per month
ALTER TABLE public.engagement_score_history 
  ADD CONSTRAINT unique_supporter_month UNIQUE (supporter_id, month_year);

-- Enable RLS
ALTER TABLE public.engagement_score_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own score history"
  ON public.engagement_score_history FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM clients WHERE clients.id = engagement_score_history.client_id AND clients.user_id = auth.uid()
  ));

CREATE POLICY "Users can insert their own score history"
  ON public.engagement_score_history FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM clients WHERE clients.id = engagement_score_history.client_id AND clients.user_id = auth.uid()
  ));

CREATE POLICY "Users can update their own score history"
  ON public.engagement_score_history FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM clients WHERE clients.id = engagement_score_history.client_id AND clients.user_id = auth.uid()
  ));

-- Index for fast lookups
CREATE INDEX idx_score_history_supporter ON public.engagement_score_history(supporter_id);
CREATE INDEX idx_score_history_client_month ON public.engagement_score_history(client_id, month_year);

-- Update link_orphan_engagement_actions to also match by username (case-insensitive)
CREATE OR REPLACE FUNCTION public.link_orphan_engagement_actions(p_client_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_linked INTEGER := 0;
  v_linked2 INTEGER := 0;
BEGIN
  -- Match 1: By platform + platform_user_id (exact match)
  UPDATE engagement_actions ea
  SET supporter_id = sp.supporter_id
  FROM supporter_profiles sp
  WHERE ea.client_id = p_client_id
    AND ea.supporter_id IS NULL
    AND ea.platform_user_id IS NOT NULL
    AND sp.platform = ea.platform
    AND sp.platform_user_id = ea.platform_user_id;
  GET DIAGNOSTICS v_linked = ROW_COUNT;

  -- Match 2: By platform_username (fuzzy - handles URL slug vs display name)
  -- Match engagement_actions.platform_username against supporter_profiles.platform_username
  -- removing @ and comparing case-insensitively
  UPDATE engagement_actions ea
  SET supporter_id = sp.supporter_id
  FROM supporter_profiles sp
  WHERE ea.client_id = p_client_id
    AND ea.supporter_id IS NULL
    AND ea.platform_username IS NOT NULL
    AND sp.platform = ea.platform
    AND sp.platform_username IS NOT NULL
    AND LOWER(TRIM(BOTH '@' FROM sp.platform_username)) = LOWER(TRIM(BOTH '@' FROM ea.platform_username));
  GET DIAGNOSTICS v_linked2 = ROW_COUNT;
  v_linked := v_linked + v_linked2;

  -- Match 3: Try matching engagement_action platform_user_id against comments to find 
  -- the actual numeric ID for supporters registered by URL slug
  -- First update supporter_profiles with real numeric IDs found in comments
  UPDATE supporter_profiles sp
  SET platform_user_id = c.author_id
  FROM comments c
  WHERE sp.platform_user_id NOT SIMILAR TO '[0-9]+'
    AND c.client_id = p_client_id
    AND c.platform = sp.platform
    AND c.author_id IS NOT NULL
    AND c.author_name IS NOT NULL
    AND (
      -- Match by username slug patterns in author_name  
      LOWER(REPLACE(REPLACE(c.author_name, ' ', '.'), '''', '')) LIKE '%' || LOWER(sp.platform_user_id) || '%'
      OR LOWER(REPLACE(sp.platform_user_id, '.', ' ')) = LOWER(c.author_name)
    );

  -- Now re-run match 1 with updated IDs
  UPDATE engagement_actions ea
  SET supporter_id = sp.supporter_id
  FROM supporter_profiles sp
  WHERE ea.client_id = p_client_id
    AND ea.supporter_id IS NULL
    AND ea.platform_user_id IS NOT NULL
    AND sp.platform = ea.platform
    AND sp.platform_user_id = ea.platform_user_id;
  GET DIAGNOSTICS v_linked2 = ROW_COUNT;
  v_linked := v_linked + v_linked2;

  -- Update last_interaction_date for affected supporters
  UPDATE supporters s
  SET last_interaction_date = sub.max_date,
      updated_at = NOW()
  FROM (
    SELECT ea.supporter_id, MAX(ea.action_date) as max_date
    FROM engagement_actions ea
    WHERE ea.client_id = p_client_id
      AND ea.supporter_id IS NOT NULL
    GROUP BY ea.supporter_id
  ) sub
  WHERE s.id = sub.supporter_id
    AND s.client_id = p_client_id
    AND (s.last_interaction_date IS NULL OR s.last_interaction_date < sub.max_date);

  -- Recalculate scores for all supporters of this client
  PERFORM calculate_engagement_score(s.id)
  FROM supporters s
  WHERE s.client_id = p_client_id;

  RETURN v_linked;
END;
$function$;

-- Function to snapshot current month scores and reset
CREATE OR REPLACE FUNCTION public.snapshot_monthly_scores(p_client_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_month text;
  v_count integer := 0;
BEGIN
  v_month := TO_CHAR(NOW(), 'YYYY-MM');

  -- Insert or update score history for current month
  INSERT INTO engagement_score_history (supporter_id, client_id, month_year, score, action_count)
  SELECT 
    s.id,
    s.client_id,
    v_month,
    COALESCE(s.engagement_score, 0),
    COALESCE((
      SELECT COUNT(*) FROM engagement_actions ea 
      WHERE ea.supporter_id = s.id 
        AND TO_CHAR(ea.action_date, 'YYYY-MM') = v_month
    ), 0)
  FROM supporters s
  WHERE s.client_id = p_client_id
  ON CONFLICT (supporter_id, month_year) 
  DO UPDATE SET 
    score = EXCLUDED.score,
    action_count = EXCLUDED.action_count;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;
