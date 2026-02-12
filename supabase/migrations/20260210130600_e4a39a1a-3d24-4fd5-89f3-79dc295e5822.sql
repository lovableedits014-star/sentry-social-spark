
-- Function to link orphan engagement_actions to supporters by matching across ALL platform profiles
CREATE OR REPLACE FUNCTION public.link_orphan_engagement_actions(p_client_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_linked INTEGER := 0;
BEGIN
  -- Link engagement_actions that have no supporter_id but match a supporter_profile
  UPDATE engagement_actions ea
  SET supporter_id = sp.supporter_id
  FROM supporter_profiles sp
  WHERE ea.client_id = p_client_id
    AND ea.supporter_id IS NULL
    AND ea.platform_user_id IS NOT NULL
    AND sp.platform = ea.platform
    AND sp.platform_user_id = ea.platform_user_id;

  GET DIAGNOSTICS v_linked = ROW_COUNT;

  -- Also update last_interaction_date for affected supporters
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
