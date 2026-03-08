
-- Add is_lider flag to contratados
ALTER TABLE public.contratados ADD COLUMN IF NOT EXISTS is_lider boolean NOT NULL DEFAULT false;

-- Drop old FK to pessoas and add new FK to contratados (self-reference)
ALTER TABLE public.contratados DROP CONSTRAINT IF EXISTS contratados_lider_id_fkey;
ALTER TABLE public.contratados ADD CONSTRAINT contratados_lider_id_fkey FOREIGN KEY (lider_id) REFERENCES public.contratados(id) ON DELETE SET NULL;
