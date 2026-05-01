-- Reagenda crons para reduzir consumo
DO $$
BEGIN
  -- resume-whatsapp-dispatches: 1min -> 5min
  PERFORM cron.unschedule('resume-whatsapp-dispatches');
EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule(
  'resume-whatsapp-dispatches',
  '*/5 * * * *',
  $$ SELECT public.resume_paused_whatsapp_dispatches(); $$
);

DO $$
BEGIN
  PERFORM cron.unschedule('engagement-autoresolve-hourly');
EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule(
  'engagement-autoresolve-hourly',
  '5 */6 * * *',
  $$
  SELECT net.http_post(
    url := 'https://qherclscaqbxytlgbunl.supabase.co/functions/v1/run-engagement-autoresolve',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFoZXJjbHNjYXFieHl0bGdidW5sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA5NzE4NTYsImV4cCI6MjA4NjU0Nzg1Nn0.3X2TICQF5fIhuwcH2Pf46-MjeODR1A1kwXF-PUBv4k8'
    ),
    body := '{}'::jsonb
  );
  $$
);

DO $$
BEGIN
  PERFORM cron.unschedule('gdelt-alerts-hourly');
EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule(
  'gdelt-alerts-hourly',
  '17 */3 * * *',
  $$
  SELECT net.http_post(
    url := 'https://qherclscaqbxytlgbunl.supabase.co/functions/v1/gdelt-alerts-check',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFoZXJjbHNjYXFieHl0bGdidW5sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA5NzE4NTYsImV4cCI6MjA4NjU0Nzg1Nn0.3X2TICQF5fIhuwcH2Pf46-MjeODR1A1kwXF-PUBv4k8"}'::jsonb,
    body := '{"scheduled":true}'::jsonb
  );
  $$
);

-- Novo cron diário de limpeza
DO $$
BEGIN
  PERFORM cron.unschedule('cleanup-old-data-daily');
EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule(
  'cleanup-old-data-daily',
  '0 4 * * *',
  $$
  SELECT net.http_post(
    url := 'https://qherclscaqbxytlgbunl.supabase.co/functions/v1/cleanup-old-data',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFoZXJjbHNjYXFieHl0bGdidW5sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA5NzE4NTYsImV4cCI6MjA4NjU0Nzg1Nn0.3X2TICQF5fIhuwcH2Pf46-MjeODR1A1kwXF-PUBv4k8'
    ),
    body := '{}'::jsonb
  );
  $$
);