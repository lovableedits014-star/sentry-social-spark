-- ============================================================================
-- Sentinelle — Post-migration fixes for self-hosted Supabase
-- Run AFTER importing schema.sql + auth.sql + data.sql
-- ============================================================================

-- 1. Required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Enable Realtime on the tables that need it
-- (Adjust the list according to what your frontend subscribes to.)
ALTER PUBLICATION supabase_realtime ADD TABLE public.comments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.alertas;
ALTER PUBLICATION supabase_realtime ADD TABLE public.message_dispatches;
ALTER PUBLICATION supabase_realtime ADD TABLE public.dispatch_items;
ALTER PUBLICATION supabase_realtime ADD TABLE public.contratado_missao_dispatches;
ALTER PUBLICATION supabase_realtime ADD TABLE public.push_dispatch_jobs;

-- Set REPLICA IDENTITY FULL to receive complete row data on updates
ALTER TABLE public.comments REPLICA IDENTITY FULL;
ALTER TABLE public.alertas REPLICA IDENTITY FULL;

-- 3. Recreate cron job: send birthday WhatsApp messages daily at 08:00 UTC-3 (= 11:00 UTC)
-- Replace <YOUR_PROJECT_URL> and <YOUR_SERVICE_ROLE_KEY> before running.
SELECT cron.schedule(
  'send-birthday-messages-daily',
  '0 11 * * *',
  $$
  SELECT net.http_post(
    url     := 'https://supabase.easychain.com.br/functions/v1/send-birthday-messages',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer <YOUR_SERVICE_ROLE_KEY>'
    ),
    body    := '{}'::jsonb
  );
  $$
);

-- 4. (Optional) Recreate cron job for IED weekly calculation
-- SELECT cron.schedule(
--   'calculate-ied-weekly',
--   '0 3 * * 1',
--   $$ SELECT net.http_post(...); $$
-- );

-- 5. (Optional) Update old storage URLs in the database if your domain changed
-- UPDATE clients
-- SET logo_url = REPLACE(logo_url, 'qherclscaqbxytlgbunl.supabase.co', 'supabase.easychain.com.br')
-- WHERE logo_url LIKE '%qherclscaqbxytlgbunl%';

-- 6. Verify cron is registered
-- SELECT * FROM cron.job;
