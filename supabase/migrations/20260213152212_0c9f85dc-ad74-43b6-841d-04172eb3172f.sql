
-- Drop the overly permissive service role policy
DROP POLICY "Service role full access to recurring tokens" ON public.recurring_notification_tokens;
