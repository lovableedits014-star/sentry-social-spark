
-- Auto-create engagement_config with defaults when a new client is created
CREATE OR REPLACE FUNCTION public.handle_new_client_engagement_config()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.engagement_config (client_id, like_points, comment_points, share_points, reaction_points, inactivity_days)
  VALUES (NEW.id, 1, 3, 5, 1, 7)
  ON CONFLICT (client_id) DO NOTHING;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER on_client_created_engagement_config
  AFTER INSERT ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_client_engagement_config();
