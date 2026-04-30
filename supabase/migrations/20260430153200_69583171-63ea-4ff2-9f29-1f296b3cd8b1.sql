
ALTER TABLE public.content_radar_snapshots
  ADD COLUMN IF NOT EXISTS crisis_alerts jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS defender_pulse jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS calendar_hooks jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS base_signals jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS meta jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS total_signals integer DEFAULT 0;
