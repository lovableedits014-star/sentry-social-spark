
-- Trigger function: when a page_owner reply is inserted, mark the parent comment as 'responded'
CREATE OR REPLACE FUNCTION public.auto_mark_parent_responded()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Only act on page owner replies that have a parent
  IF NEW.is_page_owner = true AND NEW.parent_comment_id IS NOT NULL THEN
    UPDATE comments
    SET status = 'responded',
        responded_at = COALESCE(responded_at, NEW.comment_created_time, NOW()),
        updated_at = NOW()
    WHERE comment_id = NEW.parent_comment_id
      AND client_id = NEW.client_id
      AND status = 'pending';
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Create trigger on comments table
CREATE TRIGGER trg_auto_mark_parent_responded
AFTER INSERT ON public.comments
FOR EACH ROW
EXECUTE FUNCTION public.auto_mark_parent_responded();
