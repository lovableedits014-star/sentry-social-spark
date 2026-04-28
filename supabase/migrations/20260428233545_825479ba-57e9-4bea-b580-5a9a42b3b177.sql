-- Add last_disconnected_at column to whatsapp_instances
ALTER TABLE public.whatsapp_instances
ADD COLUMN IF NOT EXISTS last_disconnected_at timestamptz;

-- Backfill: any instance currently not connected gets updated_at as proxy
UPDATE public.whatsapp_instances
SET last_disconnected_at = COALESCE(last_disconnected_at, updated_at)
WHERE status <> 'connected' AND last_disconnected_at IS NULL;

-- Trigger to maintain last_disconnected_at automatically
CREATE OR REPLACE FUNCTION public.track_whatsapp_disconnect()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Transition from connected -> not connected: stamp the moment
  IF (OLD.status = 'connected' AND NEW.status <> 'connected') THEN
    NEW.last_disconnected_at := now();
  END IF;

  -- Already disconnected and stays disconnected: keep the original timestamp
  IF (OLD.status <> 'connected' AND NEW.status <> 'connected'
      AND NEW.last_disconnected_at IS NULL) THEN
    NEW.last_disconnected_at := COALESCE(OLD.last_disconnected_at, now());
  END IF;

  -- Reconnected: clear the disconnect mark
  IF (NEW.status = 'connected') THEN
    NEW.last_disconnected_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_track_whatsapp_disconnect ON public.whatsapp_instances;
CREATE TRIGGER trg_track_whatsapp_disconnect
BEFORE UPDATE OF status ON public.whatsapp_instances
FOR EACH ROW
EXECUTE FUNCTION public.track_whatsapp_disconnect();