
-- Fix calculate_engagement_score: handle missing config properly with explicit defaults
CREATE OR REPLACE FUNCTION public.calculate_engagement_score(p_supporter_id uuid, p_days integer DEFAULT 30)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_client_id UUID;
  v_score INTEGER := 0;
  v_like_points INTEGER := 1;
  v_comment_points INTEGER := 3;
  v_share_points INTEGER := 5;
  v_reaction_points INTEGER := 1;
BEGIN
  -- Get client_id for the supporter
  SELECT client_id INTO v_client_id FROM supporters WHERE id = p_supporter_id;
  
  IF v_client_id IS NULL THEN
    RETURN 0;
  END IF;
  
  -- Load config values individually with defaults
  SELECT 
    COALESCE(like_points, 1),
    COALESCE(comment_points, 3),
    COALESCE(share_points, 5),
    COALESCE(reaction_points, 1)
  INTO v_like_points, v_comment_points, v_share_points, v_reaction_points
  FROM engagement_config
  WHERE client_id = v_client_id
  LIMIT 1;

  -- Calculate score based on actions in the period
  SELECT COALESCE(SUM(
    CASE action_type
      WHEN 'like' THEN v_like_points
      WHEN 'comment' THEN v_comment_points
      WHEN 'share' THEN v_share_points
      WHEN 'reaction' THEN v_reaction_points
      ELSE 0
    END
  ), 0)
  INTO v_score
  FROM engagement_actions
  WHERE supporter_id = p_supporter_id
  AND action_date >= NOW() - (p_days || ' days')::INTERVAL;
  
  -- Update supporter record
  UPDATE supporters 
  SET engagement_score = v_score,
      updated_at = NOW()
  WHERE id = p_supporter_id;
  
  RETURN v_score;
END;
$function$;
