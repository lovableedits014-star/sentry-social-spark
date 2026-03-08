
-- Add new columns to pessoas for contratado/lider/indicado data
ALTER TABLE public.pessoas ADD COLUMN IF NOT EXISTS zona_eleitoral text;
ALTER TABLE public.pessoas ADD COLUMN IF NOT EXISTS secao_eleitoral text;
ALTER TABLE public.pessoas ADD COLUMN IF NOT EXISTS vota_candidato text;
ALTER TABLE public.pessoas ADD COLUMN IF NOT EXISTS candidato_alternativo text;
ALTER TABLE public.pessoas ADD COLUMN IF NOT EXISTS contratado_id uuid REFERENCES public.contratados(id);
ALTER TABLE public.pessoas ADD COLUMN IF NOT EXISTS lider_id uuid REFERENCES public.pessoas(id);
