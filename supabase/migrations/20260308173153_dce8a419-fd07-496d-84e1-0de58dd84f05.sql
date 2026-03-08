
-- Fix: Replace overly permissive policy with service-role-only check
DROP POLICY "Service role can insert alertas" ON public.alertas;
