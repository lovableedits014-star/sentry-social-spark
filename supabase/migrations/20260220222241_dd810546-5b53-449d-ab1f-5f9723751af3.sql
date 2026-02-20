
-- =============================================================================
-- SOLUÇÃO DEFINITIVA: Trigger automático de engagement_actions
-- 
-- Este trigger garante que SEMPRE que um comentário for inserido ou atualizado,
-- uma engagement_action correspondente seja criada/vinculada automaticamente.
-- Isso elimina a dependência de backfills manuais na edge function.
-- =============================================================================

-- Função que cria/vincula engagement_action para um comentário
CREATE OR REPLACE FUNCTION public.auto_create_engagement_action()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_supporter_id UUID;
  v_existing_action_id UUID;
BEGIN
  -- Skip page owner comments, stubs, and comments without user ID
  IF NEW.is_page_owner = true THEN
    RETURN NEW;
  END IF;
  
  IF NEW.platform_user_id IS NULL OR NEW.platform_user_id = '' THEN
    RETURN NEW;
  END IF;
  
  IF NEW.text = '__post_stub__' THEN
    RETURN NEW;
  END IF;

  -- Check if engagement_action already exists for this comment
  SELECT id INTO v_existing_action_id
  FROM engagement_actions
  WHERE comment_id = NEW.comment_id
    AND client_id = NEW.client_id
  LIMIT 1;
  
  -- If action already exists with a supporter, no need to update
  IF v_existing_action_id IS NOT NULL THEN
    -- But if the action has no supporter_id, try to link it
    UPDATE engagement_actions
    SET supporter_id = (
      SELECT sp.supporter_id
      FROM supporter_profiles sp
      WHERE sp.platform = NEW.platform
        AND sp.platform_user_id = NEW.platform_user_id
      LIMIT 1
    )
    WHERE id = v_existing_action_id
      AND supporter_id IS NULL;
    
    RETURN NEW;
  END IF;

  -- Try to find the supporter by platform_user_id
  SELECT sp.supporter_id INTO v_supporter_id
  FROM supporter_profiles sp
  WHERE sp.platform = NEW.platform
    AND sp.platform_user_id = NEW.platform_user_id
  LIMIT 1;

  -- If not found by ID, try by username (Instagram uses username as ID)
  IF v_supporter_id IS NULL AND NEW.author_name IS NOT NULL THEN
    SELECT sp.supporter_id INTO v_supporter_id
    FROM supporter_profiles sp
    WHERE sp.platform = NEW.platform
      AND LOWER(TRIM(BOTH '@' FROM COALESCE(sp.platform_username, ''))) = LOWER(TRIM(BOTH '@' FROM NEW.platform_user_id))
    LIMIT 1;
  END IF;

  -- Insert the engagement action
  INSERT INTO engagement_actions (
    client_id,
    supporter_id,
    platform,
    platform_user_id,
    platform_username,
    action_type,
    comment_id,
    post_id,
    action_date
  ) VALUES (
    NEW.client_id,
    v_supporter_id,
    COALESCE(NEW.platform, 'facebook'),
    NEW.platform_user_id,
    NEW.author_name,
    'comment',
    NEW.comment_id,
    NEW.post_id,
    COALESCE(NEW.comment_created_time, NEW.created_at, NOW())
  )
  ON CONFLICT DO NOTHING;

  -- If a supporter was found, recalculate their score
  IF v_supporter_id IS NOT NULL THEN
    PERFORM calculate_engagement_score(v_supporter_id);
  END IF;

  RETURN NEW;
END;
$$;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS trigger_auto_engagement_action ON public.comments;

-- Create the trigger - fires on INSERT and UPDATE of relevant fields
CREATE TRIGGER trigger_auto_engagement_action
AFTER INSERT OR UPDATE OF platform_user_id, is_page_owner ON public.comments
FOR EACH ROW
EXECUTE FUNCTION public.auto_create_engagement_action();


-- =============================================================================
-- BACKFILL: Criar engagement_actions para TODOS os comentários existentes
-- que ainda não têm uma action correspondente
-- =============================================================================

-- Step 1: Insert missing engagement_actions for ALL existing comments
INSERT INTO engagement_actions (
  client_id,
  supporter_id,
  platform,
  platform_user_id,
  platform_username,
  action_type,
  comment_id,
  post_id,
  action_date
)
SELECT
  c.client_id,
  sp.supporter_id,  -- May be NULL for non-registered users
  COALESCE(c.platform, 'facebook'),
  c.platform_user_id,
  c.author_name,
  'comment',
  c.comment_id,
  c.post_id,
  COALESCE(c.comment_created_time, c.created_at, NOW())
FROM comments c
LEFT JOIN supporter_profiles sp 
  ON sp.platform = c.platform 
  AND sp.platform_user_id = c.platform_user_id
WHERE c.is_page_owner = false
  AND c.platform_user_id IS NOT NULL
  AND c.platform_user_id != ''
  AND c.text != '__post_stub__'
  AND NOT EXISTS (
    SELECT 1 FROM engagement_actions ea
    WHERE ea.comment_id = c.comment_id
      AND ea.client_id = c.client_id
  )
ON CONFLICT DO NOTHING;

-- Step 2: Update existing orphan engagement_actions (supporter_id IS NULL) 
-- to link them to supporter_profiles where we can find a match
UPDATE engagement_actions ea
SET supporter_id = sp.supporter_id
FROM supporter_profiles sp
WHERE ea.supporter_id IS NULL
  AND ea.platform_user_id IS NOT NULL
  AND sp.platform = ea.platform
  AND sp.platform_user_id = ea.platform_user_id;

-- Step 3: Recalculate scores for ALL supporters that have engagement_actions
-- (using the existing DB function that handles this properly)
SELECT calculate_engagement_score(s.id)
FROM supporters s
WHERE EXISTS (
  SELECT 1 FROM engagement_actions ea
  WHERE ea.supporter_id = s.id
);
